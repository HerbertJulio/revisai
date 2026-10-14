'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Placa } from '@/components/pecas';
import { classeEntrada } from '@/components/ui';
import { normalizarPlaca } from '@/lib/formatos';
import { useOficina } from '@/lib/store';

/** Busca um carro já cadastrado pela placa, pelo nome do dono ou pelo modelo. */
export function BuscaCarro({ aoEscolher, focar = false, rotulo = 'Buscar carro cadastrado' }: { aoEscolher: (id: string) => void; focar?: boolean; rotulo?: string }) {
  const veiculos = useOficina((s) => s.veiculos);
  const clientes = useOficina((s) => s.clientes);
  const [busca, setBusca] = useState('');
  const t = busca.trim().toLowerCase();
  const placa = normalizarPlaca(t);
  const lista =
    t.length < 2
      ? []
      : Object.values(veiculos)
          .filter((v) => (placa.length >= 2 && v.placa.includes(placa)) || (clientes[v.clienteId]?.nome.toLowerCase().includes(t) ?? false) || v.modelo.toLowerCase().includes(t))
          .slice(0, 6);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
        <input
          className={`${classeEntrada} pl-10`}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Placa, nome do dono ou modelo"
          aria-label={rotulo}
          autoComplete="off"
          autoFocus={focar}
        />
      </div>
      {lista.length ? (
        <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha bg-papel">
          {lista.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => aoEscolher(v.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-papel-2">
                <Placa placa={v.placa} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{clientes[v.clienteId]?.nome}</span>
                  <span className="block truncate text-[13.5px] text-tinta-2">{[v.marca, v.modelo, v.ano].filter(Boolean).join(' ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : t.length >= 2 ? (
        <p className="px-1 text-[14px] text-tinta-3">Nenhum carro cadastrado com esse nome ou placa.</p>
      ) : null}
    </div>
  );
}
