'use client';

import { useState } from 'react';
import { IconeServico } from '@/components/icones';
import type { ItemAviso } from '@/lib/avisos';
import { formatarData } from '@/lib/datas';
import { servico } from '@/lib/manutencao';
import { rotuloPrazo } from '@/lib/rotulos';
import { AREA_DO_SERVICO, NOMES_AREA, estadoDasAreas, vidaRestante, type Area, type EstadoArea } from '@/lib/saude';

/** Onde cada área fica no desenho do carro visto de cima (em % da largura e da altura). */
const PONTOS: Record<Area, { x: number; y: number }> = {
  motor: { x: 50, y: 17 },
  bateria: { x: 70, y: 13 },
  parabrisa: { x: 50, y: 32 },
  cabine: { x: 50, y: 48 },
  cambio: { x: 50, y: 63 },
  freio_dianteiro: { x: 9, y: 26 },
  suspensao: { x: 91, y: 26 },
  freio_traseiro: { x: 9, y: 73 },
  rodas: { x: 91, y: 73 }
};

const COR: Record<EstadoArea, string> = { atrasado: 'bg-atraso', avisar: 'bg-oleo', ok: 'bg-ok' };
const NOME_ESTADO: Record<EstadoArea, string> = { atrasado: 'vencido', avisar: 'vence logo', ok: 'em dia' };

/** O carro visto de cima, com um ponto em cada parte que tem serviço acompanhado. */
export function SaudeDoCarro({
  itens,
  hoje,
  recomendacoes
}: {
  itens: ItemAviso[];
  hoje: string;
  recomendacoes: { texto: string; area: Area | null; urgencia: 'agora' | 'proxima_revisao' | 'observar' }[];
}) {
  const [area, setArea] = useState<Area | null>(null);
  const estados = estadoDasAreas(itens, recomendacoes);
  const visiveis = area ? itens.filter((i) => AREA_DO_SERVICO[i.servico] === area) : itens;
  const recs = recomendacoes.filter((r) => r.urgencia !== 'observar' && (!area || r.area === area));
  const ordenados = [...visiveis].sort((a, b) => vidaRestante(a, hoje) - vidaRestante(b, hoje));

  return (
    <div className="grid gap-5 rounded-[22px] bg-papel p-4 ring-1 ring-linha sm:p-5 md:grid-cols-[minmax(0,240px)_1fr] md:gap-8">
      <div className="mx-auto w-full max-w-[170px] md:max-w-none">
        <div className="relative aspect-[5/9] w-full">
          <DesenhoDoCarro />
          {(Object.keys(PONTOS) as Area[]).map((a) => {
            const e = estados[a];
            const sel = area === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setArea(sel ? null : a)}
                aria-pressed={sel}
                aria-label={`${NOMES_AREA[a]}: ${e ? NOME_ESTADO[e] : 'sem serviço registrado'}`}
                title={NOMES_AREA[a]}
                className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-caneta"
                style={{ left: `${PONTOS[a].x}%`, top: `${PONTOS[a].y}%` }}
              >
                {e === 'atrasado' ? <span className="absolute inset-0 animate-ping rounded-full bg-atraso/35 motion-reduce:animate-none" aria-hidden="true" /> : null}
                <span
                  className={`relative block rounded-full ring-[3px] ring-papel transition-transform ${e ? COR[e] : 'bg-linha'} ${sel ? 'h-5 w-5 scale-110 outline-2 outline-tinta' : 'h-4 w-4'}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12.5px] text-tinta-3">
          <Legenda cor="bg-atraso" nome="Vencido" />
          <Legenda cor="bg-oleo" nome="Vence logo" />
          <Legenda cor="bg-ok" nome="Em dia" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-bold">{area ? NOMES_AREA[area] : 'Todos os itens'}</p>
          {area ? (
            <button type="button" className="text-[14px] font-semibold text-caneta hover:underline" onClick={() => setArea(null)}>
              Ver tudo
            </button>
          ) : (
            <p className="text-[13px] text-tinta-3">Toque numa parte do carro para filtrar</p>
          )}
        </div>
        {recs.length ? (
          <ul className="flex flex-col gap-1.5">
            {recs.map((r, i) => (
              <li key={i} className={`rounded-lg px-3 py-2 text-[14px] ${r.urgencia === 'agora' ? 'bg-atraso-claro text-atraso' : 'bg-oleo-claro text-oleo-tinta'}`}>
                <span className="font-semibold">{r.urgencia === 'agora' ? 'Recomendado agora' : 'Na próxima revisão'}</span>, {r.texto.charAt(0).toLowerCase() + r.texto.slice(1)}
              </li>
            ))}
          </ul>
        ) : null}
        {ordenados.length ? (
          <ul className="flex flex-col gap-3.5">
            {ordenados.map((i) => {
              const vida = vidaRestante(i, hoje);
              const p = rotuloPrazo(i.venc, i.situacao);
              const cor = i.situacao === 'atrasado' ? 'bg-atraso' : i.situacao === 'avisar' ? 'bg-oleo' : 'bg-ok';
              const texto = i.situacao === 'atrasado' ? 'text-atraso' : i.situacao === 'avisar' ? 'text-oleo-tinta' : 'text-tinta-3';
              return (
                <li key={i.servico} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-papel-2 text-tinta-2">
                    <IconeServico servico={i.servico} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[14.5px] font-semibold">{servico(i.servico).nome}</p>
                      <p className="num shrink-0 text-[13px] font-bold">{Math.round(vida * 100)}%</p>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full bg-papel-2"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(vida * 100)}
                      aria-label={`Vida restante de ${servico(i.servico).nome}`}
                    >
                      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(3, vida * 100)}%` }} />
                    </div>
                    <p className={`mt-1 text-[12.5px] ${texto}`}>
                      {p.principal}
                      <span className="text-tinta-3">, feito em {formatarData(i.base.data)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[14px] text-tinta-2">{area ? 'Nenhum serviço desta parte registrado ainda.' : 'Nenhum serviço registrado neste carro.'}</p>
        )}
      </div>
    </div>
  );
}

