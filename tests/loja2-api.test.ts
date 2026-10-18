import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { atenderApi, lerCorpoLimitado, type BancoDaApi, type ErroDoBanco, type PedidoDaApi } from '@/lib/loja/api';
import { conferirConsulta, conferirLote, FORMATO_DO_TOKEN, LIMITE_DO_LOTE, prefixoDoToken, tokenDoCabecalho } from '@/lib/loja/api-dados';
import { gerarToken, hashDoToken } from '@/lib/loja/tokens';

type Resposta = { data: unknown; error: ErroDoBanco | null };

/** Um banco falso: cada função responde o que o teste mandar e todas as chamadas ficam anotadas. */
function bancoFalso(respostas: Partial<Record<string, (args: Record<string, unknown>) => Resposta>> = {}) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const banco: BancoDaApi = {
    rpc(fn, args = {}) {
      chamadas.push({ fn, args });
      const padrao: Record<string, Resposta> = {
        limite_consumir: { data: true, error: null },
        limite_esgotado: { data: false, error: null },
        loja_api_registrar: { data: true, error: null }
      };
      return Promise.resolve(respostas[fn]?.(args) ?? padrao[fn] ?? { data: null, error: null });
    }
  };
  return { banco, chamadas, de: (fn: string) => chamadas.filter((c) => c.fn === fn) };
}

const TOKEN = `rvl_ab12cd34_${'x'.repeat(43)}`;

function pedido(extra: Partial<PedidoDaApi> & { corpoTexto?: string | null } = {}): PedidoDaApi {
  const { corpoTexto, ...resto } = extra;
  return {
    metodo: 'GET',
    autorizacao: `Bearer ${TOKEN}`,
    ip: '200.1.2.3',
    busca: new URLSearchParams(),
    corpo: async () => (corpoTexto === undefined ? '' : corpoTexto),
    ...resto
  };
}

describe('API das lojas: token e limites', () => {
  it('sem token responde 401 sem tocar no banco; sem banco, 503', async () => {
    const f = bancoFalso();
    const r = await atenderApi(pedido({ autorizacao: null }), f.banco);
    expect(r.status).toBe(401);
    expect(r.corpo).toEqual({ erro: expect.stringMatching(/Authorization: Bearer/), codigo: 'sem_token' });
    expect(f.chamadas).toHaveLength(0);
    expect((await atenderApi(pedido({ autorizacao: 'Basic abc' }), f.banco)).corpo.codigo).toBe('sem_token');
    expect((await atenderApi(pedido(), null)).status).toBe(503);
  });

  it('token fora do formato: 401 e conta a falha do IP (sem guardar o IP)', async () => {
    const f = bancoFalso();
    const r = await atenderApi(pedido({ autorizacao: 'Bearer qualquer-coisa' }), f.banco);
    expect(r).toEqual({ status: 401, corpo: { erro: expect.stringMatching(/Token inválido ou revogado/), codigo: 'token_invalido' }, cabecalhos: undefined });
    const falhas = f.de('limite_consumir');
    expect(falhas).toHaveLength(1);
    expect(String(falhas[0].args.p_chave)).toMatch(/^loja-api-falha:[0-9a-f]{24}$/);
    expect(JSON.stringify(f.chamadas)).not.toContain('200.1.2.3');
  });

  it('IP com muitas falhas espera 10 minutos', async () => {
    const f = bancoFalso({ limite_esgotado: () => ({ data: true, error: null }) });
    const r = await atenderApi(pedido(), f.banco);
    expect(r.status).toBe(429);
    expect(r.corpo.codigo).toBe('muitas_falhas');
    expect(r.cabecalhos).toEqual({ 'Retry-After': '600' });
    expect(f.de('loja_api_listar')).toHaveLength(0);
  });

  it('o limite é por token, pela chave do hash (o token não vai para a tabela dos limites)', async () => {
    const f = bancoFalso({ limite_consumir: () => ({ data: false, error: null }) });
    const r = await atenderApi(pedido(), f.banco);
    expect(r.status).toBe(429);
    expect(r.corpo).toEqual({ erro: expect.stringMatching(/até 60 por minuto/), codigo: 'limite' });
    expect(r.cabecalhos).toEqual({ 'Retry-After': '60' });
    const [limite] = f.de('limite_consumir');
    expect(limite.args).toEqual({ p_chave: `loja-api:${createHash('sha256').update(TOKEN).digest('hex').slice(0, 40)}`, p_max: 60, p_segundos: 60 });
    expect(JSON.stringify(f.de('limite_consumir'))).not.toContain(TOKEN);
    // a recusa fica registrada para a loja
    expect(f.de('loja_api_registrar')[0].args).toEqual({ p_token: TOKEN, p_metodo: 'GET', p_situacao: 429, p_recebidos: 0 });
    expect(f.de('loja_api_listar')).toHaveLength(0);
  });

  it('no limite, com token que não vale, a resposta é a do token', async () => {
    const f = bancoFalso({ limite_consumir: (a) => ({ data: String(a.p_chave).startsWith('loja-api-falha') ? true : false, error: null }), loja_api_registrar: () => ({ data: false, error: null }) });
    const r = await atenderApi(pedido(), f.banco);
    expect([r.status, r.corpo.codigo]).toEqual([401, 'token_invalido']);
  });

  it('o limite do banco fora do ar não derruba a integração', async () => {
    const f = bancoFalso({ limite_consumir: () => ({ data: null, error: { code: '08006', message: 'sem conexão' } }), loja_api_listar: () => ({ data: { produtos: [] }, error: null }) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await atenderApi(pedido(), f.banco)).status).toBe(200);
  });
});

