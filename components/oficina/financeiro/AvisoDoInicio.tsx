'use client';

// No início, abaixo do resumo do dia (só para o dono e o gerente): o fiado vencido para lembrar
// e as contas a pagar que vencem hoje ou já venceram.

import { ChevronRight, HandCoins, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { fiadosPorCliente, somaEmReais } from '@/lib/financeiro';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import { useGestao } from './comum';

export function AvisoDoFinanceiro() {
  const gestao = useGestao();
  if (!gestao) return null;
  return <Aviso />;
}

function Aviso() {
  const hoje = useHoje();
  const lancamentos = useOficina((s) => s.lancamentos);
  const { fiado, contas } = useMemo(() => {
    const lista = Object.values(lancamentos);
    const vencidos = fiadosPorCliente(lista, hoje, true);
    const pagar = lista.filter((l) => l.tipo === 'pagar' && !l.pagoEm && l.vencimento <= hoje);
    return {
      fiado: { clientes: vencidos.length, total: somaEmReais(vencidos.map((g) => g.vencido)) },
      contas: { quantidade: pagar.length, total: somaEmReais(pagar.map((l) => l.valor)) }
    };
  }, [lancamentos, hoje]);
  if (!fiado.clientes && !contas.quantidade) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Financeiro">
      {fiado.clientes ? (
        <li>
          <Link href="/oficina/financeiro?aba=fiado" className="flex items-center gap-3 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha hover:ring-tinta-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-oleo-claro text-oleo-tinta" aria-hidden="true">
              <HandCoins size={18} />
            </span>
            <span className="min-w-0 flex-1 text-[14.5px]">
              <strong>Fiado vencido:</strong> {fiado.clientes} {fiado.clientes === 1 ? 'cliente' : 'clientes'}, <span className="num font-semibold">{formatarMoeda(fiado.total)}</span>. Lembre com um toque.
            </span>
            <ChevronRight size={18} className="shrink-0 text-tinta-3" aria-hidden="true" />
          </Link>
        </li>
      ) : null}
      {contas.quantidade ? (
        <li>
          <Link href="/oficina/financeiro" className="flex items-center gap-3 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha hover:ring-tinta-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-atraso-claro text-atraso" aria-hidden="true">
              <Receipt size={18} />
            </span>
            <span className="min-w-0 flex-1 text-[14.5px]">
              <strong>Contas a pagar para hoje:</strong> {contas.quantidade} {contas.quantidade === 1 ? 'conta' : 'contas'}, <span className="num font-semibold">{formatarMoeda(contas.total)}</span>.
            </span>
            <ChevronRight size={18} className="shrink-0 text-tinta-3" aria-hidden="true" />
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
