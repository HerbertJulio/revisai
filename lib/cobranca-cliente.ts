// Cobrança do cliente da oficina: o Pix da ordem de serviço (e da mensalidade do clube) pelo
// WhatsApp, com a página de pagamento. O Pix é o código estático do Banco Central com a chave da
// oficina: o dinheiro cai direto na conta dela e o Revisaí não passa pelo pagamento. O cliente
// avisa "Já paguei" pela página; a oficina confere no banco e confirma no app, e só então o
// dinheiro entra no financeiro (os mesmos lançamentos e regras de lib/financeiro).

import { z } from 'zod';
import { somarDias } from './datas';
import { chavePixDaOficina, marcarPago, montarRecebimento, NOMES_TIPO_CHAVE, pagamentoDaOrdem, tipoDaChavePix } from './financeiro';
import { formatarMoeda, formatarPlaca, lerNumero, primeiroNome } from './formatos';
import { codigoPix, formatarChavePix } from './pix';
import type { Lancamento, NovoItemExtra } from './registros-oficina';
import type { Documento, Id, Oficina, Veiculo } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Quanto tempo a página de pagamento vale (o código Pix em si não vence). */
export const DIAS_DO_LINK = 15;

// ---------------------------------------------------------------- quanto cobrar

/** O que falta entrar no caixa da ordem (o total menos o recebido, como no pagamento da OS). */
export function valorParaCobrar(doc: Pick<Documento, 'id' | 'linhas' | 'desconto'>, lancamentos: Lancamento[]): number {
  const p = pagamentoDaOrdem(doc, lancamentos);
  return Math.max(0, r2(p.total - p.recebido));
}

/** A ordem que dá para cobrar: aberta (sinal) ou concluída. */
export function podeCobrar(doc: Pick<Documento, 'tipo' | 'situacao'>): boolean {
  return doc.tipo === 'ordem' && (doc.situacao === 'aberta' || doc.situacao === 'concluida');
}

/** Lê o valor digitado ('350', '350,50', 'R$ 1.200,00'); null quando não é um valor que dá para cobrar. */
export function lerValorDaCobranca(texto: string): number | null {
  const n = lerNumero((texto ?? '').replace(/R\$/gi, ''));
  if (n == null || !Number.isFinite(n) || n < 0.01 || n > 1_000_000) return null;
  return r2(n);
}

// ---------------------------------------------------------------- chave Pix da oficina

/** "CNPJ 12.345.678/0001-95", "Celular (21) 99999-0000". */
export function chavePixParaMostrar(chave: string | null | undefined): string {
  const tipo = tipoDaChavePix(chave);
  if (!chave || !tipo) return chave ?? '';
  return `${NOMES_TIPO_CHAVE[tipo]} ${formatarChavePix(tipo, chave)}`;
}

export interface RecebedorPix {
  chave: string;
  /** Quem recebe, como aparece no app do banco. */
  nome: string;
  cidade: string;
}

/** A chave (a mesma do financeiro), o nome e a cidade da oficina para o código Pix (null sem chave válida). */
export function recebedorDaOficina(o: Pick<Oficina, 'chavePix' | 'nome' | 'razaoSocial' | 'cidade'>): RecebedorPix | null {
  const chave = chavePixDaOficina(o);
  if (!chave) return null;
  return { chave, nome: (o.razaoSocial?.trim() || o.nome.trim() || 'Oficina').slice(0, 60), cidade: o.cidade?.trim() || 'Brasil' };
}

/** Identificador do Pix: o prefixo e letras sorteadas, até 25 letras e números. */
export function novoTxid(prefixo: string, sortear: () => number = Math.random): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const base = prefixo.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 17);
  let resto = '';
  for (let i = 0; i < 8; i++) resto += alfabeto[Math.floor(sortear() * alfabeto.length) % alfabeto.length];
  return (base + resto).slice(0, 25);
}

/** O código "copia e cola" do valor, para a chave da oficina. */
export function pixDaCobranca(r: RecebedorPix, valor: number, txid: string, descricao?: string): string {
  return codigoPix({ chave: r.chave, nome: r.nome, cidade: r.cidade, valor: r2(valor), txid, descricao });
}

// ---------------------------------------------------------------- o link de pagamento

