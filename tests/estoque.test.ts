import { describe, expect, it } from 'vitest';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { ordemDoOrcamento, itensDoAtendimento, mensagemDoOrcamento, proximoNumero, situacaoVisivel, totais, validoAte } from '@/lib/documentos';
import {
  aplicarMovimento,
  baixasDoDocumento,
  compraSugerida,
  fatorDoProduto,
  itemDoProduto,
  itensParaRepor,
  preverEstoque,
  precoSugerido,
  reposicao,
  situacaoDoItem,
  textoQuantidade
} from '@/lib/estoque';
import { codificarOrcamento, decodificarOrcamento, linkDoOrcamento, mensagemDeAprovacao, montarOrcamento, totalEscolhido } from '@/lib/orcamento-link';
import { calcularDemanda } from '@/lib/recomendacao';
import { OFICINA_VAZIA } from '@/lib/padroes';
import type { Documento, ItemEstoque, LinhaDocumento } from '@/lib/tipos';

const produto = (id: number) => CATALOGO_EXEMPLO.produtos.find((p) => p.id === id)!;
const agora = '2026-10-15T12:00:00.000Z';

function item(id: string, produtoId: number, quantidade: number, minimo = 0): ItemEstoque {
  return { ...itemDoProduto(produto(produtoId)), id, quantidade, minimo, criadoEm: agora, atualizadoEm: agora };
}

function linha(p: Partial<LinhaDocumento> & Pick<LinhaDocumento, 'descricao'>): LinhaDocumento {
  return { id: p.descricao, tipo: 'peca', quantidade: 1, unidade: 'un', valorUnitario: null, ...p };
}

function doc(p: Partial<Documento>): Documento {
  return { id: 'd1', numero: 1, tipo: 'orcamento', situacao: 'rascunho', veiculoId: 'v1', km: 50000, data: '2026-10-15', linhas: [], desconto: null, criadoEm: agora, atualizadoEm: agora, ...p };
}

