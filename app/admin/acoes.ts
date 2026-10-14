'use server';

// Ações do painel administrativo. Toda mudança confere a sessão de novo no servidor.

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { acessoDaEquipe, configEquipe, salvarSituacaoCadastro, salvarSituacaoPedido, type Gravacao } from '@/lib/equipe';
import { situacaoCadastroValida, situacaoPedidoValida } from '@/lib/equipe-dados';
import { permitido } from '@/lib/limite';
import {
  decidirImpulso,
  decidirReferencia,
  gerarAcessoFornecedor,
  salvarFornecedorAdmin,
  type Gravacao as GravacaoMarketplace
} from '@/lib/marketplace';
import { COOKIE_EQUIPE, criarSessao, DURACAO_SESSAO_MS, senhaConfere } from '@/lib/sessao-equipe';

export interface EstadoEntrada {
  erro: string | null;
}

function destinoSeguro(valor: FormDataEntryValue | null): string {
  const d = typeof valor === 'string' ? valor : '';
  return /^\/admin(\/[a-z-]+)?$/.test(d) ? d : '/admin';
}

export async function entrar(_anterior: EstadoEntrada, dados: FormData): Promise<EstadoEntrada> {
  const c = configEquipe();
  if (!c) return { erro: 'O painel administrativo ainda não foi configurado.' };
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
    path: '/admin',
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000)
  });
  redirect(destinoSeguro(dados.get('voltar')));
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: COOKIE_EQUIPE, path: '/admin' });
  redirect('/admin');
}

const SESSAO_TERMINOU: Gravacao = { ok: false, erro: 'Sua sessão terminou. Atualize a página e entre de novo.' };

export async function mudarSituacaoPedido(id: number, status: string): Promise<Gravacao> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_TERMINOU;
  if (!Number.isSafeInteger(id) || id < 1 || !situacaoPedidoValida(status)) return { ok: false, erro: 'Pedido ou situação inválida.' };
  const r = await salvarSituacaoPedido(id, status);
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

export async function mudarSituacaoCadastro(id: number, situacao: string): Promise<Gravacao> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_TERMINOU;
  if (!Number.isSafeInteger(id) || id < 1 || !situacaoCadastroValida(situacao)) return { ok: false, erro: 'Cadastro ou situação inválida.' };
  const r = await salvarSituacaoCadastro(id, situacao);
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

// ---------------------------------------------------------------- marketplace

const SESSAO_FIM = { ok: false, erro: 'Sua sessão terminou. Atualize a página e entre de novo.' } as const;

export async function salvarFornecedor(entrada: unknown): Promise<GravacaoMarketplace<{ id: number }>> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_FIM;
  const r = await salvarFornecedorAdmin(entrada);
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

/** Gera o link de acesso do fornecedor ao painel dele. O link só aparece agora; o banco guarda o hash. */
export async function gerarLinkDoFornecedor(fornecedorId: number): Promise<GravacaoMarketplace<{ link: string }>> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_FIM;
  if (!Number.isSafeInteger(fornecedorId) || fornecedorId < 1) return { ok: false, erro: 'Fornecedor inválido.' };
  const r = await gerarAcessoFornecedor(fornecedorId);
  if (!r.ok) return r;
  revalidatePath('/admin', 'layout');
  return { ok: true, link: `${await origemDoSite()}/fornecedor/entrar?c=${r.codigo}` };
}

export async function decidirPedidoDeImpulso(id: number, decisao: string, inicio: string | null): Promise<GravacaoMarketplace> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_FIM;
  if (!Number.isSafeInteger(id) || id < 1 || !['ativo', 'recusado', 'encerrado'].includes(decisao)) return { ok: false, erro: 'Pedido inválido.' };
  const r = await decidirImpulso(id, decisao as 'ativo' | 'recusado' | 'encerrado', inicio);
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

export async function decidirSugestaoDaBase(id: number, aprovar: boolean): Promise<GravacaoMarketplace> {
  if ((await acessoDaEquipe()) !== 'dentro') return SESSAO_FIM;
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, erro: 'Linha inválida.' };
  const r = await decidirReferencia(id, aprovar);
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

async function origemDoSite(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'revisai.howlks.com';
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocolo}://${host}`;
}
