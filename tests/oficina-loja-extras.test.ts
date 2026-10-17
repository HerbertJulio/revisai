// O que a loja da oficina mostra além do catálogo: anúncios com teto, estoque, pedido mínimo, preço
// combinado com a oficina, cashback, peças que servem no carro (na vitrine e no passo a passo) e a
// garantia ou devolução das compras.

import { describe, expect, it } from 'vitest';
import { ordenarOpcoes } from '@/components/oficina/passo/opcoes';
import type { Produto } from '@/lib/catalogo';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { DIAS_PARA_DEVOLVER, itensParaDevolver, podePedirDevolucao, situacaoDaDevolucao } from '@/lib/entregas-dados';
import { lerAplicacao } from '@/lib/loja/aplicacoes';
import type { Devolucao } from '@/lib/loja/dados';
import { mensagemDoPedido } from '@/lib/marketplace-dados';
import { fotografar, novidades } from '@/lib/novidades';
import {
  abaixoDoMinimo,
  anunciosDoDia,
  anunciosDoProduto,
  anunciosParaContar,
  calcularFacetas,
  cashbackParaUsar,
  estoqueDaLoja,
  filtrarProdutos,
  filtrosAtivos,
  FILTROS_VAZIOS,
  infoDaLoja,
  infoDoProduto,
  lerExtras,
  ordenarPeloCarro,
  precoCombinadoComOficina,
  precoNaVitrine,
  precoParaOficina,
  quantosFiltros,
  rotuloDoCarro,
  semAnunciosEsgotados,
  serveNoCarroDaVitrine,
  textoDoEstoqueDaLoja,
  type Anuncio,
  type CondicaoDaOficina,
  type ContextoVitrine,
  type ExtrasDaVitrine
} from '@/lib/vitrine';

const HOJE = '2026-10-17';

function produto(x: Partial<Produto> & Pick<Produto, 'id' | 'fornecedorId' | 'preco'>): Produto {
  return { categoria: 'filtro_oleo', nome: `Peça ${x.id}`, marca: null, descricao: null, unidade: 'un', conteudo: null, especificacao: {}, intervaloKm: null, intervaloMeses: null, imagemUrl: null, referenciaId: null, ...x };
}

const anuncios: Anuncio[] = [
  { impulsoId: 1, produtoId: 201, uf: null, inicio: '2026-10-01', fim: '2026-10-30', porClique: false },
  { impulsoId: 2, produtoId: 201, uf: 'RJ', inicio: '2026-10-10', fim: '2026-10-20', porClique: true },
  { impulsoId: 3, produtoId: 202, uf: 'SP', inicio: '2026-10-10', fim: '2026-10-20', porClique: true },
  { impulsoId: 4, produtoId: 203, uf: null, inicio: '2026-10-18', fim: '2026-10-30', porClique: false }
];

const extras: ExtrasDaVitrine = lerExtras({
  lojas: { '2': { prazoEntregaHoras: 4, pedidoMinimo: '100.00', cashbackPercentual: '5' }, x: { prazoEntregaHoras: 1 } },
  produtos: {
    '201': { estoque: 3, aplicacoes: [lerAplicacao('VW Gol 1.6 2013 a 2016'), lerAplicacao('Fox 2012-2015')] },
    '202': { estoque: 0, aplicacoes: [lerAplicacao('Onix 2017 a 2019')] },
    '203': { estoque: null, aplicacoes: 'nada' }
  },
  anuncios: [...anuncios, { impulsoId: 'x' }]
});

describe('extras do catálogo', () => {
  it('lê o que veio do servidor, sem quebrar com o que não confere', () => {
    expect(infoDaLoja(extras, 2)).toEqual({ prazoEntregaHoras: 4, pedidoMinimo: 100, cashbackPercentual: 5 });
    expect(infoDaLoja(extras, 3)).toBeNull();
    expect(Object.keys(extras.lojas)).toEqual(['2']);
    expect(infoDoProduto(extras, 201)?.aplicacoes.map((a) => [a.modelo, a.anoDe, a.anoAte])).toEqual([
      ['Gol', 2013, 2016],
      ['Fox', 2012, 2015]
    ]);
    expect(infoDoProduto(extras, 203)).toEqual({ estoque: null, aplicacoes: [] });
    expect(extras.anuncios.map((a) => a.impulsoId)).toEqual([1, 2, 3, 4]);
    // de uma versão antiga do app, nada
    expect(lerExtras(undefined)).toEqual({ lojas: {}, produtos: {}, anuncios: [] });
  });

  it('o estoque vira selo só quando a loja informa: sem estoque ou últimas unidades', () => {
    expect([estoqueDaLoja(0), estoqueDaLoja(3), estoqueDaLoja(5), estoqueDaLoja(6), estoqueDaLoja(null)]).toEqual(['sem', 'ultimas', 'ultimas', null, null]);
    expect(textoDoEstoqueDaLoja(-1)).toBe('Sem estoque');
    expect(textoDoEstoqueDaLoja(2)).toBe('Últimas unidades');
  });

  it('avisa a loja que não chega ao pedido mínimo e quanto falta', () => {
    expect(abaixoDoMinimo([{ fornecedorId: 2, total: 40 }, { fornecedorId: 2, total: 35.5 }, { fornecedorId: 1, total: 10 }], extras)).toEqual([{ fornecedorId: 2, minimo: 100, soma: 75.5, falta: 24.5 }]);
    expect(abaixoDoMinimo([{ fornecedorId: 2, total: 100 }], extras)).toEqual([]);
  });
});

