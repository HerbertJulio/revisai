// Efí (API Pix com certificado, mTLS): Pix Automático do Banco Central. O pagador lê um QR Code
// (Jornada 3): paga o primeiro mês e autoriza os próximos no app do banco; depois, cada mês, o
// Revisaí agenda a cobrança da recorrência (cobr) e o banco do pagador debita sozinho.
// Também gera o Pix com vencimento (cobv) da mensalidade das lojas.
// Endpoints do padrão do Banco Central para o Pix Automático: /v2/locrec, /v2/rec, /v2/cobr;
// avisos por webhook (/v2/webhookrec, /v2/webhookcobr e o webhook de Pix). Confira os nomes no
// ambiente de homologação da Efí antes de ligar em produção.

import { request } from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import { hojeEmBrasilia, maisUmMes, novoTxid } from './documento';
import {
  ErroDoGateway,
  type AssinaturaCriada,
  type Cobranca,
  type Evento,
  type NovaAssinatura,
  type NovaCobranca,
  type Pagador,
  type PedidoWebhook,
  type Provedor,
  type SituacaoPagamento
} from './tipos';

export interface ConfigEfi {
  clienteId: string;
  segredo: string;
  /** Certificado .p12 da Efí em base64. */
  certificado: string;
  senhaCertificado: string;
  ambiente: 'homologacao' | 'producao';
  chavePix: string;
  /** Segredo que vai no endereço do webhook (?s=...), para conferir que o aviso é da Efí. */
  segredoWebhook: string | null;
}

export interface PedidoEfi {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  caminho: string;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
}

export type TransporteEfi = (p: PedidoEfi) => Promise<{ status: number; json: unknown }>;

export function urlBaseEfi(ambiente: ConfigEfi['ambiente']): string {
  return ambiente === 'producao' ? 'https://pix.api.efipay.com.br' : 'https://pix-h.api.efipay.com.br';
}

/** Transporte padrão: HTTPS com o certificado da conta (mTLS). */
export function transporteHttps(c: ConfigEfi): TransporteEfi {
  const base = new URL(urlBaseEfi(c.ambiente));
  const pfx = Buffer.from(c.certificado, 'base64');
  return (p) =>
    new Promise((resolver, rejeitar) => {
      const corpo = p.corpo !== undefined ? JSON.stringify(p.corpo) : undefined;
      const req = request(
        {
          host: base.host,
          path: p.caminho,
          method: p.metodo,
          pfx,
          passphrase: c.senhaCertificado,
          headers: { accept: 'application/json', ...(corpo ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corpo) } : {}), ...(p.cabecalhos ?? {}) },
          timeout: 20_000
        },
        (res) => {
          const partes: Buffer[] = [];
          res.on('data', (d: Buffer) => partes.push(d));
          res.on('end', () => {
            const texto = Buffer.concat(partes).toString('utf8');
            let json: unknown = null;
            try {
              json = texto ? JSON.parse(texto) : null;
            } catch {
              json = null;
            }
            resolver({ status: res.statusCode ?? 0, json });
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('Efí demorou para responder')));
      req.on('error', rejeitar);
      if (corpo) req.write(corpo);
      req.end();
    });
}

function devedor(p: Pagador): Record<string, string> {
  return p.documento.length === 11 ? { cpf: p.documento, nome: p.nome.slice(0, 140) } : { cnpj: p.documento, nome: p.nome.slice(0, 140) };
}

function valor(n: number): string {
  return n.toFixed(2);
}

