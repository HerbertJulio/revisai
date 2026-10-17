'use client';

// O banco no navegador: a sessão (cookies, a mesma do servidor), a sincronização dos dados da
// oficina e o tempo real. O endereço e a chave pública vêm do servidor (não ficam no código).

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConfigPublica {
  url: string;
  chave: string;
  /** A chave do site do Turnstile, quando a verificação de pessoa está ligada no login. */
  captcha?: string | null;
}

let cliente: SupabaseClient | null = null;
let configDoCliente: string | null = null;

export function clienteNavegador(cfg: ConfigPublica): SupabaseClient {
  const assinatura = `${cfg.url}|${cfg.chave}`;
  if (!cliente || configDoCliente !== assinatura) {
    cliente = createBrowserClient(cfg.url, cfg.chave, { isSingleton: true });
    configDoCliente = assinatura;
  }
  return cliente;
}
