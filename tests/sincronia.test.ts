import { describe, expect, it } from 'vitest';
import {
  aplicarRecebidos,
  ATE_TUDO,
  baseDoItem,
  iguais,
  itemParaEnviar,
  mudancas,
  recalcularItem,
  resumoLocal,
  temDadosLocais,
  todasAsChaves,
  valorAtual,
  type Estado,
  type ItemComBase,
  type ItemRecebido
} from '@/lib/sincronia-dados';
import { OFICINA_VAZIA, PREFERENCIAS_PADRAO } from '@/lib/padroes';
import type { Cliente, MovimentoEstoque, PedidoEnviado } from '@/lib/tipos';

function estado(parte: Partial<Estado> = {}): Estado {
  return {
    clientes: {},
    veiculos: {},
    atendimentos: {},
    leituras: {},
    contatos: {},
    produtosProprios: {},
    ordens: {},
    estoque: {},
    movimentos: {},
    documentos: {},
    pedidos: [],
    oficina: OFICINA_VAZIA,
    preferencias: PREFERENCIAS_PADRAO,
    contadores: {},
    ...parte
  };
}

const cliente = (id: string, nome = 'Fulano'): Cliente => ({ id, nome, telefone: '21999990000', criadoEm: '2026-10-01T10:00:00.000Z' });

function recebido(colecao: string, id: string, dados: object | null, extra: Partial<ItemRecebido> = {}): ItemRecebido {
  return { colecao, id, dados: dados as Record<string, unknown> | null, apagado: dados === null, versao: 1, tx: 1, ...extra };
}

function item(id: string, quantidade: number, base?: ItemComBase['base']): ItemComBase {
  return {
    id,
    nome: 'Óleo 5W30',
    categoria: 'oleo_motor',
    unidade: 'L',
    quantidade,
    minimo: 0,
    custo: 30,
    preco: 50,
    criadoEm: '2026-10-01T10:00:00.000Z',
    atualizadoEm: base?.em ?? '2026-10-01T10:00:00.000Z',
    ...(base ? { base } : {})
  } as ItemComBase;
}

function mov(id: string, itemId: string, quando: string, quantidade: number, extra: Partial<MovimentoEstoque> = {}): MovimentoEstoque {
  return { id, itemId, quando, tipo: quantidade >= 0 ? 'entrada' : 'saida', quantidade, ...extra };
}

