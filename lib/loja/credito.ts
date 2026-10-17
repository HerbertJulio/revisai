import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mensagemDaLoja } from './comum';
import { COLUNAS_FATURA, esquemaCredito, lerClientesComCredito, lerCreditosDaOficina, lerFaturas, type ClienteComCredito, type CreditoNaLoja, type Fatura } from './credito-dados';

// Venda faturada no servidor, sempre como a pessoa que entrou: o banco só devolve as faturas e os
// clientes da loja dela, só deixa o dono dar crédito e só para quem já comprou da loja.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export async function faturasDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<Fatura[] | null> {
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .select(COLUNAS_FATURA)
    .eq('fornecedor_id', fornecedorId)
    .eq('forma_pagamento', 'faturado')
    .order('criado_em', { ascending: false })
    .limit(1000);
  if (error) {
    console.error('[loja] faturas', error);
    return null;
  }
  return lerFaturas(data);
}

export async function clientesComCredito(sb: SupabaseClient, fornecedorId: number): Promise<ClienteComCredito[] | null> {
  const { data, error } = await sb.rpc('loja_creditos', { p_fornecedor: fornecedorId });
  if (error) {
    console.error('[loja] créditos', error);
    return null;
  }
  return lerClientesComCredito(data);
}

/** Dá, muda ou desliga o crédito de uma oficina (o banco confere: só o dono, só quem já comprou). */
export async function salvarCredito(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao> {
  const r = esquemaCredito.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o crédito.' };
  const c = r.data;
  const { error } = await sb.from('lojas_credito').upsert(
    { fornecedor_id: fornecedorId, oficina_id: c.oficinaId, limite: Math.round(c.limite * 100) / 100, prazo_dias: c.prazoDias, ativo: c.ativo },
    { onConflict: 'fornecedor_id,oficina_id' }
  );
  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'Só o dono da loja dá crédito, e só para oficinas que já compraram da loja.' };
    console.error('[loja] salvar crédito', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para salvar o crédito agora. Tente de novo.') };
  }
  return { ok: true };
}

/** As lojas que vendem faturado para a oficina, com o que ainda cabe (para o pedido). */
export async function creditoDaOficina(sb: SupabaseClient, oficinaId: string): Promise<CreditoNaLoja[] | null> {
  const { data, error } = await sb.rpc('credito_da_oficina', { p_oficina: oficinaId });
  if (error) {
    console.error('[oficina] crédito nas lojas', error);
    return null;
  }
  return lerCreditosDaOficina(data);
}
