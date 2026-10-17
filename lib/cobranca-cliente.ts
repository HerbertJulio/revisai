// Cobrança do cliente da oficina: o Pix da ordem de serviço (e da mensalidade do clube) pelo
// WhatsApp, com a página de pagamento. O Pix é o código estático do Banco Central com a chave da
// oficina: o dinheiro cai direto na conta dela e o Revisaí não passa pelo pagamento. O cliente
// avisa "Já paguei" pela página; a oficina confere no banco e confirma no app, e só então entra
// a conta recebida no financeiro.

import { z } from 'zod';
import { somarDias } from './datas';
import { totais } from './documentos';
import { cpfValido } from './fiscal/identificacao';
import { formatarMoeda, formatarPlaca, primeiroNome } from './formatos';
import { codigoPix, formatarChavePix, normalizarChavePix, type TipoChavePix } from './pix';
import type { Lancamento, NovoItemExtra } from './registros-oficina';
import type { Documento, Id, Oficina, Veiculo } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Quanto tempo a página de pagamento vale (o código Pix em si não vence). */
export const DIAS_DO_LINK = 15;

// ---------------------------------------------------------------- quanto cobrar

/** O que já entrou de uma ordem: as contas a receber pagas ligadas a ela. */
export function recebidoDoDocumento(lancamentos: Record<Id, Lancamento> | Lancamento[], documentoId: Id): number {
  const lista = Array.isArray(lancamentos) ? lancamentos : Object.values(lancamentos);
  let soma = 0;
  for (const l of lista) if (l.tipo === 'receber' && l.pagoEm && l.documentoId === documentoId && l.valor > 0) soma += l.valor;
  return r2(soma);
}

/** O que falta receber: o total da ordem menos o que já entrou (nunca negativo). */
export function valorEmAberto(doc: Pick<Documento, 'linhas' | 'desconto'>, recebido: number): number {
  return Math.max(0, r2(totais(doc).total - Math.max(0, recebido)));
}

/** A ordem que dá para cobrar: aberta (sinal) ou concluída. */
export function podeCobrar(doc: Pick<Documento, 'tipo' | 'situacao'>): boolean {
  return doc.tipo === 'ordem' && (doc.situacao === 'aberta' || doc.situacao === 'concluida');
}

/** Lê o valor digitado ('350', '350,50', 'R$ 1.200,00'); null quando não é um valor que dá para cobrar. */
export function lerValorDaCobranca(texto: string): number | null {
  let t = (texto ?? '').replace(/R\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0.01 || n > 1_000_000) return null;
  return r2(n);
}

// ---------------------------------------------------------------- chave Pix da oficina

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O tipo de uma chave já guardada (normalizada). */
export function tipoDaChavePix(chave: string | null | undefined): TipoChavePix | null {
  const t = (chave ?? '').trim();
  if (!t) return null;
  if (t.includes('@')) return 'email';
  if (UUID.test(t)) return 'aleatoria';
  if (/^\+55\d{10,11}$/.test(t)) return 'telefone';
  if (/^\d{11}$/.test(t)) return 'cpf';
  if (/^[0-9A-Z]{12}\d{2}$/.test(t)) return 'cnpj';
  return null;
}

/**
 * A chave pronta para o código Pix, do jeito que estiver escrita: com tipo conhecido, só
 * normaliza; sem tipo, descobre (11 números com dígito de CPF válido é CPF; senão, celular).
 */
export function chavePixUsavel(chave: string | null | undefined, tipo?: TipoChavePix | null): string | null {
  const t = (chave ?? '').trim();
  if (!t) return null;
  if (tipo) return normalizarChavePix(tipo, t);
  if (t.includes('@')) return normalizarChavePix('email', t);
  if (UUID.test(t)) return normalizarChavePix('aleatoria', t);
  if (t.startsWith('+')) return normalizarChavePix('telefone', t);
  const alfa = t.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (/[A-Z]/.test(alfa)) return normalizarChavePix('cnpj', t);
  const d = t.replace(/\D/g, '');
  if (d.length === 14) return normalizarChavePix('cnpj', d);
  if (d.length === 11) return cpfValido(d) ? d : normalizarChavePix('telefone', d);
  if (d.length === 10 || ((d.length === 12 || d.length === 13) && d.startsWith('55'))) return normalizarChavePix('telefone', d);
  return null;
}

export const TIPOS_DE_CHAVE: { id: TipoChavePix; nome: string; exemplo: string }[] = [
  { id: 'cnpj', nome: 'CNPJ', exemplo: '00.000.000/0000-00' },
  { id: 'cpf', nome: 'CPF', exemplo: '000.000.000-00' },
  { id: 'telefone', nome: 'Celular', exemplo: '(21) 99999-0000' },
  { id: 'email', nome: 'E-mail', exemplo: 'pix@oficina.com.br' },
  { id: 'aleatoria', nome: 'Chave aleatória', exemplo: 'Como aparece no app do banco' }
];

export const ERRO_DA_CHAVE: Record<TipoChavePix, string> = {
  cnpj: 'O CNPJ tem 14 letras e números, como no cartão do CNPJ.',
  cpf: 'O CPF tem 11 números.',
  email: 'Confira o e-mail da chave.',
  telefone: 'Escreva o celular da chave com DDD.',
  aleatoria: 'A chave aleatória tem 32 letras e números, com tracinhos, como aparece no app do banco.'
};

/** "CNPJ 12.345.678/0001-95", "Celular (21) 99999-0000". */
export function chavePixParaMostrar(chave: string | null | undefined): string {
  const tipo = tipoDaChavePix(chave);
  if (!chave || !tipo) return chave ?? '';
  const nome = TIPOS_DE_CHAVE.find((t) => t.id === tipo)?.nome ?? '';
  return `${nome} ${formatarChavePix(tipo, chave)}`.trim();
}

export interface RecebedorPix {
  chave: string;
  /** Quem recebe, como aparece no app do banco (até 25 letras). */
  nome: string;
  cidade: string;
}

/** A chave, o nome e a cidade da oficina para o código Pix (null sem chave válida). */
export function recebedorDaOficina(o: Pick<Oficina, 'chavePix' | 'nome' | 'razaoSocial' | 'cidade'>): RecebedorPix | null {
  const chave = chavePixUsavel(o.chavePix);
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

export function urlDoPagamento(origem: string, token: string): string {
  return `${origem.replace(/\/+$/, '')}/pagar/${token}`;
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

/** A linha do link público como a oficina lê (RLS: só dono e gerente). */
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

/** A conta recebida (paga hoje, por Pix) que entra no financeiro quando a oficina confirma. */
export function lancamentoRecebido(ctx: {
  id: Id;
  valor: number;
  hoje: string;
  descricao: string;
  categoria: 'servico' | 'clube';
  clienteId?: Id | null;
  documentoId?: Id | null;
  observacao?: string;
}): NovoItemExtra<'lancamentos'> & { id: Id } {
  return {
    id: ctx.id,
    tipo: 'receber',
    descricao: ctx.descricao.slice(0, 200),
    valor: r2(ctx.valor),
    vencimento: ctx.hoje,
    pagoEm: ctx.hoje,
    forma: 'pix',
    categoria: ctx.categoria,
    clienteId: ctx.clienteId ?? null,
    documentoId: ctx.documentoId ?? null,
    ...(ctx.observacao ? { observacao: ctx.observacao.slice(0, 300) } : {})
  };
}