describe('anúncios', () => {
  it('os do produto que valem hoje para o estado, o do estado antes do nacional', () => {
    expect(anunciosDoProduto(201, anuncios, 'RJ', HOJE).map((a) => a.impulsoId)).toEqual([2, 1]);
    expect(anunciosDoProduto(201, anuncios, 'MG', HOJE).map((a) => a.impulsoId)).toEqual([1]);
    expect(anunciosDoProduto(202, anuncios, 'RJ', HOJE)).toEqual([]);
    // começa amanhã
    expect(anunciosDoProduto(203, anuncios, 'RJ', HOJE)).toEqual([]);
  });

  it('conta o visto uma vez por dia e por oficina; o esgotado sai dos patrocinados', () => {
    expect(anunciosParaContar(201, anuncios, 'RJ', HOJE, [1])).toEqual([2]);
    expect(anunciosParaContar(201, anuncios, 'RJ', HOJE, [1, 2])).toEqual([]);
    const ontem = { oficina: 'of-1', dia: '2026-10-16', vistos: [1, 2], cliques: [2] };
    expect(anunciosDoDia(ontem, 'of-1', HOJE)).toEqual({ oficina: 'of-1', dia: HOJE, vistos: [], cliques: [] });
    expect(anunciosDoDia({ ...ontem, dia: HOJE }, 'of-2', HOJE).vistos).toEqual([]);
    expect(anunciosDoDia({ ...ontem, dia: HOJE, vistos: [1, 'x', -2] }, 'of-1', HOJE).vistos).toEqual([1]);
    const patrocinios = anuncios.map(({ produtoId, uf, inicio, fim }) => ({ produtoId, uf, inicio, fim }));
    expect(semAnunciosEsgotados(patrocinios, anuncios, new Set([2])).map((p) => [p.produtoId, p.uf])).toEqual([
      [201, null],
      [202, 'SP'],
      [203, null]
    ]);
    expect(semAnunciosEsgotados(patrocinios, anuncios, new Set())).toBe(patrocinios);
  });
});

describe('preço combinado com a oficina', () => {
  const p = produto({ id: 201, fornecedorId: 2, preco: 50 });
  const condicoes: CondicaoDaOficina[] = [
    { fornecedorId: 2, produtoId: null, descontoPercentual: 10, preco: null },
    { fornecedorId: 2, produtoId: 201, descontoPercentual: 15, preco: null },
    { fornecedorId: 3, produtoId: null, descontoPercentual: 50, preco: null }
  ];

  it('o maior desconto (do produto ou da loja toda) sobre o preço de tabela, como o banco', () => {
    expect(precoCombinadoComOficina(p, condicoes)).toBe(42.5);
    expect(precoCombinadoComOficina(produto({ id: 999, fornecedorId: 2, preco: 33.33 }), condicoes)).toBe(30);
    expect(precoCombinadoComOficina(produto({ id: 999, fornecedorId: 9, preco: 10 }), condicoes)).toBeNull();
  });

  it('o preço fixo do produto vale antes do desconto, mesmo maior', () => {
    expect(precoCombinadoComOficina(p, [...condicoes, { fornecedorId: 2, produtoId: 201, descontoPercentual: null, preco: 45 }])).toBe(45);
  });

  it('a oficina paga o menor entre a promoção e o combinado', () => {
    const promocoes = [{ id: 1, produtoId: 201, titulo: 'Leve 4', precoPromocional: 40, quantidadeMinima: 4, inicio: '2026-10-01', fim: '2026-10-30' }];
    expect(precoParaOficina(p, promocoes, HOJE, 1, condicoes)).toEqual({ preco: 42.5, promocao: null, especial: true });
    expect(precoParaOficina(p, promocoes, HOJE, 4, condicoes)).toMatchObject({ preco: 40, especial: false });
    expect(precoParaOficina(p, promocoes, HOJE, 1, [])).toMatchObject({ preco: 50, especial: false });
    const ctx = { catalogo: { ...CATALOGO_EXEMPLO, promocoes }, hoje: HOJE, condicoes };
    // na vitrine, a melhor promoção (sem olhar a quantidade) contra o combinado
    expect(precoNaVitrine(p, ctx)).toEqual({ preco: 40, especial: false });
    expect(precoNaVitrine(p, { ...ctx, catalogo: { ...ctx.catalogo, promocoes: [] } })).toEqual({ preco: 42.5, especial: true });
  });

  it('o cashback para usar é o saldo, até o valor da compra na loja', () => {
    expect(cashbackParaUsar(12.4, 100)).toBe(12.4);
    expect(cashbackParaUsar(120, 99.9)).toBe(99.9);
    expect(cashbackParaUsar(-10, 100)).toBe(0);
    expect(cashbackParaUsar(null, 100)).toBe(0);
  });
});

