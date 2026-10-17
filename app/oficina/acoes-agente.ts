'use server';

// A ordem de serviço por voz, em dois passos: transcreverAudio passa o áudio do mecânico para texto
// e montarOrdemComIA preenche a ordem com esse texto e as fotos. Precisa da conta: cada chamada
// gasta a cota do plano da oficina (a mesma ordem só conta uma vez), e se a IA falhar a cota volta.
// O texto e o rascunho voltam para o aparelho, que guarda o áudio junto com a ordem.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { preencherComIA, transcreverComIA, type Midia, type ResultadoTexto } from '@/lib/agente/ia';
import { desligarNumero, encerrarRascunho, numerosLigados, rascunhosProntos, type RascunhoParaApp } from '@/lib/agente/rascunhos';
import { MAX_RELATO } from '@/lib/agente/relato';
import { configWhatsApp } from '@/lib/agente/whatsapp-cloud';
import type { OrdemIA } from '@/lib/agente/esquema';
import { acessoDaOficina } from '@/lib/conta';
import { mensagemDoBanco } from '@/lib/conta-dados';
import { permitido } from '@/lib/limite';
import { mensagemDaCota, type InfoCota } from '@/lib/plano';
import { clienteSistema } from '@/lib/supabase-servidor';

type Resposta = { ok: true; ordem: OrdemIA; modelo: string } | { ok: false; erro: string; semCota?: boolean; semConta?: boolean };
type RespostaTexto = ResultadoTexto | { ok: false; erro: string; semCota?: boolean; semConta?: boolean };

const SEM_CONTA = 'Entre na conta da oficina para usar a voz com IA.';

const esquemaContexto = z.object({
  oficina: z.string().trim().max(120).default(''),
  hoje: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  carro: z.string().trim().max(200).nullable().default(null),
  cliente: z.string().trim().max(120).nullable().default(null),
  kmAnterior: z.number().int().min(0).max(2_000_000).nullable().default(null),
  transcricao: z.string().trim().max(MAX_RELATO).nullable().default(null),
  anotacao: z.string().trim().max(1500).nullable().default(null)
});

const MAX_FOTOS = 6;
const MAX_FOTO_BYTES = 1_000_000;
const MAX_FOTOS_BYTES = 3_900_000;
// um áudio por vez, de até 5 minutos; a Vercel aceita até 4,5 MB por requisição
const MAX_AUDIO_BYTES = 3_800_000;

async function lerArquivos(dados: FormData, campo: string, prefixo: string, limite: number, maxBytes: number): Promise<Midia[] | string> {
  const arquivos = dados.getAll(campo).filter((x): x is File => x instanceof File && x.size > 0);
  if (arquivos.length > limite) return campo === 'audio' ? 'Mande um áudio por vez.' : `Mande no máximo ${limite} fotos.`;
  const lista: Midia[] = [];
  for (const f of arquivos) {
    if (!f.type.startsWith(prefixo)) return 'Arquivo de tipo inesperado.';
    if (f.size > maxBytes) return campo === 'audio' ? 'O áudio ficou grande demais. Grave até 5 minutos por vez.' : 'Uma das fotos ficou grande demais.';
    lista.push({ bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type });
  }
  return lista;
}

type Gasto = { ok: true; gastou: boolean } | { ok: false; erro: string; semCota?: boolean };

/** Gasta a cota antes da IA. `gastou` = false quando a mesma ordem já tinha pago (nada a devolver). */
async function gastar(sb: SupabaseClient, oficinaId: string, recurso: 'montagem' | 'transcricao', chave: string | null): Promise<Gasto> {
  const { data, error } = await sb.rpc('consumir_cota', { p_oficina: oficinaId, p_recurso: recurso, p_quantidade: 1, p_chave: chave });
  if (!error) return { ok: true, gastou: (data as { repetida?: boolean } | null)?.repetida !== true };
  if (error.code === 'RV040') {
    let info: InfoCota | null = null;
    try {
      info = JSON.parse(String((error as { details?: string }).details ?? '{}')) as InfoCota;
    } catch {}
    return { ok: false, erro: mensagemDaCota(recurso, info), semCota: true };
  }
  console.error('[agente] cota', error);
  return { ok: false, erro: mensagemDoBanco(error, 'Não deu para conferir o plano agora. Tente de novo.') };
}

/** A IA falhou: a cota volta (só o servidor devolve). */
async function devolver(oficinaId: string, recurso: 'montagem' | 'transcricao', chave: string | null): Promise<void> {
  const sistema = clienteSistema();
  if (!sistema) return;
  const { error } = await sistema.rpc('devolver_cota', { p_oficina: oficinaId, p_recurso: recurso, p_quantidade: 1, p_chave: chave });
  if (error) console.error('[agente] devolver cota', error);
}