describe('o que mudou no aparelho', () => {
  it('acha o que entrou, mudou e saiu em cada coleção, sem os de exemplo', () => {
    const a = estado({ clientes: { c1: cliente('c1'), c2: cliente('c2'), 'ex-c1': cliente('ex-c1') } });
    const b = estado({
      ...a,
      clientes: { c1: a.clientes.c1, c2: { ...a.clientes.c2, nome: 'Outro' }, c3: cliente('c3'), 'ex-c2': cliente('ex-c2') }
    });
    expect(mudancas(a, b).sort()).toEqual(['clientes|c2', 'clientes|c3']);
    const c = estado({ ...b, clientes: { c3: b.clientes.c3 } });
    expect(mudancas(b, c).sort()).toEqual(['clientes|c1', 'clientes|c2']);
  });

  it('pedidos pelo código; cadastro, preferências (sem o tema) e contadores como config', () => {
    const p: PedidoEnviado = { codigo: 'RV-1', quando: '2026-10-01T10:00:00.000Z', itens: [], total: 10 };
    const a = estado({ pedidos: [p] });
    const b = estado({ ...a, pedidos: [{ ...p, recebidoEm: '2026-10-02T10:00:00.000Z' }] });
    expect(mudancas(a, b)).toEqual(['pedidos|RV-1']);
    expect(mudancas(a, estado({ ...a, preferencias: { ...a.preferencias, tema: 'escuro' } }))).toEqual([]);
    expect(mudancas(a, estado({ ...a, preferencias: { ...a.preferencias, margemPecas: 45 } }))).toEqual(['config|preferencias']);
    expect(mudancas(a, estado({ ...a, oficina: { ...a.oficina, nome: 'Nova' }, contadores: { ordem: 3 } }))).toEqual(['config|oficina', 'config|contadores']);
  });

  it('levar para a conta: tudo menos o exemplo, com a config', () => {
    const e = estado({ clientes: { c1: cliente('c1'), 'ex-c1': cliente('ex-c1') }, pedidos: [{ codigo: 'RV-9', quando: 'x', itens: [], total: 0 }] });
    expect(todasAsChaves(e)).toEqual(['clientes|c1', 'pedidos|RV-9', 'config|oficina', 'config|preferencias', 'config|contadores']);
  });

  it('o item que sumiu sobe como apagado; as preferências sobem sem o tema', () => {
    const e = estado({ preferencias: { ...PREFERENCIAS_PADRAO, tema: 'escuro' } });
    expect(itemParaEnviar(e, 'clientes|zz')).toEqual({ colecao: 'clientes', id: 'zz', dados: {}, apagado: true });
    expect(itemParaEnviar(e, 'pedidos|RV-0')).toMatchObject({ apagado: true });
    expect(itemParaEnviar(e, 'config|preferencias').dados).not.toHaveProperty('tema');
    expect(valorAtual(e, 'config|preferencias')).not.toHaveProperty('tema');
    // ids com a barra no meio continuam inteiros
    const c = cliente('a|b');
    expect(itemParaEnviar(estado({ clientes: { 'a|b': c } }), 'clientes|a|b')).toMatchObject({ id: 'a|b', apagado: false });
  });

  it('compara pelo conteúdo', () => {
    expect(iguais({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
    expect(iguais({ a: 1 }, { a: 2 })).toBe(false);
    expect(iguais(undefined, { a: 1 })).toBe(false);
  });
});

describe('aplicar o que veio do banco', () => {
  it('o que veio igual não muda nada (as telas não redesenham)', () => {
    const e = estado({ clientes: { c1: cliente('c1') } });
    expect(aplicarRecebidos(e, [recebido('clientes', 'c1', { ...cliente('c1') })], {})).toEqual({});
  });

  it('mudança local esperando para subir não é atropelada', () => {
    const e = estado({ clientes: { c1: cliente('c1', 'Meu nome') } });
    const parte = aplicarRecebidos(e, [recebido('clientes', 'c1', cliente('c1', 'Do outro aparelho')), recebido('clientes', 'c2', cliente('c2'))], { 'clientes|c1': true });
    expect(parte.clientes?.c1.nome).toBe('Meu nome');
    expect(parte.clientes?.c2).toBeTruthy();
  });

  it('apagado sai do aparelho; apagado de algo que nem está aqui não muda nada', () => {
    const e = estado({ clientes: { c1: cliente('c1') } });
    expect(aplicarRecebidos(e, [recebido('clientes', 'c1', null)], {}).clientes).toEqual({});
    expect(aplicarRecebidos(e, [recebido('clientes', 'zz', null)], {})).toEqual({});
  });

  it('a config junta com o que está aqui e o tema continua o do aparelho', () => {
    const e = estado({ preferencias: { ...PREFERENCIAS_PADRAO, tema: 'escuro' }, oficina: { ...OFICINA_VAZIA, nome: 'Velho', cidade: 'Rio' } });
    const parte = aplicarRecebidos(
      e,
      [
        recebido('config', 'preferencias', { ...PREFERENCIAS_PADRAO, tema: 'claro', margemPecas: 40 }),
        recebido('config', 'oficina', { nome: 'Novo' }),
        recebido('config', 'contadores', { ordem: 7 })
      ],
      {}
    );
    expect(parte.preferencias).toMatchObject({ tema: 'escuro', margemPecas: 40 });
    expect(parte.oficina).toMatchObject({ nome: 'Novo', cidade: 'Rio' });
    expect(parte.contadores).toEqual({ ordem: 7 });
  });

  it('pedidos pelo código, os mais novos primeiro, no máximo 200', () => {
    const pedidos: PedidoEnviado[] = Array.from({ length: 200 }, (_, i) => ({ codigo: `RV-${i}`, quando: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`, itens: [], total: i }));
    const e = estado({ pedidos });
    const parte = aplicarRecebidos(
      e,
      [
        recebido('pedidos', 'RV-NOVO', { codigo: 'RV-NOVO', quando: '2026-10-20T10:00:00.000Z', itens: [], total: 1 }),
        recebido('pedidos', 'RV-3', null),
        recebido('pedidos', 'RV-4', { ...pedidos[4], recebidoEm: '2026-10-21T10:00:00.000Z' })
      ],
      {}
    );
    expect(parte.pedidos).toHaveLength(200);
    expect(parte.pedidos?.[0].codigo).toBe('RV-NOVO');
    expect(parte.pedidos?.some((p) => p.codigo === 'RV-3')).toBe(false);
    expect(parte.pedidos?.find((p) => p.codigo === 'RV-4')?.recebidoEm).toBeTruthy();
  });

  it('coleção que este aparelho ainda não conhece é ignorada', () => {
    expect(aplicarRecebidos(estado(), [recebido('lancamentos', 'l1', { valor: 1 })], {})).toEqual({});
  });
});

describe('estoque que converge', () => {
  const base = { quantidade: 10, custo: 30, em: '2026-10-01T10:00:00.000Z', ate: '' };

  it('a quantidade é a base mais os movimentos depois dela, em ordem', () => {
    const i = item('i1', 10, base);
    const ms = [mov('m2', 'i1', '2026-10-02T10:00:00.000Z', -4), mov('m1', 'i1', '2026-10-01T12:00:00.000Z', 5, { custoUnitario: 32 }), mov('m0', 'i1', '2026-09-30T10:00:00.000Z', 99)];
    const r = recalcularItem(i, ms);
    expect(r.quantidade).toBe(11);
    expect(r.custo).toBe(32);
    expect(r.atualizadoEm).toBe('2026-10-02T10:00:00.000Z');
    // nada mudou: o mesmo objeto volta
    expect(recalcularItem(r, ms)).toBe(r);
  });

  it('não fica negativo, e o empate no mesmo instante vai pelo id', () => {
    const i = item('i1', 10, { ...base, ate: 'm1' });
    const ms = [mov('m1', 'i1', base.em, 50), mov('m2', 'i1', base.em, -30), mov('m3', 'i1', '2026-10-01T11:00:00.000Z', 5)];
    // m1 já está na base (ate = m1); m2 tira 30 de 10 (fica 0); m3 soma 5
    expect(recalcularItem(i, ms).quantidade).toBe(5);
    expect(recalcularItem(item('i1', 10, { ...base, ate: ATE_TUDO }), ms).quantidade).toBe(15);
  });

  it('item antigo (sem base) parte do que tem', () => {
    const velho = item('i1', 7);
    expect(baseDoItem(velho)).toEqual({ quantidade: 7, custo: 30, em: velho.atualizadoEm, ate: ATE_TUDO });
  });

  it('dois aparelhos sem internet chegam à mesma quantidade, em qualquer ordem de chegada', () => {
    const i = item('i1', 10, base);
    const deA = [mov('a1', 'i1', '2026-10-02T09:00:00.000Z', -2), mov('a2', 'i1', '2026-10-02T11:00:00.000Z', 6)];
    const deB = [mov('b1', 'i1', '2026-10-02T10:00:00.000Z', -3)];
    const r = (e: Estado, ms: MovimentoEstoque[]) =>
      aplicarRecebidos(
        e,
        ms.map((m) => recebido('movimentos', m.id, m)),
        {}
      );
    // aparelho A: já tem os seus, recebe os de B
    const eA = estado({ estoque: { i1: recalcularItem(i, deA) }, movimentos: Object.fromEntries(deA.map((m) => [m.id, m])) });
    const fimA = r(eA, deB);
    // aparelho B: já tem os seus, recebe os de A (em outra ordem)
    const eB = estado({ estoque: { i1: recalcularItem(i, deB) }, movimentos: Object.fromEntries(deB.map((m) => [m.id, m])) });
    const fimB = r(eB, [...deA].reverse());
    expect((fimA.estoque?.i1 as ItemComBase).quantidade).toBe(11);
    expect((fimB.estoque?.i1 as ItemComBase).quantidade).toBe(11);
    // e o cadastro do item que chega depois (com a quantidade velha) não desfaz a soma
    const fimC = aplicarRecebidos(estado({ ...eA, ...fimA }), [recebido('estoque', 'i1', { ...i, nome: 'Óleo 5W30 sintético', quantidade: 999 })], {});
    expect((fimC.estoque?.i1 as ItemComBase).quantidade).toBe(11);
    expect((fimC.estoque?.i1 as ItemComBase).nome).toBe('Óleo 5W30 sintético');
  });

  it('o movimento apagado sai da conta; com o item esperando para subir, a soma vale do mesmo jeito', () => {
    const i = item('i1', 10, base);
    const ms = [mov('m1', 'i1', '2026-10-02T09:00:00.000Z', -2)];
    const e = estado({ estoque: { i1: recalcularItem(i, ms) }, movimentos: { m1: ms[0] } });
    expect(e.estoque.i1.quantidade).toBe(8);
    const parte = aplicarRecebidos(e, [recebido('movimentos', 'm1', null)], { 'estoque|i1': true });
    expect(parte.movimentos).toEqual({});
    expect(parte.estoque?.i1.quantidade).toBe(10);
  });
});

describe('dados de antes da conta', () => {
  it('o exemplo não conta como dado do aparelho', () => {
    expect(temDadosLocais(estado({ clientes: { 'ex-c1': cliente('ex-c1') } }))).toBe(false);
    expect(temDadosLocais(estado({ clientes: { c1: cliente('c1') } }))).toBe(true);
    expect(temDadosLocais({ ...estado({ oficina: { ...OFICINA_VAZIA, nome: 'Oficina' } }), configurado: true })).toBe(true);
    expect(resumoLocal(estado({ clientes: { c1: cliente('c1'), 'ex-c1': cliente('ex-c1') } })).clientes).toBe(1);
  });
});
