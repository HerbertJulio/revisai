import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { PapelEquipe } from '@/lib/conta-dados';
import { clienteDoUsuario, sessaoAtual, type Sessao } from '@/lib/supabase-servidor';
import { segundoFatorEmDia } from './segundo-fator';
import { temPapel } from './papeis';

export { HORAS_DO_SEGUNDO_FATOR, quandoPassouPeloApp, segundoFatorEmDia } from './segundo-fator';
export { temPapel } from './papeis';

// Quem está no painel da equipe. Toda página e toda ação passam por aqui: precisa ter entrado,
// ter passado pelo segundo fator (app autenticador) nas últimas 12 horas e ser da equipe com o
// papel certo. Quem não é da equipe vê "página não existe"; quem é, mas o código venceu, volta
// para confirmar o código do app. O banco confere tudo de novo (privado.eh_equipe).

export interface AcessoEquipe {
  sb: SupabaseClient;
  sessao: Sessao;
  papel: PapelEquipe;
  email: string;
  userId: string;
}

export type EstadoEquipe =
  | { tipo: 'dentro'; acesso: AcessoEquipe }
  /** entrou com o e-mail, falta (ou venceu) o código do app autenticador */
  | { tipo: 'confirmar'; sessao: Sessao; sb: SupabaseClient }
  | { tipo: 'fora' };

export const estadoDaEquipe = cache(async (): Promise<EstadoEquipe> => {
  const sessao = await sessaoAtual(true);
  if (!sessao) return { tipo: 'fora' };
  const sb = await clienteDoUsuario(true);
  if (!sb) return { tipo: 'fora' };
  if (!segundoFatorEmDia(sessao)) {
    const { data } = await sb.rpc('equipe_convidado');
    return data === true ? { tipo: 'confirmar', sessao, sb } : { tipo: 'fora' };
  }
  const { data, error } = await sb.rpc('minha_conta');
  const papel = (data as { equipe?: string | null } | null)?.equipe;
  if (error || !papel || !['admin', 'suporte', 'financeiro'].includes(papel)) return { tipo: 'fora' };
  return { tipo: 'dentro', acesso: { sb, sessao, papel: papel as PapelEquipe, email: sessao.email, userId: sessao.userId } };
});

/**
 * Para as páginas: devolve o acesso ou mostra "não existe" (quem não é da equipe ou não tem o
 * papel). Quem é da equipe e precisa confirmar o código do app vai para a entrada.
 */
export async function exigirEquipe(papeis?: readonly PapelEquipe[]): Promise<AcessoEquipe> {
  const e = await estadoDaEquipe();
  if (e.tipo === 'confirmar') redirect('/admin/entrar');
  if (e.tipo !== 'dentro' || !temPapel(e.acesso.papel, papeis)) notFound();
  return e.acesso;
}

export type SemAcessoEquipe = { ok: false; erro: string };

export const SESSAO_DA_EQUIPE_TERMINOU = 'Sua sessão terminou ou o código do app venceu. Atualize a página e entre de novo.';

/** Para as ações: o acesso, ou o erro para mostrar (a ação não muda nada). */
export async function equipeNaAcao(papeis?: readonly PapelEquipe[]): Promise<({ ok: true } & AcessoEquipe) | SemAcessoEquipe> {
  const e = await estadoDaEquipe();
  if (e.tipo !== 'dentro') return { ok: false, erro: SESSAO_DA_EQUIPE_TERMINOU };
  if (!temPapel(e.acesso.papel, papeis)) return { ok: false, erro: 'Seu papel na equipe não deixa fazer isso.' };
  return { ok: true, ...e.acesso };
}
