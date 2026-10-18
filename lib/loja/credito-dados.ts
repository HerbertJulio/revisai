// Venda faturada: o crédito que a loja dá às oficinas em quem confia e as faturas (partes de pedido
// faturadas) que ela tem a receber. Sem nada de servidor: serve às páginas, aos componentes e à
// escolha da forma de pagamento no pedido da oficina.

import { z } from 'zod';
import { formatarData } from '../datas';
import { formatarMoeda } from '../formatos';
import type { SituacaoPagamentoParte, SituacaoParte } from '../marketplace-dados';

const numero = z.union([z.number(), z.string()]).transform(Number);
const texto = z.string().nullish().transform((v) => v ?? null);

function ler<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

/** O risco é da loja: o Revisaí não garante o pagamento (ainda não há parceiro de crédito). */
export const AVISO_DO_RISCO =
  'A venda faturada é um crédito que a sua loja dá: o Revisaí não garante o pagamento nem cobra por você. Se a oficina atrasar, a cobrança é com a loja. Dê crédito só a quem você conhece.';

export const PRAZOS_DE_CREDITO = [7, 14, 21, 28, 30, 45, 60] as const;

export const esquemaCredito = z.object({
  oficinaId: z.uuid('Oficina inválida.'),
  limite: z.number({ error: 'Informe o limite.' }).positive('Informe o limite.').max(1_000_000, 'O limite vai até R$ 1.000.000.'),
  prazoDias: z.number({ error: 'Escolha o prazo.' }).int('Escolha o prazo.').min(1, 'O prazo vai de 1 a 120 dias.').max(120, 'O prazo vai de 1 a 120 dias.'),
  ativo: z.boolean()
});

// ---------------------------------------------------------------- clientes com crédito

export interface LinhaDeCredito {
  limite: number;
  prazoDias: number;
  ativo: boolean;
  atualizadoEm: string;
}

export interface ClienteComCredito {
  oficinaId: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  pedidos: number;
  total: number;
  ultimo: string;
  credito: LinhaDeCredito | null;
  /** Faturado ainda não pago (e não cancelado). */
  aberto: number;
  /** Do que está em aberto, o que já venceu. */
  vencido: number;
  faturas: number;
}

export function lerClientesComCredito(d: unknown): ClienteComCredito[] {
  return ler(
    z.object({
      oficinaId: z.string(),
      nome: z.string().nullish().transform((v) => v ?? 'Oficina'),
      cidade: texto,
      uf: texto,
      pedidos: numero,
      total: numero,
      ultimo: z.string(),
      credito: z.object({ limite: numero, prazoDias: numero, ativo: z.boolean(), atualizadoEm: z.string() }).nullish().transform((v) => v ?? null),
      aberto: numero,
      vencido: numero,
      faturas: numero
    }),
    d
  );
}

/** Quanto da linha está livre agora (nunca negativo). */
export function livreNoCredito(c: Pick<ClienteComCredito, 'credito' | 'aberto'>): number {
  if (!c.credito) return 0;
  return Math.max(0, Math.round((c.credito.limite - c.aberto) * 100) / 100);
}

// ---------------------------------------------------------------- o crédito visto pela oficina

export interface CreditoNaLoja {
  fornecedorId: number;
  loja: string;
  limite: number;
  prazoDias: number;
  aberto: number;
  livre: number;
}

export function lerCreditosDaOficina(d: unknown): CreditoNaLoja[] {
  return ler(z.object({ fornecedorId: numero, loja: z.string(), limite: numero, prazoDias: numero, aberto: numero, livre: numero }), d);
}

export type FormaDePagamento = 'pix' | 'faturado';

/**
 * O que vai em public.pedidos.pagamentos: só as lojas faturadas (Pix é o padrão). Loja escolhida
 * como faturado sem crédito ativo fica de fora (o banco recusaria com RV062).
 */
export function pagamentosDoPedido(escolhas: Record<string, FormaDePagamento>, creditos: CreditoNaLoja[]): Record<string, 'faturado'> | null {
  const comCredito = new Set(creditos.map((c) => String(c.fornecedorId)));
  const r: Record<string, 'faturado'> = {};
  for (const [loja, forma] of Object.entries(escolhas)) if (forma === 'faturado' && comCredito.has(loja)) r[loja] = 'faturado';
  return Object.keys(r).length ? r : null;
}

