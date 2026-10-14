import 'server-only';

// Chama a IA para montar a ordem de serviço. Dois caminhos, os dois com camada grátis:
// 1. Vercel AI Gateway (padrão quando roda na Vercel; autentica sozinho por OIDC e a conta tem
//    crédito grátis todo mês). Modelo em AGENTE_MODELO, padrão google/gemini-3.6-flash.
// 2. Chave grátis do Google AI Studio em GOOGLE_GENERATIVE_AI_API_KEY (modelo em
//    AGENTE_MODELO_GOOGLE, padrão gemini-2.5-flash).
// O modelo ouve o áudio direto. Se ele recusar o formato do áudio, o áudio é transcrito antes
// (Whisper pelo Gateway) e a ordem é montada a partir do texto.

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { gateway, generateText, Output, transcribe, type LanguageModel, type UserContent } from 'ai';
import { esquemaOrdem, limparOrdem, type OrdemIA } from './esquema';
import { INSTRUCOES_AGENTE, textoDoPedido, type ContextoOrdem } from './prompt';

export interface Midia {
  bytes: Uint8Array;
  mime: string;
}

export type ResultadoIA = { ok: true; ordem: OrdemIA; modelo: string } | { ok: false; erro: string };

type Caminho = { tipo: 'google'; modelo: LanguageModel; nome: string } | { tipo: 'gateway'; modelo: LanguageModel; nome: string };

function caminho(): Caminho | null {
  const chaveGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (chaveGoogle) {
    const nome = process.env.AGENTE_MODELO_GOOGLE?.trim() || 'gemini-2.5-flash';
    // AGENTE_GOOGLE_URL: outro endereço para a API do Google (um proxy, ou um servidor de teste)
    const baseURL = process.env.AGENTE_GOOGLE_URL?.trim() || undefined;
    return { tipo: 'google', modelo: createGoogleGenerativeAI({ apiKey: chaveGoogle, baseURL })(nome), nome };
  }
  const naVercel = !!process.env.VERCEL || !!process.env.VERCEL_OIDC_TOKEN || !!process.env.AI_GATEWAY_API_KEY;
  if (!naVercel) return null;
  const nome = process.env.AGENTE_MODELO?.trim() || 'google/gemini-3.6-flash';
  return { tipo: 'gateway', modelo: gateway(nome), nome };
}

export function agenteLigado(): boolean {
  return caminho() != null;
}

/** O áudio que o navegador ou o WhatsApp manda, no tipo que o modelo entende. */
function tipoDoAudio(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'audio/mp4';
  if (base === 'audio/opus') return 'audio/ogg';
  return base || 'audio/webm';
}

async function montar(c: Caminho, contexto: ContextoOrdem, audios: Midia[] | string[], imagens: Midia[]): Promise<OrdemIA> {
  const conteudo: UserContent = [{ type: 'text', text: textoDoPedido(contexto) }];
  audios.forEach((a, i) => {
    if (typeof a === 'string') conteudo.push({ type: 'text', text: `Áudio ${i + 1} (transcrito): ${a}` });
    else conteudo.push({ type: 'file', data: a.bytes, mediaType: tipoDoAudio(a.mime), filename: `audio-${i + 1}` });
  });
  imagens.forEach((img, i) => {
    conteudo.push({ type: 'text', text: `Foto ${i + 1}:` });
    conteudo.push({ type: 'image', image: img.bytes, mediaType: img.mime });
  });
  const r = await generateText({
    model: c.modelo,
    system: INSTRUCOES_AGENTE,
    messages: [{ role: 'user', content: conteudo }],
    output: Output.object({ schema: esquemaOrdem, name: 'ordem_de_servico' }),
    temperature: 0.2,
    maxOutputTokens: 6000,
    maxRetries: 1,
    timeout: 90_000
  });
  return limparOrdem(r.output);
}

function pareceFormatoDeAudio(e: unknown): boolean {
  const t = String((e as { message?: string })?.message ?? e).toLowerCase();
  return /audio|mime|media ?type|unsupported|format|invalid argument/.test(t);
}

export async function interpretarComIA(contexto: ContextoOrdem, audios: Midia[], imagens: Midia[]): Promise<ResultadoIA> {
  const c = caminho();
  if (!c) return { ok: false, erro: 'A IA ainda não está ligada neste servidor.' };
  try {
    return { ok: true, ordem: await montar(c, contexto, audios, imagens), modelo: c.nome };
  } catch (e) {
    console.error('[agente] primeira tentativa', e);
    if (audios.length && c.tipo === 'gateway' && pareceFormatoDeAudio(e)) {
      try {
        const textos: string[] = [];
        for (const a of audios) {
          const t = await transcribe({ model: gateway.transcriptionModel('openai/whisper-1'), audio: a.bytes, providerOptions: { openai: { language: 'pt' } } });
          textos.push(t.text);
        }
        return { ok: true, ordem: await montar(c, contexto, textos, imagens), modelo: `${c.nome} + whisper` };
      } catch (e2) {
        console.error('[agente] com transcrição', e2);
      }
    }
    return { ok: false, erro: 'A IA não conseguiu montar a ordem agora. Tente de novo em instantes ou registre à mão.' };
  }
}
