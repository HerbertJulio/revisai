import 'server-only';

// Rascunhos de ordem de serviço que chegam pelo WhatsApp: o número do mecânico ligado à oficina,
// a mídia guardada no Storage (bucket privado "oficinas", pasta da oficina) e a IA.
// O webhook fala com o banco como o próprio servidor (chave do sistema); o app da oficina, como
// a pessoa que entrou (o banco só mostra os rascunhos da oficina dela).

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { clienteSistema } from '../supabase-servidor';
import { esquemaOrdem, type OrdemIA } from './esquema';
import { interpretarComIA, type Midia } from './ia';

const BUCKET = 'oficinas';
const JANELA_RASCUNHO_MS = 2 * 60 * 60_000;
/** Quantas vezes a IA tenta montar o mesmo rascunho antes de desistir. */
export const MAX_TENTATIVAS = 3;

export interface MidiaGuardada {
  mensagem: string;
  tipo: 'audio' | 'foto';
  caminho: string;
  mime: string;
  tamanho: number;
  legenda?: string | null;
}

interface TextoGuardado {
  mensagem: string;
  texto: string;
}

const esquemaRascunho = z.object({
  id: z.string(),
  oficina_id: z.string().nullable(),
  telefone: z.string().nullable(),
  status: z.enum(['aberta', 'processando', 'pronta', 'confirmada', 'descartada', 'erro']),
  midias: z.array(z.object({ mensagem: z.string(), tipo: z.enum(['audio', 'foto']), caminho: z.string(), mime: z.string(), tamanho: z.number(), legenda: z.string().nullish() })),
  textos: z.array(z.object({ mensagem: z.string(), texto: z.string() })),
  resultado: z.unknown().nullable(),
  modelo: z.string().nullable(),
  erro: z.string().nullable(),
  tentativas: z.number().nullish().transform((v) => v ?? 0),
  criado_em: z.string(),
  atualizado_em: z.string()
});
export type Rascunho = z.infer<typeof esquemaRascunho>;

const COLUNAS = 'id, oficina_id, telefone, status, midias, textos, resultado, modelo, erro, tentativas, criado_em, atualizado_em';

function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function ler(linha: unknown): Rascunho | null {
  const r = esquemaRascunho.safeParse(linha);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- vínculo do WhatsApp (sistema)

export interface ContextoDoTelefone {
  oficinaId: string;
  oficina: string;
  plano: 'pro' | 'teste' | 'gratis';
}

/** Liga o número à oficina do código (o código vale uma vez). Null: código errado ou vencido. */
export async function vincularTelefone(telefone: string, codigo: string): Promise<{ oficinaId: string; oficina: string } | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const { data, error } = await sb.rpc('whatsapp_vincular', { p_telefone: telefone, p_codigo: codigo });
  if (error) {
    console.error('[agente] vínculo', error.code, error.message);
    return null;
  }
  const r = data as { oficinaId?: string; oficina?: string } | null;
  return r?.oficinaId ? { oficinaId: r.oficinaId, oficina: r.oficina ?? '' } : null;
}

/** A oficina deste número (e o plano dela hoje), ou null quando o número não é de oficina nenhuma. */
export async function contextoDoTelefone(telefone: string): Promise<ContextoDoTelefone | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const { data, error } = await sb.rpc('whatsapp_contexto', { p_telefone: telefone });
  if (error) {
    console.error('[agente] contexto', error.code, error.message);
    return null;
  }
  const r = data as { oficinaId?: string; oficina?: string; plano?: string } | null;
  if (!r?.oficinaId) return null;
  return { oficinaId: r.oficinaId, oficina: r.oficina ?? '', plano: r.plano === 'pro' || r.plano === 'teste' ? r.plano : 'gratis' };
}

// ---------------------------------------------------------------- rascunhos (sistema)

/**
 * O rascunho aberto deste WhatsApp (o das últimas 2 horas) ou um novo. Uma montagem que caiu no
 * meio, ou que deu erro e ainda tem tentativa, volta a ficar aberta com tudo que o mecânico mandou.
 */
