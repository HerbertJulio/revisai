'use client';

// Os horários de trabalho da agenda: cada dia da semana aberto ou fechado (com início e fim), a
// pausa do almoço, o tamanho de cada horário, quantos carros por vez e os dias de folga.
// Vale para a agenda e para o link de agendamento (que é atualizado junto, quando está ligado).

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, classeEntrada } from '@/components/ui';
import { dataValida, formatarData } from '@/lib/datas';
import { AGENDA_PADRAO, agendaDaSemana, duracaoTexto, horaValida, minutos, NOMES_DIAS, semanaDasPreferencias, type Periodo } from '@/lib/horarios';
import { useOficina } from '@/lib/store';
import { republicarLink } from './LinkOnline';

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const INTERVALOS = [15, 20, 30, 45, 60, 90, 120];

export function FolhaHorarios({ aberta, aoFechar, hoje }: { aberta: boolean; aoFechar: () => void; hoje: string }) {
  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Horários de trabalho" descricao="Valem para a agenda e para o link de agendamento.">
      {aberta ? <Formulario aoFechar={aoFechar} hoje={hoje} /> : null}
    </Folha>
  );
}

function Formulario({ aoFechar, hoje }: { aoFechar: () => void; hoje: string }) {
  const agenda = useOficina((s) => s.preferencias.agenda);
  const { banco, oficina } = useConta();
  const toast = useToast();
  const base = { ...AGENDA_PADRAO, ...(agenda ?? {}) };
  const [semana, setSemana] = useState<(Periodo | null)[]>(() => semanaDasPreferencias(agenda));
  const [comPausa, setComPausa] = useState(!!base.pausa);
  const [pausa, setPausa] = useState<Periodo>(base.pausa ?? { inicio: '12:00', fim: '13:00' });
  const [intervalo, setIntervalo] = useState(base.intervaloMin);
  const [vagas, setVagas] = useState(base.vagasPorHorario);
  const [folgas, setFolgas] = useState<string[]>(() => (base.folgas ?? []).filter((f) => f >= hoje).sort());
  const [novaFolga, setNovaFolga] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function mudarDia(d: number, p: Periodo | null) {
    setSemana((s) => s.map((x, i) => (i === d ? p : x)));
  }

  async function salvar() {
    for (const d of ORDEM_DIAS) {
      const p = semana[d];
      if (p && (!horaValida(p.inicio) || !horaValida(p.fim) || minutos(p.inicio) >= minutos(p.fim))) return setErro(`Confira o horário de ${NOMES_DIAS[d].toLowerCase()}: o fim vem depois do início.`);
    }
    if (comPausa && (!horaValida(pausa.inicio) || !horaValida(pausa.fim) || minutos(pausa.inicio) >= minutos(pausa.fim))) return setErro('Confira a pausa: o fim vem depois do início.');
    setErro(null);
    // as folgas que já passaram ficam guardadas (o histórico não muda)
    const passadas = (base.folgas ?? []).filter((f) => f < hoje);
    const nova = agendaDaSemana(agenda, semana, {
      pausa: comPausa ? pausa : null,
      intervaloMin: intervalo,
      vagasPorHorario: Math.max(1, Math.min(20, Math.round(vagas) || 1)),
      folgas: [...passadas, ...folgas].sort()
    });
    useOficina.getState().salvarPreferencias({ agenda: nova });
    const sb = banco();
    if (nova.agendamentoOnline && oficina && sb) {
      setSalvando(true);
      const r = await republicarLink(sb, oficina.id, nova);
      setSalvando(false);
      if (!r.ok) toast({ texto: `Horários salvos, mas o link não foi atualizado: ${r.erro}`, tom: 'erro' });
      else toast({ texto: 'Horários salvos. O link de agendamento já mostra os novos.' });
    } else toast({ texto: 'Horários salvos.' });
    aoFechar();
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">
        {ORDEM_DIAS.map((d) => {
          const p = semana[d];
          return (
            <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-papel-2 px-3 py-2">
              <label className="flex w-28 items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--tinta)]"
                  checked={!!p}
                  onChange={(e) => mudarDia(d, e.target.checked ? (semana.find(Boolean) ?? { inicio: '08:00', fim: '18:00' }) : null)}
                />
                {NOMES_DIAS[d]}
              </label>
              {p ? (
                <span className="flex items-center gap-2">
                  <input type="time" aria-label={`Abre ${NOMES_DIAS[d].toLowerCase()}`} className={`${classeEntrada} h-10 w-[7.5rem]`} value={p.inicio} onChange={(e) => mudarDia(d, { ...p, inicio: e.target.value })} />
                  <span className="text-tinta-3">às</span>
                  <input type="time" aria-label={`Fecha ${NOMES_DIAS[d].toLowerCase()}`} className={`${classeEntrada} h-10 w-[7.5rem]`} value={p.fim} onChange={(e) => mudarDia(d, { ...p, fim: e.target.value })} />
                </span>
              ) : (
                <span className="text-[14px] text-tinta-3">Fechado</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <Alternar id="ag-pausa" ligado={comPausa} aoMudar={setComPausa} rotulo="Pausa para o almoço" descricao="Sem horários marcados nesse intervalo, em todos os dias." />
        {comPausa ? (
          <span className="flex items-center gap-2">
            <input type="time" aria-label="Início da pausa" className={`${classeEntrada} h-10 w-[7.5rem]`} value={pausa.inicio} onChange={(e) => setPausa({ ...pausa, inicio: e.target.value })} />
            <span className="text-tinta-3">às</span>
            <input type="time" aria-label="Fim da pausa" className={`${classeEntrada} h-10 w-[7.5rem]`} value={pausa.fim} onChange={(e) => setPausa({ ...pausa, fim: e.target.value })} />
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Cada horário" htmlFor="ag-intervalo">
          <select id="ag-intervalo" className={classeEntrada} value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
            {(INTERVALOS.includes(intervalo) ? INTERVALOS : [...INTERVALOS, intervalo].sort((a, b) => a - b)).map((m) => (
              <option key={m} value={m}>
                {duracaoTexto(m)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Carros por horário" htmlFor="ag-vagas" dica="Quantos elevadores ou boxes atendem ao mesmo tempo.">
          <input id="ag-vagas" type="number" inputMode="numeric" min={1} max={20} className={classeEntrada} value={vagas} onChange={(e) => setVagas(Number(e.target.value))} />
        </Campo>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Folgas e feriados</p>
        <div className="flex gap-2">
          <input type="date" aria-label="Dia de folga" className={classeEntrada} min={hoje} value={novaFolga} onChange={(e) => setNovaFolga(e.target.value)} />
          <Botao
            onClick={() => {
              if (!dataValida(novaFolga) || novaFolga < hoje) return;
              setFolgas((f) => [...new Set([...f, novaFolga])].sort());
              setNovaFolga('');
            }}
            disabled={!dataValida(novaFolga)}
          >
            <Plus size={16} aria-hidden="true" /> Folga
          </Botao>
        </div>
        {folgas.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {folgas.map((f) => (
              <li key={f} className="inline-flex items-center gap-1 rounded-full bg-papel-2 py-1 pr-1 pl-3 text-[13.5px] font-semibold">
                <span className="num">{formatarData(f)}</span>
                <button type="button" aria-label={`Tirar a folga de ${formatarData(f)}`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-linha" onClick={() => setFolgas((x) => x.filter((y) => y !== f))}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-tinta-3">Nenhuma folga marcada.</p>
        )}
      </div>

      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-linha pt-4">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Botao>
      </div>
    </div>
  );
}
