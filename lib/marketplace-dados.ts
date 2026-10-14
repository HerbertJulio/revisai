// Formatos do marketplace usados pelo painel administrativo e pelo painel do fornecedor.
// Só tipos e leitura das linhas do banco (sem acesso ao banco aqui).

import { z } from 'zod';
import { CATEGORIAS } from './catalogo';
import type { Categoria } from './tipos';

const categoria = z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]);

const numero = z.union([z.number(), z.string()]).transform((v) => Number(v));
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));

export const SITUACOES_IMPULSO = [
  { id: 'pedido', nome: 'Pedido', plural: 'Pedidos', tom: 'oleo' },
  { id: 'ativo', nome: 'No ar', plural: 'No ar', tom: 'ok' },
  { id: 'recusado', nome: 'Recusado', plural: 'Recusados', tom: 'atraso' },
  { id: 'encerrado', nome: 'Encerrado', plural: 'Encerrados', tom: 'neutro' }
] as const;
export type SituacaoImpulso = (typeof SITUACOES_IMPULSO)[number]['id'];

export const SITUACOES_PARTE = [
  { id: 'novo', nome: 'Novo', tom: 'oleo' },
  { id: 'em_contato', nome: 'Em contato', tom: 'caneta' },
  { id: 'confirmado', nome: 'Confirmado', tom: 'ok' },
  { id: 'entregue', nome: 'Entregue', tom: 'neutro' },
  { id: 'cancelado', nome: 'Cancelado', tom: 'atraso' }
] as const;
export type SituacaoParte = (typeof SITUACOES_PARTE)[number]['id'];

export function situacaoParteValida(s: string): s is SituacaoParte {
  return SITUACOES_PARTE.some((x) => x.id === s);
}

