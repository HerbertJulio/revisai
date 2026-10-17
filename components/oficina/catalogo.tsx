'use client';

// O catálogo da loja. Os preços são só para quem entrou na conta: sem conta, vêm os produtos e as
// lojas sem os preços e sem as promoções. A última versão fica guardada no aparelho para abrir sem
// internet (a com preços, só enquanto a pessoa estiver na conta). Junto vêm os extras da vitrine:
// prazo de entrega, pedido mínimo e cashback das lojas, estoque e aplicações dos produtos e os
// anúncios no ar.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { normalizarCatalogo, type Catalogo, type Produto } from '@/lib/catalogo';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { EXTRAS_VAZIOS, lerExtras, semAnunciosEsgotados, semPrecos, type ExtrasDaVitrine } from '@/lib/vitrine';

const CHAVE_COM_PRECOS = 'revisai:catalogo';
const CHAVE_SEM_PRECOS = 'revisai:catalogo:vitrine';

interface EstadoCatalogo {
  catalogo: Catalogo;
  /** Prazo, pedido mínimo e cashback das lojas, estoque e aplicações dos produtos, anúncios no ar. */
  extras: ExtrasDaVitrine;
  carregando: boolean;
  semConexao: boolean;
  /** O catálogo tem os preços (só para quem entrou na conta). */
  comPrecos: boolean;
  produto: (id: number) => Produto | undefined;
  /** O anúncio por clique gastou o teto do dia: sai dos patrocinados até a próxima busca. */
  esgotar: (impulsoId: number) => void;
}

interface Baixado {
  catalogo: Catalogo;
  extras: ExtrasDaVitrine;
}

interface Base extends Baixado {
  carregando: boolean;
  semConexao: boolean;
  comPrecos: boolean;
}

function inicial(comConta: boolean): Base {
  return { catalogo: comConta ? CATALOGO_EXEMPLO : semPrecos(CATALOGO_EXEMPLO), extras: EXTRAS_VAZIOS, carregando: true, semConexao: false, comPrecos: comConta };
}

const nada = () => {};

const Contexto = createContext<EstadoCatalogo>({ ...inicial(true), produto: () => undefined, esgotar: nada });

export function useCatalogo() {
  return useContext(Contexto);
}

function lerGuardado(chave: string): Baixado | null {
  try {
    const g = localStorage.getItem(chave);
    if (!g) return null;
    const c = JSON.parse(g) as Partial<Catalogo> & { extras?: unknown };
    return Array.isArray(c?.produtos) ? { catalogo: normalizarCatalogo(c as Catalogo), extras: lerExtras(c.extras) } : null;
  } catch {
    return null;
  }
}

function guardar(chave: string, b: Baixado) {
  try {
    localStorage.setItem(chave, JSON.stringify({ ...b.catalogo, extras: b.extras }));
  } catch {}
}

async function baixar(url: string): Promise<Baixado | 401> {
  const r = await fetch(url, url.includes('precos=1') ? { cache: 'no-store', credentials: 'same-origin' } : undefined);
  if (r.status === 401) return 401;
  if (!r.ok) throw new Error(String(r.status));
  const json = (await r.json()) as Catalogo & { extras?: unknown };
  return { catalogo: normalizarCatalogo(json), extras: lerExtras(json.extras) };
}

/** Busca o catálogo da loja (com os preços para quem entrou); guarda a última versão. */
export function ProvedorCatalogo({ children }: { children: ReactNode }) {
  const { conta } = useConta();
  const comConta = !!conta;
  const [base, setBase] = useState<Base>(() => inicial(comConta));
  const [esgotados, setEsgotados] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    let vivo = true;
    setEsgotados(new Set());
    if (comConta) {
      const g = lerGuardado(CHAVE_COM_PRECOS);
      setBase(g ? { ...g, carregando: true, semConexao: false, comPrecos: true } : inicial(true));
    } else {
      // sem conta, a cópia com preços (de quando estava na conta) sai do aparelho
      try {
        localStorage.removeItem(CHAVE_COM_PRECOS);
      } catch {}
      const g = lerGuardado(CHAVE_SEM_PRECOS);
      setBase({ catalogo: semPrecos(g?.catalogo ?? CATALOGO_EXEMPLO), extras: g?.extras ?? EXTRAS_VAZIOS, carregando: true, semConexao: false, comPrecos: false });
    }
    (async () => {
      if (comConta) {
        const c = await baixar('/api/catalogo?precos=1');
        if (c !== 401) {
          if (vivo) setBase({ ...c, carregando: false, semConexao: false, comPrecos: true });
          guardar(CHAVE_COM_PRECOS, c);
          return;
        }
      }
      // sem conta (ou a sessão acabou): o catálogo sem preços
      const c = await baixar('/api/catalogo');
      if (c === 401) throw new Error('401');
      const publico = { catalogo: semPrecos(c.catalogo), extras: c.extras };
      if (vivo) setBase({ ...publico, carregando: false, semConexao: false, comPrecos: false });
      guardar(CHAVE_SEM_PRECOS, publico);
    })().catch(() => vivo && setBase((e) => ({ ...e, carregando: false, semConexao: true })));
    return () => {
      vivo = false;
    };
  }, [comConta]);

  const esgotar = useCallback((impulsoId: number) => {
    setEsgotados((atual) => (atual.has(impulsoId) ? atual : new Set([...atual, impulsoId])));
  }, []);

  const valor = useMemo<EstadoCatalogo>(() => {
    const catalogo = esgotados.size ? { ...base.catalogo, patrocinios: semAnunciosEsgotados(base.catalogo.patrocinios, base.extras.anuncios, esgotados) } : base.catalogo;
    const mapa = new Map(catalogo.produtos.map((p) => [p.id, p]));
    return { ...base, catalogo, produto: (id) => mapa.get(id), esgotar };
  }, [base, esgotados, esgotar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
