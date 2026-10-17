// Moderação: as denúncias das oficinas como a equipe vê (agrupadas pelo produto ou pela loja), os
// produtos fora da vitrine e as compras barradas pelo limite das oficinas novas. Sem servidor aqui.

import { z } from 'zod';

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const texto = z.string().nullish().transform((v) => v ?? null);

function ler<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

export type MotivoDaDenuncia = 'falsificado' | 'preco_enganoso' | 'nao_entregou' | 'conteudo_improprio' | 'outro';
export type SituacaoDaDenuncia = 'nova' | 'em_analise' | 'resolvida' | 'descartada';

export const MOTIVOS_DA_DENUNCIA: { id: MotivoDaDenuncia; nome: string; soLoja?: boolean }[] = [
  { id: 'falsificado', nome: 'Produto falsificado ou réplica' },
  { id: 'preco_enganoso', nome: 'Preço ou anúncio enganoso' },
  { id: 'conteudo_improprio', nome: 'Foto ou texto impróprio' },
  { id: 'nao_entregou', nome: 'A loja não entregou', soLoja: true },
  { id: 'outro', nome: 'Outro motivo' }
];

export function nomeDoMotivo(m: string): string {
  return MOTIVOS_DA_DENUNCIA.find((x) => x.id === m)?.nome ?? m;
}

export const SITUACOES_DA_DENUNCIA: Record<SituacaoDaDenuncia, { nome: string; tom: 'oleo' | 'caneta' | 'ok' | 'neutro' }> = {
  nova: { nome: 'Nova', tom: 'oleo' },
  em_analise: { nome: 'Em análise', tom: 'caneta' },
  resolvida: { nome: 'Resolvida', tom: 'ok' },
  descartada: { nome: 'Descartada', tom: 'neutro' }
};

export type AcaoDaModeracao = 'analisar' | 'descartar' | 'manter_oculto' | 'mostrar' | 'desativar_loja';
export const ACOES_DA_MODERACAO: AcaoDaModeracao[] = ['analisar', 'descartar', 'manter_oculto', 'mostrar', 'desativar_loja'];

export interface Denuncia {
  id: string;
  oficinaId: string;
  fornecedorId: number;
  produtoId: number | null;
  motivo: MotivoDaDenuncia;
  texto: string | null;
  situacao: SituacaoDaDenuncia;
  criadoEm: string;
  resolvidoEm: string | null;
  resolucao: string | null;
  oficina: { nome: string; cidade: string | null; uf: string | null };
  loja: { nome: string; ativo: boolean; whatsapp: string | null };
  produto: { nome: string; marca: string | null; preco: number | null; imagemUrl: string | null; ativo: boolean; oculto: boolean; categoria: string | null } | null;
}

export const COLUNAS_DENUNCIA =
  'id, oficina_id, fornecedor_id, produto_id, motivo, texto, situacao, criado_em, resolvido_em, resolucao, oficina:oficinas(nome, cidade, uf), loja:fornecedores(nome, ativo, whatsapp), produto:produtos(nome, marca, preco, imagem_url, ativo, oculto_moderacao, categoria)';

export function lerDenuncias(d: unknown): Denuncia[] {
  return ler(
    z.object({
      id: z.string(),
      oficina_id: z.string(),
      fornecedor_id: numero,
      produto_id: numeroOuNulo,
      motivo: z.enum(['falsificado', 'preco_enganoso', 'nao_entregou', 'conteudo_improprio', 'outro']),
      texto,
      situacao: z.enum(['nova', 'em_analise', 'resolvida', 'descartada']),
      criado_em: z.string(),
      resolvido_em: texto,
      resolucao: texto,
      oficina: z.object({ nome: z.string(), cidade: texto, uf: texto }).nullish(),
      loja: z.object({ nome: z.string(), ativo: z.boolean(), whatsapp: texto }).nullish(),
      produto: z
        .object({ nome: z.string(), marca: texto, preco: numeroOuNulo, imagem_url: texto, ativo: z.boolean(), oculto_moderacao: z.boolean(), categoria: texto })
        .nullish()
    }),
    d
  ).map((x) => ({
    id: x.id,
    oficinaId: x.oficina_id,
    fornecedorId: x.fornecedor_id,
    produtoId: x.produto_id,
    motivo: x.motivo,
    texto: x.texto,
    situacao: x.situacao,
    criadoEm: x.criado_em,
    resolvidoEm: x.resolvido_em,
    resolucao: x.resolucao,
    oficina: { nome: x.oficina?.nome ?? 'Oficina', cidade: x.oficina?.cidade ?? null, uf: x.oficina?.uf ?? null },
    loja: { nome: x.loja?.nome ?? `Loja ${x.fornecedor_id}`, ativo: x.loja?.ativo ?? false, whatsapp: x.loja?.whatsapp ?? null },
    produto: x.produto
      ? { nome: x.produto.nome, marca: x.produto.marca, preco: x.produto.preco, imagemUrl: x.produto.imagem_url, ativo: x.produto.ativo, oculto: x.produto.oculto_moderacao, categoria: x.produto.categoria }
      : null
  }));
}

