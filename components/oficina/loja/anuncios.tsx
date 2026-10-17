'use client';

// Os anúncios que a oficina viu e abriu na vitrine. O produto patrocinado conta como visto quando
// metade do cartão aparece na tela; os vistos vão juntos para o servidor (de 2 em 2 segundos), uma
// vez por anúncio por dia (o aparelho lembra o que já mandou e o banco conta uma vez de novo). Abrir
// um patrocinado conta o clique, também uma vez por dia; o anúncio por clique que gastou o teto do
// dia sai dos patrocinados. Só com a conta da oficina: sem ela, nada é contado.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { anunciosVistos, cliqueNoAnuncio } from '@/app/oficina/acoes-loja';
import { useConta } from '@/components/conta/ProvedorConta';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import { anunciosDoDia, anunciosDoProduto, anunciosParaContar, type AnunciosDoDia } from '@/lib/vitrine';
import { useCatalogo } from '../catalogo';

const CHAVE = 'revisai:loja:anuncios';
const ESPERA_MS = 2000;
const POR_VEZ = 50;

interface Anuncios {
  /** Liga a contagem de "visto" num elemento (o cartão do produto patrocinado). */
  observar(el: Element | null, produtoId: number): () => void;
  /** A oficina abriu (ou pôs no pedido) o produto patrocinado. */
  clicar(produtoId: number): void;
}

const Contexto = createContext<Anuncios>({ observar: () => () => {}, clicar: () => {} });

function ler(oficina: string, dia: string): AnunciosDoDia {
  try {
    return anunciosDoDia(JSON.parse(localStorage.getItem(CHAVE) ?? 'null'), oficina, dia);
  } catch {
    return anunciosDoDia(null, oficina, dia);
  }
}

function gravar(r: AnunciosDoDia) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {}
}

export function ProvedorDeAnuncios({ children }: { children: ReactNode }) {
  const { oficina } = useConta();
  const oficinaId = oficina?.id ?? null;
  const uf = useOficina((s) => s.oficina.uf);
  const hoje = useHoje();
  const { extras, esgotar } = useCatalogo();
  const fila = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observador = useRef<IntersectionObserver | null>(null);
  const alvos = useRef(new Map<Element, number>());
  // o que os callbacks leem sem refazer o observador a cada mudança
  const atual = useRef({ oficinaId, uf, hoje, anuncios: extras.anuncios });
  atual.current = { oficinaId, uf, hoje, anuncios: extras.anuncios };

  const mandar = useCallback(() => {
    timer.current = null;
    const { oficinaId: id, hoje: dia } = atual.current;
    if (!id || !fila.current.size) return;
    const ids = [...fila.current].slice(0, POR_VEZ);
    for (const x of ids) fila.current.delete(x);
    const r = ler(id, dia);
    gravar({ ...r, vistos: [...r.vistos, ...ids] });
    // sem conexão (ou recusado): sai da lista de hoje, para contar na próxima vez que aparecer
    const desfazer = () => {
      const g = ler(id, dia);
      gravar({ ...g, vistos: g.vistos.filter((x) => !ids.includes(x)) });
    };
    void anunciosVistos({ ids })
      .then((x) => {
        if (!x.ok) desfazer();
      })
      .catch(desfazer);
    if (fila.current.size) timer.current = setTimeout(mandar, ESPERA_MS);
  }, []);

  const marcarVisto = useCallback(
    (produtoId: number) => {
      const { oficinaId: id, uf: estado, hoje: dia, anuncios } = atual.current;
      if (!id || !anuncios.length) return;
      const r = ler(id, dia);
      const novos = anunciosParaContar(produtoId, anuncios, estado, dia, [...r.vistos, ...fila.current]);
      if (!novos.length) return;
      for (const x of novos) fila.current.add(x);
      if (!timer.current) timer.current = setTimeout(mandar, ESPERA_MS);
    },
    [mandar]
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const produtoId = alvos.current.get(e.target);
          o.unobserve(e.target);
          alvos.current.delete(e.target);
          if (produtoId != null) marcarVisto(produtoId);
        }
      },
      { threshold: 0.5 }
    );
    observador.current = o;
    for (const el of alvos.current.keys()) o.observe(el);
    return () => {
      o.disconnect();
      observador.current = null;
    };
  }, [marcarVisto]);

  // ao sair da Loja, o que estava na fila vai na hora; ao trocar de oficina, a fila era da outra
  useEffect(() => {
    const id = oficinaId;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (atual.current.oficinaId === id) mandar();
      else fila.current.clear();
    };
  }, [oficinaId, mandar]);

  const observar = useCallback(
    (el: Element | null, produtoId: number) => {
      if (!el || !atual.current.oficinaId) return () => {};
      if (!observador.current) {
        // sem IntersectionObserver (navegador antigo): conta ao aparecer
        if (typeof IntersectionObserver === 'undefined') marcarVisto(produtoId);
        else alvos.current.set(el, produtoId);
        return () => alvos.current.delete(el);
      }
      alvos.current.set(el, produtoId);
      observador.current.observe(el);
      return () => {
        alvos.current.delete(el);
        observador.current?.unobserve(el);
      };
    },
    [marcarVisto]
  );

  const clicar = useCallback(
    (produtoId: number) => {
      const { oficinaId: id, uf: estado, hoje: dia, anuncios } = atual.current;
      if (!id) return;
      const r = ler(id, dia);
      const anuncio = anunciosDoProduto(produtoId, anuncios, estado, dia).find((a) => !r.cliques.includes(a.impulsoId));
      if (!anuncio) return;
      gravar({ ...r, cliques: [...r.cliques, anuncio.impulsoId] });
      void cliqueNoAnuncio({ impulsoId: anuncio.impulsoId })
        .then((c) => {
          if (c.ok && c.esgotado) esgotar(anuncio.impulsoId);
        })
        .catch(() => {});
    },
    [esgotar]
  );

  const valor = useMemo(() => ({ observar, clicar }), [observar, clicar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAnuncios(): Anuncios {
  return useContext(Contexto);
}

/**
 * O ref para o cartão de um produto: quando ele é patrocinado (`ativo`), conta como visto ao
 * aparecer na tela.
 */
export function useVistoNaVitrine(produtoId: number, ativo: boolean): (el: Element | null) => void {
  const { observar } = useAnuncios();
  const desligar = useRef<(() => void) | null>(null);
  return useCallback(
    (el: Element | null) => {
      desligar.current?.();
      desligar.current = ativo && el ? observar(el, produtoId) : null;
    },
    [observar, produtoId, ativo]
  );
}
