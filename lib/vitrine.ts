// A vitrine da loja: busca, filtros com contagem, ordenação e o que vai em destaque.
// Sem interface aqui, para testar e usar no app.

import { z } from 'zod';
import { desconto, melhorOferta, nomeCategoria, ordenarVitrine, patrocinado, precoNaQuantidade, type Catalogo, type Fornecedor, type Patrocinio, type Produto, type Promocao } from './catalogo';
import { serveNoCarro } from './loja/aplicacoes';
import { lerAplicacoes, type Aplicacao } from './loja/dados';
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

// ---------------------------------------------------------------- o que as lojas informam além do catálogo

/** A loja: prazo de entrega, pedido mínimo e o cashback que ela dá. */
export interface InfoDaLoja {
  prazoEntregaHoras: number | null;
  pedidoMinimo: number | null;
  cashbackPercentual: number;
}

/** O produto: o estoque (null quando a loja não informa), em que carros serve e o prazo de entrega dele, quando difere do da loja. */
export interface InfoDoProduto {
  estoque: number | null;
  aplicacoes: Aplicacao[];
  prazoEntregaHoras?: number | null;
}

/** Um anúncio no ar (impulso), por período ou por clique; o servidor já tirou os sem teto no dia. */
export interface Anuncio {
  impulsoId: number;
  produtoId: number;
  uf: string | null;
  inicio: string;
  fim: string;
  porClique: boolean;
}

export interface ExtrasDaVitrine {
  lojas: Record<string, InfoDaLoja>;
  produtos: Record<string, InfoDoProduto>;
  anuncios: Anuncio[];
}

export const EXTRAS_VAZIOS: ExtrasDaVitrine = { lojas: {}, produtos: {}, anuncios: [] };

const numeroOuNulo = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)));
const esquemaInfoDaLoja = z.object({ prazoEntregaHoras: numeroOuNulo, pedidoMinimo: numeroOuNulo, cashbackPercentual: numeroOuNulo.transform((v) => v ?? 0) });
const esquemaInfoDoProduto = z.object({ estoque: numeroOuNulo, aplicacoes: z.unknown().transform((a) => lerAplicacoes(a)), prazoEntregaHoras: numeroOuNulo });
const esquemaAnuncio = z.object({ impulsoId: z.number().int().positive(), produtoId: z.number().int().positive(), uf: z.string().nullable(), inicio: z.string(), fim: z.string(), porClique: z.boolean() });

function lerRegistro<T>(d: unknown, esquema: z.ZodType<T>): Record<string, T> {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(d)) {
    const x = esquema.safeParse(v);
    if (/^\d+$/.test(k) && x.success) r[k] = x.data;
  }
  return r;
}

/** O que veio junto do catálogo (de uma versão antiga do app ou do servidor, pode faltar tudo). */
export function lerExtras(d: unknown): ExtrasDaVitrine {
  const o = d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
  return {
    lojas: lerRegistro(o.lojas, esquemaInfoDaLoja),
    produtos: lerRegistro(o.produtos, esquemaInfoDoProduto),
    anuncios: (Array.isArray(o.anuncios) ? o.anuncios : []).flatMap((a) => {
      const r = esquemaAnuncio.safeParse(a);
      return r.success ? [r.data] : [];
    })
  };
}

export function infoDaLoja(extras: ExtrasDaVitrine, fornecedorId: number): InfoDaLoja | null {
  return extras.lojas[String(fornecedorId)] ?? null;
}

export function infoDoProduto(extras: ExtrasDaVitrine, produtoId: number): InfoDoProduto | null {
  return extras.produtos[String(produtoId)] ?? null;
}

/** O prazo de entrega de um produto: o que a loja deu para ele ou, sem isso, o da loja. */
export function prazoDoProduto(extras: ExtrasDaVitrine, produtoId: number, fornecedorId: number): number | null {
  return infoDoProduto(extras, produtoId)?.prazoEntregaHoras ?? infoDaLoja(extras, fornecedorId)?.prazoEntregaHoras ?? null;
}