export async function rascunhoAberto(telefone: string, oficinaId: string): Promise<Rascunho | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const desde = new Date(Date.now() - JANELA_RASCUNHO_MS).toISOString();
  const agora = new Date().toISOString();
  await sb
    .from('ordens_rascunho')
    .update({ status: 'aberta', atualizado_em: agora })
    .eq('telefone', telefone)
    .eq('oficina_id', oficinaId)
    .eq('status', 'processando')
    .lt('atualizado_em', new Date(Date.now() - MONTAGEM_PARADA_MS).toISOString());
  await sb
    .from('ordens_rascunho')
    .update({ status: 'aberta', atualizado_em: agora })
    .eq('telefone', telefone)
    .eq('oficina_id', oficinaId)
    .eq('status', 'erro')
    .lt('tentativas', MAX_TENTATIVAS)
    .gte('atualizado_em', desde);
  const { data } = await sb
    .from('ordens_rascunho')
    .select(COLUNAS)
    .eq('telefone', telefone)
    .eq('oficina_id', oficinaId)
    .eq('status', 'aberta')
    .gte('atualizado_em', desde)
    .order('atualizado_em', { ascending: false })
    .limit(1);
  const atual = ler(data?.[0]);
  if (atual) return atual;
  const novo = await sb.from('ordens_rascunho').insert({ oficina_id: oficinaId, telefone, origem: 'whatsapp' }).select(COLUNAS).single();
  if (novo.error) console.error('[agente] novo rascunho', novo.error);
  return ler(novo.data);
}

export function extensao(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('amr')) return 'amr';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

/** O caminho da mídia no Storage: a pasta é a oficina (o banco deixa só ela ler). */
export function caminhoDaMidia(oficinaId: string, rascunhoId: string, ordem: number, mime: string): string {
  return `${oficinaId}/${rascunhoId}/${ordem}-${Date.now().toString(36)}.${extensao(mime)}`;
}

/** Guarda a mídia no Storage e junta ao rascunho. Devolve se era a primeira mídia do rascunho. */
export async function anexarMidia(r: Rascunho, mensagem: string, tipo: 'audio' | 'foto', bytes: Uint8Array, mime: string, legenda: string | null): Promise<boolean> {
  const sb = clienteSistema();
  if (!sb || !r.oficina_id) return false;
  if (r.midias.length >= 20) return false;
  const caminho = caminhoDaMidia(r.oficina_id, r.id, r.midias.length, mime);
  const up = await sb.storage.from(BUCKET).upload(caminho, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error('[agente] guardar mídia', up.error);
    return false;
  }
  const item: MidiaGuardada = { mensagem, tipo, caminho, mime, tamanho: bytes.length, legenda };
  const { error } = await sb.rpc('anexar_ao_rascunho', { p_id: r.id, p_campo: 'midias', p_item: item });
  if (error) console.error('[agente] anexar mídia', error);
  return r.midias.length === 0;
}

export async function anexarTexto(r: Rascunho, mensagem: string, texto: string): Promise<void> {
  const sb = clienteSistema();
  if (!sb) return;
  const item: TextoGuardado = { mensagem, texto: texto.slice(0, 2000) };
  const { error } = await sb.rpc('anexar_ao_rascunho', { p_id: r.id, p_campo: 'textos', p_item: item });
  if (error) console.error('[agente] anexar texto', error);
}

async function recarregar(id: string): Promise<Rascunho | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const { data } = await sb.from('ordens_rascunho').select(COLUNAS).eq('id', id).maybeSingle();
  return ler(data);
}

