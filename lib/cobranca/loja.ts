import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lerPagamento } from './banco';
import { COLUNAS_PAGAMENTO, type LinhaPagamento } from './tipos';

/**
 * As cobranças do Revisaí para a loja (mensalidade e comissão de cada mês), as mais novas
 * primeiro. Com o cliente da pessoa, o banco só entrega as da loja de que ela é dona.
 */
export async function cobrancasDaLoja(sb: SupabaseClient, fornecedorId: number, limite = 24): Promise<LinhaPagamento[]> {
  const { data, error } = await sb
    .from('pagamentos')
    .select(COLUNAS_PAGAMENTO)
    .eq('tipo', 'loja')
    .eq('fornecedor_id', fornecedorId)
    .neq('situacao', 'cancelado')
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) {
    console.error('[cobranca] cobranças da loja', error.message);
    return [];
  }
  return (data ?? []).map((l) => lerPagamento(l as Record<string, unknown>));
}