/** Os anúncios do produto que valem hoje para uma oficina do estado (o do estado antes do nacional). */
export function anunciosDoProduto(produtoId: number, anuncios: Anuncio[], uf: string, hoje: string): Anuncio[] {
  return anuncios
    .filter((a) => a.produtoId === produtoId && a.inicio <= hoje && a.fim >= hoje && (!a.uf || a.uf === uf))
    .sort((a, b) => Number(!!b.uf) - Number(!!a.uf) || a.impulsoId - b.impulsoId);
}

/** O que o aparelho já mandou hoje, pela oficina: anúncios vistos e clicados (cada um conta uma vez por dia). */
export interface AnunciosDoDia {
  oficina: string;
  dia: string;
  vistos: number[];
  cliques: number[];
}

/** O registro de hoje: o guardado, se for da mesma oficina e do mesmo dia; senão, um vazio. */
export function anunciosDoDia(guardado: unknown, oficina: string, dia: string): AnunciosDoDia {
  const g = guardado && typeof guardado === 'object' ? (guardado as Partial<AnunciosDoDia>) : null;
  const ids = (l: unknown) => (Array.isArray(l) ? l.filter((x): x is number => Number.isSafeInteger(x) && x > 0).slice(-500) : []);
  if (!g || g.oficina !== oficina || g.dia !== dia) return { oficina, dia, vistos: [], cliques: [] };
  return { oficina, dia, vistos: ids(g.vistos), cliques: ids(g.cliques) };
}

/** Os anúncios do produto que ainda não foram contados hoje como vistos. */
export function anunciosParaContar(produtoId: number, anuncios: Anuncio[], uf: string, hoje: string, jaContados: readonly number[]): number[] {
  return anunciosDoProduto(produtoId, anuncios, uf, hoje)
    .map((a) => a.impulsoId)
    .filter((id) => !jaContados.includes(id));
}

/** Os patrocínios que seguem valendo, sem os anúncios que esgotaram o teto do dia. */
export function semAnunciosEsgotados(patrocinios: Patrocinio[], anuncios: Anuncio[], esgotados: ReadonlySet<number>): Patrocinio[] {
  if (!esgotados.size) return patrocinios;
  const fora = anuncios.filter((a) => esgotados.has(a.impulsoId));
  return patrocinios.filter((p) => !fora.some((a) => a.produtoId === p.produtoId && a.uf === p.uf && a.inicio === p.inicio && a.fim === p.fim));
}

/** Até quantas unidades a vitrine avisa "últimas unidades". */
export const ULTIMAS_UNIDADES = 5;

/** O estoque que a loja informou, para o selo: sem estoque, últimas unidades ou nada a dizer. */
export function estoqueDaLoja(estoque: number | null | undefined): 'sem' | 'ultimas' | null {
  if (estoque == null || !Number.isFinite(estoque)) return null;
  if (estoque <= 0) return 'sem';
  return estoque <= ULTIMAS_UNIDADES ? 'ultimas' : null;
}

export function textoDoEstoqueDaLoja(estoque: number | null | undefined): string | null {
  const s = estoqueDaLoja(estoque);
  return s === 'sem' ? 'Sem estoque' : s === 'ultimas' ? 'Últimas unidades' : null;
}

function centavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** As lojas do pedido que não chegam ao pedido mínimo, com quanto falta. */
export function abaixoDoMinimo(somas: { fornecedorId: number; total: number }[], extras: ExtrasDaVitrine): { fornecedorId: number; minimo: number; soma: number; falta: number }[] {
  const porLoja = new Map<number, number>();
  for (const l of somas) porLoja.set(l.fornecedorId, (porLoja.get(l.fornecedorId) ?? 0) + l.total);
  return [...porLoja].flatMap(([fornecedorId, soma]) => {
    const minimo = infoDaLoja(extras, fornecedorId)?.pedidoMinimo;
    const s = centavos(soma);
    return minimo != null && minimo > 0 && s < minimo ? [{ fornecedorId, minimo, soma: s, falta: centavos(minimo - s) }] : [];
  });
}

// ---------------------------------------------------------------- preço combinado com a oficina

/** Desconto (na loja toda ou num produto) ou preço fixo (num produto) que a loja deu à oficina. */
export interface CondicaoDaOficina {
  fornecedorId: number;
  produtoId: number | null;
  descontoPercentual: number | null;
  preco: number | null;
}

