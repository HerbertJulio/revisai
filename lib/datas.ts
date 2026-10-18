// Datas de calendário como texto 'AAAA-MM-DD' (sem fuso), para não errar o dia ao somar meses.

const DIA_MS = 86_400_000;

/** Hoje no relógio do aparelho, como 'AAAA-MM-DD'. */
export function hojeISO(agora: Date = new Date()): string {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** A data local (no fuso do aparelho) de um instante ISO, como 'AAAA-MM-DD'. */
export function dataLocal(instante: string): string {
  const d = new Date(instante);
  return Number.isNaN(d.getTime()) ? instante.slice(0, 10) : hojeISO(d);
}

const FORMATO_DIA_BRASILIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const COM_FUSO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * O dia em Brasília ('AAAA-MM-DD') de um instante (ISO com fuso, milissegundos ou Date), o mesmo dia
 * que o banco usa: o instante de 21h47 em Brasília (00h47 em UTC) é do dia em Brasília. Uma data
 * 'AAAA-MM-DD' ou uma hora sem fuso (já local) voltam como estão.
 */
export function diaEmBrasilia(instante: number | string | Date): string {
  if (typeof instante === 'string' && !COM_FUSO.test(instante.trim())) return instante.slice(0, 10);
  const texto = typeof instante === 'string' ? instante.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00') : instante;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? String(instante).slice(0, 10) : FORMATO_DIA_BRASILIA.format(d);
}

export function dataValida(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Número do dia (dias desde 1970-01-01). */
export function paraDia(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / DIA_MS);
}

export function deDia(n: number): string {
  return new Date(Math.round(n) * DIA_MS).toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  return deDia(paraDia(iso) + Math.round(dias));
}

/** Soma meses mantendo o dia; 31/01 + 1 mês vira 28/02 (ou 29/02). */
export function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + Math.round(meses);
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Dias de a até b (positivo se b vem depois). */
export function diasEntre(a: string, b: string): number {
  return paraDia(b) - paraDia(a);
}

export function menorData(...datas: (string | null | undefined)[]): string | null {
  let menor: string | null = null;
  for (const d of datas) if (d && (menor === null || d < menor)) menor = d;
  return menor;
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = diaEmBrasilia(iso).split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDataCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [, m, d] = diaEmBrasilia(iso).split('-');
  return `${d}/${m}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '22 out' ou '22 out 2027' quando o ano é outro. */
export function formatarDataExtensa(iso: string | null | undefined, hoje?: string): string {
  if (!iso) return '';
  const [a, m, d] = diaEmBrasilia(iso).split('-');
  const base = `${Number(d)} ${MESES[Number(m) - 1]}`;
  return hoje && hoje.slice(0, 4) === a ? base : `${base} ${a}`;
}

/** 'hoje', 'amanhã', 'em 9 dias', 'ontem', 'há 3 dias'. */
export function relativo(dias: number): string {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  if (dias > 1) return dias < 60 ? `em ${dias} dias` : `em ${Math.round(dias / 30.4)} meses`;
  const p = -dias;
  return p < 60 ? `há ${p} dias` : `há ${Math.round(p / 30.4)} meses`;
}

/** Converte 'dd/mm/aaaa' digitado para 'AAAA-MM-DD'. */
export function lerDataBr(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return dataValida(iso) ? iso : null;
}

/**
 * A hora de um instante: '14:05'. No fuso do aparelho ou, com `fuso`, num fuso fixo (o que é montado
 * no servidor precisa dele, senão a hora do servidor e a do navegador não batem).
 */
export function formatarHora(instante: string, fuso?: string): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  if (fuso) return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** O dia ('AAAA-MM-DD') de um instante, no fuso do aparelho ou no fuso dado. */
function diaDoInstante(d: Date, fuso?: string): string {
  return fuso ? new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : hojeISO(d);
}

/** Dia e hora de um instante: 'hoje às 14:05', 'amanhã às 9:30', '16/10 às 14:05'. */
export function formatarDiaHora(instante: string, agora: Date = new Date(), fuso?: string): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  const dia = diaDoInstante(d, fuso);
  const dias = diasEntre(diaDoInstante(agora, fuso), dia);
  const nome = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias === -1 ? 'ontem' : formatarDataCurta(dia);
  return `${nome} às ${formatarHora(instante, fuso)}`;
}
