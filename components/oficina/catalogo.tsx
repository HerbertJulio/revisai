'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { normalizarCatalogo, type Catalogo, type Produto } from '@/lib/catalogo';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';

const CHAVE_CACHE = 'revisai:catalogo';

interface EstadoCatalogo {
  catalogo: Catalogo;
  carregando: boolean;
  semConexao: boolean;
  produto: (id: number) => Produto | undefined;
}

function montar(catalogo: Catalogo, carregando: boolean, semConexao: boolean): EstadoCatalogo {
  const mapa = new Map(catalogo.produtos.map((p) => [p.id, p]));
  return { catalogo, carregando, semConexao, produto: (id) => mapa.get(id) };
}

const Contexto = createContext<EstadoCatalogo>(montar(CATALOGO_EXEMPLO, true, false));

export function useCatalogo() {
  return useContext(Contexto);
}

/** Busca o catálogo da loja; guarda a última versão para abrir sem internet. */
export function ProvedorCatalogo({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState(() => montar(CATALOGO_EXEMPLO, true, false));

  useEffect(() => {
    let vivo = true;
    try {
      const guardado = localStorage.getItem(CHAVE_CACHE);
      if (guardado) setEstado(montar(normalizarCatalogo(JSON.parse(guardado) as Catalogo), true, false));
    } catch {}
    fetch('/api/catalogo')
      .then((r) => (r.ok ? (r.json() as Promise<Catalogo>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        if (!vivo) return;
        setEstado(montar(normalizarCatalogo(c), false, false));
        try {
          localStorage.setItem(CHAVE_CACHE, JSON.stringify(c));
        } catch {}
      })
      .catch(() => vivo && setEstado((e) => montar(e.catalogo, false, true)));
    return () => {
      vivo = false;
    };
  }, []);

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}
