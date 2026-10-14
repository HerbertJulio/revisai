'use client';

// Os passos depois que o mecânico para de falar: o áudio guardado, o áudio virando texto e a
// ordem sendo preenchida. Se um passo falha, o erro aparece nele com o que dá para fazer.

import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export type EstadoDoPasso = 'feito' | 'agora' | 'depois' | 'erro';

export interface Passo {
  id: string;
  titulo: string;
  detalhe?: ReactNode;
  estado: EstadoDoPasso;
}

function Marca({ estado }: { estado: EstadoDoPasso }) {
  if (estado === 'feito')
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ok text-sobre-ok">
        <Check size={17} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  if (estado === 'agora')
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-oleo text-[#1b1f22]">
        <LoaderCircle size={18} strokeWidth={2.6} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </span>
    );
  if (estado === 'erro')
    return (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-atraso text-white">
        <TriangleAlert size={16} strokeWidth={2.4} aria-hidden="true" />
      </span>
    );
  return <span className="h-8 w-8 shrink-0 rounded-full border-2 border-dashed border-linha" aria-hidden="true" />;
}

export function Andamento({ passos, children }: { passos: Passo[]; children?: ReactNode }) {
  // o passo em andamento é anunciado; o erro, a caixa de alerta já anuncia
  const atual = passos.find((p) => p.estado === 'agora');
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6" aria-label="Montando a ordem de serviço">
      <p className="sr-only" aria-live="polite">
        {atual ? atual.titulo : ''}
      </p>
      <ol className="flex flex-col">
        {passos.map((p, i) => (
          <li key={p.id} className="relative flex gap-3.5 pb-6 last:pb-0">
            {i < passos.length - 1 ? (
              <span aria-hidden="true" className={`absolute top-9 bottom-1 left-[15px] w-0.5 rounded-full ${p.estado === 'feito' ? 'bg-ok/40' : 'bg-linha'}`} />
            ) : null}
            <Marca estado={p.estado} />
            <div className="min-w-0 flex-1 pt-1">
              <p className={`text-[16.5px] leading-snug font-bold ${p.estado === 'depois' ? 'text-tinta-3' : p.estado === 'erro' ? 'text-atraso' : 'text-tinta'}`}>
                {p.titulo}
                {p.estado === 'agora' ? '…' : ''}
              </p>
              {p.detalhe ? <div className="mt-1.5 text-[14px] text-tinta-2">{p.detalhe}</div> : null}
            </div>
          </li>
        ))}
      </ol>
      {children}
    </section>
  );
}

/** O fim do que foi falado, para o mecânico ver que a IA ouviu certo enquanto a ordem é preenchida. */
export function TrechoDoRelato({ texto }: { texto: string }) {
  const t = texto.trim();
  const corte = t.length > 420 ? `…${t.slice(-420).replace(/^\S*\s/, '')}` : t;
  return <blockquote className="rounded-r-xl border-l-4 border-oleo bg-papel px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-line text-tinta">{corte}</blockquote>;
}
