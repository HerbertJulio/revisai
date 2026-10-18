import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mensagemDaLoja } from './comum';
import { aguardaQuem, COLUNAS_DEVOLUCAO, lerDevolucoes, type Devolucao, type SituacaoDevolucao } from './dados';
import { assinaturaConfere } from './produtos';

// Garantia e devolução, para os dois lados (cada um com o cliente da própria pessoa: o banco só deixa
// cada lado ver e fazer o que é dele). A oficina pede depois da entrega, com o motivo, os itens e até
// 6 fotos; muda o pedido enquanto está aberto, desiste ou confirma que resolveu. A loja responde: pede
// mais informação, aceita ou recusa (com a razão) e marca como resolvida. As regras ficam no banco
// (privado.regras_da_devolucao); aqui, a conferência da entrada e as mensagens.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

/** As fotos ficam no bucket público "links", na pasta da oficina, com nome que não se adivinha. */
export const BUCKET_DAS_FOTOS = 'links';
export const MAXIMO_DE_FOTOS = 6;
const TIPOS_DE_FOTO: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CAMINHO_DA_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/devolucoes\/[A-Za-z0-9_-]{1,100}\.(webp|jpg|png)$/;
const ERRO_GRAVACAO = 'Não deu para salvar agora. Tente de novo.';

const esquemaItens = z
  .array(z.object({ produtoId: z.number().int().positive(), quantidade: z.number().positive().max(100000) }))
  .max(50)
  .refine((l) => new Set(l.map((i) => i.produtoId)).size === l.length, 'Cada item aparece uma vez só.');

export const esquemaPedidoDeDevolucao = z.object({
  parteId: z.number().int().positive(),
  tipo: z.enum(['devolucao', 'garantia']).default('devolucao'),
  motivo: z.string().trim().min(5, 'Conte o motivo em poucas palavras.').max(1000, 'O motivo passou de 1.000 letras.'),
  itens: esquemaItens.default([]),
  fotos: z.array(z.string().regex(CAMINHO_DA_FOTO, 'Foto inválida.')).max(MAXIMO_DE_FOTOS, `No máximo ${MAXIMO_DE_FOTOS} fotos.`).default([])
});
export type PedidoDeDevolucao = z.input<typeof esquemaPedidoDeDevolucao>;

export const esquemaRespostaDaDevolucao = z
  .object({
    situacao: z.enum(['aberta', 'aceita', 'recusada', 'resolvida']),
    resposta: z.string().trim().max(1000, 'A resposta passou de 1.000 letras.').default('')
  })
  .refine((r) => r.situacao !== 'recusada' || r.resposta.length >= 5, { message: 'Diga à oficina por que a devolução foi recusada.', path: ['resposta'] })
  .refine((r) => r.situacao !== 'aberta' || r.resposta.length >= 2, { message: 'Escreva o que precisa saber da oficina.', path: ['resposta'] });
export type RespostaDaDevolucao = z.input<typeof esquemaRespostaDaDevolucao>;

function primeiroErro(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Confira os dados.';
}

/**
 * O endereço da foto direto no Storage (para o servidor buscar). As páginas mostram pela rota do
 * próprio site (enderecoDaFotoDaDevolucao), que confere quem pode ver.
 */
export function urlDaFotoDaDevolucao(sb: SupabaseClient, caminho: string): string {
  return sb.storage.from(BUCKET_DAS_FOTOS).getPublicUrl(caminho).data.publicUrl;
}

/**
 * A foto n de uma devolução, para a rota do site entregar: só sai se a pessoa vê a devolução (as regras
 * do banco decidem: a oficina que pediu, a loja que vendeu, a equipe).
 */
