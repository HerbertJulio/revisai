'use client';

// O que cada loja combinou com a oficina da conta (desconto ou preço fixo, o "preço combinado com
// você") e o saldo de cashback dela em cada loja. Busca ao abrir a Loja, ao voltar para o app (no
// máximo a cada minuto) e depois de um pedido. Sem conta, nada (os preços nem aparecem).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { condicoesDaLoja } from '@/app/oficina/acoes-loja';
import { useConta } from '@/components/conta/ProvedorConta';
import type { CondicaoDaOficina } from '@/lib/vitrine';

interface Condicoes {
  condicoes: CondicaoDaOficina[];
  /** Saldo de cashback por loja; pode ser negativo depois de um estorno. */
  saldos: Record<string, number>;
  /** Já buscou (com conta). */
  carregado: boolean;
  atualizar(): Promise<void>;
}

const VAZIO: Condicoes = { condicoes: [], saldos: {}, carregado: false, atualizar: async () => {} };

const Contexto = createContext<Condicoes>(VAZIO);

export function useCondicoes(): Condicoes {
  return useContext(Contexto);
}

/** O saldo de cashback da oficina na loja (0 sem saldo). */
export function saldoNaLoja(c: Pick<Condicoes, 'saldos'>, fornecedorId: number): number {
  return c.saldos[String(fornecedorId)] ?? 0;
}

const UM_MINUTO = 60_000;

export function ProvedorDeCondicoes({ children }: { children: ReactNode }) {
  const { oficina } = useConta();
  const oficinaId = oficina?.id ?? null;
  const [dados, setDados] = useState<Pick<Condicoes, 'condicoes' | 'saldos' | 'carregado'>>({ condicoes: [], saldos: {}, carregado: false });
  const atual = useRef<string | null>(null);
  const ultima = useRef(0);

  const atualizar = useCallback(async () => {
    const id = atual.current;
    if (!id) return;
    ultima.current = Date.now();
    try {
      const r = await condicoesDaLoja();
      // trocou de oficina no meio: o que voltou é da outra
      if (atual.current !== id) return;
      if (r.ok) setDados({ condicoes: r.condicoes, saldos: r.saldos, carregado: true });
    } catch {
      // sem conexão: fica o que tinha (o banco confere os preços no pedido)
    }
  }, []);

  useEffect(() => {
    atual.current = oficinaId;
    setDados({ condicoes: [], saldos: {}, carregado: false });
    if (oficinaId) void atualizar();
  }, [oficinaId, atualizar]);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && atual.current && Date.now() - ultima.current > UM_MINUTO) void atualizar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [atualizar]);

  const valor = useMemo(() => ({ ...dados, atualizar }), [dados, atualizar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
