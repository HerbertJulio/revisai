'use client';

// Marcar ou mudar um horário: dia e hora (com os horários livres do dia), cliente e carro do
// cadastro ou só nome, WhatsApp e placa, serviço, duração, profissional e observação. Os conflitos
// (dia fechado, fora do horário, sem vaga, profissional ocupado) aparecem como aviso.

import { Search, Trash2, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { Placa } from '@/components/pecas';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { mensagemConfirmacao, quandoPorExtenso, quemE } from '@/lib/agendamento';
import { dataValida } from '@/lib/datas';
import { formatarTelefone, normalizarPlaca, normalizarTelefone, placaValida } from '@/lib/formatos';
import { agoraDe, conflitos, duracaoTexto, horaValida, horariosLivres, type ConfigHorarios } from '@/lib/horarios';
import { SERVICOS_RAPIDOS, servico as infoServico } from '@/lib/manutencao';
import type { Agendamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { semDatas, useAgendamentos, useConfigAgenda, useProfissionais } from './comum';

/** O que abre a folha: um horário para mudar, ou o começo de um novo. */
export interface AberturaAgendamento {
  editar?: Id;
  data?: string;
  hora?: string;
  veiculoId?: Id | null;
  servico?: string;
  observacao?: string;
  origem?: Agendamento['origem'];
}

interface Rascunho {
  data: string;
  hora: string;
  duracaoMin: number;
  veiculoId: Id | null;
  clienteId: Id | null;
  avulso: boolean;
  nome: string;
  telefone: string;
  placa: string;
  servico: string;
  profissionalId: Id | null;
  observacao: string;
}

const DURACOES = [15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 480];
const SERVICOS_DA_AGENDA = [...SERVICOS_RAPIDOS.map((s) => infoServico(s).nome), 'Diagnóstico'];

function rascunhoDe(a: AberturaAgendamento, editar: Agendamento | undefined, config: ConfigHorarios, hoje: string): Rascunho {
  if (editar) {
    return {
      data: editar.data,
      hora: editar.hora,
      duracaoMin: editar.duracaoMin || config.intervaloMin,
      veiculoId: editar.veiculoId ?? null,
      clienteId: editar.clienteId ?? null,
      avulso: !editar.veiculoId,
      nome: editar.nome ?? '',
      telefone: editar.telefone ?? '',
      placa: editar.placa ?? '',
      servico: editar.servico,
      profissionalId: editar.profissionalId ?? null,
      observacao: editar.observacao ?? ''
    };
  }
  const veiculo = a.veiculoId ? useOficina.getState().veiculos[a.veiculoId] : undefined;
  return {
    data: a.data && dataValida(a.data) ? a.data : hoje,
    hora: a.hora && horaValida(a.hora) ? a.hora : '',
    duracaoMin: config.intervaloMin,
    veiculoId: veiculo?.id ?? null,
    clienteId: veiculo?.clienteId ?? null,
    avulso: false,
    nome: '',
    telefone: '',
    placa: '',
    servico: a.servico ?? '',
    profissionalId: null,
    observacao: a.observacao ?? ''
  };
}

function alternarServico(texto: string, nome: string): string {
  const partes = texto
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const i = partes.findIndex((p) => p.toLowerCase() === nome.toLowerCase());
  if (i >= 0) partes.splice(i, 1);
  else partes.push(nome);
  return partes.join(', ');
}

export function FolhaAgendamento({ abertura, aoFechar, hoje }: { abertura: AberturaAgendamento | null; aoFechar: () => void; hoje: string }) {
  const editar = useOficina((s) => (abertura?.editar ? s.agendamentos[abertura.editar] : undefined));
  const titulo = editar ? 'Mudar o horário' : 'Novo horário';
  return (
    <Folha aberta={!!abertura} aoFechar={aoFechar} titulo={titulo} descricao={editar ? quandoPorExtenso(editar.data, editar.hora) : 'O cliente recebe a confirmação pelo WhatsApp, se você quiser.'}>
      {abertura ? <Formulario key={abertura.editar ?? JSON.stringify(abertura)} abertura={abertura} editar={editar} aoFechar={aoFechar} hoje={hoje} /> : null}
    </Folha>
  );
}

function Formulario({ abertura, editar, aoFechar, hoje }: { abertura: AberturaAgendamento; editar: Agendamento | undefined; aoFechar: () => void; hoje: string }) {
  const config = useConfigAgenda();
  const agendamentos = useAgendamentos();
  const profissionais = useProfissionais();
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const oficina = useOficina((s) => s.oficina);
  const toast = useToast();
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(abertura, editar, config, hoje));
  const [busca, setBusca] = useState('');
  const [erros, setErros] = useState<Partial<Record<keyof Rascunho, string>>>({});
  const [apagar, setApagar] = useState(false);
  const mudar = (p: Partial<Rascunho>) => setR((x) => ({ ...x, ...p }));

  const veiculo = r.veiculoId ? veiculos[r.veiculoId] : undefined;
  const cliente = veiculo ? clientes[veiculo.clienteId] : r.clienteId ? clientes[r.clienteId] : undefined;

  const livres = useMemo(() => {
    if (!dataValida(r.data)) return [];
    const outros = agendamentos.filter((a) => a.id !== editar?.id);
    const agora = r.data === hoje ? agoraDe() : undefined;
    return horariosLivres(config, r.data, outros, { agora });
  }, [config, agendamentos, r.data, hoje, editar?.id]);

  const avisos = useMemo(
    () =>
      dataValida(r.data) && horaValida(r.hora)
        ? conflitos(config, { id: editar?.id, data: r.data, hora: r.hora, duracaoMin: r.duracaoMin, profissionalId: r.profissionalId }, agendamentos, {
            nomeProfissional: (id) => profissionais.find((p) => p.id === id)?.nome ?? 'O profissional'
          })
        : [],
    [config, agendamentos, r.data, r.hora, r.duracaoMin, r.profissionalId, editar?.id, profissionais]
  );

  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (t.length < 2) return [];
    const placa = normalizarPlaca(t);
    const digitos = t.replace(/\D/g, '');
    return Object.values(veiculos)
      .map((v) => ({ v, c: clientes[v.clienteId] }))
      .filter(
        ({ v, c }) =>
          (c?.nome.toLowerCase().includes(t) ?? false) ||
          (placa.length >= 2 && v.placa.includes(placa)) ||
          (digitos.length >= 4 && (c?.telefone.includes(digitos) ?? false)) ||
          `${v.marca} ${v.modelo}`.toLowerCase().includes(t)
      )
      .slice(0, 6);
  }, [busca, veiculos, clientes]);

  const duracoes = DURACOES.includes(r.duracaoMin) ? DURACOES : [...DURACOES, r.duracaoMin].sort((a, b) => a - b);

  function salvar() {
    const e: Partial<Record<keyof Rascunho, string>> = {};
    if (!dataValida(r.data)) e.data = 'Escolha o dia.';
    if (!horaValida(r.hora)) e.hora = 'Escolha a hora.';
    if (!r.servico.trim()) e.servico = 'Escreva o serviço.';
    if (!veiculo) {
      if (r.nome.trim().length < 2) e.nome = 'Escreva o nome do cliente ou escolha do cadastro.';
      if (r.telefone.trim() && !normalizarTelefone(r.telefone)) e.telefone = 'Confira o WhatsApp, com DDD.';
      if (r.placa.trim() && !placaValida(r.placa)) e.placa = 'Placa no formato ABC1D23 ou ABC-1234.';
    }
    setErros(e);
    if (Object.keys(e).length) return;
    const s = useOficina.getState();
    const base = editar ? semDatas(editar) : null;
    // o mesmo carro de antes: o nome e o WhatsApp de quem pediu (pelo link) continuam
    const mesmoCarro = !!veiculo && editar?.veiculoId === veiculo.id;
    const id = s.salvarRegistro('agendamentos', {
      ...(base ?? {}),
      id: editar?.id,
      data: r.data,
      hora: r.hora,
      duracaoMin: r.duracaoMin,
      clienteId: veiculo ? (mesmoCarro ? (editar?.clienteId ?? veiculo.clienteId) : veiculo.clienteId) : (r.clienteId ?? null),
      veiculoId: veiculo?.id ?? null,
      nome: veiculo ? (mesmoCarro ? editar?.nome : undefined) : r.nome.trim(),
      telefone: veiculo ? (mesmoCarro ? editar?.telefone : undefined) : (normalizarTelefone(r.telefone) ?? undefined),
      placa: veiculo ? (mesmoCarro ? editar?.placa : undefined) : normalizarPlaca(r.placa) || undefined,
      servico: r.servico.trim(),
      observacao: r.observacao.trim() || undefined,
      profissionalId: r.profissionalId,
      situacao: editar?.situacao ?? 'marcado',
      origem: editar?.origem ?? abertura.origem ?? 'oficina',
      // mudou o dia ou a hora: o lembrete da véspera vale de novo
      lembradoEm: editar && (editar.data !== r.data || editar.hora !== r.hora) ? null : (editar?.lembradoEm ?? null)
    });
    const salvo = useOficina.getState().agendamentos[id];
    aoFechar();
    if (!salvo) return;
    const q = quemE(salvo, s.clientes, s.veiculos);
    const link = linkWhatsApp(q.telefone, mensagemConfirmacao({ cliente: q.nome, oficina, data: salvo.data, hora: salvo.hora, servico: salvo.servico, carro: q.carro, hoje }));
    toast({
      texto: editar ? 'Horário mudado.' : `Marcado para ${quandoPorExtenso(salvo.data, salvo.hora, hoje)}.`,
      acao: link ? { rotulo: 'Avisar no WhatsApp', fazer: () => window.open(link, '_blank', 'noopener,noreferrer') } : undefined
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Dia" htmlFor="ag-dia" erro={erros.data}>
          <input id="ag-dia" type="date" className={classeEntrada} value={r.data} onChange={(e) => mudar({ data: e.target.value })} />
        </Campo>
        <Campo rotulo="Hora" htmlFor="ag-hora" erro={erros.hora}>
          <input id="ag-hora" type="time" step={300} className={classeEntrada} value={r.hora} onChange={(e) => mudar({ hora: e.target.value })} />
        </Campo>
      </div>
      {dataValida(r.data) ? (
        livres.length ? (
          <div className="-mt-2 flex flex-col gap-1.5">
            <p className="text-[13px] text-tinta-3">Horários livres neste dia</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horários livres">
              {livres.slice(0, 24).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={r.hora === h}
                  onClick={() => mudar({ hora: h })}
                  className={`num h-9 rounded-lg border px-2.5 text-[14px] font-semibold ${r.hora === h ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="-mt-2 text-[13px] text-tinta-3">Nenhum horário livre neste dia. Dá para marcar um encaixe assim mesmo.</p>
        )
      ) : null}

      <Campo rotulo="Duração" htmlFor="ag-duracao">
        <select id="ag-duracao" className={classeEntrada} value={r.duracaoMin} onChange={(e) => mudar({ duracaoMin: Number(e.target.value) })}>
          {duracoes.map((d) => (
            <option key={d} value={d}>
              {duracaoTexto(d)}
            </option>
          ))}
        </select>
      </Campo>

      <fieldset className="flex flex-col gap-3 border-t border-linha pt-4">
        <legend className="mb-2 text-sm font-semibold">Cliente e carro</legend>
        {veiculo ? (
          <div className="flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2.5">
            <Placa placa={veiculo.placa} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{cliente?.nome ?? 'Cliente'}</p>
              <p className="truncate text-[13.5px] text-tinta-2">
                {[veiculo.marca, veiculo.modelo, veiculo.ano].filter(Boolean).join(' ')}
                {cliente?.telefone ? `, ${formatarTelefone(cliente.telefone)}` : ''}
              </p>
            </div>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full text-tinta-2 hover:bg-papel" aria-label="Trocar o carro" onClick={() => mudar({ veiculoId: null, clienteId: null })}>
              <X size={18} />
            </button>
          </div>
        ) : r.avulso ? (
          <div className="flex flex-col gap-3">
            <Campo rotulo="Nome" htmlFor="ag-nome" erro={erros.nome}>
              <input id="ag-nome" className={classeEntrada} value={r.nome} onChange={(e) => mudar({ nome: e.target.value })} autoComplete="off" maxLength={80} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="WhatsApp" htmlFor="ag-tel" erro={erros.telefone}>
                <input id="ag-tel" type="tel" inputMode="tel" className={classeEntrada} value={r.telefone} onChange={(e) => mudar({ telefone: e.target.value })} placeholder="(21) 98765-4321" />
              </Campo>
              <Campo rotulo="Placa" htmlFor="ag-placa" erro={erros.placa}>
                <input id="ag-placa" className={`${classeEntrada} uppercase`} value={r.placa} onChange={(e) => mudar({ placa: e.target.value })} placeholder="ABC1D23" maxLength={8} autoCapitalize="characters" />
              </Campo>
            </div>
            <button type="button" className="self-start text-[14px] font-semibold text-caneta hover:underline" onClick={() => mudar({ avulso: false })}>
              Escolher do cadastro
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="relative">
              <span className="sr-only">Buscar cliente ou carro</span>
              <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
              <input className={`${classeEntrada} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Placa, nome ou telefone" autoComplete="off" />
            </label>
            {achados.length ? (
              <ul className="divide-y divide-linha overflow-hidden rounded-xl ring-1 ring-linha">
                {achados.map(({ v, c }) => (
                  <li key={v.id}>
                    <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-papel-2" onClick={() => mudar({ veiculoId: v.id, clienteId: v.clienteId })}>
                      <Placa placa={v.placa} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{c?.nome ?? 'Cliente'}</span>
                        <span className="block truncate text-[13px] text-tinta-3">{[v.marca, v.modelo, v.ano].filter(Boolean).join(' ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : busca.trim().length >= 2 ? (
              <p className="text-[13.5px] text-tinta-3">Ninguém com esse nome ou placa.</p>
            ) : null}
            {erros.nome ? (
              <p className="text-sm text-atraso" role="alert">
                {erros.nome}
              </p>
            ) : null}
            <button
              type="button"
              className="self-start text-[14px] font-semibold text-caneta hover:underline"
              onClick={() => mudar({ avulso: true, nome: /\d/.test(busca) ? r.nome : busca.trim(), placa: normalizarPlaca(busca).length === 7 ? busca : r.placa })}
            >
              Cliente sem cadastro (só nome, WhatsApp e placa)
            </button>
          </div>
        )}
      </fieldset>

      <Campo rotulo="Serviço" htmlFor="ag-servico" erro={erros.servico}>
        <input id="ag-servico" className={classeEntrada} value={r.servico} onChange={(e) => mudar({ servico: e.target.value })} placeholder="Troca de óleo, revisão..." maxLength={120} />
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Serviços comuns">
          {SERVICOS_DA_AGENDA.map((nome) => {
            const marcado = r.servico
              .split(',')
              .map((p) => p.trim().toLowerCase())
              .includes(nome.toLowerCase());
            return (
              <button
                key={nome}
                type="button"
                aria-pressed={marcado}
                onClick={() => mudar({ servico: alternarServico(r.servico, nome) })}
                className={`h-8 rounded-full border px-3 text-[13px] font-semibold ${marcado ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
              >
                {nome}
              </button>
            );
          })}
        </div>
      </Campo>

      {profissionais.some((p) => p.ativo) || r.profissionalId ? (
        <Campo rotulo="Profissional" htmlFor="ag-prof">
          <select id="ag-prof" className={classeEntrada} value={r.profissionalId ?? ''} onChange={(e) => mudar({ profissionalId: e.target.value || null })}>
            <option value="">Sem profissional</option>
            {profissionais
              .filter((p) => p.ativo || p.id === r.profissionalId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </Campo>
      ) : null}

      <Campo rotulo="Observação" htmlFor="ag-obs" dica="Opcional. Ex.: vai deixar o carro o dia todo.">
        <input id="ag-obs" className={classeEntrada} value={r.observacao} onChange={(e) => mudar({ observacao: e.target.value })} maxLength={300} />
      </Campo>

      {avisos.length ? (
        <div className="flex flex-col gap-1 rounded-xl bg-oleo-claro px-3.5 py-3 text-[14px] text-oleo-tinta" role="status">
          {avisos.map((a) => (
            <p key={a.tipo} className="flex items-start gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {a.texto}
            </p>
          ))}
          <p className="text-[13px]">Dá para marcar assim mesmo.</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-linha pt-4">
        {editar ? (
          apagar ? (
            <Botao
              variante="perigo"
              className="mr-auto"
              onClick={() => {
                useOficina.getState().apagarRegistro('agendamentos', editar.id);
                aoFechar();
                toast({ texto: 'Horário apagado.' });
              }}
            >
              <Trash2 size={16} aria-hidden="true" /> Confirmar: apagar
            </Botao>
          ) : (
            <Botao variante="fantasma" className="mr-auto" onClick={() => setApagar(true)}>
              <Trash2 size={16} aria-hidden="true" /> Apagar
            </Botao>
          )
        ) : null}
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar}>
          {editar ? 'Salvar' : 'Marcar'}
        </Botao>
      </div>
    </div>
  );
}