export async function fotoDaDevolucao(sb: SupabaseClient, id: string, indice: number): Promise<{ bytes: ArrayBuffer; tipo: string } | null> {
  if (!UUID.test(id) || !Number.isSafeInteger(indice) || indice < 0 || indice >= MAXIMO_DE_FOTOS) return null;
  const { data, error } = await sb.from('devolucoes').select('fotos').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const fotos = (data as { fotos: unknown }).fotos;
  const caminho = Array.isArray(fotos) ? fotos[indice] : null;
  if (typeof caminho !== 'string' || !CAMINHO_DA_FOTO.test(caminho)) return null;
  try {
    const r = await fetch(urlDaFotoDaDevolucao(sb, caminho), { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!r.ok || !TIPOS_DE_FOTO[tipo]) return null;
    const bytes = await r.arrayBuffer();
    return bytes.byteLength > 0 && bytes.byteLength <= 1_100_000 ? { bytes, tipo } : null;
  } catch (e) {
    console.error('[devoluções] foto', e);
    return null;
  }
}

function mensagem(e: { code?: string; message?: string } | null, padrao = ERRO_GRAVACAO): string {
  if (e?.code === '23505') return 'Esta compra já tem um pedido de devolução em andamento.';
  if (e?.code === 'P0002') return 'Compra não encontrada.';
  if (e?.code === '23514') return 'Confira o motivo (de 5 a 1.000 letras) e as fotos (no máximo 6).';
  if (e?.code === '22023') return e.message ? `${e.message.replace(/\.$/, '')}.` : padrao;
  return mensagemDaLoja(e, padrao);
}

// ---------------------------------------------------------------- leitura (os dois lados)

async function lista(sb: SupabaseClient, coluna: 'fornecedor_id' | 'oficina_id' | 'parte_id', valor: number | string, limite: number): Promise<Devolucao[] | null> {
  const { data, error } = await sb.from('devolucoes').select(COLUNAS_DEVOLUCAO).eq(coluna, valor).order('criado_em', { ascending: false }).limit(limite);
  if (error) {
    console.error('[devoluções] leitura', error);
    return null;
  }
  return lerDevolucoes(data);
}

/** As devoluções da loja (as mais novas primeiro). */
export function devolucoesDaLoja(sb: SupabaseClient, fornecedorId: number, limite = 300): Promise<Devolucao[] | null> {
  return lista(sb, 'fornecedor_id', fornecedorId, limite);
}

/** As devoluções que a oficina pediu (as mais novas primeiro). */
export function devolucoesDaOficina(sb: SupabaseClient, oficinaId: string, limite = 300): Promise<Devolucao[] | null> {
  if (!UUID.test(oficinaId)) return Promise.resolve([]);
  return lista(sb, 'oficina_id', oficinaId, limite);
}

/** As devoluções de uma compra (no máximo 3 por compra). */
export function devolucoesDaCompra(sb: SupabaseClient, parteId: number): Promise<Devolucao[] | null> {
  if (!Number.isSafeInteger(parteId) || parteId < 1) return Promise.resolve([]);
  return lista(sb, 'parte_id', parteId, 10);
}

export async function devolucao(sb: SupabaseClient, id: string): Promise<Devolucao | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await sb.from('devolucoes').select(COLUNAS_DEVOLUCAO).eq('id', id).maybeSingle();
  if (error || !data) {
    if (error) console.error('[devoluções] leitura', error);
    return null;
  }
  return lerDevolucoes([data])[0] ?? null;
}

/** Quantas abertas esperam a loja (nunca respondidas, ou a oficina mudou depois da resposta). */
export async function devolucoesParaResponder(sb: SupabaseClient, fornecedorId: number): Promise<number> {
  const { data, error } = await sb.from('devolucoes').select('situacao, respondida_em, atualizado_em').eq('fornecedor_id', fornecedorId).eq('situacao', 'aberta').limit(500);
  if (error) {
    console.error('[devoluções] contagem', error);
    return 0;
  }
  return ((data ?? []) as { situacao: SituacaoDevolucao; respondida_em: string | null; atualizado_em: string }[]).filter(
    (d) => aguardaQuem({ situacao: d.situacao, respondidaEm: d.respondida_em, atualizadoEm: d.atualizado_em }) === 'loja'
  ).length;
}

// ---------------------------------------------------------------- oficina

/**
 * Guarda uma foto para o pedido de devolução, na pasta da oficina (o Storage só deixa a oficina gravar
 * na pasta dela). Devolve o caminho, que vai em `fotos` do pedido, e o endereço para mostrar.
 */
export async function enviarFotoDaDevolucao(sb: SupabaseClient, oficinaId: string, arquivo: File): Promise<Gravacao<{ caminho: string; url: string }>> {
  if (!UUID.test(oficinaId)) return { ok: false, erro: 'Oficina não encontrada.' };
  const extensao = TIPOS_DE_FOTO[arquivo.type];
  if (!extensao) return { ok: false, erro: 'Mande a foto em JPG, PNG ou WebP.' };
  if (arquivo.size > 1_000_000) return { ok: false, erro: 'A foto passou de 1 MB. Tente outra.' };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!assinaturaConfere(bytes, arquivo.type)) return { ok: false, erro: 'O arquivo não parece uma foto.' };
  const caminho = `${oficinaId}/devolucoes/${randomUUID()}.${extensao}`;
  const { error } = await sb.storage.from(BUCKET_DAS_FOTOS).upload(caminho, bytes, { contentType: arquivo.type, upsert: false, cacheControl: '31536000' });
  if (error) {
    console.error('[devoluções] foto', error);
    return { ok: false, erro: 'Não deu para guardar a foto. Tente de novo.' };
  }
  return { ok: true, caminho, url: urlDaFotoDaDevolucao(sb, caminho) };
}

