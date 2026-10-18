// Asaas (API v3): cliente, assinatura mensal por Pix, cartão ou boleto, cobrança avulsa por Pix,
// nota fiscal de serviço (NFS-e) e os avisos (webhooks). O cartão é digitado na página de
// pagamento do próprio Asaas (invoiceUrl): o número do cartão nunca passa pelo servidor do Revisaí.
// Referência: https://docs.asaas.com (autenticação pelo cabeçalho access_token; webhooks com o
// token no cabeçalho asaas-access-token, entregues "pelo menos uma vez", com id do evento).

import { timingSafeEqual } from 'node:crypto';
import {
  ErroDoGateway,
  type AssinaturaCriada,
  type Cobranca,
  type Evento,
  type Metodo,
  type Nota,
  type NovaAssinatura,
  type NovaCobranca,
  type NovaNota,
  type Pagador,
  type PedidoWebhook,
  type Provedor,
  type SituacaoNota,
  type SituacaoPagamento
} from './tipos';

export interface ConfigAsaas {
  chave: string;
  ambiente: 'sandbox' | 'producao';
  tokenWebhook: string | null;
  nota: ConfigNota | null;
}

export interface ConfigNota {
  /** Código do serviço na prefeitura (lista da LC 116, ex.: 01.03 ou o código municipal). */
  codigoServico: string;
  /** Id do serviço municipal no Asaas, quando a prefeitura pede (opcional). */
  idServico: string | null;
  nomeServico: string;
  /** Alíquota do ISS em % (ex.: 2). */
  iss: number;
}

type Buscar = (url: string, init: RequestInit) => Promise<Response>;

const BILLING: Record<Exclude<Metodo, 'pix_automatico'>, string> = { pix: 'PIX', cartao: 'CREDIT_CARD', boleto: 'BOLETO' };

export function urlBaseAsaas(ambiente: ConfigAsaas['ambiente']): string {
  return ambiente === 'producao' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

function metodoDoBilling(b: unknown): Metodo | null {
  if (b === 'PIX') return 'pix';
  if (b === 'CREDIT_CARD') return 'cartao';
  if (b === 'BOLETO') return 'boleto';
  return null;
}

/** As situações de cobrança do Asaas, no formato do Revisaí. */
export function situacaoAsaas(status: unknown): SituacaoPagamento {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
    case 'DUNNING_RECEIVED':
      return 'pago';
    case 'OVERDUE':
    case 'DUNNING_REQUESTED':
      return 'atrasado';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'estornado';
    default:
      return 'pendente';
  }
}

export function situacaoNotaAsaas(status: unknown): SituacaoNota {
  switch (status) {
    case 'AUTHORIZED':
      return 'emitida';
    case 'CANCELED':
    case 'PROCESSING_CANCELLATION':
      return 'cancelada';
    case 'ERROR':
    case 'CANCELLATION_DENIED':
      return 'erro';
    default:
      return 'agendada';
  }
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Data do Asaas ('AAAA-MM-DD' ou 'AAAA-MM-DD HH:MM:SS', em Brasília) para ISO. */
function instante(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) return null;
  return new Date(`${m[1]}T${m[2] ?? '12:00:00'}-03:00`).toISOString();
}

function https(v: unknown): string | null {
  const t = texto(v);
  return t && /^https:\/\//.test(t) ? t.slice(0, 500) : null;
}

/** Uma cobrança (payment) do Asaas no formato do Revisaí. */
export function cobrancaAsaas(p: Record<string, unknown>): Cobranca {
  return {
    externo: String(p.id ?? ''),
    valor: numero(p.value),
    vencimento: texto(p.dueDate)?.slice(0, 10) ?? null,
    link: https(p.invoiceUrl) ?? https(p.bankSlipUrl),
    pixCopiaECola: null,
    boletoLinha: null,
    situacao: situacaoAsaas(p.status),
    pagoEm: instante(p.clientPaymentDate) ?? instante(p.confirmedDate) ?? instante(p.paymentDate),
    metodo: metodoDoBilling(p.billingType)
  };
}

