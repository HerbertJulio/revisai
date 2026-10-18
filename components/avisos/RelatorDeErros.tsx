'use client';

import { useEffect } from 'react';
import { LIMITES_DO_RELATO, limparTexto, type OrigemDoErro } from '@/lib/avisos/erros';

// Manda para o servidor os erros que acontecem nas telas (sem dados pessoais: o texto é limpo
// aqui e de novo no servidor). No máximo 10 por página aberta e sem repetir o mesmo erro.

const enviados = new Set<string>();
let total = 0;

/** Relata um erro (também serve para as telas de erro do app chamarem). */
export function relatarErro(erro: unknown, origem: OrigemDoErro = 'tela'): void {
  try {
    if (total >= 10 || typeof window === 'undefined') return;
    const e = erro instanceof Error ? erro : new Error(typeof erro === 'string' ? erro : 'Erro sem mensagem');
    const mensagem = limparTexto(`${e.name && e.name !== 'Error' ? `${e.name}: ` : ''}${e.message || 'Erro sem mensagem'}`).slice(0, LIMITES_DO_RELATO.mensagem);
    const chave = `${origem}|${mensagem}`;
    if (enviados.has(chave)) return;
    enviados.add(chave);
    total++;
    const corpo = JSON.stringify({
      mensagem,
      pilha: e.stack ? limparTexto(e.stack.split('\n').slice(0, LIMITES_DO_RELATO.linhas).join('\n')).slice(0, LIMITES_DO_RELATO.pilha) : null,
      rota: location.pathname,
      origem,
      versao: document.documentElement.dataset.versao ?? null
    });
    const blob = new Blob([corpo], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/erros', blob)) void fetch('/api/erros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {});
  } catch {
    // relatar erro nunca pode quebrar a tela
  }
}

/** Escuta os erros da janela e das promessas sem tratamento. Montar uma vez no layout. */
export function RelatorDeErros() {
  useEffect(() => {
    const aoErro = (ev: ErrorEvent) => {
      // erro de script de outro site (extensão do navegador) vem sem detalhe: não ajuda
      if (!ev.error && (!ev.message || ev.message === 'Script error.')) return;
      relatarErro(ev.error ?? ev.message, 'janela');
    };
    const aoRecusar = (ev: PromiseRejectionEvent) => relatarErro(ev.reason, 'promessa');
    window.addEventListener('error', aoErro);
    window.addEventListener('unhandledrejection', aoRecusar);
    return () => {
      window.removeEventListener('error', aoErro);
      window.removeEventListener('unhandledrejection', aoRecusar);
    };
  }, []);
  return null;
}
