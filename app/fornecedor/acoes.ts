'use server';

// Ações do painel do fornecedor. Toda ação confere a sessão e mexe só no que é do fornecedor dela.

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { responderAlerta } from '@/lib/alertas';
import { confirmarPagamento, saidaParaEntrega, salvarPixDaLoja } from '@/lib/entregas';
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

export async function responderAlertaPreco(entrada: unknown): Promise<Gravacao> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!(await permitido(`fornecedor-alerta-${id}`, 120, 60))) return { ok: false, erro: 'Muitas respostas seguidas. Espere alguns minutos.' };
  const r = await responderAlerta(id, entrada);
  if (r.ok) atualizar();
  return r;
}

export async function salvarChavePix(entrada: unknown): Promise<Gravacao> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!(await permitido(`fornecedor-pix-${id}`, 20, 60))) return { ok: false, erro: 'Muitas mudanças seguidas. Espere alguns minutos.' };
  const r = await salvarPixDaLoja(id, entrada);
  if (r.ok) atualizar();
  return r;
}

/** Marca que o pedido saiu e devolve o código do link do entregador (só aparece agora). */
export async function marcarSaida(parteId: number, previsao: string): Promise<Gravacao<{ token: string }>> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!Number.isSafeInteger(parteId) || parteId < 1) return { ok: false, erro: 'Pedido inválido.' };
  if (!(await permitido(`fornecedor-saida-${id}`, 60, 60))) return { ok: false, erro: 'Muitas mudanças seguidas. Espere alguns minutos.' };
  const r = await saidaParaEntrega(id, parteId, String(previsao ?? '').slice(0, 40));
  if (r.ok) atualizar();
  return r;
}

export async function confirmarPagamentoParte(parteId: number, confirmado: boolean): Promise<Gravacao> {
  const id = await fornecedorDaSessao();
  if (!id) return FORA;
  if (!Number.isSafeInteger(parteId) || parteId < 1) return { ok: false, erro: 'Pedido inválido.' };
  const r = await confirmarPagamento(id, parteId, confirmado === true);
  if (r.ok) atualizar();
  return r;
}