async function mudar(id: string, mudanca: Record<string, unknown>, deStatus?: string): Promise<boolean> {
  const sb = clienteSistema();
  if (!sb) return false;
  let q = sb.from('ordens_rascunho').update({ ...mudanca, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (deStatus) q = q.eq('status', deStatus);
  const { data, error } = await q.select('id');
  if (error) console.error('[agente] mudar rascunho', error);
  return !error && (data?.length ?? 0) > 0;
}

// a IA olha até 6 fotos e até 12 MB de foto por ordem (o Gemini aceita até 20 MB por pedido)
const FOTOS_DA_IA = 6;
const BYTES_DE_FOTO_DA_IA = 12_000_000;
// uma montagem parada há mais tempo que isso caiu no meio (a função tem 2 minutos)
const MONTAGEM_PARADA_MS = 3 * 60_000;

export const COTA_ACABOU = 'As ordens por voz do mês acabaram no plano da oficina.';

export type ResultadoDaMontagem = { ok: true; ordem: OrdemIA } | { ok: false; erro: string; semCota?: boolean };

/**
 * A IA monta a ordem a partir de tudo que chegou. Só um processamento por rascunho. Gasta a cota
 * da oficina (uma vez por rascunho); se a IA falhar, a cota volta e o rascunho fica com erro,
 * para tentar de novo na próxima mensagem ou na rotina diária (até 3 vezes).
 */
export async function processarRascunho(id: string, oficina: string | null): Promise<ResultadoDaMontagem> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: 'Não consegui abrir o que você mandou agora.' };
  const antes = await recarregar(id);
  if (!antes?.oficina_id) return { ok: false, erro: 'Não consegui abrir o que você mandou agora.' };
  const deStatus = antes.status === 'erro' ? 'erro' : 'aberta';
  if (!(await mudar(id, { status: 'processando' }, deStatus))) return { ok: false, erro: 'Esta ordem já está sendo montada.' };
  const chave = `wa:${id}`;
  const cota = await sb.rpc('consumir_cota', { p_oficina: antes.oficina_id, p_recurso: 'montagem', p_quantidade: 1, p_chave: chave });
  if (cota.error) {
    await mudar(id, { status: 'aberta' }, 'processando');
    if (cota.error.code === 'RV040') return { ok: false, erro: COTA_ACABOU, semCota: true };
    console.error('[agente] cota', cota.error);
    return { ok: false, erro: 'Não consegui montar agora.' };
  }
  // só devolve o que esta montagem gastou
  const gastou = (cota.data as { repetida?: boolean } | null)?.repetida !== true;
  const devolver = async () => {
    if (!gastou) return;
    const { error } = await sb.rpc('devolver_cota', { p_oficina: antes.oficina_id, p_recurso: 'montagem', p_quantidade: 1, p_chave: chave });
    if (error) console.error('[agente] devolver cota', error);
  };
  const r = await recarregar(id);
  if (!r) {
    await devolver();
    await mudar(id, { status: 'aberta' }, 'processando');
    return { ok: false, erro: 'Não consegui abrir o que você mandou agora.' };
  }
  const audios: Midia[] = [];
  const imagens: Midia[] = [];
  let bytesDeFoto = 0;
  // as fotos da IA são sempre as primeiras, na ordem (o app casa as legendas pela posição)
  let fotosCheias = false;
  for (const m of r.midias) {
    if (m.tipo === 'foto' && (fotosCheias || imagens.length >= FOTOS_DA_IA || bytesDeFoto + m.tamanho > BYTES_DE_FOTO_DA_IA)) {
      fotosCheias = true;
      continue;
    }
    const { data, error } = await sb.storage.from(BUCKET).download(m.caminho);
    if (error || !data) {
      if (m.tipo === 'foto') fotosCheias = true;
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (m.tipo === 'foto') bytesDeFoto += bytes.length;
    (m.tipo === 'audio' ? audios : imagens).push({ bytes, mime: m.mime });
  }
  const legendas = r.midias.filter((m) => m.tipo === 'foto' && m.legenda).map((m) => m.legenda);
  const anotacao = [...r.textos.map((t) => t.texto), ...legendas].join('\n').slice(0, 1500) || null;
  const res = await interpretarComIA({ oficina: oficina ?? '', hoje: hoje(), anotacao, quantidadeFotos: imagens.length }, audios, imagens);
  if (!res.ok) {
    await devolver();
    await mudar(id, { status: 'erro', erro: res.erro.slice(0, 300), tentativas: Math.min(100, r.tentativas + 1) }, 'processando');
    return res;
  }
  await mudar(id, { status: 'pronta', resultado: res.ordem, modelo: res.modelo.slice(0, 80), erro: null });
  return { ok: true, ordem: res.ordem };
}

export async function descartarAberto(telefone: string, oficinaId: string): Promise<boolean> {
  const sb = clienteSistema();
  if (!sb) return false;
  const { data } = await sb
    .from('ordens_rascunho')
    .update({ status: 'descartada', atualizado_em: new Date().toISOString() })
    .eq('telefone', telefone)
    .eq('oficina_id', oficinaId)
    .in('status', ['aberta', 'erro'])
    .select('id, midias');
  for (const r of (data ?? []) as { id: string; midias: MidiaGuardada[] }[]) await apagarConteudo(r.id, r.midias);
  return (data?.length ?? 0) > 0;
}

/** A última ordem montada deste WhatsApp nesta oficina (para reenviar o texto do cliente). */
export async function ultimaMontada(telefone: string, oficinaId: string): Promise<OrdemIA | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const { data } = await sb
    .from('ordens_rascunho')
    .select(COLUNAS)
    .eq('telefone', telefone)
    .eq('oficina_id', oficinaId)
    .in('status', ['pronta', 'confirmada'])
    .order('atualizado_em', { ascending: false })
    .limit(1);
  const r = ler(data?.[0]);
  const o = r ? esquemaOrdem.safeParse(r.resultado) : null;
  return o?.success ? o.data : null;
}

