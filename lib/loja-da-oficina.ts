import 'server-only';

// O que a loja da oficina busca só para a oficina da conta, com o cliente da pessoa (o banco só
// mostra o que é dela): as condições que cada loja combinou com a oficina (desconto ou preço fixo) e
// o saldo de cashback em cada loja.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CondicaoDaOficina } from './vitrine';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const numeroOuNulo = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export interface CondicoesDaOficina {
  condicoes: CondicaoDaOficina[];
  /** Saldo de cashback por loja (o id da loja em texto); pode ser negativo depois de um estorno. */
  saldos: Record<string, number>;
}

/** As condições e os saldos da oficina. Null só quando as duas buscas falham. */
export async function condicoesDaOficina(sb: SupabaseClient, oficinaId: string): Promise<CondicoesDaOficina | null> {
  if (!UUID.test(oficinaId)) return { condicoes: [], saldos: {} };
  const [c, s] = await Promise.all([
    sb.from('precos_por_oficina').select('fornecedor_id, produto_id, desconto_percentual, preco').eq('oficina_id', oficinaId).limit(2000),
    sb.rpc('saldos_de_cashback', { p_oficina: oficinaId })
  ]);
  if (c.error) console.error('[loja da oficina] condições', c.error);
  if (s.error) console.error('[loja da oficina] cashback', s.error);
  if (c.error && s.error) return null;
  const condicoes: CondicaoDaOficina[] = ((c.data ?? []) as Record<string, unknown>[]).flatMap((x) => {
    const fornecedorId = numeroOuNulo(x.fornecedor_id);
    if (fornecedorId == null) return [];
    return [{ fornecedorId, produtoId: numeroOuNulo(x.produto_id), descontoPercentual: numeroOuNulo(x.desconto_percentual), preco: numeroOuNulo(x.preco) }];
  });
  const saldos: Record<string, number> = {};
  for (const x of (Array.isArray(s.data) ? s.data : []) as Record<string, unknown>[]) {
    const loja = numeroOuNulo(x.fornecedor_id);
    const saldo = numeroOuNulo(x.saldo);
    if (loja != null && saldo != null && saldo !== 0) saldos[String(loja)] = Math.round(saldo * 100) / 100;
  }
  return { condicoes, saldos };
}
