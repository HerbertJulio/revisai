// Peças pequenas do painel da loja (filtros, chips, avisos). Sem estado: servem às páginas do
// servidor e aos componentes do navegador.

import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Chip } from '@/components/ui';
import type { Tom } from '@/lib/loja/comum';

export function Filtro({ ativo, aoClicar, children, n }: { ativo: boolean; aoClicar: () => void; children: ReactNode; n?: number }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold ${ativo ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
    >
      {children}
      {n != null ? <span className={`num text-[13px] ${ativo ? 'text-papel/75' : 'text-tinta-3'}`}>{n}</span> : null}
    </button>
  );
}

export function LinhaDeFiltros({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label={rotulo}>
      <div className="flex w-max gap-2">{children}</div>
    </div>
  );
}

export function ChipSituacao({ nome, tom }: { nome: string; tom: Tom }) {
  return <Chip tom={tom}>{nome}</Chip>;
}

export function AvisoErro({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
      {children}
    </p>
  );
}

export function CampoBusca({ valor, aoMudar, rotulo, dica }: { valor: string; aoMudar: (v: string) => void; rotulo: string; dica: string }) {
  return (
    <label className="relative block w-full sm:max-w-sm">
      <span className="sr-only">{rotulo}</span>
      <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={dica}
        className="h-10 w-full min-w-0 rounded-[10px] border border-linha bg-papel pr-3 pl-9 text-[16px] outline-none placeholder:text-tinta-3 focus:border-caneta focus:ring-3 focus:ring-caneta/20 sm:text-[14.5px]"
      />
    </label>
  );
}

/** Um quadro com título, para as partes da página Sua loja. */
export function Quadro({ titulo, descricao, acao, children, id }: { titulo: string; descricao?: ReactNode; acao?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4 rounded-[22px] bg-papel px-4 py-5 ring-1 ring-linha sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] leading-tight">{titulo}</h2>
          {descricao ? <div className="mt-1 max-w-prose text-[14.5px] text-tinta-2">{descricao}</div> : null}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
