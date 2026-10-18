import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

// Os três jeitos do servidor falar com o banco:
// - clienteDoUsuario: como a pessoa que entrou (o banco aplica as regras dela);
// - clientePublico: sem conta, só o que é público (catálogo, links do cliente);
// - clienteSistema: o próprio servidor, com a chave do sistema, para o que roda sem ninguém
//   (webhook do WhatsApp, rotina diária, limites). O banco libera só o necessário para ela.

const SEM_SESSAO = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;

export interface ConfigSupabase {
  url: string;
  chave: string;
  /** A chave do site do Turnstile (pública), quando a verificação de pessoa está ligada no Supabase Auth. */
  captcha?: string | null;
}

export function configSupabase(): ConfigSupabase | null {
  const url = process.env.SUPABASE_URL ?? '';
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
  const captcha = (process.env.TURNSTILE_SITE_KEY ?? '').trim() || null;
  return url && chave ? { url, chave, captcha } : null;
}

/** A chave do sistema: SISTEMA_CHAVE, ou EQUIPE_CHAVE enquanto a troca não for feita. */
export function chaveDoSistema(): string | null {
  const k = (process.env.SISTEMA_CHAVE ?? process.env.EQUIPE_CHAVE ?? '').trim();
  return k.length >= 32 ? k : null;
}

let publico: SupabaseClient | null | undefined;
let sistema: SupabaseClient | null | undefined;

export function clientePublico(): SupabaseClient | null {
  if (publico !== undefined) return publico;
  const c = configSupabase();
  publico = c ? createClient(c.url, c.chave, SEM_SESSAO) : null;
  return publico;
}

export function clienteSistema(): SupabaseClient | null {
  if (sistema !== undefined) return sistema;
  const c = configSupabase();
  const k = chaveDoSistema();
  sistema = c && k ? createClient(c.url, c.chave, { ...SEM_SESSAO, global: { headers: { 'x-revisai-sistema': k } } }) : null;
  return sistema;
}

/**
 * A assinatura do IP para o banco: HMAC-SHA256 do IP com o hash da chave do sistema (o mesmo hash
 * que o banco guarda em privado.chaves). O banco só usa o IP do cabeçalho quando a assinatura bate.
 */
export function provaDoIp(ip: string): string | null {
  const k = chaveDoSistema();
  if (!k) return null;
  const segredo = createHash('sha256').update(k).digest('hex');
  return createHmac('sha256', segredo).update(ip).digest('hex');
}

/** O IP de quem fez a requisição (a Vercel põe o primeiro em x-forwarded-for). */
export async function ipDoPedido(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

export async function agenteDoPedido(): Promise<string> {
  const h = await headers();
  return (h.get('user-agent') ?? '').slice(0, 300);
}

/** Na área da equipe os cookies da sessão ficam fora do alcance do JavaScript da página. */
export const OPCOES_COOKIE_EQUIPE = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/' };

/**
 * O cliente como a pessoa que entrou, pelos cookies da sessão. Um por requisição.
 * `equipe` deixa os cookies só para o servidor (a área da equipe não usa o banco no navegador).
 */
export const clienteDoUsuario = cache(async (equipe = false): Promise<SupabaseClient | null> => {
  const c = configSupabase();
  if (!c) return null;
  const jar = await cookies();
  const ip = await ipDoPedido();
  const prova = provaDoIp(ip);
  return createServerClient(c.url, c.chave, {
    global: { headers: prova ? { 'x-revisai-ip': ip, 'x-revisai-ip-prova': prova } : { 'x-revisai-ip': ip } },
    cookies: {
      getAll: () => jar.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) jar.set(name, value, equipe ? { ...options, ...OPCOES_COOKIE_EQUIPE } : options);
        } catch {
          // em componente de servidor não dá para gravar cookie; o proxy renova a sessão
        }
      }
    }
  });
});

export interface Sessao {
  userId: string;
  email: string;
  /** aal2 = passou pelo segundo fator nesta sessão. */
  aal: 'aal1' | 'aal2';
  /** Quando a pessoa passou por cada método (segundos desde 1970). */
  metodos: { metodo: string; quando: number }[];
}

/** Quem entrou (conferido no banco de autenticação), ou null. */
export const sessaoAtual = cache(async (equipe = false): Promise<Sessao | null> => {
  const sb = await clienteDoUsuario(equipe);
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    const c = data.claims as { sub: string; email?: string; aal?: string; amr?: { method: string; timestamp: number }[] };
    return {
      userId: c.sub,
      email: (c.email ?? '').toLowerCase(),
      aal: c.aal === 'aal2' ? 'aal2' : 'aal1',
      metodos: Array.isArray(c.amr) ? c.amr.map((a) => ({ metodo: String(a.method), quando: Number(a.timestamp) })) : []
    };
  } catch {
    return null;
  }
});
