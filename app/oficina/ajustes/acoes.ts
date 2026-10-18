'use server';

// Ajustes da conta e da equipe da oficina: quem está na oficina, os convites, os papéis, sair da
// oficina ou da conta e apagar a oficina. Tudo com a sessão de quem entrou; o banco confere cada
// permissão de novo (o dono muda papéis e tira pessoas, o gerente convida mecânicos).

import { cookies } from 'next/headers';
import { z } from 'zod';
import { COOKIE_LOJA, COOKIE_OFICINA, contaAtual, oficinaEscolhida } from '@/lib/conta';
import { mensagemDoBanco, type Conta, type OficinaDaConta, type PapelOficina } from '@/lib/conta-dados';
import { permitido } from '@/lib/limite';
import { clienteDoUsuario } from '@/lib/supabase-servidor';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Feito<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export interface MembroDaOficina {
  userId: string;
  email: string;
  nome: string | null;
  papel: PapelOficina;
  desde: string;
}

export interface ConviteAberto {
  id: string;
  email: string;
  papel: PapelOficina;
  expiraEm: string;
}

export interface EquipeDaOficina {
  membros: MembroDaOficina[];
  convites: ConviteAberto[];
  /** Quando a oficina vai ser apagada (o dono pediu), ou null. */
  excluirEm: string | null;
}

const SAIU = 'Entre na sua conta para continuar.';
const PAPEIS = ['dono', 'gerente', 'mecanico'] as const;

/** A oficina escolhida, mesmo desativada (para cancelar a exclusão e para sair dela). */
async function minhaOficina(): Promise<{ ok: true; sb: SupabaseClient; conta: Conta; oficina: OficinaDaConta } | { ok: false; erro: string }> {
  const [conta, oficina, sb] = await Promise.all([contaAtual(), oficinaEscolhida(), clienteDoUsuario()]);
  if (!conta || !sb) return { ok: false, erro: SAIU };
  if (!oficina) return { ok: false, erro: 'Crie ou entre numa oficina primeiro.' };
  return { ok: true, sb, conta, oficina };
}

function papel(v: unknown): PapelOficina {
  return PAPEIS.includes(v as PapelOficina) ? (v as PapelOficina) : 'mecanico';
}

export async function equipeDaOficina(): Promise<Feito<{ equipe: EquipeDaOficina }>> {
  const a = await minhaOficina();
  if (!a.ok) return a;
  const [m, c, o] = await Promise.all([
    a.sb.from('oficina_membros').select('user_id, email, nome, papel, criado_em').eq('oficina_id', a.oficina.id).order('criado_em'),
    // o banco só mostra os convites ao dono e ao gerente
    a.sb.from('convites').select('id, email, papel, expira_em').eq('oficina_id', a.oficina.id).is('aceito_em', null).gt('expira_em', new Date().toISOString()).order('criado_em'),
    a.sb.from('oficinas').select('excluir_em').eq('id', a.oficina.id).maybeSingle()
  ]);
  if (m.error) {
    console.error('[ajustes] membros', m.error);
    return { ok: false, erro: mensagemDoBanco(m.error, 'Não deu para abrir a equipe agora.') };
  }
  return {
    ok: true,
    equipe: {
      membros: ((m.data ?? []) as { user_id: string; email: string | null; nome: string | null; papel: string; criado_em: string }[]).map((x) => ({
        userId: x.user_id,
        email: x.email ?? '',
        nome: x.nome,
        papel: papel(x.papel),
        desde: x.criado_em
      })),
      convites: ((c.data ?? []) as { id: string; email: string; papel: string; expira_em: string }[]).map((x) => ({ id: x.id, email: x.email, papel: papel(x.papel), expiraEm: x.expira_em })),
      excluirEm: ((o.data ?? null) as { excluir_em: string | null } | null)?.excluir_em ?? null
    }
  };
}

const esquemaConvite = z.object({
  email: z.string().trim().toLowerCase().max(160).pipe(z.email('Confira o e-mail.')),
  papel: z.enum(PAPEIS)
});

export async function convidarParaOficina(email: string, papelPedido: string): Promise<Feito<{ email: string }>> {
  const r = esquemaConvite.safeParse({ email, papel: papelPedido });
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o e-mail.' };
  if (!(await permitido('oficina-convidar', 30, 60))) return { ok: false, erro: 'Muitos convites seguidos. Espere alguns minutos.' };
  const a = await minhaOficina();
  if (!a.ok) return a;
  if (!a.oficina.ativa) return { ok: false, erro: 'A oficina está desativada.' };
  // quem já é da oficina muda de papel na lista, não por convite (o convite trocaria o papel)
  const { data: ja } = await a.sb.from('oficina_membros').select('user_id').eq('oficina_id', a.oficina.id).eq('email', r.data.email).limit(1);
  if (ja?.length) return { ok: false, erro: 'Essa pessoa já é da oficina. Para mudar o papel dela, use a lista da equipe.' };
  const { error } = await a.sb.rpc('convidar', { p_tipo: 'oficina', p_alvo: a.oficina.id, p_email: r.data.email, p_papel: r.data.papel });
  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'O dono convida qualquer papel; o gerente convida só mecânicos.' };
    if (error.code === 'P0001') return { ok: false, erro: 'Há convites demais em aberto. Cancele os que não vão ser usados.' };
    console.error('[ajustes] convidar', error);
    return { ok: false, erro: mensagemDoBanco(error, 'Não deu para convidar agora. Tente de novo.') };
  }
  return { ok: true, email: r.data.email };
}

