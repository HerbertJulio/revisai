import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mensagemDaLoja } from './comum';
import { COLUNAS_CASHBACK, lerMovimentosDeCashback, type MovimentoDeCashback } from './dados';

// O cashback que a loja dá: o percentual (só o dono muda, como o resto do cadastro) e o que já
// foi creditado às oficinas. O crédito em si o banco faz quando o pedido é entregue e pago.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export async function cashbackDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<MovimentoDeCashback[] | null> {
  const { data, error } = await sb.from('cashback_movimentos').select(COLUNAS_CASHBACK).eq('fornecedor_id', fornecedorId).order('criado_em', { ascending: false }).limit(500);
  if (error) {
    console.error('[loja] cashback', error);
    return null;
  }
  return lerMovimentosDeCashback(data);
}

export async function salvarCashback(sb: SupabaseClient, fornecedorId: number, percentual: number): Promise<Gravacao> {
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 10) return { ok: false, erro: 'O cashback vai de 0% a 10%.' };
  const { data, error } = await sb
    .from('fornecedores')
    .update({ cashback_percentual: Math.round(percentual * 100) / 100 })
    .eq('id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[loja] salvar cashback', error);
    return { ok: false, erro: error ? mensagemDaLoja(error, 'Não deu para salvar agora. Tente de novo.') : 'Loja não encontrada.' };
  }
  return { ok: true };
}

/** O que a loja deu (crédito menos estorno) a partir de um instante. */
export function cashbackDado(movimentos: MovimentoDeCashback[], desde?: string): number {
  const soma = movimentos
    .filter((m) => !desde || Date.parse(m.criadoEm) >= Date.parse(desde))
    .reduce((s, m) => s + (m.tipo === 'credito' ? m.valor : m.tipo === 'estorno' ? -m.valor : 0), 0);
  return Math.round(soma * 100) / 100;
}