describe('serve no carro', () => {
  const gol = { id: 'v1', marca: 'Volkswagen', modelo: 'Gol', motor: '1.6', ano: 2015 };
  const produtos = [produto({ id: 202, fornecedorId: 2, preco: 20 }), produto({ id: 203, fornecedorId: 2, preco: 20 }), produto({ id: 201, fornecedorId: 2, preco: 20 })];
  const ctx: ContextoVitrine = { catalogo: { fornecedores: CATALOGO_EXEMPLO.fornecedores, promocoes: [], patrocinios: [] }, uf: 'RJ', hoje: HOJE, extras };

  it('pela lista de aplicações da loja; sem lista, sem informação', () => {
    expect(rotuloDoCarro(gol)).toBe('Gol 1.6 2015');
    expect(rotuloDoCarro({ marca: 'Fiat', modelo: 'Uno Mille 1.0', motor: '1.0', ano: '2010' })).toBe('Uno Mille 1.0 2010');
    expect(serveNoCarroDaVitrine(201, extras, gol)).toBe('sim');
    expect(serveNoCarroDaVitrine(201, extras, { ...gol, ano: 2018 })).toBe('nao');
    expect(serveNoCarroDaVitrine(202, extras, gol)).toBe('nao');
    expect(serveNoCarroDaVitrine(203, extras, gol)).toBe('sem-informacao');
    expect(serveNoCarroDaVitrine(201, extras, { ...gol, modelo: null })).toBe('sem-informacao');
  });

  it('o filtro tira só as que a loja diz que não servem; as que servem vêm primeiro', () => {
    const f = { ...FILTROS_VAZIOS, carro: gol };
    const r = filtrarProdutos(produtos, f, ctx);
    expect(r.map((p) => p.id)).toEqual([203, 201]);
    expect(ordenarPeloCarro(r, extras, gol).map((p) => p.id)).toEqual([201, 203]);
    expect(calcularFacetas(produtos, f, ctx).carro).toBe(1);
    expect(filtrosAtivos(f, ctx).map((a) => a.rotulo)).toEqual(['Serve no Gol 1.6 2015']);
    expect(quantosFiltros(f)).toBe(1);
    // sem os extras (catálogo antigo), o filtro não tira nada
    expect(filtrarProdutos(produtos, f, { ...ctx, extras: undefined }).map((p) => p.id)).toEqual([202, 203, 201]);
  });

  it('no passo a passo: a da última vez, o estoque, as que servem, as sem informação e as que não servem', () => {
    const opcoes = [
      { chave: 'a', origem: 'loja' as const, serve: 'nao' as const },
      { chave: 'b', origem: 'loja' as const },
      { chave: 'c', origem: 'loja' as const, serve: 'sim' as const },
      { chave: 'd', origem: 'estoque' as const },
      { chave: 'e', origem: 'loja' as const, anterior: true, serve: 'nao' as const },
      { chave: 'f', origem: 'loja' as const, serve: 'sim' as const }
    ];
    expect(ordenarOpcoes(opcoes).map((o) => o.chave)).toEqual(['e', 'd', 'c', 'f', 'b', 'a']);
  });
});