export function notaAsaas(n: Record<string, unknown>): Nota {
  return {
    externa: String(n.id ?? ''),
    situacao: situacaoNotaAsaas(n.status),
    numero: texto(n.number),
    url: https(n.pdfUrl) ?? https(n.xmlUrl),
    erro: texto(n.statusDescription)
  };
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function criarAsaas(c: ConfigAsaas, buscar: Buscar = fetch): Provedor {
  const base = urlBaseAsaas(c.ambiente);

  async function chamar<T = Record<string, unknown>>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const r = await buscar(`${base}${caminho}`, {
      method: metodo,
      headers: {
        access_token: c.chave,
        'user-agent': 'Revisai/1.0',
        accept: 'application/json',
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {})
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20_000)
    });
    const textoResposta = await r.text();
    let json: unknown = null;
    try {
      json = textoResposta ? JSON.parse(textoResposta) : null;
    } catch {
      json = null;
    }
    if (!r.ok) {
      const erros = (json as { errors?: { description?: string }[] } | null)?.errors;
      throw new ErroDoGateway(erros?.[0]?.description ?? `Asaas respondeu ${r.status}`, r.status, json);
    }
    return json as T;
  }

  async function completar(cob: Cobranca): Promise<Cobranca> {
    if (cob.situacao !== 'pendente' && cob.situacao !== 'atrasado') return cob;
    if (cob.metodo === 'pix') {
      try {
        const q = await chamar<{ payload?: string }>('GET', `/payments/${encodeURIComponent(cob.externo)}/pixQrCode`);
        return { ...cob, pixCopiaECola: texto(q.payload)?.slice(0, 600) ?? null };
      } catch {
        return cob;
      }
    }
    if (cob.metodo === 'boleto') {
      try {
        const q = await chamar<{ identificationField?: string }>('GET', `/payments/${encodeURIComponent(cob.externo)}/identificationField`);
        return { ...cob, boletoLinha: texto(q.identificationField)?.slice(0, 80) ?? null };
      } catch {
        return cob;
      }
    }
    return cob;
  }

  async function cobrancasDaAssinatura(externa: string): Promise<Cobranca[]> {
    const r = await chamar<{ data?: Record<string, unknown>[] }>('GET', `/subscriptions/${encodeURIComponent(externa)}/payments?limit=10`);
    const lista = (r.data ?? []).map(cobrancaAsaas).sort((x, y) => ((y.vencimento ?? '') > (x.vencimento ?? '') ? 1 : -1));
    const [primeira, ...resto] = lista;
    return primeira ? [await completar(primeira), ...resto] : [];
  }

  return {
    nome: 'asaas',
    metodos: ['pix', 'cartao', 'boleto'],
    emiteNota: !!c.nota,

    async criarCliente(p: Pagador) {
      const achados = await chamar<{ data?: { id: string; deleted?: boolean }[] }>('GET', `/customers?externalReference=${encodeURIComponent(p.referencia)}&cpfCnpj=${p.documento}`);
      const existente = achados.data?.find((x) => !x.deleted);
      if (existente) return existente.id;
      const novo = await chamar<{ id: string }>('POST', '/customers', {
        name: p.nome.slice(0, 120),
        cpfCnpj: p.documento,
        email: p.email,
        mobilePhone: p.telefone ? p.telefone.replace(/^55/, '') : undefined,
        externalReference: p.referencia,
        notificationDisabled: false
      });
      return novo.id;
    },

    async criarAssinatura(a: NovaAssinatura): Promise<AssinaturaCriada> {
      if (a.metodo === 'pix_automatico') throw new ErroDoGateway('O Pix Automático é pela Efí', 400);
      const sub = await chamar<{ id: string; nextDueDate?: string }>('POST', '/subscriptions', {
        customer: a.cliente,
        billingType: BILLING[a.metodo],
        value: a.valor,
        nextDueDate: a.primeiroVencimento,
        cycle: 'MONTHLY',
        description: a.descricao.slice(0, 500),
        externalReference: a.pagador.referencia
      });
      if (c.nota) {
        // a nota de cada mensalidade sai sozinha quando o pagamento confirma
        try {
          await chamar('POST', `/subscriptions/${encodeURIComponent(sub.id)}/invoiceSettings`, {
            municipalServiceId: c.nota.idServico ?? undefined,
            municipalServiceCode: c.nota.codigoServico,
            municipalServiceName: c.nota.nomeServico,
            effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION',
            receivedOnly: false,
            observations: a.descricao.slice(0, 250),
            taxes: { retainIss: false, iss: c.nota.iss, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 }
          });
        } catch (e) {
          console.error('[cobranca] asaas nota da assinatura', e instanceof Error ? e.message : e);
        }
      }
      const cobrancas = await cobrancasDaAssinatura(sub.id);
      return {
        clienteExterno: a.cliente,
        assinaturaExterna: sub.id,
        proximoVencimento: texto(sub.nextDueDate)?.slice(0, 10) ?? a.primeiroVencimento,
        autorizacao: null,
        primeira: cobrancas[0] ?? null
      };
    },

    async cancelarAssinatura(externa: string) {
      await chamar('DELETE', `/subscriptions/${encodeURIComponent(externa)}`);
    },

    async consultarPagamento(externo: string) {
      try {
        const p = await chamar<Record<string, unknown>>('GET', `/payments/${encodeURIComponent(externo)}`);
        return completar(cobrancaAsaas(p));
      } catch (e) {
        if (e instanceof ErroDoGateway && e.status === 404) return null;
        throw e;
      }
    },

    cobrancasDaAssinatura,

    async gerarCobrancaAvulsa(n: NovaCobranca) {
      const p = await chamar<Record<string, unknown>>('POST', '/payments', {
        customer: n.cliente,
        billingType: 'PIX',
        value: n.valor,
        dueDate: n.vencimento,
        description: n.descricao.slice(0, 500),
        externalReference: n.referencia
      });
      return completar(cobrancaAsaas(p));
    },

    async emitirNota(n: NovaNota): Promise<Nota> {
      if (!c.nota) throw new ErroDoGateway('A nota fiscal não está configurada (NFSE_CODIGO_SERVICO)', 400);
      const nota = await chamar<Record<string, unknown>>('POST', '/invoices', {
        payment: n.pagamentoExterno ?? undefined,
        customer: n.pagamentoExterno ? undefined : (n.cliente ?? undefined),
        serviceDescription: n.descricao.slice(0, 500),
        observations: 'Licença de uso de software (SaaS).',
        value: n.valor,
        deductions: 0,
        effectiveDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
        municipalServiceId: c.nota.idServico ?? undefined,
        municipalServiceCode: c.nota.codigoServico,
        municipalServiceName: c.nota.nomeServico,
        taxes: { retainIss: false, iss: c.nota.iss, cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 }
      });
      // emite agora, sem esperar a data agendada
      try {
        const autorizada = await chamar<Record<string, unknown>>('POST', `/invoices/${encodeURIComponent(String(nota.id))}/authorize`);
        return notaAsaas(autorizada);
      } catch {
        return notaAsaas(nota);
      }
    },

    validarWebhook(p: PedidoWebhook) {
      if (!c.tokenWebhook) return false;
      const recebido = p.cabecalhos.get('asaas-access-token') ?? '';
      return iguais(recebido, c.tokenWebhook);
    },

    lerEventos(corpo: unknown): Evento[] {
      return eventosAsaas(corpo);
    }
  };
}

