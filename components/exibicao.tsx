'use client';

// Grade ou lista: o jeito de ver produtos, lembrado neste aparelho.

import { LayoutGrid, List } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export type Exibicao = 'grade' | 'lista';

export function useExibicao(chave: string): [Exibicao, (e: Exibicao) => void] {
  const [e, setE] = useState<Exibicao>('grade');
  useEffect(() => {
    try {
      const v = localStorage.getItem(chave);
      if (v === 'grade' || v === 'lista') setE(v);
    } catch {}
  }, [chave]);
  return [
    e,
    (v) => {
      setE(v);
      try {
        localStorage.setItem(chave, v);
      } catch {}
    }
  ];
}

export function TrocaExibicao({ exibicao, aoExibir }: { exibicao: Exibicao; aoExibir: (e: Exibicao) => void }) {
  return (
    <div className="flex h-11 shrink-0 rounded-[10px] border border-linha bg-papel p-1" role="group" aria-label="Exibição dos produtos">
      <Opcao ativa={exibicao === 'grade'} aoClicar={() => aoExibir('grade')} rotulo="Grade">
        <LayoutGrid size={17} aria-hidden="true" />
      </Opcao>
      <Opcao ativa={exibicao === 'lista'} aoClicar={() => aoExibir('lista')} rotulo="Lista">
        <List size={17} aria-hidden="true" />
      </Opcao>
    </div>
  );
}

function Opcao({ ativa, aoClicar, rotulo, children }: { ativa: boolean; aoClicar: () => void; rotulo: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={aoClicar}
      title={rotulo}
      className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 text-[14px] font-semibold ${ativa ? 'bg-tinta text-papel' : 'text-tinta-2 hover:text-tinta'}`}
    >
      {children}
      <span className="hidden xl:inline">{rotulo}</span>
      <span className="sr-only xl:hidden">{rotulo}</span>
    </button>
  );
}
