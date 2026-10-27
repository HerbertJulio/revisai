'use client';

// Fluxo de caixa projetado: o que ainda tem para receber e pagar, o que está atrasado e o saldo
// dia a dia nos próximos 60 dias. Só leitura, dos lançamentos em aberto. Lógica em lib/fluxo-caixa.

import { useMemo } from 'react';
import { Chip, Secao } from '@/components/ui';
import { formatarData, somarDias } from '@/lib/datas';
import { fluxoProjetado } from '@/lib/fluxo-caixa';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';

export function FluxoCaixa() {
  const hoje = useHoje();
  const lancamentos = useOficina((s) => s.lancamentos);
  const f = useMemo(() => fluxoProjetado(Object.values(lancamentos), hoje, somarDias(hoje, 60)), [lancamentos, hoje]);
  const temAtraso = f.vencidoReceber > 0 || f.vencidoPagar > 0;

  return (
    <Secao titulo="Fluxo de caixa" descricao="Pelo que está em aberto, nos próximos 60 dias.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">A receber</p>
          <p className="largo num mt-1 text-[22px] font-extrabold text-ok">{formatarMoeda(f.aReceber)}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">A pagar</p>
          <p className="largo num mt-1 text-[22px] font-extrabold text-atraso">{formatarMoeda(f.aPagar)}</p>
        </div>
        <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="text-[13px] text-tinta-3">Saldo projetado</p>
          <p className={`largo num mt-1 text-[22px] font-extrabold ${f.saldoProjetado >= 0 ? 'text-ok' : 'text-atraso'}`}>{formatarMoeda(f.saldoProjetado)}</p>
        </div>
      </div>

      {temAtraso ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-atraso-claro px-5 py-3 text-[14px] text-atraso">
          <span className="font-semibold">Atrasado:</span>
          {f.vencidoReceber > 0 ? <span>a receber {formatarMoeda(f.vencidoReceber)}</span> : null}
          {f.vencidoPagar > 0 ? <span>a pagar {formatarMoeda(f.vencidoPagar)}</span> : null}
        </div>
      ) : null}

      {f.porDia.length ? (
        <div className="flex flex-col divide-y divide-linha rounded-2xl bg-papel px-5 ring-1 ring-linha">
          {f.porDia.map((d) => (
            <div key={d.data} className="flex items-center justify-between gap-3 py-3 text-[14.5px]">
              <span className="w-20 shrink-0 text-tinta-2">{formatarData(d.data)}</span>
              <span className="num flex-1 text-right text-ok">{d.entra ? `+${formatarMoeda(d.entra)}` : ''}</span>
              <span className="num flex-1 text-right text-atraso">{d.sai ? `−${formatarMoeda(d.sai)}` : ''}</span>
              <span className={`num w-28 shrink-0 text-right font-semibold ${d.saldo >= 0 ? '' : 'text-atraso'}`}>{formatarMoeda(d.saldo)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[15px] text-tinta-2">Nada a vencer nos próximos 60 dias. As contas a receber e a pagar aparecem aqui pela data de vencimento.</p>
      )}
    </Secao>
  );
}
