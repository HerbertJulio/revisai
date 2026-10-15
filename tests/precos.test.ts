import { describe, expect, it } from 'vitest';
import type { Catalogo, Produto } from '@/lib/catalogo';
import { chaveDoProduto, lerPreco, ofertasDoProduto, palavrasDoProduto, precoComparavel, precosPagos, ultimoPrecoPago } from '@/lib/precos';
import type { ItemEstoque, MovimentoEstoque, PedidoEnviado } from '@/lib/tipos';

function produto(p: Partial<Produto> & Pick<Produto, 'id' | 'fornecedorId' | 'nome'>): Produto {
  return { categoria: 'filtro_oleo', marca: 'Tecfil', descricao: null, unidade: 'un', conteudo: null, preco: 25, especificacao: {}, intervaloKm: null, intervaloMeses: null, imagemUrl: null, referenciaId: null, ...p };
}

const catalogo: Catalogo = {
  origem: 'banco',
  atualizadoEm: '',
  fornecedores: [
    { id: 1, nome: 'Central de Filtros', cidade: null, uf: 'RJ', demonstracao: false, destaque: false, descricao: null },
    { id: 2, nome: 'Auto Peças Niterói', cidade: null, uf: 'RJ', demonstracao: false, destaque: false, descricao: null },
    { id: 3, nome: 'Distribuidora Lub', cidade: null, uf: 'RJ', demonstracao: false, destaque: false, descricao: null }
  ],
  produtos: [
    produto({ id: 1, fornecedorId: 1, nome: 'Filtro de óleo PSL 55', preco: 26 }),
    produto({ id: 2, fornecedorId: 2, nome: 'PSL55 filtro de óleo', marca: 'TECFIL', preco: 24.5 }),
    produto({ id: 3, fornecedorId: 3, nome: 'Filtro de óleo PSL 55', preco: 27 }),
    produto({ id: 4, fornecedorId: 1, nome: 'Filtro de óleo PH 5949', marca: 'Fram', preco: 19 }),
    produto({ id: 10, fornecedorId: 3, categoria: 'oleo_motor', marca: 'Lubrax', nome: 'Supera 5W-30 1L', unidade: 'L', conteudo: 1, preco: 40, especificacao: { viscosidade: '5W-30', normas: ['GM dexos1 Gen 3'] } }),
    produto({ id: 11, fornecedorId: 1, categoria: 'oleo_motor', marca: 'Lubrax', nome: 'Supera 5W30 balde 4 L', unidade: 'L', conteudo: 4, preco: 148, especificacao: { viscosidade: '5W-30', normas: ['GM dexos1 Gen 3'] } }),
    produto({ id: 12, fornecedorId: 2, categoria: 'oleo_motor', marca: 'Mobil', nome: 'Super 5W-30', unidade: 'L', conteudo: 1, preco: 36, especificacao: { viscosidade: '5W-30', normas: ['GM dexos1 Gen 3'] } }),
    produto({ id: 13, fornecedorId: 2, categoria: 'oleo_motor', marca: 'Mobil', nome: 'Super 5W-30 sem norma', unidade: 'L', conteudo: 1, preco: 30, especificacao: { viscosidade: '5W-30' } })
  ],
  promocoes: [{ id: 1, produtoId: 3, titulo: 'Caixa', precoPromocional: 23, quantidadeMinima: 10, inicio: '2026-10-01', fim: '2026-10-31' }],
  patrocinios: []
};
const p = (id: number) => catalogo.produtos.find((x) => x.id === id)!;
const hoje = '2026-10-15';

