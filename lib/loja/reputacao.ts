import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lerReputacoes, type Reputacao } from './dados';

// A reputação das lojas nos últimos 90 dias (cancelamentos da loja, atrasos depois de confirmar e
// o tempo para confirmar), calculada no banco. É pública: a oficina vê na vitrine; a loja, no painel.

export async function reputacoesDasLojas(sb: SupabaseClient, ids: number[]): Promise<Map<number, Reputacao>> {
  const unicos = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))].slice(0, 100);
  if (!unicos.length) return new Map();
  const { data, error } = await sb.rpc('reputacao_das_lojas', { p_ids: unicos });
  if (error) {
    console.error('[loja] reputação', error);
    return new Map();
  }
  return lerReputacoes(data);
}

export async function reputacaoDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<Reputacao | null> {
  return (await reputacoesDasLojas(sb, [fornecedorId])).get(fornecedorId) ?? null;
}
