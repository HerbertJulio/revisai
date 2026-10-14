// Sugestões de promoção para o fornecedor, a partir da demanda somada da região.
// O fornecedor vê quanto as oficinas vão comprar, nunca quem são elas ou os clientes delas.

import { quantidadeDaLinha, type LinhaRegional } from './demanda';
import type { Categoria, EspecProduto } from './tipos';

export interface ProdutoDoFornecedor {
  id: number;
  categoria: Categoria;
  nome: string;
  marca: string | null;
  unidade: 'un' | 'L' | 'kit' | 'par' | 'jogo';
  conteudo: number | null;
  preco: number;
  especificacao: EspecProduto;
  ativo: boolean;
}

export interface PromocaoVigente {
  produtoId: number;
  inicio: string;
  fim: string;
}

export interface Sugestao {
  linha: LinhaRegional;
  /** O produto do fornecedor que atende a essa demanda (o mais barato), se houver. */
  produto: ProdutoDoFornecedor | null;
  /** Já tem promoção em vigor para o produto. */
  jaEmPromocao: boolean;
  /** Unidades do produto para atender à demanda toda. */
  unidades: number;
  precoSugerido: number | null;
  quantidadeMinima: number;
  descontoPercentual: number;
  texto: string;
}

/** Preço "de vitrine" que não passa do valor: 39,47 vira 38,90; 40,10 vira 39,90. */
export function precoRedondo(valor: number): number {
  const inteiro = Math.floor(valor);
  const comNoventa = inteiro + 0.9;
  return Math.round((comNoventa <= valor + 1e-9 ? comNoventa : inteiro - 0.1) * 100) / 100;
}

function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** O produto atende à linha da demanda? Para óleo, confere a viscosidade e a norma que vierem no título. */
export function atende(p: ProdutoDoFornecedor, linha: LinhaRegional): boolean {
  if (!p.ativo || p.categoria !== linha.categoria) return false;
  if (p.categoria !== 'oleo_motor') return true;
  const titulo = normalizar(linha.titulo);
  const viscosidades = [...titulo.matchAll(/\d{1,2}w-?\d{2}/g)].map((m) => m[0].replace('-', ''));
  const doProduto = normalizar(`${p.especificacao.viscosidade ?? ''} ${p.nome}`).replace(/-/g, '');
  if (viscosidades.length && !viscosidades.some((v) => doProduto.includes(v))) return false;
  const textoProduto = normalizar([p.nome, ...(p.especificacao.normas ?? []), p.especificacao.api ?? '', ...(p.especificacao.acea ?? [])].join(' '));
  for (const norma of ['dexos1', 'dexos2', '508 88', '504 00', '9.55535', 'c2', 'c3']) {
    if (titulo.includes(norma) && !textoProduto.includes(norma)) return false;
  }
  return true;
}

function unidadesPara(p: ProdutoDoFornecedor, linha: LinhaRegional): number {
  if (linha.unidade === 'L') {
    const porUnidade = p.unidade === 'L' || p.unidade === 'kit' ? (p.conteudo ?? 1) : 1;
    return Math.max(1, Math.ceil(linha.quantidade / porUnidade - 1e-9));
  }
  return Math.max(1, Math.round(linha.quantidade));
}

function nomeUnidade(p: ProdutoDoFornecedor, n: number): string {
  const plural = n !== 1;
  if (p.unidade === 'L') return (p.conteudo ?? 1) >= 3 ? (plural ? 'galões' : 'galão') : plural ? 'frascos' : 'frasco';
  if (p.unidade === 'jogo') return plural ? 'jogos' : 'jogo';
  if (p.unidade === 'kit') return plural ? 'kits' : 'kit';
  if (p.unidade === 'par') return plural ? 'pares' : 'par';
  return plural ? 'unidades' : 'unidade';
}

function reais(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

/**
 * Para cada linha da demanda regional, o produto do fornecedor que atende e uma promoção
 * sugerida (desconto maior quando o volume é maior, a partir da compra típica de uma oficina).
 */
export function sugerirPromocoes(linhas: LinhaRegional[], produtos: ProdutoDoFornecedor[], promocoes: PromocaoVigente[], hoje: string): Sugestao[] {
  const emPromocao = new Set(promocoes.filter((x) => x.inicio <= hoje && x.fim >= hoje).map((x) => x.produtoId));
  return linhas.map((linha) => {
    const candidatos = produtos.filter((p) => atende(p, linha)).sort((a, b) => a.preco - b.preco);
    const produto = candidatos[0] ?? null;
    if (!produto) {
      return {
        linha,
        produto: null,
        jaEmPromocao: false,
        unidades: 0,
        precoSugerido: null,
        quantidadeMinima: 1,
        descontoPercentual: 0,
        texto: `${linha.oficinas} oficinas da região vão precisar de ${quantidadeDaLinha(linha)} (${linha.titulo}) e você ainda não tem um produto para isso na loja.`
      };
    }
    const unidades = unidadesPara(produto, linha);
    const desconto = unidades >= 40 ? 10 : unidades >= 20 ? 8 : 6;
    const precoSugerido = precoRedondo(produto.preco * (1 - desconto / 100));
    const quantidadeMinima = Math.max(1, Math.round(unidades / Math.max(1, linha.oficinas)));
    const descontoReal = Math.round((1 - precoSugerido / produto.preco) * 100);
    const ja = emPromocao.has(produto.id);
    const texto = ja
      ? `${linha.oficinas} oficinas vão precisar de ${quantidadeDaLinha(linha)} (${linha.titulo}). Sua promoção de ${produto.nome} está no ar e aparece para elas.`
      : `${linha.oficinas} oficinas vão precisar de ${quantidadeDaLinha(linha)} (${linha.titulo}), umas ${unidades} ${nomeUnidade(produto, unidades)} de ${produto.nome}. Ofereça por ${reais(precoSugerido)} a partir de ${quantidadeMinima} ${nomeUnidade(produto, quantidadeMinima)} (${descontoReal}% de desconto).`;
    return { linha, produto, jaEmPromocao: ja, unidades, precoSugerido, quantidadeMinima, descontoPercentual: descontoReal, texto };
  });
}
