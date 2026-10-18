'use client';

import { CalendarDays } from 'lucide-react';
import { concluirHorarioDaOrdem } from '../agenda/comum';
import { PainelAgendaDaOrdem, PainelAgendaDoCarro, PainelAgendaDoInicio } from '../agenda/Paineis';
import type { Extensao } from './tipos';

// A agenda da oficina: horários com os profissionais, os pedidos pelo link de agendamento e o kit
// da revisão dos carros marcados.
export const extensao: Extensao = {
  telas: [{ href: '/oficina/agenda', rotulo: 'Agenda', descricao: 'Horários dos carros, pedidos pelo link e profissionais.', Icone: CalendarDays }],
  paineisDoInicio: [PainelAgendaDoInicio],
  paineisDaOrdem: [PainelAgendaDaOrdem],
  paineisDoCarro: [PainelAgendaDoCarro],
  aoConcluir: concluirHorarioDaOrdem
};
