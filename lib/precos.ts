// Preço pago e preço das outras lojas: a oficina vê se o preço de hoje está bom, se só uma loja
// subiu ou se subiu em todo lugar. O mesmo produto em lojas diferentes é achado pelo nome
// (marca, linha e viscosidade), sem a embalagem; o óleo é comparado pelo preço do litro.

import { formatarData } from './datas';
import { formatarMoeda } from './formatos';
import { litrosPorUnidade, precoNaQuantidade, type Catalogo, type Fornecedor, type Produto } from './catalogo';
import { normalizarViscosidade, normaAtendida } from './oleos';
import type { Categoria, ItemEstoque, MovimentoEstoque, PedidoEnviado } from './tipos';

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// embalagem e medida não fazem parte do produto: "1 L", "frasco", "galão", "kit"
const EMBALAGEM = /\b\d+(?:[.,]\d+)?\s*(?:l|lt|lts|litros?|ml)\b|\b(?:frasco|galao|kit|unidade|un|cx|caixa|balde|tambor|embalagem)\b/g;

// palavras que repetem o nome da categoria ou só ligam as outras
const GENERICAS = new Set([
  'de', 'do', 'da', 'das', 'dos', 'para', 'com', 'e', 'o', 'a',
  'filtro', 'filtros', 'oleo', 'motor', 'ar', 'combustivel', 'cabine', 'refil', 'elemento',
  'vela', 'velas', 'ignicao', 'pastilha', 'pastilhas', 'freio', 'freios', 'disco', 'discos',
  'pneu', 'pneus', 'bateria', 'amortecedor', 'amortecedores', 'palheta', 'palhetas', 'fluido', 'liquido', 'correia'
]);

