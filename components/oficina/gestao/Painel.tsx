'use client';

// Painel: a visão geral do mês (faturamento, ordens, ticket médio, inadimplência) e o faturamento
// dos últimos 6 meses. Só leitura, das ordens concluídas e dos lançamentos. Lógica em lib/indicadores.

import { useMemo } from 'react';
import { Secao } from '@/components/ui';
import { faturamentoPorMes, indicadoresDoMes } from '@/lib/indicadores';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  return `${MESES[Number(m) - 1]}/${ano.slice(2)}`;
}

export function Painel() {
  const hoje = useHoje();
  const documentos = useOficina((s) => s.documentos);
  const lancamentos = useOficina((s) => s.lancamentos);
  const ind = useMemo(() => indicadoresDoMes(Object.values(documentos), Object.values(lancamentos), hoje), [documentos, lancamentos, hoje]);
  const historico = useMemo(() => faturamentoPorMes(Object.values(documentos), hoje, 6), [documentos, hoje]);
  const maior = Math.max(1, ...historico.map((h) => h.total));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Faturamento do mês</p>
          <p className="largo num mt-1 text-[22px] font-extrabold">{formatarMoeda(ind.faturamento)}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Ordens concluídas</p>
          <p className="largo num mt-1 text-[22px] font-extrabold">{ind.ordens}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Ticket médio</p>
          <p className="largo num mt-1 text-[22px] font-extrabold">{formatarMoeda(ind.ticketMedio)}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">A receber em atraso</p>
          <p className={`largo num mt-1 text-[22px] font-extrabold ${ind.atrasoReceber > 0 ? 'text-atraso' : ''}`}>{formatarMoeda(ind.atrasoReceber)}</p>
          {ind.atrasoQtd > 0 ? <p className="text-[12px] text-tinta-3">{ind.atrasoQtd === 1 ? '1 conta' : `${ind.atrasoQtd} contas`}</p> : null}
        </div>
      </div>

      <Secao titulo="Faturamento dos últimos meses">
        <div className="flex flex-col gap-2 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          {historico.map((h) => (
            <div key={h.mes} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-[13px] text-tinta-3">{rotuloMes(h.mes)}</span>
              <span className="h-5 flex-1 overflow-hidden rounded-full bg-papel-2">
                <span className="block h-full rounded-full bg-oleo" style={{ width: `${Math.max(2, (h.total / maior) * 100)}%` }} />
              </span>
              <span className="num w-24 shrink-0 text-right text-[13.5px] font-semibold">{formatarMoeda(h.total)}</span>
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}
