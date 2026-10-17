import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mensagemDaLoja } from './comum';
import { lerConvites, lerMembros, type ConviteDaLoja, type MembroDaLoja } from './dados';

// Quem trabalha na loja. O dono chama pessoas pelo e-mail (o convite aparece na conta delas),
// muda o papel e tira gente; o vendedor vê os colegas e pode sair. As regras estão no banco.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export interface EquipeDaLoja {
  membros: MembroDaLoja[];
  /** Só o dono vê os convites abertos. */
  convites: ConviteDaLoja[];
}

export async function equipeDaLoja(sb: SupabaseClient, fornecedorId: number, dono: boolean): Promise<EquipeDaLoja | null> {
  const [m, c] = await Promise.all([
    sb.from('fornecedor_membros').select('user_id, email, nome, papel, criado_em').eq('fornecedor_id', fornecedorId).order('criado_em'),
    dono
      ? sb.from('convites').select('id, email, papel, criado_em, expira_em, aceito_em').eq('fornecedor_id', fornecedorId).is('aceito_em', null).order('criado_em', { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (m.error || c.error) {
    console.error('[loja] equipe', m.error ?? c.error);
    return null;
  }
  return { membros: lerMembros(m.data), convites: lerConvites(c.data) };
}

export const esquemaConviteDaLoja = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Confira o e-mail.'),
  papel: z.enum(['dono', 'vendedor'])
});

export type ResultadoConvite = { ok: true; email: string } | { ok: false; erro: string; confirmarEmail?: boolean };

export async function convidarParaLoja(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<ResultadoConvite> {
  const r = esquemaConviteDaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o e-mail.' };
  const { error } = await sb.rpc('convidar', { p_tipo: 'fornecedor', p_alvo: String(fornecedorId), p_email: r.data.email, p_papel: r.data.papel });
  if (error) {
    if (error.code === 'RV020') return { ok: false, erro: 'Para chamar outro dono, confirme o código que vamos mandar para o seu e-mail.', confirmarEmail: true };
    if (error.code === 'P0001') return { ok: false, erro: 'Há convites demais esperando. Cancele os que não vão ser usados.' };
    console.error('[loja] convidar', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para convidar agora. Tente de novo.') };
  }
  return { ok: true, email: r.data.email };
}

export async function cancelarConviteDaLoja(sb: SupabaseClient, conviteId: string): Promise<Gravacao> {
  if (!z.uuid().safeParse(conviteId).success) return { ok: false, erro: 'Convite inválido.' };
  const { data, error } = await sb.rpc('cancelar_convite', { p_id: conviteId });
  if (error) {
    console.error('[loja] cancelar convite', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para cancelar agora. Tente de novo.') };
  }
  return data === false ? { ok: false, erro: 'Esse convite já foi usado ou cancelado.' } : { ok: true };
}

export async function tirarDaLoja(sb: SupabaseClient, fornecedorId: number, userId: string): Promise<Gravacao> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, erro: 'Pessoa inválida.' };
  const { error } = await sb.rpc('remover_membro', { p_tipo: 'fornecedor', p_alvo: String(fornecedorId), p_user: userId });
  if (error) {
    console.error('[loja] tirar da loja', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para tirar agora. Tente de novo.') };
  }
  return { ok: true };
}

export type ResultadoPapel = { ok: true } | { ok: false; erro: string; confirmarEmail?: boolean };

export async function mudarPapelNaLoja(sb: SupabaseClient, fornecedorId: number, userId: string, papel: string): Promise<ResultadoPapel> {
  if (!z.uuid().safeParse(userId).success || (papel !== 'dono' && papel !== 'vendedor')) return { ok: false, erro: 'Pessoa ou papel inválido.' };
  const { data, error } = await sb.rpc('loja_mudar_papel', { p_fornecedor: fornecedorId, p_user: userId, p_papel: papel });
  if (error) {
    if (error.code === 'RV020') return { ok: false, erro: 'Para passar alguém a dono, confirme o código que vamos mandar para o seu e-mail.', confirmarEmail: true };
    console.error('[loja] papel', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para mudar agora. Tente de novo.') };
  }
  return data === false ? { ok: false, erro: 'Essa pessoa não está mais na loja.' } : { ok: true };
}
