import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { lerConta, type Conta, type LojaDaConta, type OficinaDaConta } from './conta-dados';
import { clienteDoUsuario, sessaoAtual } from './supabase-servidor';

export const COOKIE_OFICINA = 'revisai_oficina';
export const COOKIE_LOJA = 'revisai_loja';

/** A conta de quem entrou (oficinas, lojas, convites, equipe), ou null. Uma busca por requisição. */
export const contaAtual = cache(async (): Promise<Conta | null> => {
  const sessao = await sessaoAtual();
  if (!sessao) return null;
  const sb = await clienteDoUsuario();
  if (!sb) return null;
  const { data, error } = await sb.rpc('minha_conta');
  if (error) {
    console.error('[conta] minha_conta', error);
    return null;
  }
  return lerConta(data);
});

/** A oficina em que a pessoa está trabalhando (a escolhida no cookie, ou a primeira). */
export const oficinaEscolhida = cache(async (): Promise<OficinaDaConta | null> => {
  const conta = await contaAtual();
  if (!conta?.oficinas.length) return null;
  const jar = await cookies();
  const id = jar.get(COOKIE_OFICINA)?.value;
  return conta.oficinas.find((o) => o.id === id) ?? conta.oficinas[0];
});

export const lojaEscolhida = cache(async (): Promise<LojaDaConta | null> => {
  const conta = await contaAtual();
  if (!conta?.fornecedores.length) return null;
  const jar = await cookies();
  const id = Number(jar.get(COOKIE_LOJA)?.value);
  return conta.fornecedores.find((f) => f.id === id) ?? conta.fornecedores[0];
});

export type Acesso<T> = { ok: true; sb: SupabaseClient; conta: Conta } & T;
export type SemAcesso = { ok: false; erro: string };

const SAIU = 'Entre na sua conta para continuar.';

/** Para as ações da oficina: o cliente da pessoa e a oficina dela (o banco confere de novo). */
export async function acessoDaOficina(): Promise<Acesso<{ oficina: OficinaDaConta }> | SemAcesso> {
  const [conta, oficina, sb] = await Promise.all([contaAtual(), oficinaEscolhida(), clienteDoUsuario()]);
  if (!conta || !sb) return { ok: false, erro: SAIU };
  if (!oficina) return { ok: false, erro: 'Crie ou entre numa oficina primeiro.' };
  if (!oficina.ativa) return { ok: false, erro: 'Esta oficina está desativada.' };
  return { ok: true, sb, conta, oficina };
}

/** Para as ações da loja. */
export async function acessoDaLoja(): Promise<Acesso<{ loja: LojaDaConta }> | SemAcesso> {
  const [conta, loja, sb] = await Promise.all([contaAtual(), lojaEscolhida(), clienteDoUsuario()]);
  if (!conta || !sb) return { ok: false, erro: SAIU };
  if (!loja) return { ok: false, erro: 'Esta conta ainda não tem loja.' };
  return { ok: true, sb, conta, loja };
}
