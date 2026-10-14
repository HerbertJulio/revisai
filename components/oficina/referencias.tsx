'use client';

// A base de prazos por produto, guardada no aparelho para funcionar sem internet.
// Atualiza sozinha a cada 12 horas (a base muda pouco).

import { useEffect, useSyncExternalStore } from 'react';
import type { Referencia } from '@/lib/referencias';

const CHAVE = 'revisai:referencias';
const VALIDADE_MS = 12 * 60 * 60_000;

interface Estado {
  referencias: Referencia[];
  carregando: boolean;
  em: number;
}

const INICIAL: Estado = { referencias: [], carregando: false, em: 0 };
let estado: Estado = INICIAL;
let lido = false;
let buscando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

function mudar(novo: Partial<Estado>) {
  estado = { ...estado, ...novo };
  for (const o of ouvintes) o();
}

function lerGuardado() {
  if (lido || typeof window === 'undefined') return;
  lido = true;
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { em: number; referencias: Referencia[] } | null;
    if (g && Array.isArray(g.referencias)) estado = { ...estado, referencias: g.referencias, em: Number(g.em) || 0 };
  } catch {}
}

async function atualizar() {
  if (buscando) return buscando;
  mudar({ carregando: true });
  buscando = (async () => {
    try {
      const r = await fetch('/api/referencias');
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { referencias?: Referencia[] };
      if (Array.isArray(j.referencias) && j.referencias.length) {
        const em = Date.now();
        mudar({ referencias: j.referencias, em });
        try {
          localStorage.setItem(CHAVE, JSON.stringify({ em, referencias: j.referencias }));
        } catch {}
      }
    } catch {
      // sem internet: segue com a cópia guardada
    } finally {
      mudar({ carregando: false });
      buscando = null;
    }
  })();
  return buscando;
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export function useReferencias(): Estado {
  const s = useSyncExternalStore(
    assinar,
    () => {
      lerGuardado();
      return estado;
    },
    () => INICIAL
  );
  useEffect(() => {
    lerGuardado();
    if (Date.now() - estado.em > VALIDADE_MS) void atualizar();
  }, []);
  return s;
}
