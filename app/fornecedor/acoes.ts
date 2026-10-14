'use server';

// Ações do painel do fornecedor. Toda ação confere a sessão e mexe só no que é do fornecedor dela.

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fornecedorDaSessao } from '@/lib/fornecedor-servidor';
import { permitido } from '@/lib/limite';
import {
  enviarFotoDoProduto,
  mudarSituacaoDaParte,
  pedirImpulso,
  registrarPedidoDePlano,
  salvarProdutoDoFornecedor,
  salvarPromocaoDoFornecedor,
  type Gravacao
} from '@/lib/marketplace';
import { situacaoParteValida } from '@/lib/marketplace-dados';
import { COOKIE_FORNECEDOR } from '@/lib/sessao-fornecedor';

const FORA = { ok: false, erro: 'Sua sessão terminou. Abra de novo o link que a equipe do Revisaí mandou.' } as const;

function atualizar() {
  revalidatePath('/fornecedor', 'layout');
}

export async function sairDoPainel(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: COOKIE_FORNECEDOR, path: '/fornecedor' });
  redirect('/fornecedor');
}

export async function salvarProduto(entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!(await permitido(`fornecedor-produto-${id}`, 120, 60))) return { ok: false, erro: 'Muitas mudanças seguidas. Espere alguns minutos.' };
  const r = await salvarProdutoDoFornecedor(id, entrada);
  if (r.ok) atualizar();
  return r;
}

export async function enviarFoto(produtoId: number, dados: FormData): Promise<Gravacao<{ url: string }>> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!Number.isSafeInteger(produtoId) || produtoId < 1) return { ok: false, erro: 'Produto inválido.' };
  if (!(await permitido(`fornecedor-foto-${id}`, 60, 60))) return { ok: false, erro: 'Muitas fotos seguidas. Espere alguns minutos.' };
  const arquivo = dados.get('foto');
  if (!(arquivo instanceof File)) return { ok: false, erro: 'Escolha uma foto.' };
  const r = await enviarFotoDoProduto(id, produtoId, arquivo);
  if (r.ok) atualizar();
  return r;
}

export async function salvarPromocao(entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!(await permitido(`fornecedor-promocao-${id}`, 120, 60))) return { ok: false, erro: 'Muitas mudanças seguidas. Espere alguns minutos.' };
  const r = await salvarPromocaoDoFornecedor(id, entrada);
  if (r.ok) atualizar();
  return r;
}

export async function impulsionar(produtoId: number, dias: number, uf: string): Promise<Gravacao> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!Number.isSafeInteger(produtoId) || produtoId < 1) return { ok: false, erro: 'Produto inválido.' };
  const r = await pedirImpulso(id, produtoId, dias, uf);
  if (r.ok) atualizar();
  return r;
}

export async function mudarSituacaoPedidoFornecedor(parteId: number, status: string): Promise<Gravacao> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!Number.isSafeInteger(parteId) || parteId < 1 || !situacaoParteValida(status)) return { ok: false, erro: 'Pedido ou situação inválida.' };
  const r = await mudarSituacaoDaParte(id, parteId, status);
  if (r.ok) atualizar();
  return r;
}

export async function quererDestaque(): Promise<Gravacao> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!(await permitido(`fornecedor-plano-${id}`, 3, 60))) return { ok: false, erro: 'Já recebemos o seu pedido. A equipe fala com você em breve.' };
  return registrarPedidoDePlano(id);
}