/** As denúncias abertas juntas pelo alvo: um produto, ou a loja (denúncia sem produto). */
export interface GrupoDeDenuncias {
  chave: string;
  tipo: 'produto' | 'loja';
  produtoId: number | null;
  fornecedorId: number;
  loja: Denuncia['loja'];
  produto: Denuncia['produto'];
  denuncias: Denuncia[];
  oficinas: number;
  maisAntiga: string;
}

export function agruparDenuncias(lista: Denuncia[]): GrupoDeDenuncias[] {
  const grupos = new Map<string, GrupoDeDenuncias>();
  for (const d of lista) {
    const chave = d.produtoId != null ? `p${d.produtoId}` : `l${d.fornecedorId}`;
    const g = grupos.get(chave) ?? {
      chave,
      tipo: d.produtoId != null ? ('produto' as const) : ('loja' as const),
      produtoId: d.produtoId,
      fornecedorId: d.fornecedorId,
      loja: d.loja,
      produto: d.produto,
      denuncias: [],
      oficinas: 0,
      maisAntiga: d.criadoEm
    };
    g.denuncias.push(d);
    if (d.criadoEm < g.maisAntiga) g.maisAntiga = d.criadoEm;
    grupos.set(chave, g);
  }
  for (const g of grupos.values()) {
    g.oficinas = new Set(g.denuncias.map((d) => d.oficinaId)).size;
    g.denuncias.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }
  // produto já fora da vitrine e com mais oficinas primeiro; depois a mais antiga
  return [...grupos.values()].sort((a, b) => Number(!!b.produto?.oculto) - Number(!!a.produto?.oculto) || b.oficinas - a.oficinas || a.maisAntiga.localeCompare(b.maisAntiga));
}

export interface ProdutoForaDaVitrine {
  id: number;
  nome: string;
  marca: string | null;
  preco: number;
  fornecedorId: number;
  loja: string;
}

export const COLUNAS_PRODUTO_OCULTO = 'id, nome, marca, preco, fornecedor_id, loja:fornecedores(nome)';

export function lerProdutosOcultos(d: unknown): ProdutoForaDaVitrine[] {
  return ler(z.object({ id: numero, nome: z.string(), marca: texto, preco: numero, fornecedor_id: numero, loja: z.object({ nome: z.string() }).nullish() }), d).map((p) => ({
    id: p.id,
    nome: p.nome,
    marca: p.marca,
    preco: p.preco,
    fornecedorId: p.fornecedor_id,
    loja: p.loja?.nome ?? `Loja ${p.fornecedor_id}`
  }));
}

// ---------------------------------------------------------------- limite de compra

export const LIMITE_PADRAO_DE_COMPRA = 2000;

export interface LimiteDeCompra {
  limite: number;
  usado: number;
  livre: number;
  ate: string;
  daEquipe: boolean;
}

export function lerLimiteDeCompra(d: unknown): LimiteDeCompra | null {
  const r = z.object({ limite: numero, usado: numero, livre: numero, ate: z.string(), daEquipe: z.boolean() }).safeParse(d);
  return r.success ? r.data : null;
}

export interface BloqueioDeCompra {
  id: number;
  oficinaId: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  criada: string;
  limiteDaEquipe: number | null;
  valor: number;
  usado: number | null;
  limite: number | null;
  quando: string;
}

export function lerBloqueios(d: unknown): BloqueioDeCompra[] {
  return ler(
    z.object({
      id: numero,
      oficinaId: z.string(),
      nome: z.string(),
      cidade: texto,
      uf: texto,
      criada: z.string(),
      limiteDaEquipe: numeroOuNulo.optional().transform((v) => v ?? null),
      valor: numero,
      usado: numeroOuNulo.optional().transform((v) => v ?? null),
      limite: numeroOuNulo.optional().transform((v) => v ?? null),
      quando: z.string()
    }),
    d
  );
}
