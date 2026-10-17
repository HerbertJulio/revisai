'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Publica (ou atualiza) o que o cliente vê pelo link. O token só volta na criação: depois disso
 * a mesma referência só troca os dados, e o endereço guardado continua valendo.
 */
export async function publicarLink(
  sb: SupabaseClient,
  oficinaId: string,
  tipo: 'pagamento' | 'clube',
  ref: string,
  dados: object,
  dias: number,
  novo = false
): Promise<{ token: string | null; codigo: string | null }> {
  const { data, error } = await sb.rpc('publicar_link', { p_oficina: oficinaId, p_tipo: tipo, p_ref: ref, p_dados: dados, p_dias: dias, p_placa: null, p_novo: novo });
  if (error) throw error;
  const d = (data ?? {}) as { token?: string | null; codigo?: string | null };
  return { token: d.token ?? null, codigo: d.codigo ?? null };
}
