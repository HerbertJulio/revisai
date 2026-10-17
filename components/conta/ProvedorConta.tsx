'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Conta, OficinaDaConta } from '@/lib/conta-dados';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';

// A conta de quem entrou, para os componentes do navegador: quem é, a oficina escolhida e o
// cliente do banco (sessão nos cookies). Sem conta (modo do aparelho), conta e oficina são null.

interface ValorConta {
  conta: Conta | null;
  oficina: OficinaDaConta | null;
  config: ConfigPublica | null;
  banco: () => SupabaseClient | null;
  /** Troca a conta depois de uma ação (aceitar convite, mudar o plano). */
  definirConta: (c: Conta | null) => void;
}

const Contexto = createContext<ValorConta>({ conta: null, oficina: null, config: null, banco: () => null, definirConta: () => {} });

export function ProvedorConta({ conta: inicial, oficinaId, config, children }: { conta: Conta | null; oficinaId: string | null; config: ConfigPublica | null; children: ReactNode }) {
  const [conta, definirConta] = useState<Conta | null>(inicial);
  const banco = useCallback(() => (config ? clienteNavegador(config) : null), [config]);
  const valor = useMemo<ValorConta>(() => {
    const oficina = conta?.oficinas.find((o) => o.id === oficinaId) ?? conta?.oficinas[0] ?? null;
    return { conta, oficina, config, banco, definirConta };
  }, [conta, oficinaId, config, banco]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useConta(): ValorConta {
  return useContext(Contexto);
}
