'use client';

// A verificação de que é uma pessoa (Cloudflare Turnstile) antes de mandar o código de login por
// e-mail: sem ela, um robô pedindo códigos para milhares de e-mails gastaria a cota de e-mails do
// projeto e travaria a entrada de todo mundo. Só aparece quando a chave do site está configurada
// (TURNSTILE_SITE_KEY) e, na maioria das vezes, passa sozinha, sem a pessoa clicar em nada.

import { useEffect, useRef } from 'react';

interface Turnstile {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let carregando: Promise<void> | null = null;

function carregar(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sem janela'));
  if (window.turnstile) return Promise.resolve();
  carregando ??= new Promise<void>((pronto, falhou) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => pronto();
    s.onerror = () => {
      carregando = null;
      falhou(new Error('não carregou'));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

/**
 * Mostra o desafio (quando precisa) e entrega o token em `aoResolver` (null quando venceu ou
 * falhou). Cada token vale uma vez: mude `rodada` depois de usar, para pedir outro.
 */
export function Captcha({ chave, aoResolver, rodada = 0 }: { chave: string; aoResolver: (token: string | null) => void; rodada?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const avisar = useRef(aoResolver);
  avisar.current = aoResolver;

  useEffect(() => {
    let vivo = true;
    carregar()
      .then(() => {
        if (!vivo || !caixa.current || !window.turnstile) return;
        id.current = window.turnstile.render(caixa.current, {
          sitekey: chave,
          language: 'pt-br',
          appearance: 'interaction-only',
          callback: (t: string) => avisar.current(t),
          'expired-callback': () => avisar.current(null),
          'error-callback': () => avisar.current(null)
        });
      })
      .catch(() => avisar.current(null));
    return () => {
      vivo = false;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, [chave]);

  useEffect(() => {
    if (rodada > 0 && id.current && window.turnstile) {
      avisar.current(null);
      window.turnstile.reset(id.current);
    }
  }, [rodada]);

  return <div ref={caixa} className="flex justify-center empty:hidden" />;
}
