// A vitrine da loja: busca, filtros com contagem, ordenação e o que vai em destaque.
// Sem interface aqui, para testar e usar no app.

import { desconto, melhorOferta, nomeCategoria, ordenarVitrine, patrocinado, type Catalogo, type Fornecedor, type Produto, type Promocao } from './catalogo';
import { nomeBase } from './oleos';
import type { Categoria } from './tipos';

export type Ordem = 'relevancia' | 'menor_preco' | 'maior_desconto' | 'nome';

export const ORDENS: { id: Ordem; nome: string }[] = [
  { id: 'relevancia', nome: 'Relevância' },
  { id: 'menor_preco', nome: 'Menor preço' },
  { id: 'maior_desconto', nome: 'Maior desconto' },
  { id: 'nome', nome: 'Nome (A a Z)' }
];

/** Sem os preços (quem não entrou na conta), não dá para ordenar por preço nem por desconto. */
export function ordensDisponiveis(comPrecos: boolean): { id: Ordem; nome: string }[] {
  return comPrecos ? ORDENS : ORDENS.filter((o) => o.id === 'relevancia' || o.id === 'nome');
}

/**
 * O catálogo para quem não entrou na conta: os produtos e as lojas, sem os preços e sem as
 * promoções (preço 0 quer dizer "sem preço"). Os patrocinados continuam.
 */
export function semPrecos(c: Catalogo): Catalogo {
  return { ...c, produtos: c.produtos.map((p) => ({ ...p, preco: 0 })), promocoes: [] };
}

/** O produto veio com preço (o catálogo de quem entrou). */
export function temPreco(p: Pick<Produto, 'preco'>): boolean {
  return Number.isFinite(p.preco) && p.preco > 0;
}

export interface FiltrosLoja {
  busca: string;
  categoria: Categoria | null;
  promocao: boolean;
  destaque: boolean;
  fornecedores: number[];
  marcas: string[];
  viscosidades: string[];
  bases: string[];
  normas: string[];
  precoMin: number | null;
  precoMax: number | null;
}

export const FILTROS_VAZIOS: FiltrosLoja = {
  busca: '',
  categoria: null,
  promocao: false,
  destaque: false,
  fornecedores: [],
  marcas: [],
  viscosidades: [],
  bases: [],
  normas: [],
  precoMin: null,
  precoMax: null
};

export interface ContextoVitrine {
  catalogo: Pick<Catalogo, 'fornecedores' | 'promocoes' | 'patrocinios'>;
  uf: string;
  hoje: string;
}

/** O preço grande do cartão: o da melhor promoção, se tiver. */
export function precoDeVitrine(p: Produto, promocoes: Promocao[], hoje: string): number {
  return melhorOferta(p, promocoes, hoje)?.precoPromocional ?? p.preco;
}

export function descontoDeVitrine(p: Produto, promocoes: Promocao[], hoje: string): number {
  const o = melhorOferta(p, promocoes, hoje);
  return o ? desconto(p.preco, o.precoPromocional) : 0;
}

