'use client';

// Peças pequenas do painel da equipe.

import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Chip, classeBotao } from '@/components/ui';
import type { Tom } from '@/lib/equipe-dados';

/** Quantos itens as listas longas mostram de cada vez. */
export const POR_PAGINA = 20;

/** Texto para busca sem acento e sem maiúscula. */
export function paraBusca(...partes: (string | null | undefined)[]): string {
  return partes
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Todas as palavras digitadas aparecem no texto do item. */
export function combina(texto: string, busca: string): boolean {
  const termos = paraBusca(busca).split(/\s+/).filter(Boolean);
  return termos.every((t) => texto.includes(t));
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

/** Botão no fim da lista para mostrar os próximos itens. */
export function MostrarMais({ total, mostrando, aoMostrar }: { total: number; mostrando: number; aoMostrar: () => void }) {
  if (mostrando >= total) return null;
  const restam = total - mostrando;
  return (
    <button type="button" onClick={aoMostrar} className={classeBotao('secundario', 'normal', 'self-center')}>
      Mostrar mais {Math.min(POR_PAGINA, restam)}
      <span className="num text-tinta-3">de {restam}</span>
    </button>
  );
}

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
