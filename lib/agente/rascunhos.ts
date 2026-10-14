import 'server-only';

// Rascunhos de ordem de serviço que chegam pelo WhatsApp: o vínculo do WhatsApp do mecânico com
// o aparelho da oficina, a mídia guardada no Storage (bucket privado "oficinas") e a IA.
// O aparelhoId é um número aleatório que só o aparelho da oficina e o servidor conhecem.

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { clienteEquipe } from '../equipe';
import { esquemaOrdem, type OrdemIA } from './esquema';
import { interpretarComIA, type Midia } from './ia';

const BUCKET = 'oficinas';
const JANELA_RASCUNHO_MS = 2 * 60 * 60_000;

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
  aparelho_id: z.string(),
  telefone: z.string().nullable(),
  status: z.enum(['aberta', 'processando', 'pronta', 'confirmada', 'descartada', 'erro']),
  midias: z.array(z.object({ mensagem: z.string(), tipo: z.enum(['audio', 'foto']), caminho: z.string(), mime: z.string(), tamanho: z.number(), legenda: z.string().nullish() })),
  textos: z.array(z.object({ mensagem: z.string(), texto: z.string() })),
  resultado: z.unknown().nullable(),
  modelo: z.string().nullable(),
  erro: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string()
});
export type Rascunho = z.infer<typeof esquemaRascunho>;

const COLUNAS = 'id, aparelho_id, telefone, status, midias, textos, resultado, modelo, erro, criado_em, atualizado_em';

function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function ler(linha: unknown): Rascunho | null {
  const r = esquemaRascunho.safeParse(linha);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- vínculo do WhatsApp

/** Gera o código de 6 dígitos que o mecânico manda para o agente (vale 15 minutos). */
export async function gerarCodigoDeVinculo(aparelhoId: string, oficina: string): Promise<string | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { error } = await sb
      .from('whatsapp_codigos')
      .insert({ codigo, aparelho_id: aparelhoId, oficina_nome: oficina.slice(0, 120) || null, expira_em: new Date(Date.now() + 15 * 60_000).toISOString() });
    if (!error) return codigo;
    if (error.code !== '23505') {
      console.error('[agente] código', error);
      return null;
    }
  }
  return null;
}

export async function vincularTelefone(telefone: string, codigo: string): Promise<{ oficina: string | null } | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  const { data } = await sb.from('whatsapp_codigos').select('codigo, aparelho_id, oficina_nome, expira_em').eq('codigo', codigo).maybeSingle();
  if (!data || new Date(data.expira_em).getTime() < Date.now()) return null;
  const { error } = await sb
    .from('whatsapp_vinculos')
    .upsert({ telefone, aparelho_id: data.aparelho_id, oficina_nome: data.oficina_nome, criado_em: new Date().toISOString() }, { onConflict: 'telefone' });
  if (error) {
    console.error('[agente] vínculo', error);
    return null;
  }
  await sb.from('whatsapp_codigos').delete().eq('codigo', codigo);
  return { oficina: data.oficina_nome };
}

export async function vinculoDoTelefone(telefone: string): Promise<{ aparelhoId: string; oficina: string | null } | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  const { data } = await sb.from('whatsapp_vinculos').select('aparelho_id, oficina_nome').eq('telefone', telefone).maybeSingle();
  return data ? { aparelhoId: data.aparelho_id, oficina: data.oficina_nome } : null;
}

export async function telefonesDoAparelho(aparelhoId: string): Promise<string[]> {
  const sb = clienteEquipe();
  if (!sb) return [];
  const { data } = await sb.from('whatsapp_vinculos').select('telefone').eq('aparelho_id', aparelhoId);
  return (data ?? []).map((x: { telefone: string }) => x.telefone);
}

export async function desvincularTelefone(aparelhoId: string, telefone: string): Promise<boolean> {
  const sb = clienteEquipe();
  if (!sb) return false;
  const { error } = await sb.from('whatsapp_vinculos').delete().eq('aparelho_id', aparelhoId).eq('telefone', telefone);
  return !error;
}

// ---------------------------------------------------------------- rascunhos

/** O rascunho aberto deste WhatsApp (o das últimas 2 horas) ou um novo. */
export async function rascunhoAberto(telefone: string, aparelhoId: string): Promise<Rascunho | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  const desde = new Date(Date.now() - JANELA_RASCUNHO_MS).toISOString();
  // uma montagem que caiu no meio volta a ficar aberta, com tudo que o mecânico mandou
  await sb
    .from('ordens_rascunho')
    .update({ status: 'aberta', atualizado_em: new Date().toISOString() })
    .eq('telefone', telefone)
    .eq('status', 'processando')
    .lt('atualizado_em', new Date(Date.now() - MONTAGEM_PARADA_MS).toISOString());
  const { data } = await sb
    .from('ordens_rascunho')
    .select(COLUNAS)
    .eq('telefone', telefone)
    .eq('status', 'aberta')
    .gte('atualizado_em', desde)
    .order('atualizado_em', { ascending: false })
    .limit(1);
  const atual = ler(data?.[0]);
  if (atual) return atual;
  const novo = await sb.from('ordens_rascunho').insert({ aparelho_id: aparelhoId, telefone, origem: 'whatsapp' }).select(COLUNAS).single();
  if (novo.error) console.error('[agente] novo rascunho', novo.error);
  return ler(novo.data);
}

function extensao(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('amr')) return 'amr';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

