'use server';

// Ações da conta: termos, convites, criar oficina ou loja, escolher em qual trabalhar e sair.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { cnpjValido, soNumeros } from '@/lib/cnpj';
import { COOKIE_LOJA, COOKIE_OFICINA, contaAtual } from '@/lib/conta';
import { mensagemDoBanco } from '@/lib/conta-dados';
import { normalizarTelefone } from '@/lib/formatos';
import { agenteDoPedido, clienteDoUsuario, ipDoPedido } from '@/lib/supabase-servidor';

export type Resultado = { ok: true } | { ok: false; erro: string };

const UMA_SEMANA = 60 * 60 * 24 * 400;

async function guardarEscolha(nome: string, valor: string) {
  const jar = await cookies();
  jar.set(nome, valor, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: UMA_SEMANA });
}

export async function aceitarTermos(documentos: string[]): Promise<Resultado> {
  const sb = await clienteDoUsuario();
  if (!sb) return { ok: false, erro: 'Entre na sua conta.' };
  const lista = documentos.filter((d) => ['termos', 'privacidade', 'contrato_loja', 'tratamento_dados'].includes(d));
  const { error } = await sb.rpc('aceitar_termos', { p_documentos: lista, p_ip: await ipDoPedido(), p_agente: await agenteDoPedido() });
  return error ? { ok: false, erro: mensagemDoBanco(error) } : { ok: true };
}

export async function responderConvite(id: string, aceitar: boolean): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: 'Convite inválido.' };
  const sb = await clienteDoUsuario();
  if (!sb) return { ok: false, erro: 'Entre na sua conta.' };
  const { error } = aceitar ? await sb.rpc('aceitar_convite', { p_id: id }) : await sb.rpc('recusar_convite', { p_id: id });
  return error ? { ok: false, erro: mensagemDoBanco(error) } : { ok: true };
}

const esquemaOficina = z.object({
  nome: z.string().trim().min(2, 'Escreva o nome da oficina.').max(120),
  whatsapp: z.string().trim().max(30),
  cidade: z.string().trim().max(80),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Escolha o estado.'),
  endereco: z.string().trim().max(160).optional().default('')
});

export async function criarOficina(entrada: unknown): Promise<Resultado & { id?: string }> {
  const r = esquemaOficina.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const whatsapp = normalizarTelefone(r.data.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Confira o WhatsApp da oficina, com DDD.' };
  const sb = await clienteDoUsuario();
  if (!sb) return { ok: false, erro: 'Entre na sua conta.' };
  const { data, error } = await sb.rpc('criar_oficina', { p_nome: r.data.nome, p_whatsapp: whatsapp, p_cidade: r.data.cidade, p_uf: r.data.uf, p_endereco: r.data.endereco });
  if (error || !data) return { ok: false, erro: mensagemDoBanco(error) };
  await sb.rpc('aceitar_termos', { p_documentos: ['tratamento_dados'], p_ip: await ipDoPedido(), p_agente: await agenteDoPedido() });
  await guardarEscolha(COOKIE_OFICINA, String(data));
  return { ok: true, id: String(data) };
}

const esquemaLoja = z.object({
  nome: z.string().trim().min(2, 'Escreva o nome da loja.').max(120),
  cnpj: z.string().trim(),
  whatsapp: z.string().trim().max(30),
  cidade: z.string().trim().max(80),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Escolha o estado.')
});

export async function criarLoja(entrada: unknown): Promise<Resultado & { id?: number }> {
  const r = esquemaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  if (!cnpjValido(r.data.cnpj)) return { ok: false, erro: 'Confira o CNPJ.' };
  const whatsapp = normalizarTelefone(r.data.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Confira o WhatsApp da loja, com DDD.' };
  const sb = await clienteDoUsuario();
  if (!sb) return { ok: false, erro: 'Entre na sua conta.' };
  const { data, error } = await sb.rpc('criar_loja', { p_nome: r.data.nome, p_cnpj: soNumeros(r.data.cnpj), p_whatsapp: whatsapp, p_cidade: r.data.cidade, p_uf: r.data.uf });
  if (error || data == null) return { ok: false, erro: error?.code === '23505' ? 'Esse CNPJ já tem loja no Revisaí. Peça ao dono para convidar você.' : mensagemDoBanco(error) };
  await sb.rpc('aceitar_termos', { p_documentos: ['contrato_loja'], p_ip: await ipDoPedido(), p_agente: await agenteDoPedido() });
  await guardarEscolha(COOKIE_LOJA, String(data));
  return { ok: true, id: Number(data) };
}

export async function abrirOficina(id: string): Promise<void> {
  const conta = await contaAtual();
  if (!conta?.oficinas.some((o) => o.id === id)) redirect('/conta');
  await guardarEscolha(COOKIE_OFICINA, id);
  redirect('/oficina');
}

export async function abrirLoja(id: number): Promise<void> {
  const conta = await contaAtual();
  if (!conta?.fornecedores.some((f) => f.id === id)) redirect('/conta');
  await guardarEscolha(COOKIE_LOJA, String(id));
  redirect('/fornecedor');
}

export async function sair(): Promise<void> {
  const sb = await clienteDoUsuario();
  await sb?.auth.signOut({ scope: 'local' });
  const jar = await cookies();
  jar.delete(COOKIE_OFICINA);
  jar.delete(COOKIE_LOJA);
  redirect('/');
}

/** Sai em todos os aparelhos (quando o celular foi perdido, por exemplo). */
export async function sairDeTodos(): Promise<void> {
  const sb = await clienteDoUsuario();
  await sb?.auth.signOut({ scope: 'global' });
  const jar = await cookies();
  jar.delete(COOKIE_OFICINA);
  jar.delete(COOKIE_LOJA);
  redirect('/');
}

export async function apagarMinhaConta(confirmacao: string): Promise<Resultado> {
  if (confirmacao.trim().toUpperCase() !== 'APAGAR') return { ok: false, erro: 'Escreva APAGAR para confirmar.' };
  const sb = await clienteDoUsuario();
  if (!sb) return { ok: false, erro: 'Entre na sua conta.' };
  const { error } = await sb.rpc('apagar_minha_conta');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  return { ok: true };
}
