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
  { id: 'saiu_entrega', nome: 'Saiu para entrega', tom: 'caneta' },
  { id: 'entregue', nome: 'Entregue', tom: 'neutro' },
  { id: 'cancelado', nome: 'Cancelado', tom: 'atraso' }
] as const;
export type SituacaoParte = (typeof SITUACOES_PARTE)[number]['id'];

export const SITUACOES_PAGAMENTO = [
  { id: 'pendente', nome: 'Pagamento a combinar', tom: 'neutro' },
  { id: 'informado', nome: 'A oficina diz que pagou', tom: 'oleo' },
  { id: 'confirmado', nome: 'Pagamento confirmado', tom: 'ok' }
] as const;
export type SituacaoPagamentoParte = (typeof SITUACOES_PAGAMENTO)[number]['id'];

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
  status: z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']),
  criado_em: z.string(),
  pagamento: z.enum(['pendente', 'informado', 'confirmado']).nullish().transform((v) => v ?? 'pendente'),
  pagamento_em: z.string().nullish().transform((v) => v ?? null),
  entrega_previsao: z.string().nullish().transform((v) => v ?? null),
  entrega_saiu_em: z.string().nullish().transform((v) => v ?? null),
  entrega_posicao_em: z.string().nullish().transform((v) => v ?? null),
  entregue_em: z.string().nullish().transform((v) => v ?? null)
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
export const COLUNAS_PARTE =
  'id, pedido_id, fornecedor_id, subtotal, comissao_percentual, status, criado_em, pagamento, pagamento_em, entrega_previsao, entrega_saiu_em, entrega_posicao_em, entregue_em';
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
  /** Preço combinado num alerta de preço. */
  combinado?: boolean;
}

/** A parte de um pedido que cabe a um fornecedor, com a oficina para ele chamar no WhatsApp. */
export interface PedidoDoFornecedor {
  id: number;
  codigo: string;
  criadoEm: string;
  status: SituacaoParte;
  subtotal: number;
  comissaoPercentual: number;
  oficina: { nome: string; whatsapp: string; cidade: string | null; uf: string | null; endereco: string | null };
  observacao: string | null;
  itens: ItemDoPedido[];
  pagamento: SituacaoPagamentoParte;
  pagamentoEm: string | null;
  entrega: { previsao: string | null; saiuEm: string | null; posicaoEm: string | null; entregueEm: string | null };
}

/** Primeiro dia do mês em Brasília, para somar as vendas do mês. */
export function inicioDoMes(hoje: string): string {
  return `${hoje.slice(0, 7)}-01`;
}

// ---------------------------------------------------------------- pedido da oficina

/**
 * O contato que a oficina escreve no pedido. O nome e o WhatsApp do cadastro da oficina valem
 * mais (o banco põe os da conta); o do formulário entra quando a conta ainda não tem WhatsApp.
 */
export const esquemaContatoDoPedido = z
  .object({
    whatsapp: z.string().trim().max(30).optional().default(''),
    cidade: z.string().trim().max(80).optional().default(''),
    uf: z
      .string()
      .trim()
      .regex(/^([A-Z]{2})?$/)
      .optional()
      .default(''),
    endereco: z.string().trim().max(160).optional().default('')
  })
  .optional()
  .default({ whatsapp: '', cidade: '', uf: '', endereco: '' });

export type ContatoDoPedido = z.infer<typeof esquemaContatoDoPedido>;

export const PROPOSTA_MUDOU = 'A loja mudou a proposta. Confira a proposta nova e confirme de novo.';