describe('estoque', () => {
  it('óleo conta em litros, o resto em unidades', () => {
    expect(itemDoProduto(produto(101)).unidade).toBe('L');
    expect(fatorDoProduto(produto(110))).toBe(4);
    expect(itemDoProduto(produto(110)).custo).toBe(42.48);
    expect(itemDoProduto(produto(201)).unidade).toBe('un');
    expect(textoQuantidade(3.5, 'L')).toBe('3,5 L');
    expect(textoQuantidade(12, 'un')).toBe('12 un');
  });

  it('situação, movimento e preço sugerido', () => {
    expect(situacaoDoItem({ quantidade: 0, minimo: 2 })).toBe('zerado');
    expect(situacaoDoItem({ quantidade: 2, minimo: 2 })).toBe('baixo');
    expect(situacaoDoItem({ quantidade: 3, minimo: 2 })).toBe('ok');
    expect(situacaoDoItem({ quantidade: 1, minimo: 0 })).toBe('ok');
    const i = item('e1', 201, 3);
    const depois = aplicarMovimento(i, { tipo: 'entrada', quantidade: 10, custoUnitario: 21.5, quando: agora });
    expect(depois.quantidade).toBe(13);
    expect(depois.custo).toBe(21.5);
    expect(aplicarMovimento(depois, { tipo: 'saida', quantidade: -20, quando: agora }).quantidade).toBe(0);
    expect(precoSugerido({ preco: null, custo: 20 }, 30)).toBe(26);
    expect(precoSugerido({ preco: 45, custo: 20 }, 30)).toBe(45);
    expect(precoSugerido({ preco: null, custo: null }, 30)).toBeNull();
  });

  it('repor: os zerados primeiro e quantas embalagens pedir', () => {
    const lista = [item('a', 201, 5, 2), item('b', 203, 0, 1), item('c', 101, 3, 8)];
    expect(itensParaRepor(lista).map((i) => i.id)).toEqual(['b', 'c']);
    expect(reposicao({ quantidade: 3, minimo: 8 }, produto(110))).toBe(4);
    expect(reposicao({ quantidade: 0, minimo: 0 }, produto(201))).toBe(1);
  });

  it('a ordem tira do estoque só as peças aprovadas', () => {
    const d = doc({
      linhas: [
        linha({ descricao: 'óleo', estoqueId: 'e1', quantidade: 4, unidade: 'L' }),
        linha({ descricao: 'mais óleo', estoqueId: 'e1', quantidade: 0.5, unidade: 'L' }),
        linha({ descricao: 'filtro', estoqueId: 'e2', recusada: true }),
        linha({ descricao: 'mão de obra', tipo: 'servico' })
      ]
    });
    expect([...baixasDoDocumento(d)]).toEqual([['e1', 4.5]]);
  });

  it('previsão: precisa de 30, tem 25, faltam 5, e a compra sugerida é só o que falta', () => {
    const veiculo = { oleo: { viscosidades: ['5W-30'], api: 'SP', capacidadeL: 4 } };
    const vencendo = Array.from({ length: 30 }, (_x, i) => ({
      veiculo,
      itens: [
        { servico: 'filtro_oleo' as const, venc: { diasRestantes: 10 }, produto: null },
        ...(i < 2 ? [{ servico: 'troca_oleo' as const, venc: { diasRestantes: 5 }, produto: null }] : [])
      ]
    }));
    const demanda = calcularDemanda(vencendo as never, CATALOGO_EXEMPLO, '2026-10-15', 30);
    const estoque = [item('f1', 201, 25, 5), item('o1', 105, 3), item('o2', 109, 20)];
    const previsao = preverEstoque(demanda, [], estoque, '2026-10-15');
    const filtro = previsao.find((l) => l.categoria === 'filtro_oleo')!;
    expect(filtro).toMatchObject({ precisa: 30, tem: 25, faltam: 5, carros: 30 });
    const oleo = previsao.find((l) => l.categoria === 'oleo_motor')!;
    // 2 carros de 4 L; o 20W-50 mineral não serve para quem pede 5W-30
    expect(oleo).toMatchObject({ precisa: 8, tem: 3, faltam: 5 });
    expect(oleo.itens.map((x) => x.id)).toEqual(['o1']);
    const porId = Object.fromEntries(estoque.map((i) => [i.id, i]));
    const compra = compraSugerida(filtro, porId, CATALOGO_EXEMPLO, '2026-10-15')!;
    expect(compra.produto.id).toBe(201);
    expect(compra.quantidade).toBe(5);
    const compraOleo = compraSugerida(oleo, porId, CATALOGO_EXEMPLO, '2026-10-15')!;
    expect(compraOleo.produto.categoria).toBe('oleo_motor');
    expect(compraOleo.quantidade * (compraOleo.produto.conteudo ?? 1)).toBeGreaterThanOrEqual(5);
  });

  it('ordens abertas e orçamentos esperando resposta entram na conta', () => {
    const estoque = [item('p1', 301, 1)];
    const docs = [
      doc({ id: 'o1', tipo: 'ordem', situacao: 'aberta', linhas: [linha({ descricao: 'pastilhas', estoqueId: 'p1', servico: 'pastilhas' })] }),
      doc({ id: 'o2', tipo: 'orcamento', situacao: 'enviado', enviadoEm: agora, linhas: [linha({ descricao: 'pastilhas', servico: 'pastilhas', produto: { nome: 'Pastilhas', categoria: 'pastilha_freio' } })] }),
      doc({ id: 'o3', tipo: 'orcamento', situacao: 'recusado', linhas: [linha({ descricao: 'pastilhas', estoqueId: 'p1' })] }),
      doc({ id: 'o4', tipo: 'orcamento', situacao: 'enviado', enviadoEm: '2026-09-01T10:00:00.000Z', linhas: [linha({ descricao: 'vencido', estoqueId: 'p1' })] })
    ];
    const [l] = preverEstoque([], docs, estoque, '2026-10-15');
    expect(l).toMatchObject({ categoria: 'pastilha_freio', precisa: 2, tem: 1, faltam: 1, ordens: 2 });
  });
});

