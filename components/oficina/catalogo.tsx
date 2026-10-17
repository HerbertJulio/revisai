'use client';

// O catálogo da loja. Os preços são só para quem entrou na conta: sem conta, vêm os produtos e as
// lojas sem os preços e sem as promoções. A última versão fica guardada no aparelho para abrir sem
// internet (a com preços, só enquanto a pessoa estiver na conta).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { normalizarCatalogo, type Catalogo, type Produto } from '@/lib/catalogo';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { semPrecos } from '@/lib/vitrine';

const CHAVE_COM_PRECOS = 'revisai:catalogo';
const CHAVE_SEM_PRECOS = 'revisai:catalogo:vitrine';

interface EstadoCatalogo {
  catalogo: Catalogo;
  carregando: boolean;
  semConexao: boolean;
  /** O catálogo tem os preços (só para quem entrou na conta). */
  comPrecos: boolean;
  produto: (id: number) => Produto | undefined;
}

function montar(catalogo: Catalogo, carregando: boolean, semConexao: boolean, comPrecos: boolean): EstadoCatalogo {
  const mapa = new Map(catalogo.produtos.map((p) => [p.id, p]));
  return { catalogo, carregando, semConexao, comPrecos, produto: (id) => mapa.get(id) };
}

function inicial(comConta: boolean): EstadoCatalogo {
  return comConta ? montar(CATALOGO_EXEMPLO, true, false, true) : montar(semPrecos(CATALOGO_EXEMPLO), true, false, false);
}

const Contexto = createContext<EstadoCatalogo>(montar(CATALOGO_EXEMPLO, true, false, true));

export function useCatalogo() {
  return useContext(Contexto);
}

function lerGuardado(chave: string): Catalogo | null {
  try {
    const g = localStorage.getItem(chave);
    if (!g) return null;
    const c = JSON.parse(g) as Partial<Catalogo>;
    return Array.isArray(c?.produtos) ? normalizarCatalogo(c as Catalogo) : null;
  } catch {
    return null;
  }
}

function guardar(chave: string, c: Catalogo) {
  try {
    localStorage.setItem(chave, JSON.stringify(c));
  } catch {}
}

async function baixar(url: string): Promise<Catalogo | 401> {
  const r = await fetch(url, url.includes('precos=1') ? { cache: 'no-store', credentials: 'same-origin' } : undefined);
  if (r.status === 401) return 401;
  if (!r.ok) throw new Error(String(r.status));
  return normalizarCatalogo((await r.json()) as Catalogo);
}

/** Busca o catálogo da loja (com os preços para quem entrou); guarda a última versão. */
export function ProvedorCatalogo({ children }: { children: ReactNode }) {
  const { conta } = useConta();
  const comConta = !!conta;
  const [estado, setEstado] = useState(() => inicial(comConta));

  useEffect(() => {
    let vivo = true;
    if (comConta) {
      const g = lerGuardado(CHAVE_COM_PRECOS);
      setEstado(g ? montar(g, true, false, true) : inicial(true));
    } else {
      // sem conta, a cópia com preços (de quando estava na conta) sai do aparelho
      try {
        localStorage.removeItem(CHAVE_COM_PRECOS);
      } catch {}
      const g = lerGuardado(CHAVE_SEM_PRECOS);
      setEstado(montar(semPrecos(g ?? CATALOGO_EXEMPLO), true, false, false));
    }
    (async () => {
      if (comConta) {
        const c = await baixar('/api/catalogo?precos=1');
        if (c !== 401) {
          if (vivo) setEstado(montar(c, false, false, true));
          guardar(CHAVE_COM_PRECOS, c);
          return;
        }
      }
      // sem conta (ou a sessão acabou): o catálogo sem preços
      const c = await baixar('/api/catalogo');
      if (c === 401) throw new Error('401');
      const publico = semPrecos(c);
      if (vivo) setEstado(montar(publico, false, false, false));
      guardar(CHAVE_SEM_PRECOS, publico);
    })().catch(() => vivo && setEstado((e) => montar(e.catalogo, false, true, e.comPrecos)));
    return () => {
      vivo = false;
    };
  }, [comConta]);

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>;
}
