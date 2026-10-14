// Catálogo da loja (marketplace): fornecedores, produtos e promoções.

import type { Categoria, EspecProduto } from './tipos';

export type Unidade = 'un' | 'L' | 'kit' | 'par' | 'jogo';

export interface Fornecedor {
  id: number;
  nome: string;
  cidade: string | null;
  uf: string | null;
  demonstracao: boolean;
  /** Plano Destaque em dia: a loja aparece antes das outras e ganha o selo. */
  destaque: boolean;
  descricao: string | null;
}

/** Produto impulsionado (patrocinado) num período, no Brasil todo (uf null) ou num estado. */
export interface Patrocinio {
  produtoId: number;
  uf: string | null;
  inicio: string;
  fim: string;
}

export interface Promocao {
  id: number;
  produtoId: number;
  titulo: string;
  precoPromocional: number;
  quantidadeMinima: number;
  inicio: string;
  fim: string;
}

export interface Produto {
  id: number;
  fornecedorId: number;
  categoria: Categoria;
  nome: string;
  marca: string | null;
  descricao: string | null;
  unidade: Unidade;
  /** Litros por unidade (óleo e fluidos) ou o que vem no kit. */
  conteudo: number | null;
  preco: number;
  especificacao: EspecProduto;
  intervaloKm: number | null;
  intervaloMeses: number | null;
  /** Foto do produto (enviada pelo fornecedor). Sem ela, a loja usa a foto da categoria. */
  imagemUrl: string | null;
  /** Linha da base de prazos do fabricante, quando o produto está ligado a uma. */
  referenciaId: number | null;
}

export interface Catalogo {
  origem: 'banco' | 'exemplo';
  atualizadoEm: string;
  fornecedores: Fornecedor[];
  produtos: Produto[];
  promocoes: Promocao[];
  patrocinios: Patrocinio[];
}

/** Completa um catálogo guardado por uma versão antiga do app (campos novos ficam no padrão). */
export function normalizarCatalogo(c: Partial<Catalogo> & Pick<Catalogo, 'produtos'>): Catalogo {
  return {
    origem: c.origem ?? 'banco',
    atualizadoEm: c.atualizadoEm ?? new Date(0).toISOString(),
    fornecedores: (c.fornecedores ?? []).map((f) => ({ ...f, destaque: f.destaque ?? false, descricao: f.descricao ?? null })),
    produtos: c.produtos.map((p) => ({ ...p, imagemUrl: p.imagemUrl ?? null, referenciaId: p.referenciaId ?? null })),
    promocoes: c.promocoes ?? [],
    patrocinios: c.patrocinios ?? []
  };
}

/** O produto está impulsionado hoje para uma oficina deste estado. */
export function patrocinado(produtoId: number, patrocinios: Patrocinio[], uf: string, hoje: string): boolean {
  return patrocinios.some((x) => x.produtoId === produtoId && x.inicio <= hoje && x.fim >= hoje && (!x.uf || x.uf === uf));
}

/**
 * A ordem da vitrine: patrocinados primeiro, depois as lojas Destaque, depois o resto
 * (dentro de cada grupo, a ordem que já vinha, que é por categoria e preço).
 */
