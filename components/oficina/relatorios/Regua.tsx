// A régua do comparativo: a faixa do meio das oficinas da região (do primeiro ao último quarto),
// o meio e onde a oficina fica. Só desenho e texto, sem dados do aparelho: serve no relatório
// da oficina e na página pública.

import { formatarMetrica, marcadorNaRegua, METRICAS, textoDaPosicao, type Faixa, type Metrica } from '@/lib/comparativo';

export function LinhaDoComparativo({ metrica, valor, faixa, rotuloDoValor = 'Você' }: { metrica: Metrica; valor: number | null; faixa: Faixa | null; rotuloDoValor?: string }) {
  const info = METRICAS.find((m) => m.id === metrica)!;
  const posicao = textoDaPosicao(metrica, valor, faixa);
  const regua = faixa ? marcadorNaRegua(valor ?? faixa.mediana, faixa) : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[17px]">{info.nome}</h3>
        <p className="text-[14px] text-tinta-2">
          {rotuloDoValor}: <strong className="num text-[17px] text-tinta">{formatarMetrica(metrica, valor)}</strong>
        </p>
      </div>
      {faixa && regua ? (
        <>
          <div className="relative mx-1.5 h-6" aria-hidden="true">
            <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-papel-2" />
            <span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-caneta/30" style={{ left: `${regua.inicio}%`, width: `${Math.max(1, regua.fim - regua.inicio)}%` }} />
            <span className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-caneta" style={{ left: `${regua.meio}%` }} />
            {valor != null ? <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-oleo ring-2 ring-papel" style={{ left: `${regua.ponto}%` }} /> : null}
          </div>
          <p className="text-[13.5px] text-tinta-2">
            Metade das oficinas fica entre <strong className="num">{formatarMetrica(metrica, faixa.p25)}</strong> e <strong className="num">{formatarMetrica(metrica, faixa.p75)}</strong>. O meio é <strong className="num">{formatarMetrica(metrica, faixa.mediana)}</strong>.
          </p>
          {posicao ? (
            <p className="text-[14px]">
              <strong>{posicao.onde}</strong>
              {posicao.dica ? <span className="text-tinta-2"> {posicao.dica}</span> : null}
            </p>
          ) : (
            <p className="text-[13.5px] text-tinta-3">{info.explica}</p>
          )}
        </>
      ) : (
        <p className="text-[13.5px] text-tinta-3">Ainda não há oficinas suficientes na região com esse número para comparar sem expor ninguém.</p>
      )}
    </div>
  );
}

/** A legenda da régua (a faixa, o meio e o ponto). */
export function LegendaDaRegua({ rotuloDoValor = 'Você' }: { rotuloDoValor?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-tinta-2">
      <li className="flex items-center gap-2">
        <span className="h-2 w-6 rounded-full bg-caneta/30" aria-hidden="true" /> Metade das oficinas
      </li>
      <li className="flex items-center gap-2">
        <span className="h-4 w-[3px] rounded-full bg-caneta" aria-hidden="true" /> O meio
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3.5 w-3.5 rounded-full bg-oleo" aria-hidden="true" /> {rotuloDoValor}
      </li>
    </ul>
  );
}
