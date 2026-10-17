// A rota /api/veiculos/fipe: os endereços da BrasilAPI, o que fica guardado no mês (memória e
// banco), os erros e a tabela de mentira do modo de teste.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const chamadas: { rpc: string; args: Record<string, unknown> }[] = [];
let guardado: unknown = null;

vi.mock('@/lib/supabase-servidor', () => ({
  clienteSistema: () => ({
    rpc: async (rpc: string, args: Record<string, unknown>) => {
      chamadas.push({ rpc, args });
      return { data: rpc === 'fipe_cache_ler' ? guardado : null, error: null };
    }
  })
}));
vi.mock('@/lib/limite', () => ({ permitido: async () => true }));

const PRECO = { valor: 'R$ 61.512,00', marca: 'GM - Chevrolet', modelo: 'ONIX HATCH LT 1.0', anoModelo: 2020, combustivel: 'Gasolina', codigoFipe: '004478-1', mesReferencia: 'outubro de 2026 ', tipoVeiculo: 1, siglaCombustivel: 'G', dataConsulta: '' };

function respondendo(status: number, corpo: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
}

async function pedir(q: string) {
  const { GET } = await import('@/app/api/veiculos/fipe/route');
  const r = await GET(new NextRequest(`http://localhost/api/veiculos/fipe?${q}`));
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetModules();
  chamadas.length = 0;
  guardado = null;
  vi.stubEnv('PLACA_API_PROVEDOR', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('tabela FIPE pela BrasilAPI', () => {
  it('preço pelo código: busca uma vez e guarda no mês (memória e banco)', async () => {
    const f = respondendo(200, [PRECO]);
    const r = await pedir('acao=preco&codigo=004478-1');
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ ok: true, precos: [{ codigo: '004478-1', anoModelo: 2020, valor: 61512, referencia: '2026-10' }] });
    expect(f).toHaveBeenCalledWith('https://brasilapi.com.br/api/fipe/preco/v1/004478-1', expect.anything());
    expect(chamadas.map((c) => c.rpc)).toEqual(['fipe_cache_ler', 'fipe_cache_gravar']);
    expect(chamadas[1].args).toMatchObject({ p_chave: 'preco:004478-1', p_mes: expect.stringMatching(/^\d{4}-\d{2}$/) });
    // de novo: vem da memória, sem BrasilAPI e sem banco
    chamadas.length = 0;
    await pedir('acao=preco&codigo=004478-1');
    expect(f).toHaveBeenCalledTimes(1);
    expect(chamadas).toEqual([]);
  });

  it('o que está guardado no banco não vai à BrasilAPI', async () => {
    guardado = [{ codigo: '004478-1', marca: 'GM', modelo: 'ONIX', anoModelo: 2020, zeroKm: false, combustivel: 'Gasolina', valor: 60000, referencia: '2026-10' }];
    const f = respondendo(500, {});
    const r = await pedir('acao=preco&codigo=004478-1');
    expect(r.corpo).toMatchObject({ ok: true, precos: [{ valor: 60000 }] });
    expect(f).not.toHaveBeenCalled();
  });

  it('marcas, modelos, anos e detalhe nos endereços certos', async () => {
    const f = respondendo(200, [{ nome: 'GM - Chevrolet', valor: '23' }]);
    expect((await pedir('acao=marcas')).corpo).toEqual({ ok: true, opcoes: [{ codigo: '23', nome: 'GM - Chevrolet' }] });
    await pedir('acao=modelos&marca=23');
    await pedir('acao=anos&marca=23&modelo=4478');
    respondendo(200, PRECO);
    const g = vi.mocked(fetch);
    expect((await pedir('acao=detalhe&marca=23&modelo=4478&ano=2020-1')).corpo).toMatchObject({ ok: true, precos: [{ valor: 61512 }] });
    expect(f.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      'https://brasilapi.com.br/api/fipe/marcas/v1/carros',
      'https://brasilapi.com.br/api/fipe/veiculos/v1/carros/23',
      'https://brasilapi.com.br/api/fipe/anos/v1/carros/23/4478'
    ]);
    expect((g.mock.calls[0] as unknown as [string])[0]).toBe('https://brasilapi.com.br/api/fipe/detalhes/v1/carros/23/4478/2020-1');
  });

  it('pedido inválido, código que a FIPE não conhece e BrasilAPI fora do ar', async () => {
    expect((await pedir('acao=preco&codigo=123')).status).toBe(400);
    expect((await pedir('acao=modelos&marca=abc')).status).toBe(400);
    expect((await pedir('acao=nada')).status).toBe(400);
    respondendo(400, { message: 'Código fipe inválido' });
    expect(await pedir('acao=preco&codigo=999999-9')).toEqual({ status: 404, corpo: { ok: false, erro: 'A FIPE não conhece esse código.' } });
    respondendo(503, {});
    expect((await pedir('acao=preco&codigo=004478-1')).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('rede'))));
    expect((await pedir('acao=marcas')).status).toBe(502);
    respondendo(200, []);
    expect((await pedir('acao=modelos&marca=1')).status).toBe(404);
  });

  it('no modo de teste responde a tabela de mentira, sem rede', async () => {
    vi.stubEnv('PLACA_API_PROVEDOR', 'teste');
    const f = respondendo(500, {});
    const marcas = await pedir('acao=marcas');
    expect((marcas.corpo.opcoes as { nome: string }[]).map((m) => m.nome)).toContain('GM - Chevrolet');
    const precos = await pedir('acao=preco&codigo=004478-1');
    expect((precos.corpo.precos as { anoModelo: number; modelo: string }[]).find((p) => p.anoModelo === 2020)?.modelo).toContain('ONIX');
    const detalhe = await pedir('acao=detalhe&marca=23&modelo=4478&ano=2020-1');
    expect(detalhe.corpo.precos).toHaveLength(1);
    expect((await pedir('acao=detalhe&marca=23&modelo=1&ano=2020-1')).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });
});