function Legenda({ cor, nome }: { cor: string; nome: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${cor}`} aria-hidden="true" /> {nome}
    </span>
  );
}

/** Desenho de linha de um carro de passeio genérico, visto de cima, com a frente para cima. */
export function DesenhoDoCarro({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 360" className={`absolute inset-0 h-full w-full ${className}`} aria-hidden="true" fill="none" strokeLinejoin="round">
      {/* rodas */}
      <g className="fill-tinta/85">
        <rect x="10" y="66" width="20" height="56" rx="7" />
        <rect x="170" y="66" width="20" height="56" rx="7" />
        <rect x="10" y="236" width="20" height="56" rx="7" />
        <rect x="170" y="236" width="20" height="56" rx="7" />
      </g>
      {/* retrovisores */}
      <path d="M26 128 l-14 -4 q-4 6 2 10 l12 2 z M174 128 l14 -4 q4 6 -2 10 l-12 2 z" className="fill-papel-2 stroke-tinta" strokeWidth="2" />
      {/* carroceria */}
      <path
        d="M100 10 C138 10 162 18 168 44 L174 112 L176 160 L176 250 C176 300 168 336 140 348 C120 354 80 354 60 348 C32 336 24 300 24 250 L24 160 L26 112 L32 44 C38 18 62 10 100 10 Z"
        className="fill-papel-2 stroke-tinta"
        strokeWidth="2.5"
      />
      {/* capô */}
      <path d="M44 34 C70 26 130 26 156 34" className="stroke-tinta/40" strokeWidth="1.5" />
      <path d="M70 22 L76 96 M130 22 L124 96" className="stroke-tinta/25" strokeWidth="1.5" />
      {/* para-brisa */}
      <path d="M46 104 C72 94 128 94 154 104 L146 140 C118 134 82 134 54 140 Z" className="fill-vidro stroke-tinta" strokeWidth="2" />
      {/* teto */}
      <rect x="56" y="146" width="88" height="96" rx="14" className="fill-papel stroke-tinta/50" strokeWidth="1.5" />
      {/* vidro traseiro */}
      <path d="M56 252 C82 258 118 258 144 252 L150 284 C120 292 80 292 50 284 Z" className="fill-vidro stroke-tinta" strokeWidth="2" />
      {/* porta-malas */}
      <path d="M48 316 C76 324 124 324 152 316" className="stroke-tinta/40" strokeWidth="1.5" />
      {/* faróis e lanternas */}
      <path d="M40 30 l18 -10 M160 30 l-18 -10" className="stroke-oleo" strokeWidth="4" strokeLinecap="round" />
      <path d="M44 338 l20 6 M156 338 l-20 6" className="stroke-atraso" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
