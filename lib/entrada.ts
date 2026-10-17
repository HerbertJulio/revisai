import 'server-only';
import { configSupabase } from './supabase-servidor';

/** Quais jeitos de entrar estão ligados no Supabase (o botão do Google só aparece se estiver). */
export async function provedoresDeEntrada(): Promise<{ google: boolean; email: boolean }> {
  const c = configSupabase();
  if (!c) return { google: false, email: false };
  try {
    const r = await fetch(`${c.url}/auth/v1/settings`, { headers: { apikey: c.chave }, next: { revalidate: 600 }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return { google: false, email: true };
    const j = (await r.json()) as { external?: Record<string, boolean> };
    return { google: !!j.external?.google, email: j.external?.email !== false };
  } catch {
    return { google: false, email: true };
  }
}

/** Só caminhos do próprio app (nada de mandar a pessoa para outro site depois de entrar). */
export function destinoSeguro(valor: string | null | undefined, padrao = '/conta'): string {
  if (!valor || !/^\/(oficina|fornecedor|conta|admin)(\/[A-Za-z0-9_-]*)*(\?[A-Za-z0-9_=&%-]*)?$/.test(valor)) return padrao;
  return valor;
}
