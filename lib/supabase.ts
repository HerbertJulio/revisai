import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null | undefined;

/**
 * Cliente do Supabase só no servidor, com a chave publicável (papel anon).
 * O navegador nunca fala direto com o banco: as regras de acesso (RLS) valem do mesmo jeito.
 */
export function supabaseServidor(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  cliente = url && chave ? createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
  return cliente;
}
