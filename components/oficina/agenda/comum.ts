'use client';

// O que as partes da agenda usam juntas: a grade de horários, as listas da agenda, quem pode mudar
// a configuração, os links de WhatsApp de cada horário e a ligação com a ordem de serviço.

import { useEffect, useMemo } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { emAberto, mensagemConfirmacao, mensagemLembrete, ordemDoAgendamento, ordenarAgendamentos, quemE } from '@/lib/agendamento';
import { configDaAgenda, type ConfigHorarios } from '@/lib/horarios';
import type { Agendamento, Profissional, SituacaoAgendamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkDeAgendamento, linkWhatsApp } from '@/lib/whatsapp';

/** Dono e gerente (ou quem usa sem conta, que é o dono): mudam a configuração e veem a comissão. */
export function useGestao(): boolean {
  const { oficina } = useConta();
  return !oficina || oficina.papel !== 'mecanico';
}

export function useConfigAgenda(): ConfigHorarios {
  const agenda = useOficina((s) => s.preferencias.agenda);
  return useMemo(() => configDaAgenda(agenda), [agenda]);
}

export function useAgendamentos(): Agendamento[] {
  const mapa = useOficina((s) => s.agendamentos);
  return useMemo(() => ordenarAgendamentos(Object.values(mapa)), [mapa]);
}

/** Os profissionais em ordem de nome (os inativos no fim). */
export function useProfissionais(): Profissional[] {
  const mapa = useOficina((s) => s.profissionais);
  return useMemo(() => Object.values(mapa).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR')), [mapa]);
}

/** O link público de agendamento desta oficina (quando ligado), para pôr nas mensagens. */
export function useLinkDeAgendamento(): string | null {
  const agenda = useOficina((s) => s.preferencias.agenda);
  const origem = typeof window === 'undefined' ? '' : window.location.origin;
  return agenda?.agendamentoOnline && origem ? linkDeAgendamento(origem, agenda.slug) : null;
}

/** Muda a situação do horário (sem conferir o passo: a tela só oferece os permitidos). */
export function mudarSituacao(a: Agendamento, situacao: SituacaoAgendamento, extra: Partial<Agendamento> = {}): void {
  useOficina.getState().salvarRegistro('agendamentos', { ...semDatas(a), ...extra, situacao });
}

/** O item sem as datas de gravação (o salvarRegistro marca de novo). */
export function semDatas(a: Agendamento): Omit<Agendamento, 'criadoEm' | 'atualizadoEm'> {
  const { criadoEm: _c, atualizadoEm: _a, ...resto } = a;
  return resto;
}

/** Os links de WhatsApp de um horário: a confirmação e o lembrete da véspera, com o endereço da oficina. */
export function useMensagensDoHorario(a: Agendamento, hoje: string) {
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const oficina = useOficina((s) => s.oficina);
  return useMemo(() => {
    const q = quemE(a, clientes, veiculos);
    const ctx = { cliente: q.nome, oficina, data: a.data, hora: a.hora, servico: a.servico, carro: q.carro || '', hoje };
    return {
      quem: q,
      confirmacao: linkWhatsApp(q.telefone, mensagemConfirmacao(ctx)),
      lembrete: linkWhatsApp(q.telefone, mensagemLembrete(ctx))
    };
  }, [a, clientes, veiculos, oficina, hoje]);
}

/**
 * Liga o agendamento à ordem de serviço aberta quando o carro chegou (o passo a passo não sabe da
 * agenda) e conclui o horário quando essa ordem foi concluída (também em outro aparelho).
 */
export function useLigarOrdens(): void {
  const agendamentos = useOficina((s) => s.agendamentos);
  const documentos = useOficina((s) => s.documentos);
  const veiculos = useOficina((s) => s.veiculos);
  useEffect(() => {
    const s = useOficina.getState();
    const lista = Object.values(s.agendamentos);
    const docs = Object.values(s.documentos);
    const ligadas = new Set(lista.map((a) => a.documentoId).filter((x): x is Id => !!x));
    for (const a of lista) {
      if (a.documentoId) {
        const d = s.documentos[a.documentoId];
        if (d?.situacao === 'concluida' && emAberto(a.situacao)) mudarSituacao(a, 'concluido');
        continue;
      }
      if (a.situacao !== 'chegou' && a.situacao !== 'concluido') continue;
      const d = ordemDoAgendamento(a, docs, s.veiculos, ligadas);
      if (!d) continue;
      ligadas.add(d.id);
      const veiculo = d.veiculoId ? s.veiculos[d.veiculoId] : undefined;
      mudarSituacao(a, d.situacao === 'concluida' && a.situacao === 'chegou' ? 'concluido' : a.situacao, {
        documentoId: d.id,
        veiculoId: a.veiculoId ?? veiculo?.id ?? null,
        clienteId: a.clienteId ?? veiculo?.clienteId ?? null
      });
    }
  }, [agendamentos, documentos, veiculos]);
}

/** Depois que a ordem foi concluída: o horário ligado a ela (ou o do mesmo carro que chegou) fica concluído. */
export function concluirHorarioDaOrdem(documentoId: Id): void {
  const s = useOficina.getState();
  const doc = s.documentos[documentoId];
  if (!doc) return;
  const lista = Object.values(s.agendamentos);
  const ligadas = new Set(lista.map((a) => a.documentoId).filter((x): x is Id => !!x && x !== documentoId));
  const a =
    lista.find((x) => x.documentoId === documentoId) ??
    (doc.agendamentoId ? s.agendamentos[doc.agendamentoId] : undefined) ??
    ordenarAgendamentos(lista.filter((x) => !x.documentoId && emAberto(x.situacao))).find((x) => ordemDoAgendamento(x, [doc], s.veiculos, ligadas)?.id === doc.id);
  if (!a || !emAberto(a.situacao)) return;
  mudarSituacao(a, 'concluido', { documentoId });
}
