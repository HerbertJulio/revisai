// A prova da aprovação do orçamento (Código de Defesa do Consumidor, art. 40). O que o cliente
// aprovou (itens, quantidades, preços, desconto, total e validade) vira um texto canônico, e o
// resumo SHA-256 dele é a "versão" guardada na aprovação. A mesma conta roda na página do
// cliente, no servidor e no app da oficina, então os três mostram o mesmo código de conferência;
// se o orçamento mudar depois, o resumo deixa de bater.

import { totais } from './documentos';
import { dadosDoOrcamento, type DadosOrcamentoLink, type RespostaDoLink } from './links-publicos';
import type { AprovacaoDocumento, Cliente, Documento, Id, Veiculo } from './tipos';

export interface ItemAprovado {
  descricao: string;
  tipo: 'peca' | 'servico' | 'outro';
  quantidade: number;
  unidade: 'un' | 'L' | 'h';
  valorUnitario: number | null;
}

/** O que entra no resumo: só o que vale como combinado entre a oficina e o cliente. */
export interface ConteudoAprovado {
  orcamento: number;
  itens: ItemAprovado[];
  /** O que o cliente não quis agora (fica registrado junto). */
  recusados: string[];
  desconto: number;
  total: number;
  validade: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** O conteúdo aprovado a partir dos dados do link (os mesmos que o cliente vê). */
export function conteudoDaAprovacao(d: Pick<DadosOrcamentoLink, 'numero' | 'linhas' | 'desconto' | 'validade'>, recusadas: Iterable<Id>): ConteudoAprovado {
  const fora = new Set(recusadas);
  const aprovadas = d.linhas.filter((l) => !fora.has(l.id));
  const t = totais({
    linhas: aprovadas.map((l) => ({ id: l.id, tipo: l.tipo, descricao: l.descricao, quantidade: l.quantidade, unidade: l.unidade, valorUnitario: l.valorUnitario })),
    desconto: d.desconto ?? null
  });
  return {
    orcamento: d.numero,
    itens: aprovadas.map((l) => ({ descricao: l.descricao, tipo: l.tipo, quantidade: r2(l.quantidade), unidade: l.unidade, valorUnitario: l.valorUnitario == null ? null : r2(l.valorUnitario) })),
    recusados: d.linhas.filter((l) => fora.has(l.id)).map((l) => l.descricao),
    desconto: t.desconto,
    total: t.total,
    validade: d.validade
  };
}

/** O mesmo conteúdo, a partir do orçamento guardado no aparelho (as linhas marcadas como recusadas ficam de fora). */
export function conteudoDoOrcamento(doc: Documento, recusadas?: Iterable<Id>): ConteudoAprovado {
  const dados = dadosDoOrcamento(doc, undefined, undefined);
  return conteudoDaAprovacao(dados, recusadas ?? doc.linhas.filter((l) => l.recusada).map((l) => l.id));
}

/** JSON com as chaves em ordem e sem espaços: o mesmo texto em qualquer aparelho. */
export function jsonCanonico(v: unknown): string {
  if (v === undefined || v === null || typeof v === 'function') return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  const chaves = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`;
}

/** SHA-256 em hexadecimal (SubtleCrypto: navegador e servidor). */
export async function sha256(texto: string): Promise<string> {
  const resumo = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A versão (resumo) do conteúdo aprovado. */
export function versaoDoConteudo(c: ConteudoAprovado): Promise<string> {
  return sha256(jsonCanonico(c));
}

/** "3F2A 9C10 77BE 0D41": o começo do resumo, fácil de conferir a olho. */
export function codigoDeConferencia(versao: string | null | undefined): string {
  const h = (versao ?? '').replace(/[^0-9a-f]/gi, '').slice(0, 16).toUpperCase();
  return h.match(/.{1,4}/g)?.join(' ') ?? '';
}

export const CANAIS_DE_APROVACAO: Record<AprovacaoDocumento['canal'], string> = {
  link: 'Pelo link do orçamento',
  whatsapp: 'Pelo WhatsApp',
  presencial: 'Na oficina, com assinatura'
};

/** A aprovação que veio pelo link (data, IP e aparelho são os que o banco guardou). */
export function aprovacaoDoLink(r: RespostaDoLink): AprovacaoDocumento {
  return { canal: 'link', quando: r.quando, nome: r.nome || undefined, ip: r.ip, agente: r.agente, versao: r.hashAprovado ?? '' };
}

/** "Chrome no Android", "Safari no iPhone": o aparelho, para quem lê o comprovante. */
export function aparelhoDoAgente(agente: string | null | undefined): string {
  const a = agente ?? '';
  if (!a) return '';
  const sistema = /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Android' : /Windows/.test(a) ? 'Windows' : /Mac OS X|Macintosh/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : '';
  const navegador = /Edg\//.test(a)
    ? 'Edge'
    : /SamsungBrowser/.test(a)
      ? 'Samsung Internet'
      : /OPR\/|Opera/.test(a)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(a)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(a)
            ? 'Chrome'
            : /Safari\//.test(a)
              ? 'Safari'
              : '';
  if (navegador && sistema) return `${navegador} no ${sistema}`;
  return navegador || sistema || a.slice(0, 60);
}

/** O que mostrar sobre um orçamento: os itens aprovados e o total, a partir do documento. */
export function resumoParaComprovante(doc: Documento, cliente: Cliente | undefined, veiculo: Veiculo | undefined) {
  const dados = dadosDoOrcamento(doc, cliente, veiculo);
  const conteudo = conteudoDaAprovacao(dados, doc.linhas.filter((l) => l.recusada).map((l) => l.id));
  return { dados, conteudo };
}
