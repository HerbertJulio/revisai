// Os horários da agenda: a grade da semana, as vagas de cada horário, os conflitos e as folgas.
// Funções puras (sem navegador nem banco). A tela da agenda usa estas regras, e o banco repete a
// mesma conta para o link público de agendamento (agenda_horarios e agenda_pedir).

import { diasEntre, paraDia, somarDias } from './datas';
import type { Preferencias } from './tipos';

export interface Periodo {
  /** 'HH:MM'. */
  inicio: string;
  /** 'HH:MM', depois do início. */
  fim: string;
}

export type AgendaPreferencias = NonNullable<Preferencias['agenda']>;

/** Como a agenda fica sem ajuste: segunda a sábado, das 8h às 18h, horários de 30 minutos, um carro por vez. */
export const AGENDA_PADRAO: AgendaPreferencias = {
  diasSemana: [1, 2, 3, 4, 5, 6],
  inicio: '08:00',
  fim: '18:00',
  intervaloMin: 30,
  vagasPorHorario: 1,
  agendamentoOnline: false
};

/** A grade pronta para as contas: os períodos de cada dia da semana já sem a pausa. */
export interface ConfigHorarios {
  /** Períodos de trabalho de cada dia da semana (0 = domingo ... 6 = sábado). Sem período: fechado. */
  semana: Periodo[][];
  /** Tamanho de cada horário, em minutos. */
  intervaloMin: number;
  /** Quantos carros cabem ao mesmo tempo. */
  vagas: number;
  /** Dias fechados fora da semana normal (feriado, férias), AAAA-MM-DD. */
  folgas: string[];
}

export const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function horaValida(h: string | null | undefined): h is string {
  return typeof h === 'string' && HORA.test(h);
}

