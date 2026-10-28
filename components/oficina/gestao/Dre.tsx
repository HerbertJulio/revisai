'use client';

// Resultado do mês (DRE): receitas e despesas por categoria e o que sobrou. Caixa (pago/recebido)
// ou competência (vencido no mês). Só leitura, a partir dos lançamentos. Lógica em lib/contabilidade.

import { useMemo, useState } from 'react';
import { Secao } from '@/components/ui';
import { dre, type RegimeDre } from '@/lib/contabilidade';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';

function Lista({ titulo, linhas, total }: { titulo: string; linhas: { categoria: string; nome: string; valor: number }[]; total: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
      <div className="flex items-center justify-between">
        <p className="font-bold">{titulo}</p>
        <p className="num font-bold">{formatarMoeda(total)}</p>
      </div>
      {linhas.length ? (
        <div className="flex flex-col divide-y divide-linha border-t border-linha">
          {linhas.map((l) => (
            <div key={l.categoria} className="flex items-center justify-between gap-3 py-2 text-[14.5px]">
              <span className="text-tinta-2">{l.nome}</span>
              <span className="num">{formatarMoeda(l.valor)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-tinta-3">Nada no período.</p>
      )}
    </div>
  );
}

export function Dre() {
  const hoje = useHoje();
  const lancamentos = useOficina((s) => s.lancamentos);
  const [regime, setRegime] = useState<RegimeDre>('caixa');
  const r = useMemo(() => dre(Object.values(lancamentos), { de: `${hoje.slice(0, 7)}-01`, ate: hoje }, regime), [lancamentos, hoje, regime]);

  return (
    <Secao titulo="Resultado do mês" descricao={regime === 'caixa' ? 'Pelo que entrou e saiu do caixa este mês.' : 'Pelo que venceu este mês, pago ou não.'}>
      <div className="flex gap-2">
        {(['caixa', 'competencia'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setRegime(id)}
            className={`h-8 rounded-full px-3 text-[13px] font-semibold transition-colors ${id === regime ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2 hover:text-tinta'}`}
          >
            {id === 'caixa' ? 'Caixa' : 'Competência'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Lista titulo="Receitas" linhas={r.receitas} total={r.totalReceitas} />
        <Lista titulo="Despesas" linhas={r.despesas} total={r.totalDespesas} />
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
        <p className="text-[17px] font-bold">Resultado</p>
        <p className={`largo num text-[22px] font-extrabold ${r.resultado >= 0 ? 'text-ok' : 'text-atraso'}`}>{formatarMoeda(r.resultado)}</p>
      </div>
    </Secao>
  );
}
