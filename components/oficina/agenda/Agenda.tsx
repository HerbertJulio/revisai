'use client';

// A agenda da oficina: o dia (horário por horário, com as vagas) e a semana (com o kit da revisão),
// os pedidos que chegam pelo link de agendamento e os profissionais.

import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Placa } from '@/components/pecas';
import { Botao, Chip } from '@/components/ui';
import { emAberto, quemE } from '@/lib/agendamento';
import { dataValida, formatarDataCurta, somarDias } from '@/lib/datas';
import { useGrupos, useHoje } from '@/lib/ganchos';
import {
  abreNoDia,
  agoraDe,
  diaCheio,
  diasDaSemana,
  ehFolga,
  horaCurta,
  horariosDoDia,
  minutos,
  NOMES_DIAS,
  diaDaSemana,
  ocupaHorario,
  vagasDoDia
} from '@/lib/horarios';
import { servico as infoServico } from '@/lib/manutencao';
import type { Agendamento } from '@/lib/registros-oficina';
import { dataPorExtenso, diaCurto } from '@/lib/rotulos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { CartaoAgendamento, ChipSituacao } from './CartaoAgendamento';
import { useAgendamentos, useConfigAgenda, useGestao, useLigarOrdens, useProfissionais } from './comum';
import { FolhaAgendamento, type AberturaAgendamento } from './FolhaAgendamento';
import { FolhaHorarios } from './FolhaHorarios';
import { KitRevisao } from './KitRevisao';
import { ListaPedidos } from './ListaPedidos';
import { CartaoDoLink, resumoDaSemana } from './LinkOnline';
import { usePedidosOnline } from './pedidos';
import { Profissionais } from './Profissionais';

type Aba = 'agenda' | 'pedidos' | 'profissionais';
type Vista = 'dia' | 'semana';