/** O que o banco diz quando o pedido não sai, numa frase para a oficina (null: erro inesperado). */
export function mensagemDoPedido(e: { code?: string; message?: string } | null | undefined): string | null {
  if (!e) return null;
  const m = e.message ?? '';
  switch (e.code) {
    case 'RV001':
      return 'Esta proposta não vale mais. Veja as outras respostas ou mande um alerta novo.';
    case 'RV002':
      return PROPOSTA_MUDOU;
    case 'RV003':
      return 'A quantidade não bate com a proposta. Confira e tente de novo.';
    case 'RV030':
      return m ? `${m.replace(/\.$/, '')}. Ponha mais itens dessa loja ou tire os dela do pedido.` : 'O pedido não chega ao mínimo de uma das lojas.';
    case 'RV031':
      return m ? `${m.replace(/\.$/, '')}. Confira o cashback no pedido e mande de novo.` : 'O seu saldo de cashback não cobre o valor escolhido. Confira e mande de novo.';
    case 'RV032':
      return m ? `${m.replace(/\.$/, '')}. Use no máximo o valor da compra.` : 'O cashback passa do valor da compra nessa loja.';
    case 'RV033':
      return 'O cashback do pedido não confere com as lojas do pedido. Confira o pedido e mande de novo.';
    case '22023':
      return /proposta|alerta/i.test(m) ? 'O produto da proposta saiu da loja.' : 'Algum produto do pedido saiu da loja. Atualize a página e confira o carrinho.';
    case 'P0001':
      return 'Recebemos muitos pedidos seguidos desta oficina. Espere um pouco e tente de novo.';
    case '23514':
      return /whatsapp/i.test(m) ? 'Confira o WhatsApp da oficina, com DDD. É por ele que a loja fala com você.' : null;
    case '28000':
      return 'Entre na sua conta para fazer pedidos.';
    case '42501':
      return 'Esta conta não pode fazer pedidos por esta oficina.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------- reputação das lojas

/** Como a loja tem atendido nos últimos 90 dias (o banco calcula; menos de 5 pedidos é loja nova). */
export type Reputacao =
  | { nova: true; pedidos: number }
  | { nova: false; pedidos: number; canceladosPct: number; atrasoPct: number | null; horasParaConfirmar: number | null };

const esquemaReputacao = z.union([
  z.object({ nova: z.literal(true), pedidos: numero }),
  z.object({
    nova: z.literal(false),
    pedidos: numero,
    canceladosPct: numero,
    atrasoPct: numeroOuNulo.optional().transform((v) => v ?? null),
    horasParaConfirmar: numeroOuNulo.optional().transform((v) => v ?? null)
  })
]);

/** Lê o que reputacao_das_lojas devolve ({ "id": {...} }); o que vier fora do formato fica de fora. */
export function lerReputacoes(dados: unknown): Map<number, Reputacao> {
  const m = new Map<number, Reputacao>();
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return m;
  for (const [id, valor] of Object.entries(dados as Record<string, unknown>)) {
    const n = Number(id);
    const r = esquemaReputacao.safeParse(valor);
    if (Number.isInteger(n) && n > 0 && r.success) m.set(n, r.data);
  }
  return m;
}

const pct = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')}%`;

/** O selo da loja ("Confirma em 2 h", "Loja nova no Revisaí"), o detalhe e o tom. */
export function seloDaReputacao(r: Reputacao): { texto: string; detalhe: string; tom: 'ok' | 'neutro' | 'atencao' } {
  if (r.nova)
    return { texto: 'Loja nova no Revisaí', detalhe: r.pedidos ? `${r.pedidos} ${r.pedidos === 1 ? 'pedido' : 'pedidos'} pelo app nos últimos 90 dias` : 'Ainda sem pedidos pelo app', tom: 'neutro' };
  const h = r.horasParaConfirmar;
  const tempo = h == null ? null : h < 1 ? 'Confirma em menos de 1 h' : h < 24 ? `Confirma em ${Math.round(h)} h` : `Confirma em ${Math.round(h / 24)} ${Math.round(h / 24) === 1 ? 'dia' : 'dias'}`;
  const detalhe = [`${r.pedidos} pedidos em 90 dias`, `${pct(r.canceladosPct)} cancelados pela loja`, ...(r.atrasoPct != null ? [`${pct(r.atrasoPct)} entregues com atraso`] : [])].join(', ');
  const atencao = r.canceladosPct >= 15 || (r.atrasoPct ?? 0) >= 25;
  const bom = r.canceladosPct <= 5 && (r.atrasoPct ?? 0) <= 10;
  const texto = atencao ? 'Cancela ou atrasa mais que as outras' : (tempo ?? (bom ? 'Entrega em dia' : `${r.pedidos} pedidos em 90 dias`));
  return { texto, detalhe, tom: atencao ? 'atencao' : bom ? 'ok' : 'neutro' };
}