function semAcento(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function compacto(t: string): string {
  return semAcento(t).replace(/[^a-z0-9]/g, '');
}

/** Todo o texto que a busca olha: nome, marca, categoria, ficha técnica e loja. */
export function textoDoProduto(p: Produto, fornecedor?: Pick<Fornecedor, 'nome'>): string {
  const e = p.especificacao;
  return semAcento(
    [
      p.nome,
      p.marca,
      nomeCategoria(p.categoria),
      e.viscosidade,
      e.base ? nomeBase(e.base) : '',
      e.api ? `API ${e.api}` : '',
      e.ilsac,
      ...(e.acea ?? []),
      ...(e.normas ?? []),
      e.medida,
      e.amperagem ? `${e.amperagem} Ah` : '',
      e.tipo,
      fornecedor?.nome
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/** Cada palavra digitada tem de aparecer; "5w30" acha "5W-30". */
export function combinaBusca(texto: string, busca: string): boolean {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return true;
  const junto = texto.replace(/[^a-z0-9]/g, '');
  return termos.every((t) => texto.includes(t) || (compacto(t).length > 1 && junto.includes(compacto(t))));
}

export type Faceta = 'categoria' | 'promocao' | 'destaque' | 'fornecedores' | 'marcas' | 'viscosidades' | 'bases' | 'normas' | 'preco';

function dentro<T>(lista: T[], valor: T | null | undefined): boolean {
  return !lista.length || (valor != null && lista.includes(valor));
}

/** Os produtos que passam nos filtros. `exceto` ignora uma faceta (para contar as opções dela). */
export function filtrarProdutos(produtos: Produto[], f: FiltrosLoja, ctx: ContextoVitrine, exceto?: Faceta): Produto[] {
  const lojas = new Map(ctx.catalogo.fornecedores.map((x) => [x.id, x]));
  return produtos.filter((p) => {
    const loja = lojas.get(p.fornecedorId);
    if (exceto !== 'categoria' && f.categoria && p.categoria !== f.categoria) return false;
    if (exceto !== 'promocao' && f.promocao && !melhorOferta(p, ctx.catalogo.promocoes, ctx.hoje)) return false;
    if (exceto !== 'destaque' && f.destaque && !loja?.destaque) return false;
    if (exceto !== 'fornecedores' && !dentro(f.fornecedores, p.fornecedorId)) return false;
    if (exceto !== 'marcas' && !dentro(f.marcas, p.marca)) return false;
    if (exceto !== 'viscosidades' && !dentro(f.viscosidades, p.especificacao.viscosidade)) return false;
    if (exceto !== 'bases' && !dentro(f.bases, p.especificacao.base)) return false;
    if (exceto !== 'normas' && f.normas.length && !(p.especificacao.normas ?? []).some((n) => f.normas.includes(n))) return false;
    if (exceto !== 'preco') {
      const preco = precoDeVitrine(p, ctx.catalogo.promocoes, ctx.hoje);
      if (f.precoMin != null && preco < f.precoMin) return false;
      if (f.precoMax != null && preco > f.precoMax) return false;
    }
    return combinaBusca(textoDoProduto(p, loja), f.busca);
  });
}

export function ordenarProdutos(produtos: Produto[], ordem: Ordem, ctx: ContextoVitrine): Produto[] {
  if (ordem === 'relevancia') return ordenarVitrine(produtos, ctx.catalogo, ctx.uf, ctx.hoje);
  const lista = [...produtos];
  const preco = (p: Produto) => precoDeVitrine(p, ctx.catalogo.promocoes, ctx.hoje);
  if (ordem === 'menor_preco') return lista.sort((a, b) => preco(a) - preco(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (ordem === 'maior_desconto') {
    const d = (p: Produto) => descontoDeVitrine(p, ctx.catalogo.promocoes, ctx.hoje);
    return lista.sort((a, b) => d(b) - d(a) || preco(a) - preco(b));
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface Opcao<T> {
  valor: T;
  nome: string;
  n: number;
}

export interface Facetas {
  categorias: Opcao<Categoria>[];
  promocao: number;
  destaque: number;
  fornecedores: Opcao<number>[];
  marcas: Opcao<string>[];
  viscosidades: Opcao<string>[];
  bases: Opcao<string>[];
  normas: Opcao<string>[];
  /** Menor e maior preço dos produtos que os outros filtros deixam. */
  faixa: { min: number; max: number } | null;
}

function contar<T>(lista: Produto[], chaves: (p: Produto) => (T | null | undefined)[], nome: (v: T) => string): Opcao<T>[] {
  const m = new Map<T, number>();
  for (const p of lista) for (const v of new Set(chaves(p))) if (v != null && v !== '') m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([valor, n]) => ({ valor, nome: nome(valor), n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** As opções de cada filtro, com quantos produtos cada uma traria (respeitando os outros filtros). */
export function calcularFacetas(produtos: Produto[], f: FiltrosLoja, ctx: ContextoVitrine): Facetas {
  const lojas = new Map(ctx.catalogo.fornecedores.map((x) => [x.id, x]));
  const sem = (faceta: Faceta) => filtrarProdutos(produtos, f, ctx, faceta);
  const ordemViscosidade = (v: string) => {
    const [a, b] = v.split('W-').map((x) => Number.parseInt(x, 10));
    return (Number.isFinite(a) ? a : 99) * 100 + (Number.isFinite(b) ? b : 0);
  };
  const precos = sem('preco').map((p) => precoDeVitrine(p, ctx.catalogo.promocoes, ctx.hoje));
  return {
    categorias: contar(sem('categoria'), (p) => [p.categoria], nomeCategoria),
    promocao: sem('promocao').filter((p) => melhorOferta(p, ctx.catalogo.promocoes, ctx.hoje)).length,
    destaque: sem('destaque').filter((p) => lojas.get(p.fornecedorId)?.destaque).length,
    fornecedores: contar(sem('fornecedores'), (p) => [p.fornecedorId], (id) => lojas.get(id)?.nome ?? 'Fornecedor'),
    marcas: contar(sem('marcas'), (p) => [p.marca], (m) => m),
    viscosidades: contar(sem('viscosidades'), (p) => [p.especificacao.viscosidade], (v) => v).sort((a, b) => ordemViscosidade(a.valor) - ordemViscosidade(b.valor)),
    bases: contar(sem('bases'), (p) => [p.especificacao.base], (b) => nomeBase(b as never) || b),
    normas: contar(sem('normas'), (p) => p.especificacao.normas ?? [], (n) => n),
    faixa: precos.length ? { min: Math.floor(Math.min(...precos)), max: Math.ceil(Math.max(...precos)) } : null
  };
}

export interface FiltroAtivo {
  chave: string;
  rotulo: string;
  sem: FiltrosLoja;
}

/** Os filtros ligados, cada um com o jeito de desligar (para as etiquetas acima dos resultados). */
export function filtrosAtivos(f: FiltrosLoja, ctx: ContextoVitrine): FiltroAtivo[] {
  const lojas = new Map(ctx.catalogo.fornecedores.map((x) => [x.id, x.nome]));
  const r: FiltroAtivo[] = [];
  const brl = (n: number) => `R$ ${String(n).replace('.', ',')}`;
  if (f.busca.trim()) r.push({ chave: 'busca', rotulo: `"${f.busca.trim()}"`, sem: { ...f, busca: '' } });
  if (f.categoria) r.push({ chave: 'categoria', rotulo: nomeCategoria(f.categoria), sem: { ...f, categoria: null, viscosidades: [], bases: [], normas: [] } });
  if (f.promocao) r.push({ chave: 'promocao', rotulo: 'Em promoção', sem: { ...f, promocao: false } });
  if (f.destaque) r.push({ chave: 'destaque', rotulo: 'Lojas destaque', sem: { ...f, destaque: false } });
  for (const id of f.fornecedores) r.push({ chave: `f${id}`, rotulo: lojas.get(id) ?? 'Fornecedor', sem: { ...f, fornecedores: f.fornecedores.filter((x) => x !== id) } });
  for (const m of f.marcas) r.push({ chave: `m${m}`, rotulo: m, sem: { ...f, marcas: f.marcas.filter((x) => x !== m) } });
  for (const v of f.viscosidades) r.push({ chave: `v${v}`, rotulo: v, sem: { ...f, viscosidades: f.viscosidades.filter((x) => x !== v) } });
  for (const b of f.bases) r.push({ chave: `b${b}`, rotulo: nomeBase(b as never) || b, sem: { ...f, bases: f.bases.filter((x) => x !== b) } });
  for (const n of f.normas) r.push({ chave: `n${n}`, rotulo: n, sem: { ...f, normas: f.normas.filter((x) => x !== n) } });
  if (f.precoMin != null || f.precoMax != null) {
    const rotulo = f.precoMin != null && f.precoMax != null ? `${brl(f.precoMin)} a ${brl(f.precoMax)}` : f.precoMin != null ? `A partir de ${brl(f.precoMin)}` : `Até ${brl(f.precoMax!)}`;
    r.push({ chave: 'preco', rotulo, sem: { ...f, precoMin: null, precoMax: null } });
  }
  return r;
}

/** Quantos filtros estão ligados, fora a busca e a categoria (para o botão Filtros do celular). */
export function quantosFiltros(f: FiltrosLoja): number {
  return (
    (f.promocao ? 1 : 0) +
    (f.destaque ? 1 : 0) +
    f.fornecedores.length +
    f.marcas.length +
    f.viscosidades.length +
    f.bases.length +
    f.normas.length +
    (f.precoMin != null || f.precoMax != null ? 1 : 0)
  );
}

export interface DestaqueDaVitrine {
  produto: Produto;
  motivo: 'patrocinado' | 'oferta';
}

/** O carrossel do topo: primeiro os produtos impulsionados, depois as maiores promoções. */
export function destaquesDaVitrine(produtos: Produto[], ctx: ContextoVitrine, maximo = 5): DestaqueDaVitrine[] {
  const pagos = produtos.filter((p) => patrocinado(p.id, ctx.catalogo.patrocinios, ctx.uf, ctx.hoje));
  const ofertas = produtos
    .filter((p) => !pagos.includes(p) && descontoDeVitrine(p, ctx.catalogo.promocoes, ctx.hoje) > 0)
    .sort((a, b) => descontoDeVitrine(b, ctx.catalogo.promocoes, ctx.hoje) - descontoDeVitrine(a, ctx.catalogo.promocoes, ctx.hoje));
  return [...pagos.map((produto) => ({ produto, motivo: 'patrocinado' as const })), ...ofertas.map((produto) => ({ produto, motivo: 'oferta' as const }))].slice(0, maximo);
}

/** A loja Destaque que aparece no meio da vitrine hoje (troca a cada dia, entre as que têm produto). */
export function lojaDoDia(fornecedores: Fornecedor[], produtos: Pick<Produto, 'fornecedorId'>[], hoje: string): Fornecedor | null {
  const comProduto = new Set(produtos.map((p) => p.fornecedorId));
  const lista = fornecedores.filter((f) => f.destaque && comProduto.has(f.id)).sort((a, b) => a.id - b.id);
  if (!lista.length) return null;
  const dia = Math.floor(Date.parse(`${hoje}T12:00:00Z`) / 86_400_000);
  return lista[dia % lista.length];
}