export function Agenda() {
  const params = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();
  const hoje = useHoje();
  const gestao = useGestao();
  const agenda = useOficina((s) => s.preferencias.agenda);
  const { novos } = usePedidosOnline();
  const profissionais = useProfissionais();
  useLigarOrdens();

  const aba: Aba = params.get('aba') === 'pedidos' ? 'pedidos' : params.get('aba') === 'profissionais' ? 'profissionais' : 'agenda';
  const vista: Vista = params.get('ver') === 'semana' ? 'semana' : 'dia';
  const diaParam = params.get('dia') ?? '';
  const dia = dataValida(diaParam) ? diaParam : hoje;
  const [filtro, setFiltro] = useState<Id | null>(null);
  const [horarios, setHorarios] = useState(false);
  const [abertura, setAbertura] = useState<AberturaAgendamento | null>(() => {
    if (params.get('novo') !== '1') return null;
    return { data: params.get('dia') ?? undefined, hora: params.get('hora') ?? undefined, veiculoId: params.get('carro'), servico: params.get('servico') ?? undefined };
  });

  function ir(mudar: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudar)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    p.delete('novo');
    p.delete('carro');
    p.delete('servico');
    p.delete('hora');
    const q = p.toString();
    router.replace(q ? `${caminho}?${q}` : caminho, { scroll: false });
  }

  const passo = vista === 'semana' ? 7 : 1;
  const ativos = profissionais.filter((p) => p.ativo);
  const rotuloDia = vista === 'semana' ? `Semana de ${formatarDataCurta(diasDaSemana(dia)[0])}` : dia === hoje ? 'Hoje' : dia === somarDias(hoje, 1) ? 'Amanhã' : diaCurto(dia);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[15px] text-tinta-3 first-letter:uppercase">{dataPorExtenso(hoje)}</p>
          <h1 className="largo mt-1 text-[30px] sm:text-[34px]">Agenda</h1>
          <p className="mt-1 text-[14px] text-tinta-2">{resumoDaSemana(agenda)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gestao ? (
            <Botao onClick={() => setHorarios(true)}>
              <Settings2 size={17} aria-hidden="true" /> Horários
            </Botao>
          ) : null}
          <Botao variante="primario" onClick={() => setAbertura({ data: dia >= hoje ? dia : hoje })}>
            <Plus size={18} aria-hidden="true" /> Novo horário
          </Botao>
        </div>
      </header>

      <div role="tablist" aria-label="Partes da agenda" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {(
          [
            ['agenda', 'Agenda', 0],
            ['pedidos', 'Pedidos pelo link', novos.length],
            ['profissionais', 'Profissionais', 0]
          ] as const
        ).map(([id, rotulo, n]) => {
          const sel = aba === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={sel}
              onClick={() => ir({ aba: id === 'agenda' ? null : id })}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
            >
              {rotulo}
              {n > 0 ? (
                <span className="num grid h-6 min-w-6 place-items-center rounded-full bg-oleo px-1.5 text-[12.5px] text-[#1b1f22]" aria-label={`${n} esperando`}>
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {aba === 'agenda' ? (
        <div className="flex flex-col gap-5" role="tabpanel">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <button type="button" aria-label={vista === 'semana' ? 'Semana anterior' : 'Dia anterior'} className="grid h-10 w-10 place-items-center rounded-full hover:bg-papel-2" onClick={() => ir({ dia: somarDias(dia, -passo) })}>
                <ChevronLeft size={20} />
              </button>
              <label className="relative">
                <span className="meio-largo pointer-events-none block min-w-[9.5rem] rounded-full bg-papel px-4 py-2 text-center font-bold ring-1 ring-linha first-letter:uppercase">{rotuloDia}</span>
                <input type="date" aria-label="Escolher o dia" className="absolute inset-0 cursor-pointer opacity-0" value={dia} onChange={(e) => dataValida(e.target.value) && ir({ dia: e.target.value })} />
              </label>
              <button type="button" aria-label={vista === 'semana' ? 'Próxima semana' : 'Próximo dia'} className="grid h-10 w-10 place-items-center rounded-full hover:bg-papel-2" onClick={() => ir({ dia: somarDias(dia, passo) })}>
                <ChevronRight size={20} />
              </button>
            </div>
            {dia !== hoje ? (
              <Botao tamanho="pequeno" variante="fantasma" onClick={() => ir({ dia: null })}>
                Hoje
              </Botao>
            ) : null}
            <div className="ml-auto flex rounded-full bg-papel p-1 ring-1 ring-linha" role="group" aria-label="Ver por">
              {(['dia', 'semana'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vista === v}
                  onClick={() => ir({ ver: v === 'dia' ? null : 'semana' })}
                  className={`h-8 rounded-full px-3.5 text-[14px] font-semibold ${vista === v ? 'bg-tinta text-papel' : 'text-tinta-2 hover:text-tinta'}`}
                >
                  {v === 'dia' ? 'Dia' : 'Semana'}
                </button>
              ))}
            </div>
          </div>

          {ativos.length > 1 ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Profissional">
              <BotaoFiltro ativo={!filtro} aoClicar={() => setFiltro(null)}>
                Todos
              </BotaoFiltro>
              {ativos.map((p) => (
                <BotaoFiltro key={p.id} ativo={filtro === p.id} aoClicar={() => setFiltro(filtro === p.id ? null : p.id)}>
                  {p.nome}
                </BotaoFiltro>
              ))}
            </div>
          ) : null}

          {vista === 'dia' ? (
            <VistaDia dia={dia} hoje={hoje} filtro={filtro} aoNovo={(a) => setAbertura(a)} aoEditar={(id) => setAbertura({ editar: id })} />
          ) : (
            <>
              <VistaSemana dia={dia} hoje={hoje} filtro={filtro} aoAbrirDia={(d) => ir({ dia: d, ver: null })} />
              <KitRevisao hoje={hoje} />
            </>
          )}
        </div>
      ) : aba === 'pedidos' ? (
        <div className="flex flex-col gap-5" role="tabpanel">
          <CartaoDoLink aoMudarHorarios={() => setHorarios(true)} />
          <ListaPedidos hoje={hoje} aoVerNaAgenda={(d) => ir({ aba: null, dia: d, ver: null })} />
        </div>
      ) : (
        <div role="tabpanel">
          <Profissionais />
        </div>
      )}

      <FolhaAgendamento
        abertura={abertura}
        aoFechar={() => {
          setAbertura(null);
          // veio de um link (?novo=1): tira do endereço para não abrir de novo ao recarregar
          if (params.get('novo')) ir({});
        }}
        hoje={hoje}
      />
      <FolhaHorarios aberta={horarios} aoFechar={() => setHorarios(false)} hoje={hoje} />
    </div>
  );
}

function BotaoFiltro({ ativo, aoClicar, children }: { ativo: boolean; aoClicar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={`h-9 shrink-0 rounded-full border px-3.5 text-[14px] font-semibold ${ativo ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- o dia

interface Linha {
  hora: string;
  /** Horário da grade (com vagas) ou só os agendamentos fora dela. */
  daGrade: boolean;
  itens: Agendamento[];
  livres: number;
}

function VistaDia({ dia, hoje, filtro, aoNovo, aoEditar }: { dia: string; hoje: string; filtro: Id | null; aoNovo: (a: AberturaAgendamento) => void; aoEditar: (id: Id) => void }) {
  const config = useConfigAgenda();
  const todos = useAgendamentos();
  const { grupos } = useGrupos(60);
  const doDia = useMemo(() => todos.filter((a) => a.data === dia), [todos, dia]);
  const visiveis = filtro ? doDia.filter((a) => a.profissionalId === filtro) : doDia;

  const linhas = useMemo(() => {
    const grade = vagasDoDia(config, dia, doDia);
    const agora = dia === hoje ? agoraDe().minutos : dia < hoje ? 24 * 60 : -1;
    const r: Linha[] = grade.map((v) => ({ hora: v.hora, daGrade: true, itens: [], livres: v.livres }));
    for (const a of visiveis) {
      const m = minutos(a.hora);
      const linha = r.find((l) => l.daGrade && m >= minutos(l.hora) && m < minutos(l.hora) + config.intervaloMin);
      if (linha) linha.itens.push(a);
      else {
        const fora = r.find((l) => !l.daGrade && l.hora === a.hora);
        if (fora) fora.itens.push(a);
        else r.push({ hora: a.hora, daGrade: false, itens: [a], livres: 0 });
      }
    }
    // horário livre que já passou não aparece (só os que têm carro)
    return r.filter((l) => l.itens.length || minutos(l.hora) + config.intervaloMin > agora).sort((a, b) => minutos(a.hora) - minutos(b.hora));
  }, [config, dia, doDia, visiveis, hoje]);

  // os carros que o cliente marcou pelos avisos (sem hora) para este dia
  const dosAvisos = useMemo(() => {
    const comHorario = new Set(doDia.map((a) => a.veiculoId).filter(Boolean));
    return grupos.filter((g) => g.etapa === 'agendado' && g.ultimoContato?.data === dia && !comHorario.has(g.veiculo.id));
  }, [grupos, doDia, dia]);

  const fechado = !abreNoDia(config, dia);
  const folga = ehFolga(config, dia);
  const ocupados = doDia.filter((a) => ocupaHorario(a.situacao)).length;

  return (
    <section className="flex flex-col gap-3" aria-label={`Agenda de ${diaCurto(dia)}`}>
      <div className="flex flex-wrap items-center gap-2 text-[14px] text-tinta-2">
        <span className="first-letter:uppercase">{dataPorExtenso(dia)}</span>
        <span>·</span>
        <span>{ocupados === 0 ? 'nenhum carro marcado' : `${ocupados} ${ocupados === 1 ? 'carro' : 'carros'}`}</span>
        {folga ? <Chip tom="atraso">Folga</Chip> : fechado ? <Chip>Fechado</Chip> : diaCheio(config, dia, doDia) ? <Chip tom="oleo">Dia cheio</Chip> : null}
      </div>

      {fechado && !doDia.length ? (
        <p className="rounded-2xl bg-papel px-4 py-3 text-[14.5px] text-tinta-2 ring-1 ring-linha">
          {folga ? 'Dia de folga da oficina.' : `A oficina não abre ${NOMES_DIAS[diaDaSemana(dia)].toLowerCase()}.`} Dá para marcar um encaixe assim mesmo em Novo horário.
        </p>
      ) : null}

      <ol className="flex flex-col gap-2">
        {linhas.map((l) => (
          <li key={`${l.hora}-${l.daGrade}`} className="flex gap-3">
            <span className={`num w-12 shrink-0 pt-3 text-right text-[14px] font-semibold ${l.daGrade ? 'text-tinta-2' : 'text-oleo-tinta'}`}>{l.hora}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {l.itens.map((a) => (
                <CartaoAgendamento key={a.id} a={a} hoje={hoje} aoEditar={aoEditar} />
              ))}
              {l.daGrade && l.livres > 0 && dia >= hoje ? (
                <button
                  type="button"
                  onClick={() => aoNovo({ data: dia, hora: l.hora })}
                  className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-linha px-3 text-left text-[14px] text-tinta-3 hover:border-tinta-3 hover:text-tinta"
                  aria-label={`Marcar às ${l.hora}`}
                >
                  <Plus size={16} aria-hidden="true" /> {l.itens.length ? `Mais um carro (${l.livres} ${l.livres === 1 ? 'vaga' : 'vagas'})` : 'Livre'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!linhas.length && !fechado ? <p className="text-[14.5px] text-tinta-2">{dia < hoje ? 'Nenhum carro neste dia.' : 'Os horários de hoje já passaram.'}</p> : null}

      {dosAvisos.length ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-caneta-claro px-4 py-3 text-caneta">
          <p className="font-bold">Marcados pelos avisos, sem hora</p>
          <ul className="flex flex-col gap-2">
            {dosAvisos.map((g) => (
              <li key={g.veiculo.id} className="flex flex-wrap items-center gap-2 text-[14.5px]">
                <Placa placa={g.veiculo.placa} />
                <span className="min-w-0 flex-1 text-tinta">
                  {g.cliente?.nome ?? 'Cliente'}: {g.itens.map((i) => infoServico(i.servico).nome).join(', ')}
                </span>
                <Botao
                  tamanho="pequeno"
                  variante="escuro"
                  onClick={() =>
                    aoNovo({
                      data: dia,
                      veiculoId: g.veiculo.id,
                      servico: g.itens.map((i) => infoServico(i.servico).nome).join(', '),
                      observacao: g.ultimoContato?.observacao,
                      origem: 'aviso'
                    })
                  }
                >
                  Marcar a hora
                </Botao>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- a semana

function VistaSemana({ dia, hoje, filtro, aoAbrirDia }: { dia: string; hoje: string; filtro: Id | null; aoAbrirDia: (d: string) => void }) {
  const config = useConfigAgenda();
  const todos = useAgendamentos();
  const clientes = useOficina((s) => s.clientes);
  const veiculos = useOficina((s) => s.veiculos);
  const dias = diasDaSemana(dia);

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Semana">
      {dias.map((d) => {
        const doDia = todos.filter((a) => a.data === d);
        const visiveis = filtro ? doDia.filter((a) => a.profissionalId === filtro) : doDia;
        const ocupam = doDia.filter((a) => ocupaHorario(a.situacao));
        const capacidade = horariosDoDia(config, d).length * config.vagas;
        const folga = ehFolga(config, d);
        const fechado = !abreNoDia(config, d);
        const cheio = diaCheio(config, d, doDia);
        return (
          <li key={d} className={`flex flex-col rounded-2xl bg-papel ring-1 ${d === hoje ? 'ring-2 ring-tinta' : 'ring-linha'}`}>
            <button type="button" onClick={() => aoAbrirDia(d)} className="flex items-center justify-between gap-2 border-b border-linha px-4 py-2.5 text-left hover:bg-papel-2" aria-label={`Abrir ${diaCurto(d)}`}>
              <span className="meio-largo font-bold first-letter:uppercase">
                {diaCurto(d)}
                {d === hoje ? <span className="ml-1.5 text-[13px] font-semibold text-tinta-3">hoje</span> : null}
              </span>
              <span className="flex items-center gap-1.5 text-[13px] text-tinta-3">
                {folga ? <Chip tom="atraso">Folga</Chip> : fechado ? <Chip>Fechado</Chip> : cheio ? <Chip tom="oleo">Cheio</Chip> : null}
                {capacidade ? (
                  <span className="num">
                    {ocupam.length}/{capacidade}
                  </span>
                ) : ocupam.length ? (
                  <span className="num">{ocupam.length}</span>
                ) : null}
              </span>
            </button>
            {capacidade ? (
              <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-papel-2" aria-hidden="true">
                <div className={`h-full rounded-full ${cheio ? 'bg-oleo' : 'bg-tinta-3'}`} style={{ width: `${Math.min(100, Math.round((ocupam.length / capacidade) * 100))}%` }} />
              </div>
            ) : null}
            {visiveis.length ? (
              <ul className="flex flex-col gap-1.5 px-4 py-3">
                {visiveis.map((a) => {
                  const q = quemE(a, clientes, veiculos);
                  return (
                    <li key={a.id} className={`flex items-center gap-2 text-[14px] ${emAberto(a.situacao) || a.situacao === 'concluido' ? '' : 'opacity-60'}`}>
                      <span className="num w-11 shrink-0 font-semibold">{a.hora}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {q.nome}
                        <span className="text-tinta-3"> · {a.servico}</span>
                      </span>
                      <ChipSituacao situacao={a.situacao} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-3 text-[13.5px] text-tinta-3">{fechado ? 'Sem expediente.' : capacidade ? `Livre: ${horaCurta(horariosDoDia(config, d)[0])} às ${horaCurta(config.semana[diaDaSemana(d)].at(-1)?.fim ?? '18:00')}` : 'Sem horários.'}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