describe('orçamentos e ordens', () => {
  const base = doc({
    modalidade: 'pago',
    vistoria: { valor: 80, abater: true },
    linhas: [
      linha({ id: 'l1', descricao: 'Pastilhas', servico: 'pastilhas', valorUnitario: 189.9, produto: { nome: 'Pastilhas', categoria: 'pastilha_freio', id: 301 } }),
      linha({ id: 'l2', descricao: 'Discos', servico: 'discos', valorUnitario: 429.9 }),
      linha({ id: 'l3', descricao: 'Mão de obra dos freios', tipo: 'servico', servico: 'pastilhas', valorUnitario: 180 }),
      linha({ id: 'l4', descricao: 'Fluido', servico: 'fluido_freio', quantidade: 2, valorUnitario: null })
    ],
    desconto: 20
  });

  it('totais sem as linhas recusadas, com o desconto', () => {
    expect(totais(base)).toEqual({ pecas: 619.8, servicos: 180, outros: 0, subtotal: 799.8, desconto: 20, total: 779.8, semPreco: 1 });
    const parcial = { ...base, linhas: base.linhas.map((l) => (l.id === 'l2' ? { ...l, recusada: true } : l)) };
    expect(totais(parcial).total).toBe(349.9);
    expect(totais({ linhas: [linha({ descricao: 'x', valorUnitario: 10 })], desconto: 50 }).total).toBe(0);
  });

  it('validade e situação vencida', () => {
    expect(validoAte({ data: '2026-10-15', validadeDias: 10 })).toBe('2026-10-25');
    expect(validoAte({ data: '2026-10-01', enviadoEm: '2026-10-05T10:00:00.000Z', validadeDias: 10 })).toBe('2026-10-15');
    expect(situacaoVisivel({ ...base, situacao: 'enviado', enviadoEm: '2026-10-01T10:00:00.000Z' }, '2026-10-15')).toBe('vencido');
    expect(situacaoVisivel({ ...base, situacao: 'aprovado', enviadoEm: '2026-10-01T10:00:00.000Z' }, '2026-10-15')).toBe('aprovado');
  });

  it('números contam separado por tipo e nunca voltam', () => {
    const docs = [doc({ tipo: 'orcamento', numero: 3 }), doc({ tipo: 'ordem', numero: 1 })];
    expect(proximoNumero({}, docs, 'orcamento')).toBe(4);
    expect(proximoNumero({ ordem: 7 }, docs, 'ordem')).toBe(8);
  });

  it('o orçamento aprovado vira ordem só com o que foi aprovado e abate a vistoria', () => {
    let n = 0;
    const aprovado = { ...base, linhas: base.linhas.map((l) => (l.id === 'l2' ? { ...l, recusada: true } : l)) };
    const os = ordemDoOrcamento(aprovado, { id: 'os1', numero: 5, agora, hoje: '2026-10-16', novoId: () => `n${++n}` });
    expect(os).toMatchObject({ id: 'os1', numero: 5, tipo: 'ordem', situacao: 'aberta', orcamentoId: 'd1', data: '2026-10-16', desconto: 20 });
    expect(os.linhas.map((l) => l.descricao)).toEqual(['Pastilhas', 'Mão de obra dos freios', 'Fluido', 'Vistoria já paga (abatida)']);
    expect(totais(os).total).toBe(269.9);
  });

  it('a ordem pronta vira os itens do serviço, um por serviço, com o produto e o prazo', () => {
    const itens = itensDoAtendimento(
      { linhas: [...base.linhas, linha({ descricao: 'Discos', servico: 'discos', intervaloKm: 40000, intervaloMeses: null })] },
      (s) => (s === 'pastilhas' ? { km: 20000, meses: 24 } : { km: null, meses: 24 })
    );
    expect(itens.map((i) => i.servico)).toEqual(['pastilhas', 'discos', 'fluido_freio']);
    expect(itens[0]).toMatchObject({ produto: { id: 301 }, intervaloKm: 20000, intervaloMeses: 24, observacao: 'Mão de obra dos freios' });
    expect(itens[2]).toMatchObject({ produto: { nome: 'Fluido' }, intervaloKm: null, intervaloMeses: 24 });
  });

  it('mensagem do orçamento', () => {
    const m = mensagemDoOrcamento({ oficina: 'Auto Center', cliente: 'Roberto Alves', carro: 'Gol', placa: 'RBA5G44', numero: 12, total: 779.8, validade: '2026-10-25', link: 'https://x/orcamento#abc' });
    expect(m).toContain('Oi, Roberto!');
    expect(m).toContain('orçamento nº 12 do seu Gol, placa RBA5G44');
    expect(m).toMatch(/R\$\s779,80/);
    expect(m).toContain('25/10/2026');
    expect(m).toContain('https://x/orcamento#abc');
  });
});