/** As palavras que identificam o produto (marca, linha, código, viscosidade), em ordem alfabética. */
export function palavrasDoProduto(texto: string): string[] {
  const t = semAcento(texto.toLowerCase())
    .replace(/(\d{1,2})\s*w\s*-?\s*(\d{2})/g, '$1w$2')
    .replace(EMBALAGEM, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const palavras = t.split(/\s+/).filter((p) => p && !GENERICAS.has(p));
  // código escrito separado ("PSL 55") junta com o número ("PSL55")
  const juntas: string[] = [];
  for (const p of palavras) {
    const antes = juntas[juntas.length - 1];
    if (antes && /^[a-z]{2,4}$/.test(antes) && /^\d+$/.test(p)) juntas[juntas.length - 1] = antes + p;
    else juntas.push(p);
  }
  return [...new Set(juntas)].sort();
}

/** O mesmo produto em lojas diferentes tem a mesma chave. */
export function chaveDoProduto(p: { categoria: Categoria; marca?: string | null; nome: string }): string {
  return `${p.categoria}|${palavrasDoProduto([p.marca, p.nome].filter(Boolean).join(' ')).join(' ')}`;
}

/** O preço que dá para comparar entre embalagens: o do litro no óleo, o da unidade no resto. */
export function precoComparavel(p: Pick<Produto, 'categoria' | 'unidade' | 'conteudo'>, preco: number): number {
  const litros = litrosPorUnidade(p);
  return Math.round((litros ? preco / litros : preco) * 100) / 100;
}

export function porLitro(p: Pick<Produto, 'categoria' | 'unidade' | 'conteudo'>): boolean {
  return litrosPorUnidade(p) != null;
}

/** "R$ 31,90 o litro" ou "R$ 24,50". */
export function textoComparavel(valor: number, litro: boolean): string {
  return `${formatarMoeda(valor)}${litro ? ' o litro' : ''}`;
}

export interface Oferta {
  produto: Produto;
  fornecedor: Fornecedor | undefined;
  /** Preço da embalagem na quantidade pedida (com a promoção que vale). */
  preco: number;
  comparavel: number;
  promocao: boolean;
}

function oferta(p: Produto, catalogo: Catalogo, hoje: string, quantidade: number): Oferta {
  const { preco, promocao } = precoNaQuantidade(p, catalogo.promocoes, hoje, quantidade);
  return { produto: p, fornecedor: catalogo.fornecedores.find((f) => f.id === p.fornecedorId), preco, comparavel: precoComparavel(p, preco), promocao: !!promocao };
}

function parecido(base: Produto, p: Produto): boolean {
  if (p.categoria !== base.categoria) return false;
  const a = base.especificacao;
  const b = p.especificacao;
  if (base.categoria === 'oleo_motor') {
    if (!a.viscosidade || !b.viscosidade || normalizarViscosidade(a.viscosidade) !== normalizarViscosidade(b.viscosidade)) return false;
    // atende a todas as normas de montadora do produto de base
    return (a.normas ?? []).every((n) => normaAtendida(b.normas, n));
  }
  if (a.medida) return a.medida === b.medida;
  if (a.amperagem) return a.amperagem === b.amperagem;
  return false;
}

/**
 * As ofertas do mesmo produto nas lojas (a do próprio produto inclusive), do menor para o maior
 * preço comparável, e as de produtos parecidos (outro óleo com a mesma viscosidade e normas,
 * outro pneu da mesma medida).
 */
export function ofertasDoProduto(base: Produto, catalogo: Catalogo, hoje: string, quantidade = 1): { mesmo: Oferta[]; parecidos: Oferta[] } {
  const ativos = new Set(catalogo.fornecedores.map((f) => f.id));
  const chave = chaveDoProduto(base);
  const mesmo: Oferta[] = [];
  const parecidos: Oferta[] = [];
  for (const p of catalogo.produtos) {
    if (!ativos.has(p.fornecedorId)) continue;
    if (p.id === base.id || chaveDoProduto(p) === chave) mesmo.push(oferta(p, catalogo, hoje, quantidade));
    else if (parecido(base, p)) parecidos.push(oferta(p, catalogo, hoje, quantidade));
  }
  const porPreco = (a: Oferta, b: Oferta) => a.comparavel - b.comparavel || a.produto.id - b.produto.id;
  return { mesmo: mesmo.sort(porPreco), parecidos: parecidos.sort(porPreco) };
}

export interface PrecoPago {
  chave: string | null;
  produtoId?: number;
  nome: string;
  /** Preço da embalagem (pedido) ou da unidade de estoque (entrada). */
  preco: number;
  comparavel: number;
  quando: string;
  fornecedor?: string;
  origem: 'pedido' | 'estoque';
}

/** Tudo o que a oficina já pagou: os pedidos da loja e as entradas no estoque com custo. */
export function precosPagos(pedidos: PedidoEnviado[], catalogo: Pick<Catalogo, 'produtos' | 'fornecedores'> | null, movimentos: MovimentoEstoque[], estoque: Record<string, ItemEstoque>): PrecoPago[] {
  const lista: PrecoPago[] = [];
  const doCatalogo = new Map((catalogo?.produtos ?? []).map((p) => [p.id, p]));
  for (const ped of pedidos) {
    for (const i of ped.itens) {
      const p = doCatalogo.get(i.produtoId);
      lista.push({
        chave: i.chave ?? (p ? chaveDoProduto(p) : null),
        produtoId: i.produtoId,
        nome: i.nome,
        preco: i.precoUnitario,
        comparavel: i.precoComparavel ?? (p ? precoComparavel(p, i.precoUnitario) : i.precoUnitario),
        quando: ped.quando,
        fornecedor: i.fornecedor ?? catalogo?.fornecedores.find((f) => f.id === (i.fornecedorId ?? p?.fornecedorId))?.nome,
        origem: 'pedido'
      });
    }
  }
  for (const m of movimentos) {
    if (m.tipo !== 'entrada' || m.custoUnitario == null || m.custoUnitario <= 0 || m.origem?.tipo === 'pedido') continue;
    const item = estoque[m.itemId];
    if (!item) continue;
    lista.push({
      chave: chaveDoProduto(item),
      produtoId: item.produtoLojaId,
      nome: [item.marca, item.nome].filter(Boolean).join(' '),
      preco: m.custoUnitario,
      comparavel: m.custoUnitario,
      quando: m.quando,
      fornecedor: m.fornecedor,
      origem: 'estoque'
    });
  }
  return lista.sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
}

/** A última vez que pagou por este produto (na mesma loja ou em outra). */
export function ultimoPrecoPago(p: Pick<Produto, 'id' | 'categoria' | 'marca' | 'nome'>, pagos: PrecoPago[]): PrecoPago | null {
  const chave = chaveDoProduto(p);
  return pagos.find((x) => x.produtoId === p.id) ?? pagos.find((x) => x.chave === chave) ?? null;
}

export interface LeituraDePreco {
  tom: 'bom' | 'caro' | 'neutro';
  texto: string;
  /** A loja que tem mais barato, quando tem. */
  melhor?: Oferta;
}

const IGUAL = 0.005;

function nomeDaLoja(o: Oferta): string {
  return o.fornecedor?.nome ?? 'outra loja';
}

/**
 * Compara o preço de hoje com o que a oficina pagou e com as outras lojas.
 * "Subiu em todas as lojas" quando nenhuma loja tem pelo preço pago.
 */
export function lerPreco(atual: Oferta, pago: PrecoPago | null, ofertas: Oferta[]): LeituraDePreco | null {
  const litro = porLitro(atual.produto);
  const outras = ofertas.filter((o) => o.produto.id !== atual.produto.id);
  const maisBarata = outras.filter((o) => o.comparavel < atual.comparavel * (1 - IGUAL)).sort((a, b) => a.comparavel - b.comparavel)[0];
  const quando = pago ? ` em ${formatarData(pago.quando.slice(0, 10))}` : '';

  if (pago) {
    const diferenca = Math.round((atual.comparavel - pago.comparavel) * 100) / 100;
    const pagou = `Você pagou ${textoComparavel(pago.comparavel, litro)}${quando}`;
    if (atual.comparavel > pago.comparavel * (1 + IGUAL)) {
      const peloPago = outras.filter((o) => o.comparavel <= pago.comparavel * (1 + IGUAL)).sort((a, b) => a.comparavel - b.comparavel)[0];
      if (peloPago) return { tom: 'caro', texto: `${pagou}. A ${nomeDaLoja(peloPago)} tem por ${textoComparavel(peloPago.comparavel, litro)}.`, melhor: peloPago };
      if (outras.length) {
        const menor = Math.min(atual.comparavel, ...outras.map((o) => o.comparavel));
        return {
          tom: 'neutro',
          texto: `Subiu em todas as lojas: o menor preço hoje é ${textoComparavel(menor, litro)}. ${pagou}.`,
          melhor: maisBarata
        };
      }
      return { tom: 'caro', texto: `${formatarMoeda(diferenca)} mais caro que da última vez. ${pagou}.` };
    }
    if (atual.comparavel < pago.comparavel * (1 - IGUAL)) return { tom: 'bom', texto: `${formatarMoeda(-diferenca)} mais barato que da última vez. ${pagou}.`, melhor: maisBarata };
    return { tom: 'neutro', texto: `Mesmo preço da última vez${quando}.`, melhor: maisBarata };
  }

  if (!outras.length) return null;
  if (!maisBarata) return { tom: 'bom', texto: `Menor preço entre ${ofertas.length} lojas.` };
  return { tom: 'neutro', texto: `A ${nomeDaLoja(maisBarata)} tem por ${textoComparavel(maisBarata.comparavel, litro)}.`, melhor: maisBarata };
}