/** O que a página /pagar mostra (vai nos dados do link público). */
export const esquemaDadosDoPagamento = z.object({
  valor: z.number().positive().max(1_000_000),
  descricao: z.string().max(200).default(''),
  titulo: z.string().max(120).default(''),
  cliente: z.string().max(80).default(''),
  oficina: z.string().max(120).default(''),
  recebedor: z.string().max(80).default(''),
  chave: z.string().max(120).default(''),
  pix: z.string().min(20).max(600),
  validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  documentoId: z.string().max(100).nullish().transform((v) => v ?? null),
  cobrancaId: z.string().max(100).nullish().transform((v) => v ?? null),
  membroId: z.string().max(100).nullish().transform((v) => v ?? null),
  competencia: z.string().regex(/^\d{4}-\d{2}$/).nullish().transform((v) => v ?? null),
  pago: z.boolean().default(false),
  pagoEm: z.string().max(40).nullish().transform((v) => v ?? null)
});
export type DadosDoPagamento = z.infer<typeof esquemaDadosDoPagamento>;

export function lerDadosDoPagamento(v: unknown): DadosDoPagamento | null {
  const r = esquemaDadosDoPagamento.safeParse(v);
  return r.success ? r.data : null;
}

/** "OS nº 12 · Gol, placa ABC1D23". */
export function descricaoDaOrdem(doc: Pick<Documento, 'numero'>, veiculo?: Pick<Veiculo, 'modelo' | 'placa'> | null): string {
  const carro = [veiculo?.modelo?.trim(), veiculo?.placa ? `placa ${formatarPlaca(veiculo.placa)}` : ''].filter(Boolean).join(', ');
  return [`OS nº ${doc.numero}`, carro].filter(Boolean).join(' · ');
}

export interface NovaCobranca {
  recebedor: RecebedorPix;
  valor: number;
  descricao: string;
  titulo: string;
  cliente: string;
  oficina: string;
  hoje: string;
  txid: string;
  dias?: number;
  documentoId?: Id | null;
  cobrancaId?: Id | null;
  membroId?: Id | null;
  competencia?: string | null;
}

/** Os dados do link de pagamento, com o código Pix do valor. */
export function dadosDoPagamento(c: NovaCobranca): DadosDoPagamento {
  return {
    valor: r2(c.valor),
    descricao: c.descricao.slice(0, 200),
    titulo: c.titulo.slice(0, 120),
    cliente: primeiroNome(c.cliente).slice(0, 80),
    oficina: c.oficina.trim().slice(0, 120),
    recebedor: c.recebedor.nome.slice(0, 80),
    chave: chavePixParaMostrar(c.recebedor.chave).slice(0, 120),
    pix: pixDaCobranca(c.recebedor, c.valor, c.txid, c.titulo),
    validade: somarDias(c.hoje, c.dias ?? DIAS_DO_LINK),
    documentoId: c.documentoId ?? null,
    cobrancaId: c.cobrancaId ?? null,
    membroId: c.membroId ?? null,
    competencia: c.competencia ?? null,
    pago: false,
    pagoEm: null
  };
}

/** Uma referência nova para cada cobrança da ordem (o aviso de uma não apaga o da outra). */
export function refDaCobranca(documentoId: Id, agora: number = Date.now()): string {
  return `pix-${documentoId}`.slice(0, 80) + `-${agora.toString(36)}`;
}