/** Rascunhos que deram erro e ainda têm tentativa (a rotina diária tenta de novo). */
export async function rascunhosComErro(limite = 20): Promise<{ id: string; oficina: string | null; telefone: string | null }[]> {
  const sb = clienteSistema();
  if (!sb) return [];
  const { data, error } = await sb
    .from('ordens_rascunho')
    .select('id, telefone, oficina_id, tentativas')
    .eq('status', 'erro')
    .lt('tentativas', MAX_TENTATIVAS)
    .gte('atualizado_em', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('atualizado_em', { ascending: true })
    .limit(limite);
  if (error) {
    console.error('[agente] rascunhos com erro', error);
    return [];
  }
  const ids = [...new Set((data ?? []).map((r: { oficina_id: string | null }) => r.oficina_id).filter((x): x is string => !!x))];
  const nomes = ids.length ? await sb.from('oficinas').select('id, nome').in('id', ids) : { data: [] };
  const mapa = new Map(((nomes.data ?? []) as { id: string; nome: string }[]).map((o) => [o.id, o.nome]));
  return (data ?? []).map((r: { id: string; telefone: string | null; oficina_id: string | null }) => ({ id: r.id, telefone: r.telefone, oficina: r.oficina_id ? (mapa.get(r.oficina_id) ?? null) : null }));
}

// ---------------------------------------------------------------- para o app da oficina (pessoa)

export interface RascunhoParaApp {
  id: string;
  criadoEm: string;
  ordem: OrdemIA;
  modelo: string | null;
  midias: { tipo: 'audio' | 'foto'; mime: string; legenda: string | null }[];
}

/** Os números de WhatsApp ligados à oficina. */
export async function numerosLigados(sb: SupabaseClient, oficinaId: string): Promise<string[]> {
  const { data, error } = await sb.from('whatsapp_vinculos').select('telefone').eq('oficina_id', oficinaId).order('criado_em');
  if (error) {
    console.error('[agente] números', error);
    return [];
  }
  return (data ?? []).map((x: { telefone: string }) => x.telefone);
}

export async function desligarNumero(sb: SupabaseClient, oficinaId: string, telefone: string): Promise<boolean> {
  const { data, error } = await sb.from('whatsapp_vinculos').delete().eq('oficina_id', oficinaId).eq('telefone', telefone).select('telefone');
  if (error) console.error('[agente] desligar', error);
  return !error && (data?.length ?? 0) > 0;
}

/** Os rascunhos prontos da oficina (a mídia o app baixa à parte, por /api/agente/midia). */
export async function rascunhosProntos(sb: SupabaseClient, oficinaId: string): Promise<RascunhoParaApp[]> {
  const { data, error } = await sb.from('ordens_rascunho').select(COLUNAS).eq('oficina_id', oficinaId).eq('status', 'pronta').order('criado_em', { ascending: false }).limit(20);
  if (error) {
    console.error('[agente] rascunhos prontos', error);
    return [];
  }
  const lista: RascunhoParaApp[] = [];
  for (const linha of data ?? []) {
    const r = ler(linha);
    const o = r ? esquemaOrdem.safeParse(r.resultado) : null;
    if (!r || !o?.success) continue;
    lista.push({ id: r.id, criadoEm: r.criado_em, ordem: o.data, modelo: r.modelo, midias: r.midias.map((m) => ({ tipo: m.tipo, mime: m.mime, legenda: m.legenda ?? null })) });
  }
  return lista;
}

/** Um áudio ou foto de um rascunho da oficina (o banco só deixa baixar da pasta dela). */
export async function midiaDoRascunho(sb: SupabaseClient, oficinaId: string, id: string, indice: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const { data } = await sb.from('ordens_rascunho').select(COLUNAS).eq('id', id).eq('oficina_id', oficinaId).maybeSingle();
  const r = ler(data);
  const m = r?.midias[indice];
  if (!m || !m.caminho.startsWith(`${oficinaId}/`)) return null;
  const arquivo = await sb.storage.from(BUCKET).download(m.caminho);
  if (arquivo.error || !arquivo.data) return null;
  return { bytes: new Uint8Array(await arquivo.data.arrayBuffer()), mime: m.mime };
}

/** A oficina confirmou ou descartou o rascunho: a mídia sai do servidor (o app já baixou). */
export async function encerrarRascunho(sb: SupabaseClient, oficinaId: string, id: string, status: 'confirmada' | 'descartada'): Promise<boolean> {
  const { data, error } = await sb
    .from('ordens_rascunho')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('oficina_id', oficinaId)
    .eq('status', 'pronta')
    .select('id, midias');
  if (error) console.error('[agente] encerrar rascunho', error);
  const linha = data?.[0] as { id: string; midias: MidiaGuardada[] } | undefined;
  if (error || !linha) return false;
  await apagarConteudo(linha.id, linha.midias);
  return true;
}

/** Apaga os áudios e fotos do Storage e esvazia o rascunho (fica só a linha, sem conteúdo). */
async function apagarConteudo(id: string, midias: MidiaGuardada[]): Promise<void> {
  const sb = clienteSistema();
  if (!sb) return;
  const caminhos = (Array.isArray(midias) ? midias : []).map((m) => m.caminho).filter(Boolean);
  if (caminhos.length) {
    const { error } = await sb.storage.from(BUCKET).remove(caminhos);
    if (error) console.error('[agente] apagar mídia', error);
  }
  const { error } = await sb.from('ordens_rascunho').update({ midias: [], textos: [], resultado: null }).eq('id', id);
  if (error) console.error('[agente] esvaziar rascunho', error);
}

/**
 * Rotina diária: rascunhos parados há mais de `dias` dias (que a oficina nunca abriu ou esqueceu)
 * perdem os áudios, fotos e textos, e os códigos de vínculo vencidos somem.
 */
export async function limparRascunhosVelhos(dias = 30): Promise<{ rascunhos: number }> {
  const sb = clienteSistema();
  if (!sb) return { rascunhos: 0 };
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString();
  await sb.from('whatsapp_codigos').delete().lt('expira_em', new Date().toISOString());
  const { data, error } = await sb
    .from('ordens_rascunho')
    .select('id, status, midias, textos')
    .lt('atualizado_em', limite)
    .order('atualizado_em', { ascending: true })
    .limit(200);
  if (error) {
    console.error('[agente] rascunhos velhos', error);
    return { rascunhos: 0 };
  }
  let n = 0;
  for (const r of (data ?? []) as { id: string; status: string; midias: MidiaGuardada[]; textos: unknown[] }[]) {
    const vazio = !r.midias?.length && !r.textos?.length;
    if (vazio && (r.status === 'confirmada' || r.status === 'descartada')) continue;
    if (r.status !== 'confirmada' && r.status !== 'descartada') {
      await sb.from('ordens_rascunho').update({ status: 'descartada', atualizado_em: new Date().toISOString() }).eq('id', r.id);
    }
    await apagarConteudo(r.id, r.midias);
    n++;
  }
  return { rascunhos: n };
}