/** Guarda a mídia no Storage e junta ao rascunho. Devolve se era a primeira mídia do rascunho. */
export async function anexarMidia(r: Rascunho, mensagem: string, tipo: 'audio' | 'foto', bytes: Uint8Array, mime: string, legenda: string | null): Promise<boolean> {
  const sb = clienteEquipe();
  if (!sb) return false;
  if (r.midias.length >= 20) return false;
  const caminho = `${r.aparelho_id}/${r.id}/${Date.now().toString(36)}-${mensagem.slice(-12).replace(/[^A-Za-z0-9]/g, '')}.${extensao(mime)}`;
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
  const sb = clienteEquipe();
  if (!sb) return;
  const item: TextoGuardado = { mensagem, texto: texto.slice(0, 2000) };
  const { error } = await sb.rpc('anexar_ao_rascunho', { p_id: r.id, p_campo: 'textos', p_item: item });
  if (error) console.error('[agente] anexar texto', error);
}

async function recarregar(id: string): Promise<Rascunho | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  const { data } = await sb.from('ordens_rascunho').select(COLUNAS).eq('id', id).maybeSingle();
  return ler(data);
}

async function mudar(id: string, mudanca: Record<string, unknown>, deStatus?: string): Promise<boolean> {
  const sb = clienteEquipe();
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

/**
 * A IA monta a ordem a partir de tudo que chegou. Só um processamento por rascunho. Se der errado,
 * o rascunho volta a ficar aberto e o mecânico pode escrever fechar de novo.
 */
export async function processarRascunho(id: string, oficina: string | null): Promise<{ ok: true; ordem: OrdemIA } | { ok: false; erro: string }> {
  if (!(await mudar(id, { status: 'processando' }, 'aberta'))) return { ok: false, erro: 'Esta ordem já está sendo montada.' };
  const r = await recarregar(id);
  const sb = clienteEquipe();
  if (!r || !sb) {
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
    await mudar(id, { status: 'aberta', erro: res.erro.slice(0, 300) }, 'processando');
    return res;
  }
  await mudar(id, { status: 'pronta', resultado: res.ordem, modelo: res.modelo.slice(0, 80), erro: null });
  return { ok: true, ordem: res.ordem };
}

export async function descartarAberto(telefone: string): Promise<boolean> {
  const sb = clienteEquipe();
  if (!sb) return false;
  const { data } = await sb.from('ordens_rascunho').update({ status: 'descartada', atualizado_em: new Date().toISOString() }).eq('telefone', telefone).eq('status', 'aberta').select('id');
  return (data?.length ?? 0) > 0;
}

/** A última ordem montada deste WhatsApp (para reenviar o texto do cliente). */
export async function ultimaMontada(telefone: string): Promise<OrdemIA | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  const { data } = await sb.from('ordens_rascunho').select(COLUNAS).eq('telefone', telefone).in('status', ['pronta', 'confirmada']).order('atualizado_em', { ascending: false }).limit(1);
  const r = ler(data?.[0]);
  const o = r ? esquemaOrdem.safeParse(r.resultado) : null;
  return o?.success ? o.data : null;
}

// ---------------------------------------------------------------- para o app da oficina

export interface RascunhoParaApp {
  id: string;
  criadoEm: string;
  ordem: OrdemIA;
  modelo: string | null;
  midias: { tipo: 'audio' | 'foto'; mime: string; legenda: string | null }[];
}

/** Os rascunhos prontos deste aparelho (a mídia o app baixa à parte, por /api/agente/midia). */
export async function rascunhosProntos(aparelhoId: string): Promise<RascunhoParaApp[]> {
  const sb = clienteEquipe();
  if (!sb) return [];
  const { data, error } = await sb.from('ordens_rascunho').select(COLUNAS).eq('aparelho_id', aparelhoId).eq('status', 'pronta').order('criado_em', { ascending: false }).limit(20);
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

/** Um áudio ou foto de um rascunho deste aparelho. */
export async function midiaDoRascunho(aparelhoId: string, id: string, indice: number): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const sb = clienteEquipe();
  if (!sb) return null;
  const { data } = await sb.from('ordens_rascunho').select(COLUNAS).eq('id', id).eq('aparelho_id', aparelhoId).maybeSingle();
  const r = ler(data);
  const m = r?.midias[indice];
  if (!m) return null;
  const arquivo = await sb.storage.from(BUCKET).download(m.caminho);
  if (arquivo.error || !arquivo.data) return null;
  return { bytes: new Uint8Array(await arquivo.data.arrayBuffer()), mime: m.mime };
}

export async function encerrarRascunho(aparelhoId: string, id: string, status: 'confirmada' | 'descartada'): Promise<boolean> {
  const sb = clienteEquipe();
  if (!sb) return false;
  const { data, error } = await sb
    .from('ordens_rascunho')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .eq('aparelho_id', aparelhoId)
    .eq('status', 'pronta')
    .select('id, midias');
  if (error) console.error('[agente] encerrar rascunho', error);
  const linha = data?.[0] as { id: string; midias: MidiaGuardada[] } | undefined;
  if (error || !linha) return false;
  // o app já baixou o que precisava: áudios, fotos e textos saem do servidor
  await apagarConteudo(linha.id, linha.midias);
  return true;
}

/** Apaga os áudios e fotos do Storage e esvazia o rascunho (fica só a linha, sem conteúdo). */
async function apagarConteudo(id: string, midias: MidiaGuardada[]): Promise<void> {
  const sb = clienteEquipe();
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
  const sb = clienteEquipe();
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