/** Passo 1: o áudio que o mecânico acabou de gravar vira texto. */
export async function transcreverAudio(dados: FormData): Promise<RespostaTexto> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: SEM_CONTA, semConta: true };
  if (!(await permitido('agente-ouvir', 60, 60))) return { ok: false, erro: 'Muitos áudios seguidos. Espere alguns minutos.' };
  const audios = await lerArquivos(dados, 'audio', 'audio/', 1, MAX_AUDIO_BYTES);
  if (typeof audios === 'string') return { ok: false, erro: audios };
  if (!audios.length) return { ok: false, erro: 'Grave um áudio primeiro.' };
  const g = await gastar(a.sb, a.oficina.id, 'transcricao', null);
  if (!g.ok) return g;
  const r = await transcreverComIA(audios);
  if (!r.ok && g.gastou) await devolver(a.oficina.id, 'transcricao', null);
  return r;
}

/** Passo 2: o texto (falado ou escrito) e as fotos viram a ordem de serviço preenchida. */
export async function montarOrdemComIA(dados: FormData): Promise<Resposta> {
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: SEM_CONTA, semConta: true };
  if (!(await permitido('agente', 40, 60))) return { ok: false, erro: 'Muitas ordens seguidas. Espere alguns minutos.' };
  let contexto: z.infer<typeof esquemaContexto>;
  try {
    contexto = esquemaContexto.parse(JSON.parse(String(dados.get('contexto') ?? '{}')));
  } catch {
    return { ok: false, erro: 'Dados da ordem inválidos.' };
  }
  // a mesma ordem (a sessão da tela) só gasta a cota uma vez, mesmo preenchendo de novo
  const sessao = String(dados.get('sessao') ?? '');
  const chave = /^[A-Za-z0-9_-]{6,80}$/.test(sessao) ? `voz:${sessao}` : null;
  const fotos = await lerArquivos(dados, 'foto', 'image/', MAX_FOTOS, MAX_FOTO_BYTES);
  if (typeof fotos === 'string') return { ok: false, erro: fotos };
  if (!contexto.transcricao && !contexto.anotacao && !fotos.length) return { ok: false, erro: 'Fale ou escreva o que foi feito no carro.' };
  if (fotos.reduce((s, m) => s + m.bytes.length, 0) > MAX_FOTOS_BYTES) return { ok: false, erro: 'As fotos passaram do limite. Mande menos fotos.' };
  const g = await gastar(a.sb, a.oficina.id, 'montagem', chave);
  if (!g.ok) return g;
  const r = await preencherComIA({ ...contexto, oficina: contexto.oficina || a.oficina.nome, quantidadeFotos: fotos.length }, fotos);
  if (!r.ok && g.gastou) await devolver(a.oficina.id, 'montagem', chave);
  return r;
}

// ---------------------------------------------------------------- agente no WhatsApp

export interface EstadoWhatsApp {
  ligado: boolean;
  numero: string | null;
  telefones: string[];
}

export async function estadoDoWhatsApp(): Promise<EstadoWhatsApp> {
  const c = configWhatsApp();
  const a = await acessoDaOficina();
  if (!c || !a.ok) return { ligado: !!c, numero: c?.numero ?? null, telefones: [] };
  return { ligado: true, numero: c.numero, telefones: await numerosLigados(a.sb, a.oficina.id) };
}

export async function codigoParaWhatsApp(): Promise<{ ok: true; codigo: string; numero: string | null } | { ok: false; erro: string; semPro?: boolean }> {
  const c = configWhatsApp();
  if (!c) return { ok: false, erro: 'O número do agente ainda não foi ligado pela equipe do Revisaí.' };
  const a = await acessoDaOficina();
  if (!a.ok) return { ok: false, erro: a.erro };
  if (a.oficina.plano === 'gratis') return { ok: false, erro: 'O agente no WhatsApp é do Pro. Teste o Pro por 30 dias em Ajustes, na parte Plano.', semPro: true };
  if (!(await permitido('agente-codigo', 10, 60))) return { ok: false, erro: 'Muitos códigos seguidos. Espere alguns minutos.' };
  const { data, error } = await a.sb.rpc('whatsapp_gerar_codigo', { p_oficina: a.oficina.id });
  if (error || typeof data !== 'string') {
    if (error) console.error('[agente] código', error);
    return { ok: false, erro: mensagemDoBanco(error, 'Não deu para gerar o código agora. Tente de novo.') };
  }
  return { ok: true, codigo: data, numero: c.numero };
}

export async function desligarWhatsApp(telefone: string): Promise<boolean> {
  if (!/^55\d{10,11}$/.test(telefone)) return false;
  const a = await acessoDaOficina();
  if (!a.ok) return false;
  return desligarNumero(a.sb, a.oficina.id, telefone);
}

export async function rascunhosDoWhatsApp(): Promise<RascunhoParaApp[]> {
  const a = await acessoDaOficina();
  if (!a.ok) return [];
  if (!(await permitido('agente-rascunhos', 60, 10))) return [];
  return rascunhosProntos(a.sb, a.oficina.id);
}

export async function encerrarRascunhoDoWhatsApp(id: string, status: 'confirmada' | 'descartada'): Promise<boolean> {
  if (!z.uuid().safeParse(id).success || !['confirmada', 'descartada'].includes(status)) return false;
  const a = await acessoDaOficina();
  if (!a.ok) return false;
  return encerrarRascunho(a.sb, a.oficina.id, id, status);
}