/** A oficina pede a devolução ou a garantia de uma compra entregue. A loja e o código vêm da compra. */
export async function abrirDevolucao(sb: SupabaseClient, entrada: unknown): Promise<Gravacao<{ id: string }>> {
  const r = esquemaPedidoDeDevolucao.safeParse(entrada);
  if (!r.success) return { ok: false, erro: primeiroErro(r.error) };
  const d = r.data;
  const { data, error } = await sb
    .from('devolucoes')
    .insert({ parte_id: d.parteId, tipo: d.tipo, motivo: d.motivo, itens: d.itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })), fotos: d.fotos })
    .select('id')
    .single();
  if (error || !data) {
    if (error) console.error('[devoluções] abrir', error);
    return { ok: false, erro: mensagem(error, 'Não deu para mandar o pedido agora. Tente de novo.') };
  }
  return { ok: true, id: String((data as { id: string }).id) };
}

/** A oficina muda o pedido (motivo, tipo, itens, fotos) enquanto a loja não decidiu. */
export async function editarDevolucao(sb: SupabaseClient, id: string, entrada: unknown): Promise<Gravacao> {
  if (!UUID.test(id)) return { ok: false, erro: 'Pedido de devolução não encontrado.' };
  const r = esquemaPedidoDeDevolucao.omit({ parteId: true }).safeParse(entrada);
  if (!r.success) return { ok: false, erro: primeiroErro(r.error) };
  const d = r.data;
  const { data, error } = await sb
    .from('devolucoes')
    .update({ tipo: d.tipo, motivo: d.motivo, itens: d.itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })), fotos: d.fotos })
    .eq('id', id)
    .eq('situacao', 'aberta')
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[devoluções] editar', error);
    return { ok: false, erro: error ? mensagem(error) : 'Este pedido não pode mais mudar: a loja já decidiu.' };
  }
  return { ok: true };
}

/** A oficina desiste do pedido enquanto ele está aberto. */
export async function desistirDaDevolucao(sb: SupabaseClient, id: string): Promise<Gravacao> {
  if (!UUID.test(id)) return { ok: false, erro: 'Pedido de devolução não encontrado.' };
  const { data, error } = await sb.from('devolucoes').delete().eq('id', id).eq('situacao', 'aberta').select('id').maybeSingle();
  if (error || !data) {
    if (error) console.error('[devoluções] desistir', error);
    return { ok: false, erro: error ? mensagem(error) : 'Este pedido não pode mais ser cancelado: a loja já decidiu.' };
  }
  return { ok: true };
}

/** A oficina confirma que a loja resolveu (troca feita ou dinheiro devolvido). */
export async function confirmarResolucao(sb: SupabaseClient, id: string): Promise<Gravacao> {
  if (!UUID.test(id)) return { ok: false, erro: 'Pedido de devolução não encontrado.' };
  const { data, error } = await sb.from('devolucoes').update({ situacao: 'resolvida' }).eq('id', id).eq('situacao', 'aceita').select('id').maybeSingle();
  if (error || !data) {
    if (error) console.error('[devoluções] confirmar', error);
    return { ok: false, erro: error ? mensagem(error) : 'Só dá para confirmar depois que a loja aceitar.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- loja

/**
 * A loja responde: situação "aberta" com resposta = pede mais informação; "aceita" ou "recusada" (com a
 * razão) = decide; "resolvida" = a troca ou o reembolso aconteceu.
 */
export async function responderDevolucao(sb: SupabaseClient, fornecedorId: number, id: string, entrada: unknown): Promise<Gravacao<{ situacao: SituacaoDevolucao }>> {
  if (!UUID.test(id)) return { ok: false, erro: 'Pedido de devolução não encontrado.' };
  const r = esquemaRespostaDaDevolucao.safeParse(entrada);
  if (!r.success) return { ok: false, erro: primeiroErro(r.error) };
  const { situacao, resposta } = r.data;
  // resposta em branco ao aceitar ou resolver: fica a que já estava
  const mudanca: Record<string, unknown> = { situacao };
  if (resposta) mudanca.resposta = resposta;
  const { data, error } = await sb.from('devolucoes').update(mudanca).eq('id', id).eq('fornecedor_id', fornecedorId).select('situacao').maybeSingle();
  if (error || !data) {
    if (error) console.error('[devoluções] responder', error);
    return { ok: false, erro: error ? mensagem(error) : 'Pedido de devolução não encontrado.' };
  }
  return { ok: true, situacao: (data as { situacao: SituacaoDevolucao }).situacao };
}
