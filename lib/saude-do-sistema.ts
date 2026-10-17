import 'server-only';
import { clientePublico } from './supabase-servidor';

// Conferências rápidas de que o sistema responde: usadas pela rota de saúde (monitor) e pela
// página de status. Cada uma tem 3 segundos de prazo e nunca lança erro.

export interface Conferencia {
  ok: boolean;
  ms: number;
}

/** Uma consulta leve no banco. */
export async function conferirBanco(): Promise<Conferencia> {
  const inicio = Date.now();
  const sb = clientePublico();
  if (!sb) return { ok: false, ms: 0 };
  try {
    const { error } = await sb.from('fornecedores').select('id').limit(1).abortSignal(AbortSignal.timeout(3000));
    return { ok: !error, ms: Date.now() - inicio };
  } catch {
    return { ok: false, ms: Date.now() - inicio };
  }
}

/** O serviço de login (Supabase Auth) responde. */
export async function conferirLogin(): Promise<Conferencia> {
  const inicio = Date.now();
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return { ok: false, ms: 0 };
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, { headers: { apikey: chave }, cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return { ok: r.ok, ms: Date.now() - inicio };
  } catch {
    return { ok: false, ms: Date.now() - inicio };
  }
}