describe('link do orçamento', () => {
  const oficina = { ...OFICINA_VAZIA, nome: 'Auto Center Teste', whatsapp: '(21) 98765-4321', cidade: 'Niterói', uf: 'RJ' };
  const d = doc({
    numero: 12,
    modalidade: 'pago',
    vistoria: { valor: 80, abater: true },
    linhas: [linha({ id: 'a', descricao: 'Pastilhas', valorUnitario: 189.9 }), linha({ id: 'b', descricao: 'Mão de obra', tipo: 'servico', valorUnitario: 120 }), linha({ id: 'c', descricao: 'Recusada', recusada: true, valorUnitario: 1 })],
    desconto: 9.9,
    recomendacoes: [{ texto: 'Trocar os amortecedores na próxima', urgencia: 'proxima_revisao' }]
  });

  it('vai e volta pelo link, sem as linhas recusadas', () => {
    const dados = montarOrcamento(d, oficina, { id: 'c1', nome: 'Roberto Alves', telefone: '', criadoEm: agora }, { id: 'v1', clienteId: 'c1', placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol', ano: 2014, criadoEm: agora });
    expect(dados.o.w).toBe('5521987654321');
    expect(dados.c).toBe('Roberto');
    expect(dados.l).toHaveLength(2);
    expect(dados.vi).toEqual({ v: 80, a: true });
    expect(dados.ate).toBe('2026-10-25');
    const link = linkDoOrcamento('https://revisai.howlks.com/', dados)!;
    expect(link.startsWith('https://revisai.howlks.com/orcamento#')).toBe(true);
    expect(decodificarOrcamento(link.split('#')[1])).toEqual(dados);
    expect(decodificarOrcamento(codificarOrcamento({ ...dados, l: [] }))).toBeNull();
    expect(decodificarOrcamento('lixo')).toBeNull();
  });

  it('o cliente escolhe os itens e manda a aprovação', () => {
    const dados = montarOrcamento(d, oficina, undefined, undefined);
    const formatar = (n: number) => `R$ ${n.toFixed(2)}`;
    expect(totalEscolhido(dados, new Set([0, 1]))).toBe(300);
    expect(totalEscolhido(dados, new Set([1]))).toBe(110.1);
    expect(mensagemDeAprovacao(dados, new Set([0, 1]), formatar)).toBe('Olá! Aprovo o orçamento nº 12 (Carro), no total de R$ 300.00.');
    expect(mensagemDeAprovacao(dados, new Set([1]), formatar)).toContain('Aprovo só estes itens do orçamento nº 12');
    expect(mensagemDeAprovacao(dados, new Set([1]), formatar)).toContain('- Mão de obra');
  });
});

describe('falta mais urgente para o resumo do dia', () => {
  it('o óleo vem primeiro e só conta o que já tem um pouco no estoque', async () => {
    const { faltaMaisUrgente, fraseDaFalta } = await import('@/lib/estoque');
    const linha = (x: Record<string, unknown>) =>
      ({ chave: String(x.titulo), titulo: 'x', servico: 'troca_oleo', categoria: 'oleo_motor', unidade: 'L', precisa: 30, tem: 25, faltam: 5, carros: 7, ordens: 0, itens: [], exigido: null, semEspecificacao: false, ...x }) as never;
    const filtro = linha({ titulo: 'Filtro de óleo', categoria: 'filtro_oleo', unidade: 'un', precisa: 8, tem: 2, faltam: 6 });
    const oleo = linha({ titulo: 'Óleo 5W-30' });
    const zerado = linha({ titulo: 'Filtro de ar', categoria: 'filtro_ar', unidade: 'un', precisa: 4, tem: 0, faltam: 4 });
    expect(faltaMaisUrgente([filtro, zerado, oleo])).toBe(oleo);
    expect(faltaMaisUrgente([filtro, zerado])).toBe(filtro);
    expect(faltaMaisUrgente([zerado])).toBeNull();
    expect(fraseDaFalta(oleo)).toBe('Vai faltar Óleo 5W-30 nos próximos 30 dias: você tem 25 L e vai precisar de mais 5 L.');
  });
});
