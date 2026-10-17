// As notas fiscais como o app lê (public.notas_fiscais, só dono e gerente) e o resumo que fica na
// ordem de serviço (documento.nota). Sem nada de servidor: serve às telas e às ações.

import type { Documento } from '../tipos';
import type { AmbienteFiscal, SituacaoNota, TipoNota } from './tipos';

export interface NotaFiscal {
  id: string;
  documentoId: string | null;
  tipo: TipoNota;
  provedor: string;
  externo: string;
  ambiente: AmbienteFiscal;
  situacao: SituacaoNota;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  urlPdf: string | null;
  urlXml: string | null;
  valor: number;
  tomador: { nome?: string; documento?: string; email?: string | null };
  mensagem: string | null;
  autorizadaEm: string | null;
  canceladaEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export const COLUNAS_DA_NOTA =
  'id, documento_id, tipo, provedor, externo, ambiente, situacao, numero, serie, chave, url_pdf, url_xml, valor, tomador, mensagem, autorizada_em, cancelada_em, criado_em, atualizado_em';

function texto(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

export function lerNotaFiscal(v: unknown): NotaFiscal | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const tipo = r.tipo === 'nfse' || r.tipo === 'nfe' ? r.tipo : null;
  const situacao = r.situacao === 'processando' || r.situacao === 'autorizada' || r.situacao === 'erro' || r.situacao === 'cancelada' ? r.situacao : null;
  if (typeof r.id !== 'string' || !tipo || !situacao) return null;
  const t = r.tomador && typeof r.tomador === 'object' ? (r.tomador as NotaFiscal['tomador']) : {};
  return {
    id: r.id,
    documentoId: texto(r.documento_id),
    tipo,
    provedor: String(r.provedor ?? ''),
    externo: String(r.externo ?? ''),
    ambiente: r.ambiente === 'producao' ? 'producao' : 'homologacao',
    situacao,
    numero: texto(r.numero),
    serie: texto(r.serie),
    chave: texto(r.chave),
    urlPdf: texto(r.url_pdf),
    urlXml: texto(r.url_xml),
    valor: Number(r.valor) || 0,
    tomador: t,
    mensagem: texto(r.mensagem),
    autorizadaEm: texto(r.autorizada_em),
    canceladaEm: texto(r.cancelada_em),
    criadoEm: String(r.criado_em ?? ''),
    atualizadoEm: String(r.atualizado_em ?? '')
  };
}

export const SITUACOES_DA_NOTA: Record<SituacaoNota, { nome: string; tom: 'oleo' | 'ok' | 'atraso' | 'neutro' }> = {
  processando: { nome: 'Processando', tom: 'oleo' },
  autorizada: { nome: 'Autorizada', tom: 'ok' },
  erro: { nome: 'Recusada', tom: 'atraso' },
  cancelada: { nome: 'Cancelada', tom: 'neutro' }
};

export const NOMES_DA_NOTA: Record<TipoNota, { curto: string; longo: string }> = {
  nfse: { curto: 'NFS-e', longo: 'Nota de serviço (NFS-e)' },
  nfe: { curto: 'NF-e', longo: 'Nota das peças (NF-e)' }
};

/** A NF-e cancela até 24 horas depois de autorizada (alguns estados dão mais; o emissor confere). */
export const HORAS_PARA_CANCELAR_NFE = 24;

/** Dá para pedir o cancelamento agora? A NFS-e depende da prefeitura: quem diz não é o emissor. */
export function podeCancelar(n: Pick<NotaFiscal, 'tipo' | 'situacao' | 'autorizadaEm'>, agora: Date = new Date()): boolean {
  if (n.situacao !== 'autorizada') return false;
  if (n.tipo === 'nfse') return true;
  const desde = n.autorizadaEm ? new Date(n.autorizadaEm).getTime() : NaN;
  return Number.isFinite(desde) && agora.getTime() - desde <= HORAS_PARA_CANCELAR_NFE * 3_600_000;
}

/** A nota mais nova de cada tipo da ordem (a que vale; as recusadas e canceladas ficam de histórico). */
export function notasDaOrdem(notas: NotaFiscal[], documentoId: string): Partial<Record<TipoNota, NotaFiscal>> {
  const r: Partial<Record<TipoNota, NotaFiscal>> = {};
  for (const n of notas) {
    if (n.documentoId !== documentoId) continue;
    const atual = r[n.tipo];
    if (!atual || n.criadoEm > atual.criadoEm) r[n.tipo] = n;
  }
  return r;
}

/** O resumo que fica na ordem: a nota de serviço (ou, sem ela, a das peças). */
export function resumoDaNota(notas: Partial<Record<TipoNota, NotaFiscal>>): Documento['nota'] {
  const n = notas.nfse ?? notas.nfe;
  if (!n) return null;
  return { situacao: n.situacao, numero: n.numero, url: n.urlPdf, chave: n.chave, mensagem: n.mensagem };
}

/** O resumo da ordem mudou (para gravar só quando precisa). */
export function resumoMudou(atual: Documento['nota'] | undefined, novo: Documento['nota']): boolean {
  const a = atual ?? null;
  if (!a || !novo) return a !== novo;
  return a.situacao !== novo.situacao || (a.numero ?? null) !== (novo.numero ?? null) || (a.url ?? null) !== (novo.url ?? null) || (a.chave ?? null) !== (novo.chave ?? null) || (a.mensagem ?? null) !== (novo.mensagem ?? null);
}
