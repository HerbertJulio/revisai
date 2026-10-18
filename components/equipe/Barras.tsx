// Gráficos simples dos números do negócio, só com HTML e CSS (servem no servidor e no navegador).

import type { ReactNode } from 'react';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10" vira "out/26". */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-');
  const n = Number(m);
  return n >= 1 && n <= 12 ? `${MESES[n - 1]}/${a.slice(2)}` : mes;
}

export interface Barra {
  rotulo: string;
  valor: number;
  /** O texto no fim da barra (o valor formatado). */
  texto: string;
  detalhe?: ReactNode;
}

/** Barras deitadas, a maior ocupa a linha toda. */
export function Barras({ itens, rotulo }: { itens: Barra[]; rotulo: string }) {
  const max = Math.max(0, ...itens.map((i) => i.valor));
  return (
    <ul className="flex flex-col gap-2.5 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.rotulo} className="grid grid-cols-[minmax(72px,auto)_1fr_auto] items-center gap-3 text-[14px]">
          <span className="text-tinta-2">{i.rotulo}</span>
          <span className="h-3 overflow-hidden rounded-full bg-papel-2" aria-hidden="true">
            <span className="block h-3 rounded-full bg-oleo" style={{ width: `${max > 0 ? Math.max(1.5, (i.valor / max) * 100) : 0}%` }} />
          </span>
          <span className="num text-right font-semibold">
            {i.texto}
            {i.detalhe ? <span className="block text-[12.5px] font-normal text-tinta-3">{i.detalhe}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Escolha do período por link (?dias=30), sem JavaScript. */
export function Periodos({ opcoes, atual, caminho, parametro }: { opcoes: { valor: number; rotulo: string }[]; atual: number; caminho: string; parametro: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Período">
      {opcoes.map((o) => (
        <a
          key={o.valor}
          href={`${caminho}?${parametro}=${o.valor}`}
          aria-current={o.valor === atual ? 'true' : undefined}
          className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] font-semibold ${o.valor === atual ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
        >
          {o.rotulo}
        </a>
      ))}
    </nav>
  );
}
