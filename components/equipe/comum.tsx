'use client';

// Peças pequenas do painel da equipe.

import type { ReactNode } from 'react';
import { Chip } from '@/components/ui';
import type { Tom } from '@/lib/equipe-dados';

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

export function SeletorSituacao<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  desabilitado
}: {
  valor: T;
  opcoes: readonly { id: T; nome: string }[];
  aoMudar: (v: T) => void;
  rotulo: string;
  desabilitado?: boolean;
}) {
  return (
    <label className="ml-auto flex items-center gap-2 text-[14px] font-semibold text-tinta-2">
      <span className="max-sm:sr-only">Situação</span>
      <select
        aria-label={rotulo}
        value={valor}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.value as T)}
        className="h-10 min-w-0 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[16px] font-semibold sm:h-9 sm:text-[14px] text-tinta outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 disabled:opacity-60"
      >
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AvisoErro({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
      {children}
    </p>
  );
}
