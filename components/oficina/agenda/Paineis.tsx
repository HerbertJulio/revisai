'use client';

// Onde a agenda aparece nas outras telas: o início (os carros de hoje, quem lembrar amanhã e os
// pedidos pelo link), o detalhe da ordem de serviço (de qual horário ela veio) e a página do carro
// (o próximo horário e o botão de marcar).

import { BellRing, CalendarClock, CalendarPlus, ChevronRight, Globe } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Placa } from '@/components/pecas';
import { classeBotao } from '@/components/ui';
import { emAberto, quandoPorExtenso, quemE } from '@/lib/agendamento';
import { somarDias } from '@/lib/datas';
import { useHoje } from '@/lib/ganchos';
import { horaCurta } from '@/lib/horarios';
import type { Agendamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Documento, Id } from '@/lib/tipos';
import { ChipSituacao } from './CartaoAgendamento';
import { mudarSituacao, useAgendamentos, useLigarOrdens, useMensagensDoHorario } from './comum';
import { usePedidosOnline } from './pedidos';

/** No início, abaixo do resumo do dia. Some quando não há nada para hoje nem pedido esperando. */
export function PainelAgendaDoInicio() {
  const hoje = useHoje();
  const todos = useAgendamentos();
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const { novos } = usePedidosOnline();
  useLigarOrdens();
  const amanha = somarDias(hoje, 1);
  const deHoje = useMemo(() => todos.filter((a) => a.data === hoje && a.situacao !== 'cancelado'), [todos, hoje]);
  const lembrar = useMemo(() => todos.filter((a) => a.data === amanha && (a.situacao === 'marcado' || a.situacao === 'confirmado') && !a.lembradoEm), [todos, amanha]);
  if (!deHoje.length && !lembrar.length && !novos.length) return null;
  const abertos = deHoje.filter((a) => emAberto(a.situacao)).length;

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label="Agenda de hoje">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[19px]">
          <CalendarClock size={20} aria-hidden="true" /> Agenda de hoje
        </h2>
        <Link href="/oficina/agenda" className="inline-flex items-center gap-1 text-[14px] font-semibold text-caneta hover:underline">
          Ver a agenda <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {deHoje.length ? (
        <>
          <p className="text-[14px] text-tinta-2">{abertos ? `${abertos} ${abertos === 1 ? 'carro ainda vem ou está na oficina' : 'carros ainda vêm ou estão na oficina'}.` : 'Todos os horários de hoje já foram atendidos.'}</p>
          <ul className="flex flex-col divide-y divide-linha">
            {deHoje.map((a) => {
              const q = quemE(a, clientes, veiculos);
              return (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <span className="num w-12 shrink-0 font-bold">{a.hora}</span>
                  {q.placa ? <Placa placa={q.placa} /> : null}
                  <span className="min-w-0 flex-1 truncate text-[14.5px]">
                    {q.nome}
                    <span className="text-tinta-3"> · {a.servico}</span>
                  </span>
                  <ChipSituacao situacao={a.situacao} />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {lembrar.length ? (
        <div className="flex flex-col gap-2 rounded-xl bg-papel-2 px-3 py-2.5">
          <p className="flex items-center gap-2 text-[14.5px] font-semibold">
            <BellRing size={16} aria-hidden="true" /> Lembrar {lembrar.length === 1 ? 'o cliente de amanhã' : `os ${lembrar.length} clientes de amanhã`}
          </p>
          <ul className="flex flex-col gap-1.5">
            {lembrar.map((a) => (
              <LembreteDeAmanha key={a.id} a={a} hoje={hoje} />
            ))}
          </ul>
        </div>
      ) : null}
      {novos.length ? (
        <Link href="/oficina/agenda?aba=pedidos" className="flex items-center gap-3 rounded-xl bg-oleo-claro px-3 py-2.5 text-oleo-tinta hover:brightness-[0.98]">
          <Globe size={18} aria-hidden="true" />
          <span className="flex-1 font-semibold">
            {novos.length === 1 ? '1 pedido de horário pelo link esperando resposta' : `${novos.length} pedidos de horário pelo link esperando resposta`}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  );
}

function LembreteDeAmanha({ a, hoje }: { a: Agendamento; hoje: string }) {
  const { quem, lembrete } = useMensagensDoHorario(a, hoje);
  return (
    <li className="flex flex-wrap items-center gap-2 text-[14px]">
      <span className="num font-semibold">{horaCurta(a.hora)}</span>
      <span className="min-w-0 flex-1 truncate">
        {quem.nome} · {a.servico}
      </span>
      {lembrete ? (
        <a
          href={lembrete}
          target="_blank"
          rel="noopener noreferrer"
          className={classeBotao('whatsapp', 'pequeno')}
          onClick={() => mudarSituacao(a, a.situacao, { lembradoEm: new Date().toISOString() })}
        >
          <BellRing size={14} aria-hidden="true" /> Lembrar
        </a>
      ) : (
        <span className="text-[13px] text-tinta-3">sem WhatsApp</span>
      )}
    </li>
  );
}

/** No detalhe da ordem de serviço: o horário da agenda de onde ela veio. */
export function PainelAgendaDaOrdem({ doc }: { doc: Documento }) {
  useLigarOrdens();
  const agendamentos = useOficina((s) => s.agendamentos);
  const a = useMemo(() => (doc.tipo === 'ordem' ? (Object.values(agendamentos).find((x) => x.documentoId === doc.id) ?? (doc.agendamentoId ? agendamentos[doc.agendamentoId] : undefined)) : undefined), [agendamentos, doc]);
  const profissional = useOficina((s) => (a?.profissionalId ? s.profissionais[a.profissionalId] : undefined));
  if (!a) return null;
  return (
    <Link href={`/oficina/agenda?dia=${a.data}`} className="flex items-center gap-3 rounded-xl bg-papel-2 px-3.5 py-2.5 text-[14px] hover:brightness-[0.98]">
      <CalendarClock size={18} className="shrink-0 text-tinta-2" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold first-letter:uppercase">Veio da agenda: {quandoPorExtenso(a.data, a.hora)}</span>
        <span className="block text-tinta-3">
          {a.servico}
          {profissional ? ` · ${profissional.nome}` : ''}
          {a.origem === 'online' ? ' · pedido pelo link' : ''}
        </span>
      </span>
      <ChipSituacao situacao={a.situacao} />
    </Link>
  );
}

/** Na página do carro: os próximos horários dele e o botão para marcar. */
export function PainelAgendaDoCarro({ veiculoId }: { veiculoId: Id }) {
  const hoje = useHoje();
  const todos = useAgendamentos();
  const placa = useOficina((s) => s.veiculos[veiculoId]?.placa);
  const proximos = useMemo(() => todos.filter((a) => a.data >= hoje && emAberto(a.situacao) && (a.veiculoId === veiculoId || (!a.veiculoId && !!placa && a.placa === placa))), [todos, hoje, veiculoId, placa]);
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha" aria-label="Agenda do carro">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <CalendarClock size={18} aria-hidden="true" /> {proximos.length ? 'Horário marcado' : 'Agenda'}
        </p>
        <Link href={`/oficina/agenda?novo=1&carro=${encodeURIComponent(veiculoId)}`} className={classeBotao('secundario', 'pequeno')}>
          <CalendarPlus size={15} aria-hidden="true" /> Marcar horário
        </Link>
      </div>
      {proximos.length ? (
        <ul className="flex flex-col gap-1.5">
          {proximos.map((a) => (
            <li key={a.id}>
              <Link href={`/oficina/agenda?dia=${a.data}`} className="flex flex-wrap items-center gap-2 text-[14.5px] hover:underline">
                <span className="font-semibold first-letter:uppercase">{quandoPorExtenso(a.data, a.hora, hoje)}</span>
                <span className="text-tinta-2">· {a.servico}</span>
                <ChipSituacao situacao={a.situacao} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-tinta-3">Nenhum horário marcado para este carro.</p>
      )}
    </section>
  );
}
