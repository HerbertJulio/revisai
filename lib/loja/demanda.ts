import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lerDemanda, type DemandaDaRegiao } from './dados';

// O que as oficinas do estado vão comprar, somado no banco: só oficinas com conta, só linhas com
// oficinas suficientes, com um pouco de ruído. A loja nunca vê quem são as oficinas.

export async function demandaDaLoja(sb: SupabaseClient, uf: string | null): Promise<DemandaDaRegiao | null> {
  if (!uf || !/^[A-Z]{2}$/.test(uf)) return null;
  const { data, error } = await sb.rpc('demanda_da_regiao', { p_uf: uf });
  if (error) {
    console.error('[loja] demanda', error);
    return null;
  }
  return lerDemanda(data);
}