/** As mensagens das regras da venda faturada e do limite de compra, para a tela da oficina. */
export function mensagemDoCredito(e: { code?: string; message?: string } | null | undefined): string | null {
  if (!e) return null;
  const m = (e.message ?? '').replace(/\.$/, '');
  switch (e.code) {
    case 'RV060':
      return m ? `${m}.` : 'Esta compra passa do limite das oficinas novas. Fale com a equipe do Revisaí.';
    case 'RV061':
      return m ? `${m}. Pague uma fatura em aberto ou escolha Pix para essa loja.` : 'O limite faturado dessa loja não cobre esta compra.';
    case 'RV062':
      return m ? `${m}.` : 'Essa loja não vende faturado para a sua oficina. Escolha Pix.';
    case 'RV063':
      return 'A forma de pagamento do pedido não confere. Atualize a página e escolha de novo.';
    default:
      return null;
  }
}

// ---------------------------------------------------------------- faturas a receber

export type SituacaoDaFatura = 'aguardando_entrega' | 'aberta' | 'vencida' | 'recebida' | 'cancelada';

export interface Fatura {
  id: number;
  pedidoId: number;
  codigo: string;
  oficinaId: string | null;
  oficina: string;
  whatsapp: string;
  /** O que a oficina deve: o subtotal menos o cashback usado na compra. */
  valor: number;
  /** O cashback da loja usado nesta compra (já fora do valor). */
  cashback: number;
  status: SituacaoParte;
  pagamento: SituacaoPagamentoParte;
  pagamentoEm: string | null;
  prazoDias: number;
  vencimento: string | null;
  entregueEm: string | null;
  criadoEm: string;
}

export const COLUNAS_FATURA = 'id, pedido_id, codigo, oficina_id, oficina_nome, oficina_whatsapp, subtotal, cashback, status, pagamento, pagamento_em, prazo_dias, vencimento, entregue_em, criado_em';

export function lerFaturas(d: unknown): Fatura[] {
  return ler(
    z.object({
      id: numero,
      pedido_id: numero,
      codigo: z.string().nullish().transform((v) => v ?? '------'),
      oficina_id: texto,
      oficina_nome: z.string().nullish().transform((v) => v ?? 'Oficina'),
      oficina_whatsapp: z.string().nullish().transform((v) => v ?? ''),
      subtotal: numero,
      cashback: numero.nullish().transform((v) => v ?? 0),
      status: z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']),
      pagamento: z.enum(['pendente', 'informado', 'confirmado']).catch('pendente'),
      pagamento_em: texto,
      prazo_dias: numero.nullish().transform((v) => v ?? 0),
      vencimento: texto,
      entregue_em: texto,
      criado_em: z.string()
    }),
    d
  ).map((x) => ({
    id: x.id,
    pedidoId: x.pedido_id,
    codigo: x.codigo,
    oficinaId: x.oficina_id,
    oficina: x.oficina_nome,
    whatsapp: x.oficina_whatsapp,
    valor: Math.max(0, Math.round((x.subtotal - x.cashback) * 100) / 100),
    cashback: x.cashback,
    status: x.status,
    pagamento: x.pagamento,
    pagamentoEm: x.pagamento_em,
    prazoDias: x.prazo_dias,
    vencimento: x.vencimento ? x.vencimento.slice(0, 10) : null,
    entregueEm: x.entregue_em,
    criadoEm: x.criado_em
  }));
}

/** hoje é 'AAAA-MM-DD' (em Brasília). */
export function situacaoDaFatura(f: Pick<Fatura, 'status' | 'pagamento' | 'vencimento'>, hoje: string): SituacaoDaFatura {
  if (f.status === 'cancelado') return 'cancelada';
  if (f.pagamento === 'confirmado') return 'recebida';
  if (!f.vencimento) return 'aguardando_entrega';
  return f.vencimento < hoje ? 'vencida' : 'aberta';
}

