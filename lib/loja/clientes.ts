import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mensagemDaLoja } from './comum';
import { COLUNAS_CONDICAO, lerClientes, lerCondicoes, type ClienteDaLoja, type CondicaoDaOficina } from './dados';

// As oficinas que já compraram da loja e as condições combinadas com cada uma (desconto na loja
// toda, desconto num produto ou preço fixo num produto). O banco só deixa combinar com quem já comprou.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export async function clientesDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<ClienteDaLoja[] | null> {
  const { data, error } = await sb.rpc('loja_clientes', { p_fornecedor: fornecedorId });
  if (error) {
    console.error('[loja] clientes', error);
    return null;
  }
  return lerClientes(data);
}

export async function condicoesDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<CondicaoDaOficina[] | null> {
  const { data, error } = await sb.from('precos_por_oficina').select(COLUNAS_CONDICAO).eq('fornecedor_id', fornecedorId).order('atualizado_em', { ascending: false }).limit(5000);
  if (error) {
    console.error('[loja] condições', error);
    return null;
  }
  return lerCondicoes(data);
}

export const esquemaCondicao = z
  .object({
    oficinaId: z.uuid(),
    produtoId: z.number().int().positive().nullable(),
    tipo: z.enum(['desconto', 'preco']),
    valor: z.number().positive('Informe o valor.')
  })
  .refine((c) => c.tipo !== 'preco' || c.produtoId != null, { message: 'Preço fixo vale para um produto. Para a loja toda, use desconto.' })
  .refine((c) => c.tipo !== 'desconto' || c.valor <= 90, { message: 'O desconto vai até 90%.' })
  .refine((c) => c.tipo !== 'preco' || c.valor <= 100000, { message: 'Confira o preço.' });

/** Cria ou troca a condição daquela oficina (na loja toda ou no produto). */
export async function salvarCondicao(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao> {
  const r = esquemaCondicao.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira a condição.' };
  const c = r.data;
  const valor = Math.round(c.valor * 100) / 100;
  const { error } = await sb.from('precos_por_oficina').upsert(
    {
      fornecedor_id: fornecedorId,
      oficina_id: c.oficinaId,
      produto_id: c.produtoId,
      desconto_percentual: c.tipo === 'desconto' ? valor : null,
      preco: c.tipo === 'preco' ? valor : null
    },
    { onConflict: 'fornecedor_id,oficina_id,produto_id' }
  );
  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'Só dá para combinar condições com oficinas que já compraram da loja.' };
    console.error('[loja] salvar condição', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para salvar agora. Tente de novo.') };
  }
  return { ok: true };
}

export async function removerCondicao(sb: SupabaseClient, fornecedorId: number, id: number): Promise<Gravacao> {
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, erro: 'Condição inválida.' };
  const { error } = await sb.from('precos_por_oficina').delete().eq('id', id).eq('fornecedor_id', fornecedorId);
  if (error) {
    console.error('[loja] tirar condição', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para tirar agora. Tente de novo.') };
  }
  return { ok: true };
}
