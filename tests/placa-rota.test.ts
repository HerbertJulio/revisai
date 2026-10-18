// A rota /api/veiculos/placa com o banco e o provedor de mentira: o que já está guardado não gasta
// a cota, a cota que acabou explica o porquê, o provedor que falha devolve a consulta e o que veio
// fica guardado. O provedor de verdade (consultadeplaca.net) é testado com o fetch simulado.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const chamadas: { quem: 'usuario' | 'sistema'; rpc: string; args: Record<string, unknown> }[] = [];
let respostasDoBanco: Record<string, { data?: unknown; error?: { code: string; message: string; details?: string } | null }> = {};
let comConta = true;

function cliente(quem: 'usuario' | 'sistema') {
  return {
    rpc: async (rpc: string, args: Record<string, unknown>) => {
      chamadas.push({ quem, rpc, args });
      const r = respostasDoBanco[rpc] ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    }
  };
}

vi.mock('@/lib/conta', () => ({
  acessoDaOficina: async () =>
    comConta ? { ok: true, sb: cliente('usuario'), conta: {}, oficina: { id: 'of-1', nome: 'Oficina', papel: 'dono', ativa: true, plano: 'gratis' } } : { ok: false, erro: 'Entre na sua conta para continuar.' }
}));
vi.mock('@/lib/supabase-servidor', () => ({ clienteSistema: () => cliente('sistema') }));
vi.mock('@/lib/limite', () => ({ permitidoPara: async () => true }));

function pedido(placa: unknown) {
  return new NextRequest('http://localhost/api/veiculos/placa', { method: 'POST', body: JSON.stringify({ placa }), headers: { 'content-type': 'application/json' } });
}

async function rota() {
  return import('@/app/api/veiculos/placa/route');
}

beforeEach(() => {
  vi.resetModules();
  chamadas.length = 0;
  respostasDoBanco = { placas_consumir: { data: { plano: 'gratis', usado: 3, limite: 20 } }, placas_uso_do_mes: { data: { plano: 'gratis', usado: 3, limite: 20 } } };
  comConta = true;
  vi.stubEnv('PLACA_API_PROVEDOR', 'teste');
  vi.stubEnv('PLACA_API_TOKEN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('busca pela placa', () => {
  it('sem conta ou sem provedor, explica por que não dá', async () => {
    comConta = false;
    const { GET, POST } = await rota();
    expect(await (await GET()).json()).toMatchObject({ disponivel: false, motivo: 'conta' });
    const r = await POST(pedido('ABC1D23'));
    expect(r.status).toBe(401);
    expect((await r.json()).erro).toContain('precisa ter conta');
    comConta = true;
    vi.stubEnv('PLACA_API_PROVEDOR', '');
    expect(await (await GET()).json()).toMatchObject({ disponivel: false, motivo: 'desligada' });
    expect((await POST(pedido('ABC1D23'))).status).toBe(503);
  });

  it('o provedor de mentira não existe em produção', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await rota();
    expect(await (await GET()).json()).toMatchObject({ disponivel: false });
  });

  it('placa inválida', async () => {
    const { POST } = await rota();
    const r = await POST(pedido('12'));
    expect(r.status).toBe(400);
    expect(chamadas).toEqual([]);
  });

  it('achou: gasta uma consulta, guarda pela placa Mercosul e devolve o carro', async () => {
    const { POST } = await rota();
    const r = await POST(pedido('bra-2019'));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ ok: true, guardada: false, uso: { usado: 3, limite: 20 }, dados: { placa: 'BRA2019', marca: 'Chevrolet', modelo: 'Onix', anoModelo: 2020, combustivel: 'flex', fipe: { codigo: '004478-1', valor: 58123 } } });
    expect(chamadas.map((c) => `${c.quem}:${c.rpc}`)).toEqual(['sistema:placas_cache_ler', 'usuario:placas_consumir', 'sistema:placas_cache_gravar']);
    expect(chamadas[0].args).toEqual({ p_placa: 'BRA2A19' });
    expect(chamadas[2].args).toMatchObject({ p_placa: 'BRA2A19', p_dados: { v: 1, provedor: 'teste', dados: { marca: 'Chevrolet' } } });
  });

  it('guardada: não gasta a cota', async () => {
    respostasDoBanco.placas_cache_ler = {
      data: { dados: { v: 1, dados: { placa: 'BRA2A19', marca: 'Fiat', modelo: 'Argo', versao: null, motor: null, ano: 2021, anoModelo: 2022, cor: null, combustivel: 'flex', municipio: null, uf: 'RJ', chassi: null, fipe: null } } }
    };
    const { POST } = await rota();
    const corpo = await (await POST(pedido('BRA2019'))).json();
    expect(corpo).toMatchObject({ ok: true, guardada: true, dados: { placa: 'BRA2019', marca: 'Fiat' } });
    expect(chamadas.map((c) => c.rpc)).toEqual(['placas_cache_ler', 'placas_uso_do_mes']);
  });

  it('o guardado num formato antigo vale como não guardado', async () => {
    respostasDoBanco.placas_cache_ler = { data: { dados: { v: 0, dados: {} } } };
    const { POST } = await rota();
    expect((await (await POST(pedido('BRA2019'))).json()).guardada).toBe(false);
  });

  it('a cota acabou: 429 com a mensagem do plano', async () => {
    respostasDoBanco.placas_consumir = { error: { code: 'RV090', message: 'As consultas de placa do mês acabaram', details: '{"plano": "gratis", "limite": 20}' } };
    const { POST } = await rota();
    const r = await POST(pedido('BRA2019'));
    expect(r.status).toBe(429);
    const corpo = await r.json();
    expect(corpo.motivo).toBe('cota');
    expect(corpo.erro).toContain('As 20 consultas de placa deste mês acabaram');
    expect(chamadas.map((c) => c.rpc)).not.toContain('placas_cache_gravar');
  });

  it('não achou: 404, a consulta conta (o provedor cobra) e nada fica guardado', async () => {
    const { POST } = await rota();
    const r = await POST(pedido('ZZZ1A11'));
    expect(r.status).toBe(404);
    expect((await r.json()).motivo).toBe('nao_achou');
    expect(chamadas.map((c) => c.rpc)).toEqual(['placas_cache_ler', 'placas_consumir']);
  });

  it('o provedor falhou: a consulta volta para a cota', async () => {
    const { POST } = await rota();
    const r = await POST(pedido('ERR1A11'));
    expect(r.status).toBe(502);
    expect(chamadas.map((c) => `${c.quem}:${c.rpc}`)).toEqual(['sistema:placas_cache_ler', 'usuario:placas_consumir', 'sistema:placas_devolver']);
  });
});

