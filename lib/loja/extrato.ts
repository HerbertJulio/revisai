import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lerExtratoDaLoja, type ExtratoDaLoja } from './dados';

// O extrato do mês da loja, como o banco calcula (a mesma conta que a equipe usa para cobrar).

export async function extratoDaLoja(sb: SupabaseClient, fornecedorId: number, mes: string): Promise<ExtratoDaLoja | null> {
  const { data, error } = await sb.rpc('extrato_da_loja', { p_fornecedor: fornecedorId, p_mes: mes });
  if (error) {
    console.error('[loja] extrato', error);
    return null;
  }
  return lerExtratoDaLoja(data);
}