const esquemaFornecedor = z.object({
  id: numero,
  nome: z.string(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  whatsapp: z.string().nullable(),
  demonstracao: z.boolean(),
  ativo: z.boolean(),
  destaque: z.boolean(),
  destaque_ate: z.string().nullable(),
  descricao: z.string().nullable(),
  criado_em: z.string()
});
export type LinhaFornecedor = z.infer<typeof esquemaFornecedor>;

const esquemaContrato = z.object({
  fornecedor_id: numero,
  plano: z.enum(['vitrine', 'destaque']),
  comissao_percentual: numero,
  mensalidade: numero,
  email: z.string().nullable(),
  observacao: z.string().nullable()
});
export type LinhaContrato = z.infer<typeof esquemaContrato>;

const esquemaProduto = z.object({
  id: numero,
  fornecedor_id: numero,
  categoria,
  nome: z.string(),
  marca: z.string().nullable(),
  descricao: z.string().nullable(),
  unidade: z.enum(['un', 'L', 'kit', 'par', 'jogo']),
  conteudo: numeroOuNulo,
  preco: numero,
  especificacao: z.record(z.string(), z.unknown()).nullable().transform((v) => v ?? {}),
  intervalo_km: numeroOuNulo,
  intervalo_meses: numeroOuNulo,
  ativo: z.boolean(),
  imagem_url: z.string().nullable(),
  referencia_id: numeroOuNulo
});
export type LinhaProduto = z.infer<typeof esquemaProduto>;

const esquemaPromocao = z.object({
  id: numero,
  produto_id: numero,
  titulo: z.string(),
  preco_promocional: numero,
  quantidade_minima: numero,
  inicio: z.string(),
  fim: z.string(),
  ativo: z.boolean()
});
export type LinhaPromocao = z.infer<typeof esquemaPromocao>;

const esquemaImpulso = z.object({
  id: numero,
  produto_id: numero,
  fornecedor_id: numero,
  uf: z.string().nullable(),
  dias: numero,
  valor: numero,
  inicio: z.string().nullable(),
  fim: z.string().nullable(),
  status: z.enum(['pedido', 'ativo', 'recusado', 'encerrado']),
  observacao: z.string().nullable(),
  criado_em: z.string()
});
export type LinhaImpulso = z.infer<typeof esquemaImpulso>;

const esquemaParte = z.object({
  id: numero,
  pedido_id: numero,
  fornecedor_id: numero,
  subtotal: numero,
  comissao_percentual: numero,
  status: z.enum(['novo', 'em_contato', 'confirmado', 'entregue', 'cancelado']),
  criado_em: z.string()
});
export type LinhaParte = z.infer<typeof esquemaParte>;

const esquemaReferencia = z.object({
  id: numero,
  categoria,
  marca: z.string(),
  linha: z.string(),
  tipo: z.string().nullable(),
  intervalo_km: numeroOuNulo,
  intervalo_meses: numeroOuNulo,
  intervalo_km_severo: numeroOuNulo,
  intervalo_meses_severo: numeroOuNulo,
  segue_manual: z.boolean(),
  observacao: z.string().nullable(),
  fonte_nome: z.string().nullable(),
  fonte_url: z.string().nullable(),
  confianca: z.enum(['fabricante', 'imprensa', 'mercado', 'oficina', 'fornecedor']),
  origem: z.enum(['equipe', 'fornecedor', 'oficina']),
  fornecedor_id: numeroOuNulo,
  aprovado: z.boolean(),
  ativo: z.boolean(),
  criado_em: z.string()
});
export type LinhaReferencia = z.infer<typeof esquemaReferencia>;

/** Lê as linhas no formato esperado e conta as que vieram diferentes (para o log). */
function ler<T>(esquema: z.ZodType<T>, dados: unknown): { itens: T[]; descartadas: number } {
  const itens: T[] = [];
  let descartadas = 0;
  for (const linha of Array.isArray(dados) ? dados : []) {
    const r = esquema.safeParse(linha);
    if (r.success) itens.push(r.data);
    else descartadas++;
  }
  return { itens, descartadas };
}

export const lerFornecedoresCompletos = (d: unknown) => ler(esquemaFornecedor, d);
export const lerContratos = (d: unknown) => ler(esquemaContrato, d);
export const lerProdutosCompletos = (d: unknown) => ler(esquemaProduto, d);
export const lerPromocoesCompletas = (d: unknown) => ler(esquemaPromocao, d);
export const lerImpulsos = (d: unknown) => ler(esquemaImpulso, d);
export const lerPartes = (d: unknown) => ler(esquemaParte, d);
export const lerReferenciasCompletas = (d: unknown) => ler(esquemaReferencia, d);

export const COLUNAS_FORNECEDOR = 'id, nome, cidade, uf, whatsapp, demonstracao, ativo, destaque, destaque_ate, descricao, criado_em';
export const COLUNAS_CONTRATO = 'fornecedor_id, plano, comissao_percentual, mensalidade, email, observacao';
export const COLUNAS_PRODUTO = 'id, fornecedor_id, categoria, nome, marca, descricao, unidade, conteudo, preco, especificacao, intervalo_km, intervalo_meses, ativo, imagem_url, referencia_id';
export const COLUNAS_PROMOCAO = 'id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim, ativo';
export const COLUNAS_IMPULSO = 'id, produto_id, fornecedor_id, uf, dias, valor, inicio, fim, status, observacao, criado_em';
export const COLUNAS_PARTE = 'id, pedido_id, fornecedor_id, subtotal, comissao_percentual, status, criado_em';
export const COLUNAS_REFERENCIA_ADMIN =
  'id, categoria, marca, linha, tipo, intervalo_km, intervalo_meses, intervalo_km_severo, intervalo_meses_severo, segue_manual, observacao, fonte_nome, fonte_url, confianca, origem, fornecedor_id, aprovado, ativo, criado_em';

/** O fornecedor com o contrato e os números do mês, como o painel administrativo mostra. */
export interface FornecedorAdmin extends LinhaFornecedor {
  contrato: LinhaContrato | null;
  temAcesso: boolean;
  produtosAtivos: number;
  vendasMes: number;
  comissaoMes: number;
  pedidosMes: number;
}

/** Item de um pedido, como o banco guarda (o gatilho calcular_pedido monta). */
export interface ItemDoPedido {
  produto_id: number;
  nome: string;
  fornecedor_id: number;
  quantidade: number;
  preco_unitario: number;
}

/** A parte de um pedido que cabe a um fornecedor, com a oficina para ele chamar no WhatsApp. */
export interface PedidoDoFornecedor {
  id: number;
  codigo: string;
  criadoEm: string;
  status: SituacaoParte;
  subtotal: number;
  comissaoPercentual: number;
  oficina: { nome: string; whatsapp: string; cidade: string | null; uf: string | null };
  observacao: string | null;
  itens: ItemDoPedido[];
}

/** Primeiro dia do mês em Brasília, para somar as vendas do mês. */
export function inicioDoMes(hoje: string): string {
  return `${hoje.slice(0, 7)}-01`;
}