/** '08:30' vira 510 (minutos desde a meia-noite); hora inválida vira NaN. */
export function minutos(h: string): number {
  const m = HORA.exec(h ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/** 510 vira '08:30'. Passou de 24h, fica em 23:59. */
export function hora(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** '8h', '8h30', '13h'. */
export function horaCurta(h: string): string {
  const m = minutos(h);
  if (Number.isNaN(m)) return h;
  const resto = m % 60;
  return `${Math.floor(m / 60)}h${resto ? String(resto).padStart(2, '0') : ''}`;
}

/** '30 min', '1 h', '1 h 30'. */
export function duracaoTexto(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto}` : `${h} h`;
}

/** Dia da semana de uma data: 0 = domingo ... 6 = sábado (1970-01-01 foi uma quinta). */
export function diaDaSemana(data: string): number {
  return (((paraDia(data) + 4) % 7) + 7) % 7;
}

/** A segunda-feira da semana da data (a agenda mostra a semana de segunda a domingo). */
export function inicioDaSemana(data: string): string {
  return somarDias(data, -((diaDaSemana(data) + 6) % 7));
}

/** As 7 datas da semana que começa na segunda da data. */
export function diasDaSemana(data: string): string[] {
  const inicio = inicioDaSemana(data);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

function periodoValido(p: Partial<Periodo> | null | undefined): p is Periodo {
  return !!p && horaValida(p.inicio) && horaValida(p.fim) && minutos(p.inicio) < minutos(p.fim);
}

/** O período sem a pausa (o almoço corta o dia em dois). */
export function tirarPausa(p: Periodo, pausa: Partial<Periodo> | null | undefined): Periodo[] {
  if (!periodoValido(pausa)) return [p];
  const a = minutos(p.inicio);
  const b = minutos(p.fim);
  const pa = minutos(pausa.inicio);
  const pb = minutos(pausa.fim);
  if (pb <= a || pa >= b) return [p];
  const r: Periodo[] = [];
  if (pa > a) r.push({ inicio: p.inicio, fim: hora(pa) });
  if (pb < b) r.push({ inicio: hora(pb), fim: p.fim });
  return r;
}

function inteiroEntre(v: unknown, min: number, max: number, padrao: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : padrao;
  return Math.max(min, Math.min(max, n));
}

/** A grade da semana a partir das preferências da oficina (o que faltar segue o padrão). */
export function configDaAgenda(a?: Partial<AgendaPreferencias> | null): ConfigHorarios {
  const base: AgendaPreferencias = { ...AGENDA_PADRAO, ...(a ?? {}) };
  const porDia = Array.isArray(base.semana) && base.semana.length === 7 ? base.semana : null;
  const semana = Array.from({ length: 7 }, (_, d): Periodo[] => {
    let p: Periodo | null;
    if (porDia) p = periodoValido(porDia[d]) ? { inicio: porDia[d]!.inicio, fim: porDia[d]!.fim } : null;
    else p = base.diasSemana.includes(d) && periodoValido(base) ? { inicio: base.inicio, fim: base.fim } : null;
    return p ? tirarPausa(p, base.pausa) : [];
  });
  return {
    semana,
    intervaloMin: inteiroEntre(base.intervaloMin, 10, 240, 30),
    vagas: inteiroEntre(base.vagasPorHorario, 1, 20, 1),
    folgas: (base.folgas ?? []).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
  };
}

/** O horário de cada dia da semana como as preferências guardam (com o dia fechado como null). */
export function semanaDasPreferencias(a?: Partial<AgendaPreferencias> | null): (Periodo | null)[] {
  const base: AgendaPreferencias = { ...AGENDA_PADRAO, ...(a ?? {}) };
  if (Array.isArray(base.semana) && base.semana.length === 7) return base.semana.map((p) => (periodoValido(p) ? { inicio: p.inicio, fim: p.fim } : null));
  return Array.from({ length: 7 }, (_, d) => (base.diasSemana.includes(d) ? { inicio: base.inicio, fim: base.fim } : null));
}

/**
 * As preferências da agenda a partir do horário de cada dia. Os campos antigos (dias, início e
 * fim) continuam preenchidos com o resumo, para quem ainda lê só eles.
 */
export function agendaDaSemana(atual: Partial<AgendaPreferencias> | null | undefined, semana: (Periodo | null)[], mudar: Partial<AgendaPreferencias> = {}): AgendaPreferencias {
  const base: AgendaPreferencias = { ...AGENDA_PADRAO, ...(atual ?? {}), ...mudar };
  const dias = semana.map((p, d) => (periodoValido(p) ? d : -1)).filter((d) => d >= 0);
  const abertos = semana.filter(periodoValido);
  const inicio = abertos.length ? hora(Math.min(...abertos.map((p) => minutos(p.inicio)))) : base.inicio;
  const fim = abertos.length ? hora(Math.max(...abertos.map((p) => minutos(p.fim)))) : base.fim;
  return { ...base, semana: semana.map((p) => (periodoValido(p) ? { inicio: p.inicio, fim: p.fim } : null)), diasSemana: dias, inicio, fim };
}

export function ehFolga(config: Pick<ConfigHorarios, 'folgas'>, data: string): boolean {
  return config.folgas.includes(data);
}

/** Os períodos de trabalho da data (vazio quando fecha: dia da semana fechado ou folga). */
export function periodosDoDia(config: ConfigHorarios, data: string): Periodo[] {
  if (ehFolga(config, data)) return [];
  return config.semana[diaDaSemana(data)] ?? [];
}

export function abreNoDia(config: ConfigHorarios, data: string): boolean {
  return periodosDoDia(config, data).length > 0;
}

/** Os horários que começam no dia: cada um cabe inteiro num período ('08:00', '08:30'...). */
export function horariosDoDia(config: ConfigHorarios, data: string): string[] {
  const r: string[] = [];
  const passo = Math.max(5, config.intervaloMin);
  for (const p of periodosDoDia(config, data)) {
    for (let m = minutos(p.inicio); m + passo <= minutos(p.fim); m += passo) r.push(hora(m));
  }
  return r;
}

// ---------------------------------------------------------------- ocupação

/** O que ocupa a agenda: um agendamento ou um pedido pelo link. */
export interface Ocupacao {
  id?: string;
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM. */
  hora: string;
  duracaoMin: number;
  profissionalId?: string | null;
  situacao?: string;
}

/** Cancelado e falta liberam o horário; o resto (até o concluído) ocupa. */
export function ocupaHorario(situacao: string | undefined): boolean {
  return situacao !== 'cancelado' && situacao !== 'faltou';
}

function intervalo(o: Pick<Ocupacao, 'hora' | 'duracaoMin'>, padrao: number): [number, number] {
  const a = minutos(o.hora);
  const d = o.duracaoMin > 0 ? o.duracaoMin : padrao;
  return [a, a + d];
}

function cruza(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Quantos agendamentos do dia tocam o horário [hora, hora + intervalo). */
export function ocupacaoDoHorario(lista: Ocupacao[], data: string, h: string, intervaloMin: number): number {
  const alvo: [number, number] = [minutos(h), minutos(h) + intervaloMin];
  let n = 0;
  for (const o of lista) if (o.data === data && ocupaHorario(o.situacao) && horaValida(o.hora) && cruza(intervalo(o, intervaloMin), alvo)) n++;
  return n;
}

export interface VagaDoHorario {
  hora: string;
  ocupados: number;
  livres: number;
}

/** Cada horário do dia com quantos carros já tem e quantas vagas sobram. */
export function vagasDoDia(config: ConfigHorarios, data: string, lista: Ocupacao[]): VagaDoHorario[] {
  return horariosDoDia(config, data).map((h) => {
    const ocupados = ocupacaoDoHorario(lista, data, h, config.intervaloMin);
    return { hora: h, ocupados, livres: Math.max(0, config.vagas - ocupados) };
  });
}

/** O instante de referência ("agora") como dia e minutos do relógio da oficina. */
export interface Agora {
  data: string;
  minutos: number;
}

export function agoraDe(d: Date = new Date()): Agora {
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { data, minutos: d.getHours() * 60 + d.getMinutes() };
}

function absoluto(data: string, min: number): number {
  return paraDia(data) * 1440 + min;
}

/**
 * Os horários livres do dia: com vaga e, quando há `agora`, depois da antecedência mínima
 * (o horário de hoje que já passou, ou que está perto demais, não aparece).
 */
export function horariosLivres(config: ConfigHorarios, data: string, lista: Ocupacao[], opcoes: { agora?: Agora; antecedenciaMin?: number } = {}): string[] {
  const limite = opcoes.agora ? absoluto(opcoes.agora.data, opcoes.agora.minutos) + Math.max(0, opcoes.antecedenciaMin ?? 0) : -Infinity;
  return vagasDoDia(config, data, lista)
    .filter((v) => v.livres > 0 && absoluto(data, minutos(v.hora)) >= limite)
    .map((v) => v.hora);
}

/** O primeiro horário livre a partir de agora, em até `dias` dias (para sugerir ao marcar ou remarcar). */
export function proximoLivre(config: ConfigHorarios, lista: Ocupacao[], agora: Agora, opcoes: { dias?: number; antecedenciaMin?: number } = {}): { data: string; hora: string } | null {
  const dias = opcoes.dias ?? 30;
  for (let i = 0; i <= dias; i++) {
    const data = somarDias(agora.data, i);
    const livres = horariosLivres(config, data, lista, { agora, antecedenciaMin: opcoes.antecedenciaMin ?? 0 });
    if (livres.length) return { data, hora: livres[0] };
  }
  return null;
}

// ---------------------------------------------------------------- conflitos

export type Conflito =
  | { tipo: 'invalido'; texto: string }
  | { tipo: 'folga'; texto: string }
  | { tipo: 'fechado'; texto: string }
  | { tipo: 'fora'; texto: string }
  | { tipo: 'lotado'; texto: string; ocupados: number; vagas: number }
  | { tipo: 'profissional'; texto: string; ids: string[] };

/** Quantos carros ao mesmo tempo, no máximo, entre os agendamentos dentro do intervalo. */
function maximoAoMesmoTempo(intervalos: [number, number][], janela: [number, number]): number {
  const pontos: [number, number][] = [];
  for (const [a, b] of intervalos) {
    const ini = Math.max(a, janela[0]);
    const fim = Math.min(b, janela[1]);
    if (ini < fim) pontos.push([ini, 1], [fim, -1]);
  }
  // no mesmo minuto, quem sai sai antes de quem entra
  pontos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let atual = 0;
  let maximo = 0;
  for (const [, d] of pontos) {
    atual += d;
    maximo = Math.max(maximo, atual);
  }
  return maximo;
}

/**
 * Os problemas de um horário novo ou mudado: dia fechado ou de folga, fora do horário de trabalho,
 * sem vaga (conta o máximo de carros ao mesmo tempo) e o mesmo profissional com dois carros.
 * São avisos: a oficina pode marcar assim mesmo (um encaixe, por exemplo).
 */
export function conflitos(config: ConfigHorarios, novo: Ocupacao, lista: Ocupacao[], opcoes: { nomeProfissional?: (id: string) => string } = {}): Conflito[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novo.data) || !horaValida(novo.hora)) return [{ tipo: 'invalido', texto: 'Escolha o dia e a hora.' }];
  const r: Conflito[] = [];
  const janela = intervalo(novo, config.intervaloMin);
  if (ehFolga(config, novo.data)) r.push({ tipo: 'folga', texto: 'Este dia está marcado como folga da oficina.' });
  else if (!abreNoDia(config, novo.data)) r.push({ tipo: 'fechado', texto: `A oficina não abre ${NOMES_DIAS[diaDaSemana(novo.data)].toLowerCase()}.` });
  else {
    const dentro = periodosDoDia(config, novo.data).some((p) => janela[0] >= minutos(p.inicio) && janela[1] <= minutos(p.fim));
    if (!dentro) r.push({ tipo: 'fora', texto: 'Fica fora do horário de trabalho.' });
  }
  const outros = lista.filter((o) => o.id !== novo.id && o.data === novo.data && ocupaHorario(o.situacao) && horaValida(o.hora));
  const maximo = maximoAoMesmoTempo(
    outros.map((o) => intervalo(o, config.intervaloMin)),
    janela
  );
  if (maximo + 1 > config.vagas) {
    r.push({
      tipo: 'lotado',
      ocupados: maximo,
      vagas: config.vagas,
      texto: config.vagas === 1 ? 'Já tem um carro neste horário.' : `Já tem ${maximo} carros neste horário, e cabem ${config.vagas}.`
    });
  }
  if (novo.profissionalId) {
    const ids = outros.filter((o) => o.profissionalId === novo.profissionalId && cruza(intervalo(o, config.intervaloMin), janela)).map((o) => o.id ?? '');
    if (ids.length) {
      const nome = opcoes.nomeProfissional?.(novo.profissionalId) ?? 'O profissional';
      r.push({ tipo: 'profissional', ids, texto: `${nome} já tem outro carro neste horário.` });
    }
  }
  return r;
}

/** Ainda tem vaga em algum horário do dia (para mostrar "dia cheio"). */
export function diaCheio(config: ConfigHorarios, data: string, lista: Ocupacao[]): boolean {
  const vagas = vagasDoDia(config, data, lista);
  return vagas.length > 0 && vagas.every((v) => v.livres === 0);
}

/** As datas de `de` até `ate` (inclusive). */
export function datasEntre(de: string, ate: string): string[] {
  const n = diasEntre(de, ate);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => somarDias(de, i));
}

/** A grade como o link público recebe (sem pausa nem campos da tela): o que o banco usa para os horários livres. */
export function gradeParaPublicar(config: ConfigHorarios): { semana: Periodo[][]; intervaloMin: number; vagas: number; folgas: string[] } {
  return {
    semana: config.semana.map((dia) => dia.map((p) => ({ inicio: p.inicio, fim: p.fim }))),
    intervaloMin: config.intervaloMin,
    vagas: config.vagas,
    folgas: [...config.folgas].sort()
  };
}