describe('garantia e devolução', () => {
  const agora = Date.parse('2026-10-17T12:00:00Z');
  const entregue = (dias: number) => ({ status: 'entregue' as const, entrega: { entregueEm: new Date(agora - dias * 86_400_000).toISOString() } });

  it('pede depois da entrega, até 90 dias, sem outro em andamento e até 3 por compra', () => {
    expect(podePedirDevolucao(entregue(10), [], agora)).toEqual({ pode: true });
    expect(podePedirDevolucao({ status: 'saiu_entrega', entrega: { entregueEm: null } }, [], agora)).toEqual({ pode: false, motivo: null });
    expect(podePedirDevolucao(entregue(DIAS_PARA_DEVOLVER + 1), [], agora)).toMatchObject({ pode: false, motivo: expect.stringContaining('90 dias') });
    expect(podePedirDevolucao(entregue(10), [{ situacao: 'aberta' }], agora)).toEqual({ pode: false, motivo: null });
    expect(podePedirDevolucao(entregue(10), [{ situacao: 'recusada' }, { situacao: 'resolvida' }], agora)).toEqual({ pode: true });
    expect(podePedirDevolucao(entregue(10), [{ situacao: 'recusada' }, { situacao: 'resolvida' }, { situacao: 'recusada' }], agora)).toMatchObject({ pode: false, motivo: expect.stringContaining('3 pedidos') });
  });

  it('diz de quem é a vez: a loja perguntou, aceitou (falta confirmar), recusou ou resolveu', () => {
    const base = { situacao: 'aberta' as const, respondidaEm: null, atualizadoEm: '2026-10-17T10:00:00Z', resposta: null };
    expect(situacaoDaDevolucao(base)).toEqual({ nome: 'Esperando a loja', tom: 'neutro', acao: null });
    expect(situacaoDaDevolucao({ ...base, respondidaEm: '2026-10-17T10:00:00Z', resposta: 'Manda a foto da etiqueta?' }).acao).toBe('responder');
    // a oficina respondeu depois: a vez é da loja de novo
    expect(situacaoDaDevolucao({ ...base, respondidaEm: '2026-10-17T09:00:00Z', resposta: 'Manda a foto?' }).acao).toBeNull();
    expect(situacaoDaDevolucao({ ...base, situacao: 'aceita' }).acao).toBe('confirmar');
    expect(situacaoDaDevolucao({ ...base, situacao: 'recusada' }).nome).toBe('A loja recusou');
  });

  it('os itens que podem voltar são os com o produto conhecido, somados', () => {
    const itens = [
      { produtoId: 5, nome: 'Filtro', quantidade: 2, precoUnitario: 20, combinado: false, especial: false },
      { produtoId: null, nome: 'Antigo', quantidade: 1, precoUnitario: 10, combinado: false, especial: false },
      { produtoId: 5, nome: 'Filtro', quantidade: 1, precoUnitario: 20, combinado: true, especial: false }
    ];
    expect(itensParaDevolver({ itens })).toEqual([{ produtoId: 5, nome: 'Filtro', quantidade: 3 }]);
  });

  it('avisa quando a loja responde, aceita ou recusa', () => {
    const d = (x: Partial<Devolucao>) => ({ id: 'd1', situacao: 'aberta' as const, respondidaEm: null, codigo: 'K7P2MX', loja: { nome: 'Central de Filtros', whatsapp: null }, ...x });
    const antes = fotografar([], [], [d({})]);
    expect(novidades(antes, [], [], [d({ respondidaEm: '2026-10-17T10:00:00Z' })])).toEqual(['A Central de Filtros respondeu o seu pedido de garantia ou devolução da compra K7P2MX.']);
    expect(novidades(antes, [], [], [d({ situacao: 'aceita' })])).toEqual(['A Central de Filtros aceitou o seu pedido de garantia ou devolução da compra K7P2MX.']);
    // sem a lista (não carregou), nada
    expect(novidades(fotografar([], [], null), [], [], [d({ situacao: 'recusada' })])).toEqual([]);
  });
});

describe('mensagens do pedido com cashback', () => {
  it('saldo que não cobre, cashback acima da compra e pedido de cashback que não confere', () => {
    expect(mensagemDoPedido({ code: 'RV031', message: 'O seu cashback na Loja X é de R$ 4,00' })).toBe('O seu cashback na Loja X é de R$ 4,00. Confira o cashback no pedido e mande de novo.');
    expect(mensagemDoPedido({ code: 'RV032', message: 'O cashback na Loja X passa do valor da compra (R$ 50,00)' })).toContain('Use no máximo o valor da compra');
    expect(mensagemDoPedido({ code: 'RV033' })).toContain('não confere');
  });
});
