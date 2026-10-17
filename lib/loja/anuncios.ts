import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { lerMetricasDosAnuncios, type MetricaDoAnuncio } from './dados';

// Anúncios (impulsos) da loja: os números para o painel da loja e o que a vitrine da oficina chama
// ao mostrar e ao clicar num anúncio. As regras (um por oficina por dia, teto do dia) estão no banco.

export async function metricasDosAnuncios(sb: SupabaseClient, fornecedorId: number, dias = 30): Promise<Map<number, MetricaDoAnuncio>> {
  const { data, error } = await sb.rpc('metricas_dos_anuncios', { p_fornecedor: fornecedorId, p_dias: dias });
  if (error) {
    console.error('[loja] métricas dos anúncios', error);
    return new Map();
  }
  return lerMetricasDosAnuncios(data);
}

// ---------------------------------------------------------------- para a vitrine da oficina

/** Dos anúncios que a vitrine vai mostrar, os que ainda têm teto hoje (os por período sempre têm). */
export async function anunciosComOrcamento(sb: SupabaseClient, ids: number[]): Promise<Set<number>> {
  const unicos = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))].slice(0, 200);
  if (!unicos.length) return new Set();
  const { data, error } = await sb.rpc('anuncios_com_orcamento', { p_impulsos: unicos });
  if (error) {
    console.error('[anúncios] orçamento', error);
    return new Set(unicos);
  }
  return new Set((Array.isArray(data) ? data : []).map(Number));
}

/** A oficina viu estes anúncios (conta uma vez por dia). Com o cliente da pessoa da oficina. */
export async function registrarImpressoes(sb: SupabaseClient, ids: number[], oficinaId?: string): Promise<number> {
  const unicos = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))].slice(0, 50);
  if (!unicos.length) return 0;
  const { data, error } = await sb.rpc('registrar_impressoes', { p_impulsos: unicos, p_oficina: oficinaId ?? null });
  if (error) {
    console.error('[anúncios] impressões', error);
    return 0;
  }
  return Number(data) || 0;
}

const esquemaClique = z.object({ registrado: z.boolean(), cobrado: z.number().optional(), esgotado: z.boolean().optional(), motivo: z.string().optional() });
export type CliqueRegistrado = z.infer<typeof esquemaClique>;

/** A oficina clicou no anúncio. */
export async function registrarClique(sb: SupabaseClient, impulsoId: number, oficinaId?: string): Promise<CliqueRegistrado | null> {
  if (!Number.isSafeInteger(impulsoId) || impulsoId < 1) return null;
  const { data, error } = await sb.rpc('registrar_clique', { p_impulso: impulsoId, p_oficina: oficinaId ?? null });
  if (error) {
    console.error('[anúncios] clique', error);
    return null;
  }
  const r = esquemaClique.safeParse(data);
  return r.success ? r.data : null;
}
