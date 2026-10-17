import { describe, expect, it } from 'vitest';
import {
  AGENDA_PADRAO,
  agendaDaSemana,
  conflitos,
  configDaAgenda,
  datasEntre,
  diaCheio,
  diaDaSemana,
  diasDaSemana,
  duracaoTexto,
  gradeParaPublicar,
  hora,
  horaCurta,
  horariosDoDia,
  horariosLivres,
  inicioDaSemana,
  minutos,
  ocupacaoDoHorario,
  periodosDoDia,
  proximoLivre,
  semanaDasPreferencias,
  tirarPausa,
  vagasDoDia,
  type Ocupacao
} from '@/lib/horarios';

// 2026-10-19 é segunda-feira; 2026-10-24 é sábado; 2026-10-25 é domingo.
const SEG = '2026-10-19';
const SAB = '2026-10-24';
const DOM = '2026-10-25';

function ag(data: string, h: string, extra: Partial<Ocupacao> = {}): Ocupacao {
  return { id: `${data}-${h}-${Math.random()}`, data, hora: h, duracaoMin: 30, situacao: 'marcado', ...extra };
}

describe('horas e dias', () => {
  it('converte horas e minutos', () => {
    expect(minutos('08:30')).toBe(510);
    expect(Number.isNaN(minutos('8:30'))).toBe(true);
    expect(Number.isNaN(minutos('24:00'))).toBe(true);
    expect(hora(510)).toBe('08:30');
    expect(hora(24 * 60 + 10)).toBe('23:59');
    expect(horaCurta('08:00')).toBe('8h');
    expect(horaCurta('13:30')).toBe('13h30');
    expect(duracaoTexto(30)).toBe('30 min');
    expect(duracaoTexto(60)).toBe('1 h');
    expect(duracaoTexto(90)).toBe('1 h 30');
  });

  it('sabe o dia da semana e a semana de segunda a domingo', () => {
    expect(diaDaSemana(SEG)).toBe(1);
    expect(diaDaSemana(SAB)).toBe(6);
    expect(diaDaSemana(DOM)).toBe(0);
    expect(inicioDaSemana(DOM)).toBe(SEG);
    expect(inicioDaSemana(SEG)).toBe(SEG);
    expect(diasDaSemana('2026-10-22')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(datasEntre('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(datasEntre('2026-11-02', '2026-10-30')).toEqual([]);
  });
});

describe('grade da semana', () => {
  it('sem ajuste: segunda a sábado, 8h às 18h, 30 minutos, um carro', () => {
    const c = configDaAgenda(undefined);
    expect(c.intervaloMin).toBe(30);
    expect(c.vagas).toBe(1);
    expect(periodosDoDia(c, DOM)).toEqual([]);
    expect(horariosDoDia(c, SEG)).toHaveLength(20);
    expect(horariosDoDia(c, SEG)[0]).toBe('08:00');
    expect(horariosDoDia(c, SEG).at(-1)).toBe('17:30');
    expect(horariosDoDia(c, SAB)).toHaveLength(20);
  });

  it('cada dia com o seu horário, a pausa do almoço e as folgas', () => {
    const semana = semanaDasPreferencias(AGENDA_PADRAO);
    semana[6] = { inicio: '08:00', fim: '12:00' };
    const prefs = agendaDaSemana(AGENDA_PADRAO, semana, { pausa: { inicio: '12:00', fim: '13:00' }, folgas: ['2026-11-02'], intervaloMin: 60 });
    expect(prefs.diasSemana).toEqual([1, 2, 3, 4, 5, 6]);
    expect(prefs.inicio).toBe('08:00');
    expect(prefs.fim).toBe('18:00');
    const c = configDaAgenda(prefs);
    expect(periodosDoDia(c, SEG)).toEqual([
      { inicio: '08:00', fim: '12:00' },
      { inicio: '13:00', fim: '18:00' }
    ]);
    expect(horariosDoDia(c, SEG)).toEqual(['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
    expect(horariosDoDia(c, SAB)).toEqual(['08:00', '09:00', '10:00', '11:00']);
    // segunda, 2 de novembro (Finados): folga
    expect(horariosDoDia(c, '2026-11-02')).toEqual([]);
    expect(gradeParaPublicar(c).semana[6]).toEqual([{ inicio: '08:00', fim: '12:00' }]);
  });

  it('a pausa fora do período não muda nada; o horário que não cabe inteiro fica de fora', () => {
    expect(tirarPausa({ inicio: '08:00', fim: '12:00' }, { inicio: '13:00', fim: '14:00' })).toEqual([{ inicio: '08:00', fim: '12:00' }]);
    expect(tirarPausa({ inicio: '08:00', fim: '12:00' }, { inicio: '07:00', fim: '09:00' })).toEqual([{ inicio: '09:00', fim: '12:00' }]);
    const c = configDaAgenda({ ...AGENDA_PADRAO, inicio: '08:00', fim: '10:00', intervaloMin: 45 });
    expect(horariosDoDia(c, SEG)).toEqual(['08:00', '08:45']);
  });

  it('valores fora da faixa voltam para o limite', () => {
    const c = configDaAgenda({ ...AGENDA_PADRAO, intervaloMin: 1, vagasPorHorario: 0 });
    expect(c.intervaloMin).toBe(10);
    expect(c.vagas).toBe(1);
    expect(configDaAgenda({ ...AGENDA_PADRAO, inicio: '18:00', fim: '08:00' }).semana.every((d) => d.length === 0)).toBe(true);
  });
});

describe('vagas', () => {
  const c = configDaAgenda({ ...AGENDA_PADRAO, vagasPorHorario: 2 });

  it('conta os carros de cada horário; cancelado e falta liberam', () => {
    const lista = [ag(SEG, '08:00'), ag(SEG, '08:00', { situacao: 'cancelado' }), ag(SEG, '08:00', { situacao: 'faltou' }), ag(SEG, '08:00', { duracaoMin: 60 })];
    expect(ocupacaoDoHorario(lista, SEG, '08:00', 30)).toBe(2);
    expect(ocupacaoDoHorario(lista, SEG, '08:30', 30)).toBe(1);
    const vagas = vagasDoDia(c, SEG, lista);
    expect(vagas[0]).toEqual({ hora: '08:00', ocupados: 2, livres: 0 });
    expect(vagas[1]).toEqual({ hora: '08:30', ocupados: 1, livres: 1 });
    expect(horariosLivres(c, SEG, lista)[0]).toBe('08:30');
  });

  it('respeita a antecedência mínima e o que já passou', () => {
    const livres = horariosLivres(c, SEG, [], { agora: { data: SEG, minutos: minutos('10:10') }, antecedenciaMin: 60 });
    expect(livres[0]).toBe('11:30');
    expect(horariosLivres(c, SEG, [], { agora: { data: '2026-10-18', minutos: minutos('23:00') }, antecedenciaMin: 12 * 60 })[0]).toBe('11:00');
    expect(horariosLivres(c, SEG, [], { agora: { data: '2026-10-20', minutos: 0 } })).toEqual([]);
  });

  it('dia cheio e o próximo horário livre', () => {
    const um = configDaAgenda({ ...AGENDA_PADRAO, inicio: '08:00', fim: '09:00' });
    const lista = [ag(SEG, '08:00'), ag(SEG, '08:30')];
    expect(diaCheio(um, SEG, lista)).toBe(true);
    expect(diaCheio(um, SEG, [])).toBe(false);
    expect(diaCheio(um, DOM, [])).toBe(false);
    expect(proximoLivre(um, lista, { data: SEG, minutos: 0 })).toEqual({ data: '2026-10-20', hora: '08:00' });
    expect(proximoLivre(um, lista, { data: SAB, minutos: 9 * 60 })).toEqual({ data: '2026-10-26', hora: '08:00' });
  });
});

describe('conflitos', () => {
  const c = configDaAgenda({ ...AGENDA_PADRAO, folgas: ['2026-10-21'] });

  it('dia fechado, folga e fora do horário', () => {
    expect(conflitos(c, ag(DOM, '09:00'), []).map((x) => x.tipo)).toEqual(['fechado']);
    expect(conflitos(c, ag('2026-10-21', '09:00'), []).map((x) => x.tipo)).toEqual(['folga']);
    expect(conflitos(c, ag(SEG, '17:45'), []).map((x) => x.tipo)).toEqual(['fora']);
    expect(conflitos(c, ag(SEG, '07:00'), []).map((x) => x.tipo)).toEqual(['fora']);
    expect(conflitos(c, ag(SEG, '09:00'), [])).toEqual([]);
    expect(conflitos(c, { data: '', hora: '', duracaoMin: 30 }, [])[0].tipo).toBe('invalido');
  });

  it('sem vaga: conta quantos carros ficam ao mesmo tempo, sem contar o próprio agendamento', () => {
    const existente = ag(SEG, '09:00', { id: 'a', duracaoMin: 60 });
    expect(conflitos(c, ag(SEG, '09:30'), [existente]).map((x) => x.tipo)).toEqual(['lotado']);
    expect(conflitos(c, ag(SEG, '10:00'), [existente])).toEqual([]);
    expect(conflitos(c, { ...existente }, [existente])).toEqual([]);
    expect(conflitos(c, ag(SEG, '09:30'), [{ ...existente, situacao: 'cancelado' }])).toEqual([]);
    // dois carros que se seguem cabem num lugar de 2 vagas junto com um terceiro que pega os dois horários
    const dois = configDaAgenda({ ...AGENDA_PADRAO, vagasPorHorario: 2 });
    const r = conflitos(dois, ag(SEG, '08:00', { duracaoMin: 60 }), [ag(SEG, '08:00'), ag(SEG, '08:30')]);
    expect(r).toEqual([]);
    const cheio = conflitos(dois, ag(SEG, '08:00'), [ag(SEG, '08:00'), ag(SEG, '08:00')]);
    expect(cheio[0]).toMatchObject({ tipo: 'lotado', ocupados: 2, vagas: 2, texto: 'Já tem 2 carros neste horário, e cabem 2.' });
  });

  it('o mesmo profissional em dois carros ao mesmo tempo', () => {
    const dois = configDaAgenda({ ...AGENDA_PADRAO, vagasPorHorario: 3 });
    const r = conflitos(dois, ag(SEG, '09:00', { profissionalId: 'p1' }), [ag(SEG, '09:00', { id: 'x', profissionalId: 'p1' }), ag(SEG, '09:00', { profissionalId: 'p2' })], {
      nomeProfissional: () => 'João'
    });
    expect(r).toEqual([{ tipo: 'profissional', ids: ['x'], texto: 'João já tem outro carro neste horário.' }]);
  });
});