export async function cancelarConviteDaOficina(id: string): Promise<Feito> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: 'Convite inválido.' };
  const a = await minhaOficina();
  if (!a.ok) return a;
  const { data, error } = await a.sb.rpc('cancelar_convite', { p_id: id });
  if (error) return { ok: false, erro: mensagemDoBanco(error, 'Não deu para cancelar agora.') };
  return data ? { ok: true } : { ok: false, erro: 'Esse convite já foi usado ou cancelado.' };
}

export async function mudarPapelNaOficina(userId: string, papelNovo: string): Promise<Feito> {
  if (!z.uuid().safeParse(userId).success || !PAPEIS.includes(papelNovo as PapelOficina)) return { ok: false, erro: 'Pedido inválido.' };
  const a = await minhaOficina();
  if (!a.ok) return a;
  const { data, error } = await a.sb.rpc('mudar_papel', { p_oficina: a.oficina.id, p_user: userId, p_papel: papelNovo });
  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'Só o dono muda os papéis.' };
    if (error.code === 'P0001') return { ok: false, erro: 'A oficina precisa de pelo menos um dono. Passe o papel de dono para outra pessoa antes.' };
    return { ok: false, erro: mensagemDoBanco(error, 'Não deu para mudar agora.') };
  }
  return data ? { ok: true } : { ok: false, erro: 'Essa pessoa não está mais na oficina.' };
}

export async function tirarDaOficina(userId: string): Promise<Feito> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, erro: 'Pedido inválido.' };
  const a = await minhaOficina();
  if (!a.ok) return a;
  if (userId === a.conta.usuario.id) return { ok: false, erro: 'Para sair você mesmo, use Sair desta oficina.' };
  const { data, error } = await a.sb.rpc('remover_membro', { p_tipo: 'oficina', p_alvo: a.oficina.id, p_user: userId });
  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'Só o dono tira alguém da oficina.' };
    if (error.code === 'P0001') return { ok: false, erro: 'A oficina precisa de pelo menos um dono.' };
    return { ok: false, erro: mensagemDoBanco(error, 'Não deu para tirar agora.') };
  }
  return data ? { ok: true } : { ok: false, erro: 'Essa pessoa já não estava na oficina.' };
}

/** A pessoa sai da oficina (o último dono não sai: passa o papel antes ou apaga a oficina). */
export async function sairDaOficina(): Promise<Feito> {
  const a = await minhaOficina();
  if (!a.ok) return a;
  const { error } = await a.sb.rpc('remover_membro', { p_tipo: 'oficina', p_alvo: a.oficina.id, p_user: a.conta.usuario.id });
  if (error) {
    if (error.code === 'P0001') return { ok: false, erro: 'Você é o único dono. Passe o papel de dono para outra pessoa antes de sair, ou apague a oficina.' };
    return { ok: false, erro: mensagemDoBanco(error, 'Não deu para sair agora.') };
  }
  (await cookies()).delete(COOKIE_OFICINA);
  return { ok: true };
}

/** O dono pede para apagar a oficina: ela sai do ar na hora e é apagada de vez em 30 dias. */
export async function pedirExclusaoDaOficina(confirmacao: string): Promise<Feito<{ quando: string }>> {
  if (String(confirmacao ?? '').trim().toUpperCase() !== 'APAGAR') return { ok: false, erro: 'Escreva APAGAR para confirmar.' };
  const a = await minhaOficina();
  if (!a.ok) return a;
  if (a.oficina.papel !== 'dono') return { ok: false, erro: 'Só o dono apaga a oficina.' };
  const { data, error } = await a.sb.rpc('oficina_pedir_exclusao', { p_oficina: a.oficina.id });
  if (error) return { ok: false, erro: mensagemDoBanco(error, 'Não deu para pedir agora. Tente de novo.') };
  return { ok: true, quando: String(data ?? '') };
}

export async function cancelarExclusaoDaOficina(): Promise<Feito> {
  const a = await minhaOficina();
  if (!a.ok) return a;
  const { data, error } = await a.sb.rpc('oficina_cancelar_exclusao', { p_oficina: a.oficina.id });
  if (error) return { ok: false, erro: mensagemDoBanco(error, 'Não deu para cancelar agora.') };
  return data ? { ok: true } : { ok: false, erro: 'Não há exclusão para cancelar (ou o prazo já passou).' };
}

/** Sai da conta neste aparelho, ou em todos. Quem chama apaga a cópia dos dados do aparelho. */
export async function sairDaConta(todos: boolean): Promise<Feito> {
  const sb = await clienteDoUsuario();
  if (sb) {
    const { error } = await sb.auth.signOut({ scope: todos ? 'global' : 'local' });
    if (error && todos) return { ok: false, erro: 'Não deu para sair dos outros aparelhos agora. Tente de novo.' };
  }
  const jar = await cookies();
  jar.delete(COOKIE_OFICINA);
  jar.delete(COOKIE_LOJA);
  return { ok: true };
}
