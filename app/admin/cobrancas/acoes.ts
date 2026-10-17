'use server';

// Ações do financeiro na cobrança. Lançar, marcar como pago e cancelar passam pelo banco como a
// pessoa (o banco confere o papel de novo); o que fala com o gateway (Pix da loja, nota fiscal,
// cancelar a assinatura) grava pela chave do sistema depois de conferir o papel aqui.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  agendarCobrancasRecorrentes,
  cancelarPro,
  cobrarLoja,
  notaDoPagamentoMarcado,
  reemitirNota,
  reprocessarAvisos,
  type Res
} from '@/lib/cobranca/servidor';
import { mensagemDoBanco } from '@/lib/conta-dados';
import { PODE } from '@/lib/equipe/papeis';
import { equipeNaAcao } from '@/lib/equipe/sessao';

const CAMINHO = '/admin/cobrancas';
const uuid = z.uuid();
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

async function financeiro() {
  return equipeNaAcao(PODE.mudarPlano);
}

export async function marcarComoPago(pagamentoId: string): Promise<Res> {
  const a = await financeiro();
  if (!a.ok) return a;
  if (!uuid.safeParse(pagamentoId).success) return { ok: false, erro: 'Cobrança inválida.' };
  const { error } = await a.sb.rpc('cobranca_marcar_pago', { p_pagamento: pagamentoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  await notaDoPagamentoMarcado(pagamentoId).catch((e) => console.error('[cobrancas] nota', e));
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function cancelarCobranca(pagamentoId: string): Promise<Res> {
  const a = await financeiro();
  if (!a.ok) return a;
  if (!uuid.safeParse(pagamentoId).success) return { ok: false, erro: 'Cobrança inválida.' };
  const { data, error } = await a.sb.rpc('cobranca_cancelar_pagamento', { p_pagamento: pagamentoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (data !== true) return { ok: false, erro: 'Só dá para cancelar o que está em aberto.' };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function emitirNotaDeNovo(pagamentoId: string): Promise<Res> {
  const a = await financeiro();
  if (!a.ok) return a;
  if (!uuid.safeParse(pagamentoId).success) return { ok: false, erro: 'Cobrança inválida.' };
  const r = await reemitirNota(pagamentoId);
  revalidatePath(CAMINHO);
  return r;
}

const esquemaLoja = z.object({ fornecedorId: z.coerce.number().int().positive(), mes, valor: z.coerce.number().min(0).max(1_000_000) });

export async function lancarLojaAMao(dados: unknown): Promise<Res> {
  const a = await financeiro();
  if (!a.ok) return a;
  const v = esquemaLoja.safeParse(dados);
  if (!v.success) return { ok: false, erro: 'Confira o mês e o valor.' };
  const { error } = await a.sb.rpc('cobranca_lancar_loja', { p_fornecedor: v.data.fornecedorId, p_mes: v.data.mes, p_valor: Math.round(v.data.valor * 100) / 100 });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function gerarPixDaLoja(dados: unknown): Promise<Res> {
  const a = await financeiro();
  if (!a.ok) return a;
  const v = esquemaLoja.safeParse(dados);
  if (!v.success) return { ok: false, erro: 'Confira o mês e o valor.' };
  const r = await cobrarLoja(a.sb, v.data.fornecedorId, v.data.mes, Math.round(v.data.valor * 100) / 100, a.userId);
  revalidatePath(CAMINHO);
  return r.ok ? { ok: true } : r;
}

export async function cancelarAssinaturaDaOficina(oficinaId: string): Promise<Res> {
  const a = await financeiro();
  if (!a.ok) return a;
  if (!uuid.safeParse(oficinaId).success) return { ok: false, erro: 'Oficina inválida.' };
  const r = await cancelarPro(oficinaId);
  revalidatePath(CAMINHO);
  return r;
}

export async function tentarAvisosDeNovo(): Promise<Res<{ texto: string }>> {
  const a = await financeiro();
  if (!a.ok) return a;
  const r = await reprocessarAvisos();
  revalidatePath(CAMINHO);
  return r.ok ? { ok: true, texto: `${r.aplicados} aplicados, ${r.falharam} ainda com problema.` } : r;
}

export async function agendarPixAutomaticoAgora(): Promise<Res<{ texto: string }>> {
  const a = await financeiro();
  if (!a.ok) return a;
  const r = await agendarCobrancasRecorrentes();
  revalidatePath(CAMINHO);
  return r.ok ? { ok: true, texto: `${r.agendadas} cobranças agendadas${r.falharam ? `, ${r.falharam} com erro` : ''}.` } : r;
}