/** Traduz um aviso do Asaas ({ id, event, payment | subscription | invoice }). */
export function eventosAsaas(corpo: unknown): Evento[] {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const id = texto(c.id) ?? null;
  const evento = texto(c.event) ?? '';
  if (!id) return [];
  const pagamento = c.payment && typeof c.payment === 'object' ? (c.payment as Record<string, unknown>) : null;
  const assinatura = c.subscription && typeof c.subscription === 'object' ? (c.subscription as Record<string, unknown>) : null;
  const nota = c.invoice && typeof c.invoice === 'object' ? (c.invoice as Record<string, unknown>) : null;

  if (pagamento && texto(pagamento.id)) {
    const cob = cobrancaAsaas(pagamento);
    const sub = texto(pagamento.subscription);
    switch (evento) {
      case 'PAYMENT_CREATED':
      case 'PAYMENT_UPDATED':
      case 'PAYMENT_RESTORED':
        return [{ id, tipo: 'cobranca', cobranca: cob, assinatura: sub }];
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_DUNNING_RECEIVED':
        return [{ id, tipo: 'pago', externo: cob.externo, pagoEm: cob.pagoEm ?? new Date().toISOString(), assinatura: sub, cobranca: { ...cob, situacao: 'pago' } }];
      case 'PAYMENT_OVERDUE':
        return [{ id, tipo: 'atrasado', externo: cob.externo }];
      case 'PAYMENT_DELETED':
        return [{ id, tipo: 'cancelado', externo: cob.externo }];
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_RECEIVED_IN_CASH_UNDONE':
        return [{ id, tipo: 'estornado', externo: cob.externo }];
      default:
        return [{ id, tipo: 'ignorado', motivo: evento || 'sem evento' }];
    }
  }
  if (assinatura && texto(assinatura.id) && (evento === 'SUBSCRIPTION_DELETED' || evento === 'SUBSCRIPTION_INACTIVATED')) {
    return [{ id, tipo: 'assinatura_cancelada', assinatura: String(assinatura.id) }];
  }
  if (nota && texto(nota.id) && evento.startsWith('INVOICE_')) {
    return [{ id, tipo: 'nota', externo: texto(nota.payment), nota: notaAsaas(nota) }];
  }
  return [{ id, tipo: 'ignorado', motivo: evento || 'sem evento' }];
}