describe('mesmo produto em outras lojas', () => {
  it('a chave ignora embalagem, ordem das palavras, acento e caixa', () => {
    expect(palavrasDoProduto('Óleo Supera 5W-30 balde 4 L')).toEqual(['5w30', 'supera']);
    expect(palavrasDoProduto('Filtro de óleo PSL 55')).toEqual(['psl55']);
    expect(chaveDoProduto(p(1))).toBe(chaveDoProduto(p(2)));
    expect(chaveDoProduto(p(10))).toBe(chaveDoProduto(p(11)));
    expect(chaveDoProduto(p(1))).not.toBe(chaveDoProduto(p(4)));
  });

  it('o óleo compara pelo litro', () => {
    expect(precoComparavel(p(11), 148)).toBe(37);
    expect(precoComparavel(p(1), 26)).toBe(26);
  });

  it('ofertas do mesmo produto e dos parecidos', () => {
    const { mesmo, parecidos } = ofertasDoProduto(p(1), catalogo, hoje);
    expect(mesmo.map((o) => o.produto.id)).toEqual([2, 1, 3]);
    expect(parecidos).toEqual([]);
    const caixa = ofertasDoProduto(p(1), catalogo, hoje, 10);
    expect(caixa.mesmo.map((o) => [o.produto.id, o.comparavel])).toEqual([[3, 23], [2, 24.5], [1, 26]]);
    const oleo = ofertasDoProduto(p(10), catalogo, hoje);
    expect(oleo.mesmo.map((o) => o.produto.id)).toEqual([11, 10]);
    // o sem a norma dexos1 não é parecido
    expect(oleo.parecidos.map((o) => o.produto.id)).toEqual([12]);
  });
});

describe('preço pago', () => {
  const pedidos: PedidoEnviado[] = [
    { codigo: 'AAA111', quando: '2026-09-12T10:00:00.000Z', itens: [{ produtoId: 1, nome: 'Filtro de óleo PSL 55', quantidade: 10, precoUnitario: 25 }], total: 250 },
    { codigo: 'BBB222', quando: '2026-08-01T10:00:00.000Z', itens: [{ produtoId: 11, nome: 'Supera 5W30 balde 4 L', quantidade: 2, precoUnitario: 140 }], total: 280 }
  ];
  const estoque: Record<string, ItemEstoque> = {
    e1: { id: 'e1', nome: 'Supera 5W-30', marca: 'Lubrax', categoria: 'oleo_motor', unidade: 'L', quantidade: 10, minimo: 0, custo: 36, preco: null, criadoEm: '', atualizadoEm: '' }
  };
  const movimentos: MovimentoEstoque[] = [
    { id: 'm1', itemId: 'e1', quando: '2026-10-01T10:00:00.000Z', tipo: 'entrada', quantidade: 20, custoUnitario: 36, fornecedor: 'Balcão' },
    { id: 'm2', itemId: 'e1', quando: '2026-10-02T10:00:00.000Z', tipo: 'saida', quantidade: -4 }
  ];
  const pagos = precosPagos(pedidos, catalogo, movimentos, estoque);

  it('junta pedidos e entradas, os mais novos primeiro', () => {
    expect(pagos.map((x) => [x.origem, x.comparavel])).toEqual([
      ['estoque', 36],
      ['pedido', 25],
      ['pedido', 35]
    ]);
    expect(pagos[1].fornecedor).toBe('Central de Filtros');
  });

  it('acha a última compra pelo produto ou pelo mesmo produto de outra loja', () => {
    expect(ultimoPrecoPago(p(1), pagos)?.comparavel).toBe(25);
    expect(ultimoPrecoPago(p(2), pagos)?.comparavel).toBe(25);
    expect(ultimoPrecoPago(p(10), pagos)?.comparavel).toBe(36);
    expect(ultimoPrecoPago(p(4), pagos)).toBeNull();
  });

  it('diz se está caro, se só uma loja subiu ou se subiu em todo lugar', () => {
    const { mesmo } = ofertasDoProduto(p(1), catalogo, hoje);
    const pago = ultimoPrecoPago(p(1), pagos);
    const de = (id: number) => mesmo.find((o) => o.produto.id === id)!;
    const caro = lerPreco(de(1), pago, mesmo)!;
    expect(caro.tom).toBe('caro');
    expect(caro.texto).toContain('Auto Peças Niterói tem por R$');
    expect(caro.melhor?.produto.id).toBe(2);
    expect(lerPreco(de(2), pago, mesmo)!.tom).toBe('bom');
    // todo mundo acima do que pagou: subiu no mercado
    const subiu = lerPreco(de(1), { ...pago!, comparavel: 20 }, mesmo)!;
    expect(subiu.tom).toBe('neutro');
    expect(subiu.texto).toMatch(/^Subiu em todas as lojas: o menor preço hoje é R\$\s24,50/);
    expect(lerPreco(de(1), null, mesmo)!.texto).toContain('Auto Peças Niterói');
    expect(lerPreco(de(2), null, mesmo)!.texto).toBe('Menor preço entre 3 lojas.');
    expect(lerPreco(de(1), null, [de(1)])).toBeNull();
  });
});
