'use client';

// Peças dos painéis da jornada da ordem no app da oficina.

import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SEM_CONTA } from './conta';

const CLASSE_IMPRIMINDO = 'imprimindo-so-a-area';

/**
 * O que só sai na impressão, por cima de tudo (até de uma folha aberta). Montada, imprime: na
 * página impressa ela é a única coisa. Depois de imprimir, avisa para desmontar.
 */
export function AreaDeImpressao({ children, aoTerminar }: { children: ReactNode; aoTerminar: () => void }) {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const terminar = useRef(aoTerminar);
  useEffect(() => {
    terminar.current = aoTerminar;
  });
  useEffect(() => setAlvo(document.body), []);
  useEffect(() => {
    if (!alvo) return;
    alvo.classList.add(CLASSE_IMPRIMINDO);
    const fim = () => {
      alvo.classList.remove(CLASSE_IMPRIMINDO);
      window.removeEventListener('afterprint', fim);
      terminar.current();
    };
    window.addEventListener('afterprint', fim);
    // deixa a área aparecer antes de abrir a impressão
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', fim);
      alvo.classList.remove(CLASSE_IMPRIMINDO);
    };
  }, [alvo]);
  if (!alvo) return null;
  return createPortal(
    <div className="area-de-impressao">
      <style>{`.area-de-impressao{display:none}@media print{body.${CLASSE_IMPRIMINDO}>*:not(.area-de-impressao){display:none!important}body.${CLASSE_IMPRIMINDO} dialog{display:none!important}body.${CLASSE_IMPRIMINDO}>.area-de-impressao{display:block!important;color:#000;background:#fff}@page{size:A4;margin:14mm}}`}</style>
      {children}
    </div>,
    alvo
  );
}

export function CaixaDoServico({ titulo, icone, acao, children, id }: { titulo: ReactNode; icone?: ReactNode; acao?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-3 rounded-xl px-3.5 py-3 ring-1 ring-linha" aria-label={typeof titulo === 'string' ? titulo : undefined}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-[16px]">
          {icone ? <span className="shrink-0 text-tinta-2">{icone}</span> : null}
          <span className="truncate">{titulo}</span>
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Sem conta, os links do cliente não existem: chama para entrar. */
export function AvisoSemConta({ texto = SEM_CONTA }: { texto?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-papel-2 px-3 py-2 text-[13.5px] text-tinta-2">
      {texto}
      <Link href="/entrar?para=/oficina" className="inline-flex items-center gap-1 font-semibold text-caneta hover:underline">
        <LogIn size={14} aria-hidden="true" /> Entrar
      </Link>
    </p>
  );
}

/**
 * Abre a janela já no toque (o navegador bloqueia a que abre depois de esperar a internet) e
 * leva para o endereço quando ele fica pronto; sem endereço, fecha.
 */
export function janelaParaDepois(): { ir: (url: string) => void; fechar: () => void } {
  let janela: Window | null = null;
  try {
    janela = window.open('', '_blank');
    if (janela) janela.opener = null;
  } catch {
    janela = null;
  }
  return {
    ir(url) {
      if (janela && !janela.closed) janela.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    },
    fechar() {
      try {
        janela?.close();
      } catch {}
    }
  };
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
