'use client';

import { useTransition } from 'react';
import { abrirLoja } from '@/app/conta/acoes';

/** Para quem trabalha em mais de uma loja: troca a loja do painel. */
export function TrocarLoja({ lojas, atual }: { lojas: { id: number; nome: string }[]; atual: number }) {
  const [trocando, iniciar] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 self-start text-[14px] font-semibold text-tinta-2">
      Loja do painel
      <select
        value={atual}
        disabled={trocando}
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id !== atual) iniciar(() => abrirLoja(id));
        }}
        className="h-9 min-w-0 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[16px] font-semibold text-tinta outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 disabled:opacity-60 sm:text-[14px]"
      >
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