/** O texto do WhatsApp: o link da página e, numa linha só, o código para copiar e colar. */
export function mensagemDeCobranca(ctx: { oficina: string; cliente: string; valor: number; descricao: string; link: string | null; pix: string }): string {
  const nome = primeiroNome(ctx.cliente);
  const partes = [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`,
    `Segue o Pix de ${formatarMoeda(ctx.valor)}${ctx.descricao ? ` (${ctx.descricao})` : ''}.`
  ];
  if (ctx.link) partes.push(`Para pagar, abra o link e use o QR Code ou o código: ${ctx.link}`, 'Depois de pagar, toque em "Já paguei" na página.');
  partes.push('Pix copia e cola (copie a linha abaixo e cole no app do seu banco):', ctx.pix);
  return partes.join('\n');
}

// ---------------------------------------------------------------- o cliente avisou

export interface RespostaPaguei {
  quando: string;
  nome: string | null;
  competencia: string | null;
}

/** A resposta "Já paguei" guardada no link (null para outra resposta). */
export function lerRespostaPaguei(resposta: unknown): RespostaPaguei | null {
  if (!resposta || typeof resposta !== 'object') return null;
  const r = resposta as Record<string, unknown>;
  if (r.acao !== 'paguei') return null;
  const quando = typeof r.quando === 'string' ? r.quando : '';
  const nome = typeof r.nome === 'string' && r.nome.trim() ? r.nome.trim().slice(0, 80) : null;
  const competencia = typeof r.competencia === 'string' && /^\d{4}-\d{2}$/.test(r.competencia) ? r.competencia : null;
  return { quando, nome, competencia };
}

/** A linha do link público como a oficina lê (só o dono e o gerente leem estes links). */
export interface LinkDeCobranca {
  id: string;
  tipo: 'pagamento' | 'clube';
  ref: string;
  codigo: string | null;
  dados: Record<string, unknown>;
  resposta: unknown;
  respondidoEm: string | null;
  processadoEm: string | null;
  criadoEm: string;
  expiraEm: string;
}

export const COLUNAS_DO_LINK = 'id, tipo, ref, codigo, dados, resposta, respondido_em, processado_em, criado_em, expira_em';

export function lerLinkDeCobranca(v: unknown): LinkDeCobranca | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if ((r.tipo !== 'pagamento' && r.tipo !== 'clube') || typeof r.id !== 'string') return null;
  return {
    id: r.id,
    tipo: r.tipo,
    ref: String(r.ref ?? ''),
    codigo: typeof r.codigo === 'string' ? r.codigo : null,
    dados: r.dados && typeof r.dados === 'object' ? (r.dados as Record<string, unknown>) : {},
    resposta: r.resposta ?? null,
    respondidoEm: typeof r.respondido_em === 'string' ? r.respondido_em : null,
    processadoEm: typeof r.processado_em === 'string' ? r.processado_em : null,
    criadoEm: String(r.criado_em ?? ''),
    expiraEm: String(r.expira_em ?? '')
  };
}

/** O cliente avisou que pagou e a oficina ainda não tratou. */
export function avisoPendente(l: LinkDeCobranca): RespostaPaguei | null {
  if (!l.respondidoEm || l.processadoEm) return null;
  return lerRespostaPaguei(l.resposta);
}

// ---------------------------------------------------------------- o pagamento confirmado

/** O mesmo Pix confirmado em dois aparelhos vira uma conta só. */
export function idDoLancamentoDoLink(linkId: string): Id {
  return `pix-${linkId}`;
}

export function idDoLancamentoDaMensalidade(cobrancaId: Id): Id {
  return `clube-${cobrancaId}`;
}

/** A conta recebida por Pix hoje, montada pelo financeiro (com o id fixo do link ou da mensalidade). */
export function recebimentoPorPix(ctx: {
  id: Id;
  valor: number;
  hoje: string;
  descricao: string;
  categoria: 'servico' | 'clube';
  clienteId?: Id | null;
  documentoId?: Id | null;
  observacao?: string;
}): NovoItemExtra<'lancamentos'> & { id: Id } {
  const [l] = montarRecebimento(
    { valor: r2(ctx.valor), forma: 'pix', parcelas: 1, hoje: ctx.hoje, descricao: ctx.descricao.slice(0, 200), categoria: ctx.categoria, clienteId: ctx.clienteId ?? null, documentoId: ctx.documentoId ?? null, observacao: ctx.observacao },
    () => ctx.id
  );
  return { ...l, id: ctx.id };
}

/**
 * O Pix da ordem confirmado entra no financeiro: quita a conta em aberto da ordem com o mesmo
 * valor (o fiado ou o boleto que o cliente pagou por Pix) ou vira um recebimento novo.
 */
export function lancamentoDoPixDaOrdem(
  ctx: { linkId: string; valor: number; hoje: string; descricao: string; clienteId?: Id | null; documentoId: Id; observacao?: string },
  lancamentos: Lancamento[]
): { quitar: Lancamento | null; novo: (NovoItemExtra<'lancamentos'> & { id: Id }) | null } {
  const id = idDoLancamentoDoLink(ctx.linkId);
  if (lancamentos.some((l) => l.id === id)) return { quitar: null, novo: null };
  const aberta = lancamentos
    .filter((l) => l.tipo === 'receber' && !l.pagoEm && l.documentoId === ctx.documentoId && Math.round(l.valor * 100) === Math.round(ctx.valor * 100))
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1))[0];
  if (aberta) {
    const obs = [aberta.observacao, ctx.observacao].filter(Boolean).join('. ');
    return { quitar: { ...marcarPago(aberta, ctx.hoje, 'pix'), ...(obs ? { observacao: obs.slice(0, 300) } : {}) }, novo: null };
  }
  return {
    quitar: null,
    novo: recebimentoPorPix({ id, valor: ctx.valor, hoje: ctx.hoje, descricao: ctx.descricao, categoria: 'servico', clienteId: ctx.clienteId, documentoId: ctx.documentoId, observacao: ctx.observacao })
  };
}
