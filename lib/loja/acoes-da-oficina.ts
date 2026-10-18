'use server';

// Ações da oficina ligadas às lojas: ver o crédito que as lojas deram (para escolher faturado no
// pedido), o limite de compra das oficinas novas e denunciar um produto ou uma loja. Rodam como a
// pessoa que entrou, pela oficina escolhida; o banco confere tudo de novo.

import { z } from 'zod';
import { acessoDaOficina } from '../conta';
import { permitido } from '../limite';
import { creditoDaOficina } from './credito';
import type { CreditoNaLoja } from './credito-dados';
import { denunciar } from './moderacao';
import { lerLimiteDeCompra, MOTIVOS_DA_DENUNCIA, type LimiteDeCompra, type MotivoDaDenuncia } from './moderacao-dados';

type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string; semConta?: boolean };

/**
 * As lojas que vendem faturado para a oficina (com o que ainda cabe em cada uma) e o limite de compra
 * das oficinas novas (null quando não há limite). Para a escolha da forma de pagamento no pedido.
 */
export async function creditoNasLojas(): Promise<Gravacao<{ creditos: CreditoNaLoja[]; limite: LimiteDeCompra | null }>> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  const [creditos, limite] = await Promise.all([creditoDaOficina(a.sb, a.oficina.id), a.sb.rpc('compra_limite', { p_oficina: a.oficina.id })]);
  if (!creditos) return { ok: false, erro: 'Não deu para ver o crédito nas lojas agora.' };
  if (limite.error) console.error('[oficina] limite de compra', limite.error);
  return { ok: true, creditos, limite: limite.error ? null : lerLimiteDeCompra(limite.data) };
}

const esquemaDenuncia = z
  .object({
    produtoId: z.number().int().positive().nullable().optional().default(null),
    fornecedorId: z.number().int().positive().nullable().optional().default(null),
    motivo: z.enum(MOTIVOS_DA_DENUNCIA.map((m) => m.id) as [MotivoDaDenuncia, ...MotivoDaDenuncia[]], { error: 'Escolha o motivo da denúncia.' }),
    texto: z.string().trim().max(1000, 'Escreva até 1.000 letras.').optional().default('')
  })
  .refine((d) => d.produtoId != null || d.fornecedorId != null, { message: 'Escolha o produto ou a loja.' });

/** A oficina denuncia um produto (ou a loja, sem produto). A equipe do Revisaí recebe na fila. */
export async function denunciarNaLoja(entrada: unknown): Promise<Gravacao<{ id: string }>> {
  const r = esquemaDenuncia.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira a denúncia.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro, semConta: true };
  if (!(await permitido(`denuncia-${a.oficina.id}`, 10, 60))) return { ok: false, erro: 'Muitas denúncias seguidas. Tente de novo mais tarde.' };
  const d = r.data;
  return denunciar(a.sb, a.oficina.id, { produtoId: d.produtoId, fornecedorId: d.produtoId != null ? null : d.fornecedorId }, d.motivo, d.texto);
}