export function ordenarVitrine<T extends Pick<Produto, 'id' | 'fornecedorId'>>(produtos: T[], catalogo: Pick<Catalogo, 'fornecedores' | 'patrocinios'>, uf: string, hoje: string): T[] {
  const destaques = new Set(catalogo.fornecedores.filter((f) => f.destaque).map((f) => f.id));
  const peso = (p: T) => (patrocinado(p.id, catalogo.patrocinios, uf, hoje) ? 0 : destaques.has(p.fornecedorId) ? 1 : 2);
  return produtos
    .map((p, i) => ({ p, i, w: peso(p) }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .map((x) => x.p);
}

export const CATEGORIAS: { id: Categoria; nome: string }[] = [
  { id: 'oleo_motor', nome: 'Óleo de motor' },
  { id: 'filtro_oleo', nome: 'Filtro de óleo' },
  { id: 'filtro_ar', nome: 'Filtro de ar' },
  { id: 'filtro_combustivel', nome: 'Filtro de combustível' },
  { id: 'filtro_cabine', nome: 'Filtro de cabine' },
  { id: 'vela', nome: 'Velas' },
  { id: 'correia_dentada', nome: 'Correia dentada' },
  { id: 'correia_acessorios', nome: 'Correia de acessórios' },
  { id: 'pastilha_freio', nome: 'Pastilhas' },
  { id: 'disco_freio', nome: 'Discos' },
  { id: 'fluido_freio', nome: 'Fluido de freio' },
  { id: 'arrefecimento', nome: 'Arrefecimento' },
  { id: 'pneu', nome: 'Pneus' },
  { id: 'bateria', nome: 'Baterias' },
  { id: 'amortecedor', nome: 'Amortecedores' },
  { id: 'fluido_cambio', nome: 'Câmbio' },
  { id: 'higienizacao_ar', nome: 'Ar-condicionado' },
  { id: 'palheta', nome: 'Palhetas' },
  { id: 'outros', nome: 'Outros' }
];

export function nomeCategoria(id: Categoria): string {
  return CATEGORIAS.find((c) => c.id === id)?.nome ?? 'Outros';
}

export function promocoesAtivas(promocoes: Promocao[], produtoId: number, hoje: string): Promocao[] {
  return promocoes.filter((p) => p.produtoId === produtoId && p.inicio <= hoje && p.fim >= hoje);
}

/** A promoção de menor preço que vale para a quantidade (respeita a quantidade mínima). */
export function precoNaQuantidade(produto: Produto, promocoes: Promocao[], hoje: string, quantidade: number) {
  let melhor: Promocao | null = null;
  for (const p of promocoesAtivas(promocoes, produto.id, hoje)) {
    if (quantidade >= p.quantidadeMinima && p.precoPromocional < produto.preco && (!melhor || p.precoPromocional < melhor.precoPromocional)) melhor = p;
  }
  return { preco: melhor ? melhor.precoPromocional : produto.preco, promocao: melhor };
}

/** A melhor promoção do produto, sem olhar a quantidade (para a vitrine). */
export function melhorOferta(produto: Produto, promocoes: Promocao[], hoje: string): Promocao | null {
  let melhor: Promocao | null = null;
  for (const p of promocoesAtivas(promocoes, produto.id, hoje)) {
    if (p.precoPromocional < produto.preco && (!melhor || p.precoPromocional < melhor.precoPromocional)) melhor = p;
  }
  return melhor;
}

export function desconto(preco: number, promocional: number): number {
  return preco > 0 ? Math.round((1 - promocional / preco) * 100) : 0;
}

/** "Frasco de 1 L", "Galão de 4 L", "Jogo", "Par", "Unidade". */
export function embalagem(p: Pick<Produto, 'unidade' | 'conteudo'>): string {
  if (p.unidade === 'L') {
    const l = String(p.conteudo ?? 1).replace('.', ',');
    return (p.conteudo ?? 1) >= 3 ? `Galão de ${l} L` : `Frasco de ${l} L`;
  }
  if (p.unidade === 'kit') return 'Kit';
  if (p.unidade === 'jogo') return 'Jogo';
  if (p.unidade === 'par') return 'Par';
  return 'Unidade';
}

/** "4 frascos", "1 jogo", "2 pares". */
export function quantidadeComUnidade(p: Pick<Produto, 'unidade' | 'conteudo'>, quantidade: number): string {
  const plural = quantidade !== 1;
  switch (p.unidade) {
    case 'L':
      return (p.conteudo ?? 1) >= 3 ? `${quantidade} ${plural ? 'galões' : 'galão'}` : `${quantidade} ${plural ? 'frascos' : 'frasco'}`;
    case 'kit':
      return `${quantidade} ${plural ? 'kits' : 'kit'}`;
    case 'jogo':
      return `${quantidade} ${plural ? 'jogos' : 'jogo'}`;
    case 'par':
      return `${quantidade} ${plural ? 'pares' : 'par'}`;
    default:
      return `${quantidade} ${plural ? 'unidades' : 'unidade'}`;
  }
}

/** Litros em uma unidade de óleo (frasco, galão ou kit). */
export function litrosPorUnidade(p: Pick<Produto, 'unidade' | 'conteudo' | 'categoria'>): number | null {
  if (p.categoria !== 'oleo_motor') return null;
  if (p.unidade === 'L') return p.conteudo ?? 1;
  if (p.unidade === 'kit') return p.conteudo ?? null;
  return null;
}
