'use server';

// A ordem de serviço por voz, em dois passos: transcreverAudio passa o áudio do mecânico para texto
// e montarOrdemComIA preenche a ordem com esse texto e as fotos. Nada fica guardado no servidor:
// o texto e o rascunho voltam para o aparelho, que guarda o áudio junto com a ordem.

import { z } from 'zod';
import { preencherComIA, transcreverComIA, type Midia, type ResultadoTexto } from '@/lib/agente/ia';
import {
  desvincularTelefone,
  encerrarRascunho,
  gerarCodigoDeVinculo,
  rascunhosProntos,
  telefonesDoAparelho,
  type RascunhoParaApp
} from '@/lib/agente/rascunhos';
import { MAX_RELATO } from '@/lib/agente/relato';
import { configWhatsApp } from '@/lib/agente/whatsapp-cloud';
import type { OrdemIA } from '@/lib/agente/esquema';
import { permitido } from '@/lib/limite';

type Resposta = { ok: true; ordem: OrdemIA; modelo: string } | { ok: false; erro: string };

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

/** Passo 1: o áudio que o mecânico acabou de gravar vira texto. */
export async function transcreverAudio(dados: FormData): Promise<ResultadoTexto> {
  if (!(await permitido('agente-ouvir', 60, 60))) return { ok: false, erro: 'Muitos áudios seguidos. Espere alguns minutos.' };
  const audios = await lerArquivos(dados, 'audio', 'audio/', 1, MAX_AUDIO_BYTES);
  if (typeof audios === 'string') return { ok: false, erro: audios };
  if (!audios.length) return { ok: false, erro: 'Grave um áudio primeiro.' };
  return transcreverComIA(audios);
}

/** Passo 2: o texto (falado ou escrito) e as fotos viram a ordem de serviço preenchida. */
export async function montarOrdemComIA(dados: FormData): Promise<Resposta> {
  if (!(await permitido('agente', 40, 60))) return { ok: false, erro: 'Muitas ordens seguidas. Espere alguns minutos.' };
  let contexto: z.infer<typeof esquemaContexto>;
  try {
    contexto = esquemaContexto.parse(JSON.parse(String(dados.get('contexto') ?? '{}')));
  } catch {
    return { ok: false, erro: 'Dados da ordem inválidos.' };
  }
  const fotos = await lerArquivos(dados, 'foto', 'image/', MAX_FOTOS, MAX_FOTO_BYTES);
  if (typeof fotos === 'string') return { ok: false, erro: fotos };
  if (!contexto.transcricao && !contexto.anotacao && !fotos.length) return { ok: false, erro: 'Fale ou escreva o que foi feito no carro.' };
  if (fotos.reduce((s, m) => s + m.bytes.length, 0) > MAX_FOTOS_BYTES) return { ok: false, erro: 'As fotos passaram do limite. Mande menos fotos.' };
  return preencherComIA({ ...contexto, quantidadeFotos: fotos.length }, fotos);
}

// ---------------------------------------------------------------- agente no WhatsApp

const aparelho = z.uuid();

export interface EstadoWhatsApp {
  ligado: boolean;
  numero: string | null;
  telefones: string[];
}

export async function estadoDoWhatsApp(aparelhoId: string): Promise<EstadoWhatsApp> {
  const c = configWhatsApp();
  if (!c || !aparelho.safeParse(aparelhoId).success) return { ligado: !!c, numero: c?.numero ?? null, telefones: [] };
  return { ligado: true, numero: c.numero, telefones: await telefonesDoAparelho(aparelhoId) };
}

export async function codigoParaWhatsApp(aparelhoId: string, oficina: string): Promise<{ ok: true; codigo: string; numero: string | null } | { ok: false; erro: string }> {
  const c = configWhatsApp();
  if (!c) return { ok: false, erro: 'O número do agente ainda não foi ligado pela equipe do Revisaí.' };
  if (!aparelho.safeParse(aparelhoId).success) return { ok: false, erro: 'Aparelho inválido.' };
  if (!(await permitido('agente-codigo', 10, 60))) return { ok: false, erro: 'Muitos códigos seguidos. Espere alguns minutos.' };
  const codigo = await gerarCodigoDeVinculo(aparelhoId, String(oficina ?? '').slice(0, 120));
  return codigo ? { ok: true, codigo, numero: c.numero } : { ok: false, erro: 'Não deu para gerar o código agora. Tente de novo.' };
}

export async function desligarWhatsApp(aparelhoId: string, telefone: string): Promise<boolean> {
  if (!aparelho.safeParse(aparelhoId).success || !/^55\d{10,11}$/.test(telefone)) return false;
  return desvincularTelefone(aparelhoId, telefone);
}

export async function rascunhosDoWhatsApp(aparelhoId: string): Promise<RascunhoParaApp[]> {
  if (!aparelho.safeParse(aparelhoId).success) return [];
  if (!(await permitido('agente-rascunhos', 60, 10))) return [];
  return rascunhosProntos(aparelhoId);
}

export async function encerrarRascunhoDoWhatsApp(aparelhoId: string, id: string, status: 'confirmada' | 'descartada'): Promise<boolean> {
  if (!aparelho.safeParse(aparelhoId).success || !z.uuid().safeParse(id).success || !['confirmada', 'descartada'].includes(status)) return false;
  return encerrarRascunho(aparelhoId, id, status);
}
