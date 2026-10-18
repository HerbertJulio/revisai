'use client';

// A conta da oficina para as partes da ordem que falam com o servidor (links do cliente, fotos,
// respostas). Os componentes pegam pelo gancho; o que roda fora deles (o efeito de concluir a
// ordem) usa a última conta que um componente registrou, se ela ainda é a dos dados do aparelho.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import type { PapelOficina } from '@/lib/conta-dados';
import { useOficina } from '@/lib/store';

export interface ContextoDaConta {
  sb: SupabaseClient;
  oficinaId: string;
  papel: PapelOficina;
}

export const SEM_CONTA = 'Entre com sua conta para mandar o link ao cliente.';

let registrado: ContextoDaConta | null = null;

/** A conta ligada aos dados deste aparelho (null sem conta). */
export function contextoDaConta(): ContextoDaConta | null {
  if (!registrado) return null;
  return useOficina.getState().contaOficinaId === registrado.oficinaId ? registrado : null;
}

export function useContextoDaConta(): ContextoDaConta | null {
  const { oficina, banco } = useConta();
  const ctx = useMemo<ContextoDaConta | null>(() => {
    if (!oficina || typeof window === 'undefined') return null;
    const sb = banco();
    return sb ? { sb, oficinaId: oficina.id, papel: oficina.papel } : null;
  }, [oficina, banco]);
  useEffect(() => {
    if (ctx) registrado = ctx;
  }, [ctx]);
  return ctx;
}

/** Sem conta, quem usa o aparelho é o dono; com conta, o mecânico não vê dinheiro. */
export function useEhMecanico(): boolean {
  return useConta().oficina?.papel === 'mecanico';
}
