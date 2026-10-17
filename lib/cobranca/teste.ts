// Gateway de mentira, para testar a cobrança de ponta a ponta no computador
// (COBRANCA_PROVEDOR=teste). Nunca liga em produção (o index confere). Os links apontam para
// example.com, e os avisos (webhooks) são mandados à mão com o cabeçalho x-teste-segredo:
//   { "id": "evt_1", "tipo": "pago", "externo": "<cobrança>" }
//   { "id": "evt_2", "tipo": "assinatura_cancelada", "assinatura": "<assinatura>" }
//   { "id": "evt_3", "tipo": "nota", "externo": "<cobrança>", "nota": { "externa": "nf_1", "situacao": "emitida", "numero": "1", "url": "https://..." } }

import { timingSafeEqual } from 'node:crypto';
import { codigoPix } from '@/lib/pix';
import { novoTxid } from './documento';
import type { AssinaturaCriada, Cobranca, Evento, Metodo, NovaAssinatura, NovaCobranca, NovaNota, Nota, PedidoWebhook, Provedor, SituacaoNota } from './tipos';

export const SEGREDO_TESTE_PADRAO = 'segredo-de-teste';
const BASE = 'https://example.com/revisai-teste';

function pix(valor: number, txid: string, descricao: string): string {
  return codigoPix({ chave: 'pix-teste@example.com', nome: 'REVISAI TESTE', cidade: 'RIO DE JANEIRO', valor, txid, descricao });
}

function cobranca(metodo: Metodo, valor: number, vencimento: string, descricao: string, prefixo = 'pay'): Cobranca {
  const externo = `${prefixo}_teste_${novoTxid('').slice(0, 16)}`;
  const comPix = metodo === 'pix' || metodo === 'pix_automatico';
  return {
    externo,
    valor,
    vencimento,
    link: metodo === 'pix_automatico' ? null : `${BASE}/pagar/${externo}`,
    pixCopiaECola: comPix ? pix(valor, externo, descricao) : null,
    boletoLinha: metodo === 'boleto' ? '23790.00009 00000.000000 00000.000000 1 00000000002990' : null,
    situacao: 'pendente',
    pagoEm: null,
    metodo
  };
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;
}

const SITUACOES_NOTA: SituacaoNota[] = ['agendada', 'emitida', 'erro', 'cancelada'];

export function criarTeste(segredo: string = SEGREDO_TESTE_PADRAO): Provedor {
  return {
    nome: 'teste',
    metodos: ['pix_automatico', 'pix', 'cartao', 'boleto'],
    emiteNota: true,

    async criarCliente(p) {
      return `cus_teste_${p.documento}`;
    },

    async criarAssinatura(a: NovaAssinatura): Promise<AssinaturaCriada> {
      const primeira = cobranca(a.metodo, a.valor, a.primeiroVencimento, a.descricao);
      return {
        clienteExterno: a.cliente,
        assinaturaExterna: `sub_teste_${novoTxid('').slice(0, 16)}`,
        proximoVencimento: a.primeiroVencimento,
        autorizacao: a.metodo === 'pix_automatico' ? primeira.pixCopiaECola : null,
        primeira
      };
    },

    async cancelarAssinatura() {},

    async consultarPagamento() {
      return null;
    },

    async cobrancasDaAssinatura() {
      return [];
    },

    async gerarCobrancaAvulsa(n: NovaCobranca) {
      return cobranca('pix', n.valor, n.vencimento, n.descricao);
    },

    async agendarCobrancaRecorrente(_assinatura: string, valor: number, vencimento: string, descricao: string) {
      return cobranca('pix_automatico', valor, vencimento, descricao, 'cobr');
    },

    async emitirNota(n: NovaNota): Promise<Nota> {
      const externa = `nf_teste_${novoTxid('').slice(0, 12)}`;
      const numero = String(1000 + Math.floor(Math.random() * 9000));
      return { externa, situacao: n.valor > 0 ? 'emitida' : 'erro', numero, url: `${BASE}/nota/${externa}.pdf`, erro: n.valor > 0 ? null : 'Valor zerado' };
    },

    validarWebhook(p: PedidoWebhook) {
      return iguais(p.cabecalhos.get('x-teste-segredo') ?? '', segredo);
    },

    lerEventos(corpo: unknown): Evento[] {
      return eventosTeste(corpo);
    }
  };
}

export function eventosTeste(corpo: unknown): Evento[] {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>;
  const id = texto(c.id);
  const externo = texto(c.externo);
  const assinatura = texto(c.assinatura);
  if (!id) return [];
  switch (c.tipo) {
    case 'pago':
      return externo ? [{ id, tipo: 'pago', externo, pagoEm: texto(c.pagoEm) ?? new Date().toISOString(), assinatura, cobranca: null }] : [];
    case 'atrasado':
      return externo ? [{ id, tipo: 'atrasado', externo }] : [];
    case 'cancelado':
    case 'estornado':
      return externo ? [{ id, tipo: c.tipo, externo }] : [];
    case 'assinatura_cancelada':
    case 'autorizacao_ativa':
    case 'autorizacao_recusada':
      return assinatura ? [{ id, tipo: c.tipo, assinatura }] : [];
    case 'nota': {
      const n = (c.nota && typeof c.nota === 'object' ? c.nota : {}) as Record<string, unknown>;
      const externa = texto(n.externa);
      const situacao = SITUACOES_NOTA.find((s) => s === n.situacao) ?? 'agendada';
      const url = texto(n.url);
      return externa ? [{ id, tipo: 'nota', externo, nota: { externa, situacao, numero: texto(n.numero), url: url && url.startsWith('https://') ? url : null } }] : [];
    }
    default:
      return [{ id, tipo: 'ignorado', motivo: String(c.tipo ?? 'sem tipo') }];
  }
}
