'use server';

// Ações do painel da equipe. Toda mudança confere a sessão de novo no servidor.

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { acessoDaEquipe, configEquipe, salvarSituacaoCadastro, salvarSituacaoPedido, type Gravacao } from '@/lib/equipe';
import { situacaoCadastroValida, situacaoPedidoValida } from '@/lib/equipe-dados';
import { permitido } from '@/lib/limite';
import { COOKIE_EQUIPE, criarSessao, DURACAO_SESSAO_MS, senhaConfere } from '@/lib/sessao-equipe';

export interface EstadoEntrada {
  erro: string | null;
}

function destinoSeguro(valor: FormDataEntryValue | null): string {
  const d = typeof valor === 'string' ? valor : '';
  return /^\/equipe(\/[a-z-]+)?$/.test(d) ? d : '/equipe';
}

export async function entrar(_anterior: EstadoEntrada, dados: FormData): Promise<EstadoEntrada> {
  const c = configEquipe();
  if (!c) return { erro: 'O painel da equipe ainda não foi configurado.' };
  if (!(await permitido('equipe-entrar', 8, 15))) return { erro: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
  if (!senhaConfere(String(dados.get('senha') ?? ''), c.senha)) {
    await new Promise((r) => setTimeout(r, 400));
    return { erro: 'Senha errada. Confira e tente de novo.' };
  }
  const jar = await cookies();
  jar.set(COOKIE_EQUIPE, criarSessao(c.chave, c.senha), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/equipe',
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000)
  });
  redirect(destinoSeguro(dados.get('voltar')));
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: COOKIE_EQUIPE, path: '/equipe' });
  redirect('/equipe');
}

const SESSAO_TERMINOU: Gravacao = { ok: false, erro: 'Sua sessão terminou. Atualize a página e entre de novo.' };

export async function mudarSituacaoPedido(id: number, status: string): Promise<Gravacao> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_TERMINOU;
  if (!Number.isSafeInteger(id) || id < 1 || !situacaoPedidoValida(status)) return { ok: false, erro: 'Pedido ou situação inválida.' };
  const r = await salvarSituacaoPedido(id, status);
  if (r.ok) revalidatePath('/equipe', 'layout');
  return r;
}

export async function mudarSituacaoCadastro(id: number, situacao: string): Promise<Gravacao> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_TERMINOU;
  if (!Number.isSafeInteger(id) || id < 1 || !situacaoCadastroValida(situacao)) return { ok: false, erro: 'Cadastro ou situação inválida.' };
  const r = await salvarSituacaoCadastro(id, situacao);
  if (r.ok) revalidatePath('/equipe', 'layout');
  return r;
}