describe('consultadeplaca.net', () => {
  function respondendo(...respostas: { status: number; corpo: unknown }[]) {
    const fila = [...respostas];
    const f = vi.fn(async () => {
      const r = fila.shift() ?? { status: 500, corpo: {} };
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', f);
    return f;
  }

  async function consultar(placa = 'ABC1D23') {
    const { consultarPlaca } = await import('@/app/api/veiculos/placa/provedores');
    return consultarPlaca(placa, { provedor: 'consultadeplaca', token: 'cdp_test_x' });
  }

  it('manda a chave no cabeçalho, a placa no corpo e uma chave de repetição que vale no dia', async () => {
    const f = respondendo({ status: 201, corpo: { result: 'found', vehicle: { brand: 'FIAT', model: 'ARGO', model_year: 2022 } } });
    const r = await consultar();
    expect(r).toMatchObject({ tipo: 'achou', dados: { marca: 'Fiat', modelo: 'Argo', anoModelo: 2022 } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://consultadeplaca.net/api/v1/lookups');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer cdp_test_x');
    expect(h['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init.body))).toEqual({ plate: 'ABC1D23' });
    // a mesma placa no mesmo dia, a mesma chave
    respondendo({ status: 201, corpo: { result: 'not_found' } });
    const f2 = vi.mocked(fetch);
    await consultar();
    expect(((f2.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['Idempotency-Key']).toBe(h['Idempotency-Key']);
  });

  it('não achou, sem saldo, chave recusada, placa recusada, fora do ar', async () => {
    respondendo({ status: 201, corpo: { result: 'not_found', vehicle: null } });
    expect(await consultar()).toEqual({ tipo: 'nao_achou' });
    respondendo({ status: 402, corpo: { code: 'insufficient_balance' } });
    expect(await consultar()).toMatchObject({ tipo: 'falhou', mensagem: expect.stringContaining('sem crédito') });
    respondendo({ status: 401, corpo: { code: 'invalid_api_key' } });
    expect(await consultar()).toMatchObject({ tipo: 'falhou', mensagem: expect.stringContaining('fora do ar') });
    respondendo({ status: 422, corpo: { code: 'validation_failed' } });
    expect(await consultar()).toMatchObject({ tipo: 'falhou', mensagem: expect.stringContaining('não aceitou') });
    respondendo({ status: 429, corpo: { code: 'rate_limited' } });
    expect(await consultar()).toMatchObject({ tipo: 'falhou', mensagem: expect.stringContaining('um minuto') });
    respondendo({ status: 503, corpo: { code: 'service_unavailable' } });
    expect(await consultar()).toMatchObject({ tipo: 'falhou' });
    respondendo({ status: 201, corpo: { result: 'algo' } });
    expect(await consultar()).toMatchObject({ tipo: 'falhou', mensagem: expect.stringContaining('não entende') });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('rede'))));
    expect(await consultar()).toMatchObject({ tipo: 'falhou', mensagem: expect.stringContaining('não respondeu') });
  });

  it('o mesmo pedido ainda andando do outro lado: espera e pergunta de novo', async () => {
    vi.useFakeTimers();
    try {
      const f = respondendo({ status: 409, corpo: { code: 'idempotency_in_progress' } }, { status: 201, corpo: { result: 'not_found' } });
      const p = consultar();
      await vi.advanceTimersByTimeAsync(3000);
      expect(await p).toEqual({ tipo: 'nao_achou' });
      expect(f).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o provedor vem da configuração', async () => {
    const { configDaPlaca } = await import('@/app/api/veiculos/placa/provedores');
    vi.stubEnv('PLACA_API_PROVEDOR', '');
    vi.stubEnv('PLACA_API_TOKEN', 'cdp_live_abc');
    expect(configDaPlaca()).toEqual({ provedor: 'consultadeplaca', token: 'cdp_live_abc' });
    vi.stubEnv('PLACA_API_TOKEN', '');
    expect(configDaPlaca()).toBeNull();
    vi.stubEnv('PLACA_API_PROVEDOR', 'outro');
    vi.stubEnv('PLACA_API_TOKEN', 'x');
    expect(configDaPlaca()).toBeNull();
  });
});
