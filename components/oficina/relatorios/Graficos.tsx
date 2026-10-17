'use client';

// Gráficos simples só com HTML e CSS (nítidos em qualquer largura, sem biblioteca): colunas por
// mês, barras deitadas e a divisão de um total. Uma série por gráfico, na cor do óleo; o valor
// aparece no fim da barra (nas colunas, no maior e no último, e em qualquer uma ao passar o
// dedo ou o teclado). A tabela ao lado de cada gráfico tem todos os números.

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Um teto redondo para a escala (1, 2, 2,5 ou 5 vezes uma potência de 10). */
export function tetoRedondo(max: number): number {
  if (!(max > 0)) return 1;
  const base = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= base * m) return base * m;
  return base * 10;
}

export interface Coluna {
  rotulo: string;
  /** Rótulo curto, quando são muitas colunas no celular. */
  curto?: string;
  valor: number;
  texto: string;
}

export function Colunas({ itens, rotulo }: { itens: Coluna[]; rotulo: string }) {
  const max = Math.max(0, ...itens.map((i) => i.valor));
  const teto = tetoRedondo(max);
  const indiceMax = itens.findIndex((i) => i.valor === max && max > 0);
  const muitas = itens.length > 6;
  return (
    <figure className="flex flex-col gap-2 rounded-2xl bg-papel px-3 pt-4 pb-3 ring-1 ring-linha sm:px-5" aria-label={rotulo}>
      <div className="relative ml-9 h-44">
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-linha" style={{ bottom: `${f * 100}%` }} aria-hidden="true">
            <span className="num absolute -top-2 -left-9 w-8 text-right text-[11px] leading-none text-tinta-3">{compacto.format(teto * f)}</span>
          </div>
        ))}
        <ul className="absolute inset-0 flex items-end gap-[2px]">
          {itens.map((c, i) => {
            const altura = teto > 0 ? (c.valor / teto) * 100 : 0;
            const fixo = i === indiceMax || i === itens.length - 1;
            return (
              <li key={c.rotulo} tabIndex={0} aria-label={`${c.rotulo}: ${c.texto}`} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none">
                <span
                  className={`num pointer-events-none absolute z-10 rounded-md px-1 text-[11.5px] leading-tight font-semibold whitespace-nowrap ${
                    fixo && !muitas ? 'text-tinta-2' : 'bg-tinta text-papel opacity-0 shadow-etiqueta group-hover:opacity-100 group-focus-visible:opacity-100'
                  } ${i === itens.length - 1 && itens.length > 1 ? 'right-0' : i === 0 && itens.length > 1 ? 'left-0' : ''}`}
                  style={{ bottom: `calc(${altura}% + 4px)` }}
                  aria-hidden="true"
                >
                  {c.texto}
                </span>
                <span
                  className="block w-full max-w-6 rounded-t-[4px] bg-oleo transition-[filter] group-hover:brightness-90 group-focus-visible:brightness-90"
                  style={{ height: `${c.valor > 0 ? Math.max(altura, 1.5) : 0}%` }}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ul>
      </div>
      <ol className="ml-9 flex gap-[2px]" aria-hidden="true">
        {itens.map((c) => (
          <li key={c.rotulo} className="min-w-0 flex-1 truncate text-center text-[11.5px] text-tinta-3">
            {muitas ? (
              <>
                <span className="sm:hidden">{c.curto ?? c.rotulo}</span>
                <span className="hidden sm:inline">{c.rotulo}</span>
              </>
            ) : (
              c.rotulo
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}

export interface Barra {
  rotulo: string;
  valor: number;
  texto: string;
  detalhe?: string;
}

/** Barras deitadas: a maior ocupa a linha toda; o valor fica no fim. */
export function Barras({ itens, rotulo }: { itens: Barra[]; rotulo: string }) {
  const max = Math.max(0, ...itens.map((i) => i.valor));
  return (
    <ul className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={rotulo}>
      {itens.map((i) => (
        <li key={i.rotulo} className="flex flex-col gap-1 text-[14px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-tinta-2">{i.rotulo}</span>
            <span className="num shrink-0 font-semibold">
              {i.texto}
              {i.detalhe ? <span className="ml-1.5 text-[12.5px] font-normal text-tinta-3">{i.detalhe}</span> : null}
            </span>
          </div>
          <span className="block h-2.5 overflow-hidden rounded-full bg-papel-2" aria-hidden="true">
            <span className="block h-2.5 rounded-full bg-oleo" style={{ width: `${max > 0 ? Math.max(1.5, (i.valor / max) * 100) : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface Parte {
  rotulo: string;
  valor: number;
  texto: string;
  /** Classe da cor (bg-...). */
  cor: string;
}

/** A divisão de um total numa barra só, com a legenda (cor, nome, valor e %) embaixo. */
export function Divisao({ partes, rotulo }: { partes: Parte[]; rotulo: string }) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  const visiveis = partes.filter((p) => p.valor > 0);
  return (
    <figure className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={rotulo}>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]" aria-hidden="true">
        {total > 0 ? visiveis.map((p) => <span key={p.rotulo} className={`block h-full ${p.cor}`} style={{ width: `${(p.valor / total) * 100}%` }} title={`${p.rotulo}: ${p.texto}`} />) : <span className="block h-full w-full bg-papel-2" />}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[14px]">
        {partes.map((p) => (
          <li key={p.rotulo} className="flex items-center gap-2">
            <span className={`h-3 w-3 shrink-0 rounded-[3px] ${p.cor}`} aria-hidden="true" />
            <span className="text-tinta-2">{p.rotulo}</span>
            <span className="num font-semibold">{p.texto}</span>
            {total > 0 ? <span className="num text-[12.5px] text-tinta-3">{Math.round((Math.max(0, p.valor) / total) * 100)}%</span> : null}
          </li>
        ))}
      </ul>
    </figure>
  );
}