/** Situação de cob, cobv e cobr no formato do Revisaí. */
export function situacaoEfi(status: unknown): SituacaoPagamento {
  switch (status) {
    case 'CONCLUIDA':
      return 'pago';
    case 'REMOVIDA_PELO_USUARIO_RECEBEDOR':
    case 'REMOVIDA_PELO_PSP':
    case 'CANCELADA':
    case 'REJEITADA':
      return 'cancelado';
    case 'EXPIRADA':
      return 'atrasado';
    default:
      return 'pendente';
  }
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function cobrancaEfi(j: Record<string, unknown>, metodo: Cobranca['metodo']): Cobranca {
  const cal = (j.calendario ?? {}) as Record<string, unknown>;
  const val = (j.valor ?? {}) as Record<string, unknown>;
  const pix = Array.isArray(j.pix) ? (j.pix as Record<string, unknown>[]) : [];
  const vencimento = texto(cal.dataDeVencimento) ?? (texto(cal.criacao)?.slice(0, 10) ?? null);
  return {
    externo: String(j.txid ?? ''),
    valor: Number(val.original ?? val.valorRec ?? 0) || 0,
    vencimento,
    link: null,
    pixCopiaECola: texto(j.pixCopiaECola)?.slice(0, 600) ?? null,
    boletoLinha: null,
    situacao: situacaoEfi(j.status),
    pagoEm: texto(pix[0]?.horario),
    metodo
  };
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function criarEfi(c: ConfigEfi, transporte: TransporteEfi = transporteHttps(c)): Provedor {
  let token: { valor: string; ate: number } | null = null;

  async function autenticar(): Promise<string> {
    if (token && token.ate > Date.now() + 30_000) return token.valor;
    const basico = Buffer.from(`${c.clienteId}:${c.segredo}`).toString('base64');
    const r = await transporte({ metodo: 'POST', caminho: '/oauth/token', corpo: { grant_type: 'client_credentials' }, cabecalhos: { authorization: `Basic ${basico}` } });
    const j = (r.json ?? {}) as { access_token?: string; expires_in?: number };
    if (r.status >= 300 || !j.access_token) throw new ErroDoGateway('A Efí recusou as credenciais', r.status, r.json);
    token = { valor: j.access_token, ate: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.valor;
  }

  async function chamar<T = Record<string, unknown>>(metodo: PedidoEfi['metodo'], caminho: string, corpo?: unknown): Promise<T> {
    const r = await transporte({ metodo, caminho, corpo, cabecalhos: { authorization: `Bearer ${await autenticar()}` } });
    if (r.status >= 300) {
      const j = (r.json ?? {}) as { mensagem?: string; detail?: string; title?: string };
      throw new ErroDoGateway(j.mensagem ?? j.detail ?? j.title ?? `Efí respondeu ${r.status}`, r.status, r.json);
    }
    return (r.json ?? {}) as T;
  }

  async function consultar(txid: string): Promise<Cobranca | null> {
    for (const [tipo, metodo] of [
      ['cob', 'pix_automatico'],
      ['cobr', 'pix_automatico'],
      ['cobv', 'pix']
    ] as const) {
      try {
        const j = await chamar<Record<string, unknown>>('GET', `/v2/${tipo}/${encodeURIComponent(txid)}`);
        return cobrancaEfi(j, metodo);
      } catch (e) {
        if (e instanceof ErroDoGateway && (e.status === 404 || e.status === 400)) continue;
        throw e;
      }
    }
    return null;
  }

  return {
    nome: 'efi',
    metodos: ['pix_automatico'],
    emiteNota: false,

    // a Efí não guarda cliente: o devedor vai em cada cobrança
    async criarCliente(p: Pagador) {
      return p.documento;
    },

    async criarAssinatura(a: NovaAssinatura): Promise<AssinaturaCriada> {
      if (a.metodo !== 'pix_automatico') throw new ErroDoGateway('Pela Efí, só o Pix Automático', 400);
      // 1. o primeiro mês, com o QR que também autoriza a recorrência (Jornada 3)
      const txid = novoTxid('rvp');
      const cob = await chamar<Record<string, unknown>>('PUT', `/v2/cob/${txid}`, {
        calendario: { expiracao: 86_400 },
        devedor: devedor(a.pagador),
        valor: { original: valor(a.valor) },
        chave: c.chavePix,
        solicitacaoPagador: a.descricao.slice(0, 140)
      });
      // 2. o lugar da recorrência e a recorrência mensal, a partir do mês que vem
      const loc = await chamar<{ id: number }>('POST', '/v2/locrec');
      const inicio = maisUmMes(a.primeiroVencimento || hojeEmBrasilia());
      const rec = await chamar<{ idRec: string; status?: string }>('POST', '/v2/rec', {
        vinculo: { objeto: a.descricao.slice(0, 35), contrato: a.pagador.referencia.replace(/-/g, '').slice(0, 35), devedor: devedor(a.pagador) },
        calendario: { dataInicial: inicio, periodicidade: 'MENSAL' },
        valor: { valorRec: valor(a.valor) },
        politicaRetentativa: 'PERMITE_3R_7D',
        loc: loc.id,
        ativacao: { dadosJornada: { txid } }
      });
      // 3. o copia e cola da Jornada 3 (paga o primeiro mês e autoriza)
      const dados = await chamar<{ dadosQR?: { pixCopiaECola?: string } }>('GET', `/v2/rec/${encodeURIComponent(rec.idRec)}?txid=${txid}`);
      const autorizacao = texto(dados.dadosQR?.pixCopiaECola) ?? texto(cob.pixCopiaECola);
      return {
        clienteExterno: a.pagador.documento,
        assinaturaExterna: rec.idRec,
        proximoVencimento: inicio,
        autorizacao: autorizacao?.slice(0, 600) ?? null,
        primeira: { ...cobrancaEfi(cob, 'pix_automatico'), vencimento: a.primeiroVencimento, pixCopiaECola: autorizacao?.slice(0, 600) ?? null }
      };
    },

    async cancelarAssinatura(externa: string) {
      await chamar('PATCH', `/v2/rec/${encodeURIComponent(externa)}`, { status: 'CANCELADA' });
    },

    consultarPagamento: consultar,

    // as cobranças da recorrência são criadas pelo Revisaí (agendarCobrancaRecorrente) e ficam no banco
    async cobrancasDaAssinatura() {
      return [];
    },

    async agendarCobrancaRecorrente(assinatura: string, v: number, vencimento: string, descricao: string) {
      const txid = novoTxid('rvr');
      const j = await chamar<Record<string, unknown>>('PUT', `/v2/cobr/${txid}`, {
        idRec: assinatura,
        infoAdicional: descricao.slice(0, 140),
        calendario: { dataDeVencimento: vencimento },
        valor: { original: valor(v) },
        ajusteDiaUtil: true
      });
      return { ...cobrancaEfi({ ...j, txid: j.txid ?? txid }, 'pix_automatico'), vencimento };
    },

    async gerarCobrancaAvulsa(n: NovaCobranca) {
      const txid = novoTxid('rvl');
      const j = await chamar<Record<string, unknown>>('PUT', `/v2/cobv/${txid}`, {
        calendario: { dataDeVencimento: n.vencimento, validadeAposVencimento: 30 },
        devedor: devedor(n.pagador),
        valor: { original: valor(n.valor) },
        chave: c.chavePix,
        solicitacaoPagador: n.descricao.slice(0, 140)
      });
      return { ...cobrancaEfi({ ...j, txid: j.txid ?? txid }, 'pix'), vencimento: n.vencimento };
    },

    async emitirNota() {
      throw new ErroDoGateway('A Efí não emite nota fiscal', 400);
    },

    validarWebhook(p: PedidoWebhook) {
      if (!c.segredoWebhook) return false;
      return iguais(p.url.searchParams.get('s') ?? '', c.segredoWebhook);
    },

    lerEventos(corpo: unknown): Evento[] {
      return eventosEfi(corpo);
    }
  };
}

function lista(c: Record<string, unknown>, chaves: string[]): Record<string, unknown>[] {
  for (const k of chaves) if (Array.isArray(c[k])) return (c[k] as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  return [];
}

/**
 * Traduz os avisos da Efí: Pix recebido ({ pix: [...] }), recorrência ({ recs: [...] }) e
 * cobrança da recorrência ({ cobsr: [...] }). Sem id de evento, o id vem do próprio item e da
 * situação (a mesma situação repetida é o mesmo aviso).
 */
export function eventosEfi(corpo: unknown): Evento[] {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const eventos: Evento[] = [];
  for (const p of lista(c, ['pix'])) {
    const txid = texto(p.txid);
    const e2e = texto(p.endToEndId);
    if (!txid || !e2e) continue;
    const devolucoes = Array.isArray(p.devolucoes) ? (p.devolucoes as Record<string, unknown>[]) : [];
    const devolvida = devolucoes.find((d) => d?.status === 'DEVOLVIDO');
    if (devolvida) {
      eventos.push({ id: `${e2e}:devolvido:${String(devolvida.id ?? '')}`, tipo: 'estornado', externo: txid });
      continue;
    }
    eventos.push({ id: `${e2e}:pago`, tipo: 'pago', externo: txid, pagoEm: texto(p.horario), assinatura: null, cobranca: null });
  }
  for (const r of lista(c, ['recs', 'rec', 'recorrencias'])) {
    const idRec = texto(r.idRec);
    const status = texto(r.status) ?? '';
    if (!idRec) continue;
    const id = `${idRec}:${status}`;
    if (status === 'APROVADA') eventos.push({ id, tipo: 'autorizacao_ativa', assinatura: idRec });
    else if (status === 'REJEITADA') eventos.push({ id, tipo: 'autorizacao_recusada', assinatura: idRec });
    else if (status === 'CANCELADA' || status === 'EXPIRADA') eventos.push({ id, tipo: 'assinatura_cancelada', assinatura: idRec });
    else eventos.push({ id, tipo: 'ignorado', motivo: `recorrência ${status || 'sem situação'}` });
  }
  for (const r of lista(c, ['cobsr', 'cobr', 'cobrs'])) {
    const txid = texto(r.txid);
    const status = texto(r.status) ?? '';
    if (!txid) continue;
    const id = `${txid}:${status}`;
    if (status === 'CONCLUIDA') {
      const pix = Array.isArray(r.pix) ? (r.pix as Record<string, unknown>[]) : [];
      eventos.push({ id, tipo: 'pago', externo: txid, pagoEm: texto(pix[0]?.horario) ?? texto(r.atualizacao) ?? null, assinatura: texto(r.idRec), cobranca: null });
    } else if (status === 'EXPIRADA') eventos.push({ id, tipo: 'atrasado', externo: txid });
    else if (status === 'CANCELADA' || status === 'REJEITADA') eventos.push({ id, tipo: 'cancelado', externo: txid });
    else eventos.push({ id, tipo: 'ignorado', motivo: `cobrança ${status || 'sem situação'}` });
  }
  return eventos;
}