/**
 * O preço que a loja deu só para esta oficina, com a mesma conta do banco (privado.preco_para_oficina):
 * o preço fixo do produto vale primeiro; sem ele, o maior desconto (do produto ou da loja toda) sobre o
 * preço de tabela. Null quando a loja não combinou nada que valha para o produto.
 */
export function precoCombinadoComOficina(p: Pick<Produto, 'id' | 'fornecedorId' | 'preco'>, condicoes: CondicaoDaOficina[]): number | null {
  const valem = condicoes.filter((c) => c.fornecedorId === p.fornecedorId && (c.produtoId === p.id || c.produtoId == null));
  const fixos = valem.filter((c) => c.produtoId === p.id && c.preco != null && c.preco > 0).map((c) => c.preco!);
  if (fixos.length) return Math.min(...fixos);
  const descontos = valem.filter((c) => c.descontoPercentual != null && c.descontoPercentual > 0).map((c) => c.descontoPercentual!);
  if (!descontos.length || !(p.preco > 0)) return null;
  return centavos(p.preco * (1 - Math.max(...descontos) / 100));
}

/**
 * O preço que a oficina paga na quantidade: o menor entre o de tabela, o da promoção e o combinado
 * com ela (o banco recalcula no pedido). `especial` quando o combinado é o que vale.
 */
export function precoParaOficina(p: Produto, promocoes: Promocao[], hoje: string, quantidade: number, condicoes: CondicaoDaOficina[]): { preco: number; promocao: Promocao | null; especial: boolean } {
  const base = precoNaQuantidade(p, promocoes, hoje, quantidade);
  const combinado = condicoes.length ? precoCombinadoComOficina(p, condicoes) : null;
  if (combinado != null && combinado < base.preco) return { preco: combinado, promocao: null, especial: true };
  return { preco: base.preco, promocao: base.promocao, especial: false };
}

/** O cashback que dá para usar numa loja: o saldo, até o valor da compra nela. */
export function cashbackParaUsar(saldo: number | null | undefined, subtotal: number): number {
  if (!saldo || !(saldo > 0) || !(subtotal > 0)) return 0;
  return centavos(Math.min(saldo, subtotal));
}

// ---------------------------------------------------------------- serve no carro

/** O carro escolhido para filtrar a vitrine (um carro de cliente da oficina). */
export interface CarroDoFiltro {
  id: string;
  marca: string | null;
  modelo: string | null;
  motor?: string | null;
  ano: number | null;
}

/** "Gol 1.6 2015": o modelo (ou a marca), o motor e o ano. */
export function rotuloDoCarro(c: { marca?: string | null; modelo?: string | null; motor?: string | null; ano?: number | string | null }): string {
  const motor = c.motor && c.modelo && c.modelo.includes(c.motor) ? '' : c.motor;
  return [c.modelo || c.marca, motor, c.ano].filter(Boolean).join(' ').trim();
}

/** A peça serve no carro, pelas aplicações que a loja informou (sem aplicação, 'sem-informacao'). */
export function serveNoCarroDaVitrine(produtoId: number, extras: ExtrasDaVitrine, carro: Pick<CarroDoFiltro, 'marca' | 'modelo' | 'ano'> | null | undefined): 'sim' | 'nao' | 'sem-informacao' {
  if (!carro?.modelo) return 'sem-informacao';
  return serveNoCarro(infoDoProduto(extras, produtoId)?.aplicacoes ?? [], carro);
}