export const SITUACOES_DA_FATURA: Record<SituacaoDaFatura, { nome: string; tom: 'neutro' | 'oleo' | 'atraso' | 'ok' | 'caneta' }> = {
  aguardando_entrega: { nome: 'Vence depois da entrega', tom: 'caneta' },
  aberta: { nome: 'Em aberto', tom: 'oleo' },
  vencida: { nome: 'Vencida', tom: 'atraso' },
  recebida: { nome: 'Recebida', tom: 'ok' },
  cancelada: { nome: 'Cancelada', tom: 'neutro' }
};

export interface ResumoDasFaturas {
  aberto: number;
  vencido: number;
  recebidoNoMes: number;
  porSituacao: Record<Exclude<SituacaoDaFatura, 'cancelada'>, Fatura[]>;
}

/** As faturas por situação (vencidas primeiro pelo vencimento mais antigo) e os totais. */
export function resumirFaturas(faturas: Fatura[], hoje: string): ResumoDasFaturas {
  const porSituacao: ResumoDasFaturas['porSituacao'] = { vencida: [], aberta: [], aguardando_entrega: [], recebida: [] };
  for (const f of faturas) {
    const s = situacaoDaFatura(f, hoje);
    if (s !== 'cancelada') porSituacao[s].push(f);
  }
  const porVencimento = (a: Fatura, b: Fatura) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999') || a.criadoEm.localeCompare(b.criadoEm);
  porSituacao.vencida.sort(porVencimento);
  porSituacao.aberta.sort(porVencimento);
  porSituacao.aguardando_entrega.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  porSituacao.recebida.sort((a, b) => (b.pagamentoEm ?? b.criadoEm).localeCompare(a.pagamentoEm ?? a.criadoEm));
  const soma = (l: Fatura[]) => Math.round(l.reduce((s, f) => s + f.valor, 0) * 100) / 100;
  const mes = hoje.slice(0, 7);
  return {
    aberto: soma([...porSituacao.vencida, ...porSituacao.aberta, ...porSituacao.aguardando_entrega]),
    vencido: soma(porSituacao.vencida),
    recebidoNoMes: soma(porSituacao.recebida.filter((f) => (f.pagamentoEm ?? '').slice(0, 7) === mes)),
    porSituacao
  };
}

/** Dias entre dois dias 'AAAA-MM-DD' (positivo quando b é depois de a). */
export function diasEntreDatas(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** "vence hoje", "vence em 3 dias (20/10/2026)", "venceu há 2 dias (15/10/2026)" ou o prazo depois da entrega. */
export function textoDoVencimento(f: Pick<Fatura, 'vencimento' | 'prazoDias'>, hoje: string): string {
  if (!f.vencimento) return `vence ${f.prazoDias} ${f.prazoDias === 1 ? 'dia' : 'dias'} depois da entrega`;
  const dias = diasEntreDatas(hoje, f.vencimento);
  if (dias === 0) return 'vence hoje';
  if (dias > 0) return `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'} (${formatarData(f.vencimento)})`;
  return `venceu há ${-dias} ${dias === -1 ? 'dia' : 'dias'} (${formatarData(f.vencimento)})`;
}

/** A mensagem para lembrar a oficina pelo WhatsApp (educada, com o valor e o vencimento). */
export function mensagemDeCobranca(f: Pick<Fatura, 'oficina' | 'codigo' | 'valor' | 'vencimento' | 'prazoDias'>, loja: string, hoje: string): string {
  const quando = !f.vencimento
    ? `vence ${f.prazoDias} ${f.prazoDias === 1 ? 'dia' : 'dias'} depois da entrega`
    : f.vencimento < hoje
      ? `venceu em ${formatarData(f.vencimento)}`
      : f.vencimento === hoje
        ? 'vence hoje'
        : `vence em ${formatarData(f.vencimento)}`;
  return `Olá, ${f.oficina}! Aqui é da ${loja}. Passando para lembrar que a fatura do pedido ${f.codigo}, de ${formatarMoeda(f.valor)}, ${quando}. Se já pagou, pode desconsiderar e, se puder, mande o comprovante por aqui. Obrigado!`;
}