describe('API das lojas: GET /produtos', () => {
  it('passa os filtros para o banco e devolve o que ele respondeu', async () => {
    const dados = { loja: { id: 7, nome: 'Loja' }, produtos: [{ id: 1, codigo: 'A1', preco: 10 }], proximo: null };
    const f = bancoFalso({ loja_api_listar: () => ({ data: dados, error: null }) });
    const r = await atenderApi(pedido({ busca: new URLSearchParams('codigo=%20A1%20&depois=10&limite=50') }), f.banco);
    expect(r).toEqual({ status: 200, corpo: dados });
    expect(f.de('loja_api_listar')[0].args).toEqual({ p_token: TOKEN, p_codigo: 'A1', p_depois: 10, p_limite: 50 });
    // sem filtros: 100 por página
    await atenderApi(pedido(), f.banco);
    expect(f.de('loja_api_listar')[1].args).toEqual({ p_token: TOKEN, p_codigo: null, p_depois: null, p_limite: 100 });
  });

  it('filtro errado: 400 em português, registrado', async () => {
    const f = bancoFalso();
    const r = await atenderApi(pedido({ busca: new URLSearchParams('limite=0') }), f.banco);
    expect(r.status).toBe(400);
    expect(r.corpo).toEqual({ erro: `limite vai de 1 a ${LIMITE_DO_LOTE}.`, codigo: 'consulta_invalida' });
    expect(f.de('loja_api_registrar')[0].args).toEqual({ p_token: TOKEN, p_metodo: 'GET', p_situacao: 400, p_recebidos: 0 });
    expect(f.de('loja_api_listar')).toHaveLength(0);
  });

  it('token revogado (RV066): 401 e a falha conta; erro estranho do banco: 500 sem detalhes', async () => {
    const f = bancoFalso({ loja_api_listar: () => ({ data: null, error: { code: 'RV066', message: 'Token inválido ou revogado' } }) });
    const r = await atenderApi(pedido(), f.banco);
    expect([r.status, r.corpo.codigo]).toEqual([401, 'token_invalido']);
    expect(f.de('limite_consumir').some((c) => String(c.args.p_chave).startsWith('loja-api-falha:'))).toBe(true);
    const g = bancoFalso({ loja_api_listar: () => ({ data: null, error: { code: 'XX000', message: 'detalhe interno' } }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r2 = await atenderApi(pedido(), g.banco);
    expect(r2.status).toBe(500);
    expect(JSON.stringify(r2.corpo)).not.toContain('detalhe interno');
  });
});

describe('API das lojas: PATCH /produtos', () => {
  const patch = (corpoTexto: string | null) => pedido({ metodo: 'PATCH', corpoTexto });

  it('manda os produtos conferidos e devolve as contagens do banco', async () => {
    const resposta = { recebidos: 2, atualizados: 1, sem_mudanca: 0, nao_encontrados: ['ZZ'], erros: [] };
    const f = bancoFalso({ loja_api_atualizar: () => ({ data: resposta, error: null }) });
    const corpo = { produtos: [{ codigo: ' A1 ', preco: 41.9, estoque: 10 }, { codigo: 'ZZ', ativo: false, prazo_entrega_horas: null }] };
    const r = await atenderApi(patch(JSON.stringify(corpo)), f.banco);
    expect(r).toEqual({ status: 200, corpo: resposta });
    expect(f.de('loja_api_atualizar')[0].args).toEqual({
      p_token: TOKEN,
      p_itens: [
        { codigo: 'A1', preco: 41.9, estoque: 10 },
        { codigo: 'ZZ', ativo: false, prazo_entrega_horas: null }
      ]
    });
    expect(f.de('loja_api_registrar')).toHaveLength(0);
  });

  it('JSON quebrado, corpo grande, lote vazio ou grande demais: 4xx em português, nada muda', async () => {
    const f = bancoFalso();
    expect(await atenderApi(patch('{produtos: ['), f.banco)).toEqual(expect.objectContaining({ status: 400, corpo: expect.objectContaining({ codigo: 'json_invalido' }) }));
    expect((await atenderApi(patch(null), f.banco)).status).toBe(413);
    const vazio = await atenderApi(patch('{"produtos": []}'), f.banco);
    expect(vazio.corpo).toEqual({ erro: 'A lista de produtos está vazia.', codigo: 'lote_invalido', erros: [] });
    const grande = await atenderApi(patch(JSON.stringify({ produtos: Array.from({ length: 501 }, (_, i) => ({ codigo: `C${i}`, estoque: 1 })) })), f.banco);
    expect(grande.status).toBe(400);
    expect(grande.corpo.erro).toBe('Mande até 500 produtos por vez (vieram 501).');
    expect(f.de('loja_api_registrar').map((c) => [c.args.p_situacao, c.args.p_recebidos])).toEqual([
      [400, 0],
      [413, 0],
      [400, 0],
      [400, 501]
    ]);
    expect(f.de('loja_api_atualizar')).toHaveLength(0);
  });

  it('produto que não confere: 400 com cada erro (índice, código e motivo) e nada muda', async () => {
    const f = bancoFalso();
    const corpo = {
      produtos: [
        { codigo: 'A1', preco: 10 },
        { codigo: 'A2', preco: -3 },
        { codigo: 'A3', estoque: 2.5 },
        { codigo: 'A4', nome: 'Óleo' },
        { preco: 4 },
        { codigo: 'A5' },
        { codigo: 'A1', ativo: true },
        'texto'
      ]
    };
    const r = await atenderApi(patch(JSON.stringify(corpo)), f.banco);
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toBe('7 produtos não conferem. Nada foi mudado.');
    expect(r.corpo.erros).toEqual([
      { indice: 1, codigo: 'A2', erro: 'O preço vai de 0,01 a 100.000.' },
      { indice: 2, codigo: 'A3', erro: 'estoque é um número inteiro (ou null para não controlar).' },
      { indice: 3, codigo: 'A4', erro: 'Campo não reconhecido: nome. Use codigo, preco, estoque, prazo_entrega_horas, ativo.' },
      { indice: 4, codigo: null, erro: 'Falta o código do produto (codigo, o da sua loja).' },
      { indice: 5, codigo: 'A5', erro: 'Mande pelo menos um de preco, estoque, prazo_entrega_horas ou ativo.' },
      { indice: 6, codigo: 'A1', erro: 'O código A1 veio repetido (também no produto 0).' },
      { indice: 7, codigo: null, erro: 'Cada produto é um objeto, como {"codigo": "ABC123", "estoque": 10}.' }
    ]);
    expect(f.de('loja_api_atualizar')).toHaveLength(0);
  });

  it('o lote recusado pelo banco (22023) vira 400 com a mensagem dele', async () => {
    const f = bancoFalso({ loja_api_atualizar: () => ({ data: null, error: { code: '22023', message: 'Mande de 1 a 500 produtos por vez' } }) });
    const r = await atenderApi(patch('{"produtos":[{"codigo":"A1","preco":1}]}'), f.banco);
    expect(r).toEqual({ status: 400, corpo: { erro: 'Mande de 1 a 500 produtos por vez.', codigo: 'lote_invalido' }, cabecalhos: undefined });
  });
});

describe('API das lojas: peças', () => {
  it('lê o token do cabeçalho', () => {
    expect(tokenDoCabecalho(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(tokenDoCabecalho(`  bearer   ${TOKEN}  `)).toBe(TOKEN);
    expect(tokenDoCabecalho('Bearer')).toBeNull();
    expect(tokenDoCabecalho(null)).toBeNull();
    expect(tokenDoCabecalho(`Bearer ${TOKEN} extra`)).toBeNull();
  });

  it('o token novo tem o formato, o prefixo e o hash SHA-256; nenhum repete', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = gerarToken();
      expect(t.token).toMatch(FORMATO_DO_TOKEN);
      expect(prefixoDoToken(t.token)).toBe(t.prefixo);
      expect(t.hash).toBe(createHash('sha256').update(t.token).digest('hex'));
      expect(hashDoToken(t.token)).toBe(t.hash);
      vistos.add(t.token);
    }
    expect(vistos.size).toBe(200);
  });

  it('confere a consulta e o lote', () => {
    expect(conferirConsulta(new URLSearchParams('depois=0'))).toEqual({ ok: false, erro: expect.stringMatching(/proximo/) });
    expect(conferirConsulta(new URLSearchParams('limite=500'))).toEqual({ ok: true, codigo: null, depois: null, limite: 500 });
    expect(conferirLote({ itens: [] })).toEqual(expect.objectContaining({ ok: false, erro: expect.stringMatching(/"produtos"/) }));
    expect(conferirLote({ produtos: [{ codigo: 'X', estoque: null }] })).toEqual({ ok: true, itens: [{ codigo: 'X', estoque: null }] });
  });

  it('lê o corpo até o limite, sem guardar o resto', async () => {
    const fluxo = (partes: string[]) =>
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const p of partes) c.enqueue(new TextEncoder().encode(p));
          c.close();
        }
      });
    expect(await lerCorpoLimitado(fluxo(['{"a":', '1}']), 100, null)).toBe('{"a":1}');
    expect(await lerCorpoLimitado(fluxo(['x'.repeat(60), 'y'.repeat(60)]), 100, null)).toBeNull();
    expect(await lerCorpoLimitado(fluxo(['{}']), 100, 5000)).toBeNull();
    expect(await lerCorpoLimitado(null, 100, null)).toBe('');
    expect(await lerCorpoLimitado(fluxo(['ação']), 100, null)).toBe('ação');
  });
});