/** As que servem primeiro, depois as sem informação e por último as que a loja diz que não servem (a ordem de dentro fica). */
export function ordenarPeloCarro<T extends { id: number }>(produtos: T[], extras: ExtrasDaVitrine, carro: Pick<CarroDoFiltro, 'marca' | 'modelo' | 'ano'> | null | undefined): T[] {
  if (!carro?.modelo) return produtos;
  const peso = { sim: 0, 'sem-informacao': 1, nao: 2 } as const;
  return produtos
    .map((p, i) => ({ p, i, w: peso[serveNoCarroDaVitrine(p.id, extras, carro)] }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .map((x) => x.p);
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
  /** Serve no carro: saem as peças que a loja diz que não servem; as sem informação ficam, depois das que servem. */
  carro: CarroDoFiltro | null;
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
  precoMax: null,
  carro: null
};

export interface ContextoVitrine {
  catalogo: Pick<Catalogo, 'fornecedores' | 'promocoes' | 'patrocinios'>;
  uf: string;
  hoje: string;
  /** Estoque, aplicações e anúncios (sem eles, o filtro do carro não tira nada). */
  extras?: ExtrasDaVitrine;
  /** Os preços combinados com a oficina da conta. */
  condicoes?: CondicaoDaOficina[];
}

/** O preço grande do cartão: o da melhor promoção, se tiver. */
export function precoDeVitrine(p: Produto, promocoes: Promocao[], hoje: string): number {
  return melhorOferta(p, promocoes, hoje)?.precoPromocional ?? p.preco;
}

/** O preço da vitrine para a oficina: o da promoção ou o combinado com ela, o menor. */
export function precoNaVitrine(p: Produto, ctx: Pick<ContextoVitrine, 'catalogo' | 'hoje' | 'condicoes'>): { preco: number; especial: boolean } {
  const promocional = precoDeVitrine(p, ctx.catalogo.promocoes, ctx.hoje);
  const combinado = ctx.condicoes?.length ? precoCombinadoComOficina(p, ctx.condicoes) : null;
  return combinado != null && combinado < promocional ? { preco: combinado, especial: true } : { preco: promocional, especial: false };
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

export type Faceta = 'categoria' | 'promocao' | 'destaque' | 'fornecedores' | 'marcas' | 'viscosidades' | 'bases' | 'normas' | 'preco' | 'carro';

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
      const { preco } = precoNaVitrine(p, ctx);
      if (f.precoMin != null && preco < f.precoMin) return false;
      if (f.precoMax != null && preco > f.precoMax) return false;
    }
    if (exceto !== 'carro' && f.carro && ctx.extras && serveNoCarroDaVitrine(p.id, ctx.extras, f.carro) === 'nao') return false;
    return combinaBusca(textoDoProduto(p, loja), f.busca);
  });
}

export function ordenarProdutos(produtos: Produto[], ordem: Ordem, ctx: ContextoVitrine): Produto[] {
  if (ordem === 'relevancia') return ordenarVitrine(produtos, ctx.catalogo, ctx.uf, ctx.hoje);
  const lista = [...produtos];
  const preco = (p: Produto) => precoNaVitrine(p, ctx).preco;
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
  /** Quantos servem no carro escolhido (pelas aplicações que a loja informou). */
  carro: number;
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
  const precos = sem('preco').map((p) => precoNaVitrine(p, ctx).preco);
  return {
    categorias: contar(sem('categoria'), (p) => [p.categoria], nomeCategoria),
    promocao: sem('promocao').filter((p) => melhorOferta(p, ctx.catalogo.promocoes, ctx.hoje)).length,
    destaque: sem('destaque').filter((p) => lojas.get(p.fornecedorId)?.destaque).length,
    fornecedores: contar(sem('fornecedores'), (p) => [p.fornecedorId], (id) => lojas.get(id)?.nome ?? 'Fornecedor'),
    marcas: contar(sem('marcas'), (p) => [p.marca], (m) => m),
    viscosidades: contar(sem('viscosidades'), (p) => [p.especificacao.viscosidade], (v) => v).sort((a, b) => ordemViscosidade(a.valor) - ordemViscosidade(b.valor)),
    bases: contar(sem('bases'), (p) => [p.especificacao.base], (b) => nomeBase(b as never) || b),
    normas: contar(sem('normas'), (p) => p.especificacao.normas ?? [], (n) => n),
    faixa: precos.length ? { min: Math.floor(Math.min(...precos)), max: Math.ceil(Math.max(...precos)) } : null,
    carro: f.carro && ctx.extras ? sem('carro').filter((p) => serveNoCarroDaVitrine(p.id, ctx.extras!, f.carro) === 'sim').length : 0
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
  if (f.carro) r.push({ chave: 'carro', rotulo: `Serve no ${rotuloDoCarro(f.carro)}`, sem: { ...f, carro: null } });
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
    (f.precoMin != null || f.precoMax != null ? 1 : 0) +
    (f.carro ? 1 : 0)
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
