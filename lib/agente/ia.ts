import 'server-only';

// A IA da ordem de serviço por voz, em dois passos, no app e no WhatsApp:
// 1. o áudio do mecânico vira texto (transcreverComIA);
// 2. o texto, com as fotos, vira a ordem preenchida (preencherComIA).
// Dois caminhos, os dois com camada grátis:
// - chave grátis do Google AI Studio em GOOGLE_GENERATIVE_AI_API_KEY (modelo em
//   AGENTE_MODELO_GOOGLE, padrão gemini-2.5-flash);
// - Vercel AI Gateway, quando roda na Vercel (autentica sozinho por OIDC). Modelo em AGENTE_MODELO,
//   padrão google/gemini-3.6-flash. Se o modelo recusar o formato do áudio, o texto sai pelo Whisper.
// Os prazos de cada passo somados cabem nos 120 segundos da função do WhatsApp, que faz os dois.

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { gateway, generateText, Output, transcribe, type LanguageModel, type UserContent } from 'ai';
import { esquemaPreenchimento, limparOrdem, type OrdemIA } from './esquema';
import { INSTRUCOES_AGENTE, INSTRUCOES_TRANSCRICAO, textoDoPedido, type ContextoOrdem } from './prompt';
import { juntarRelato, limparTranscricao, SEM_FALA } from './relato';

export interface Midia {
  bytes: Uint8Array;
  mime: string;
}

export type ResultadoIA = { ok: true; ordem: OrdemIA; modelo: string } | { ok: false; erro: string };
export type ResultadoTexto = { ok: true; texto: string; modelo: string } | { ok: false; erro: string };

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

const DESLIGADA = 'A IA ainda não está ligada neste servidor.';

/** O que deu errado com a IA, em palavras que a oficina entende (e o motivo técnico para o log). */
export function motivoDoErro(e: unknown, acao: 'ouvir' | 'montar' = 'montar'): { mensagem: string; tecnico: string } {
  const erro = (e as { lastError?: unknown })?.lastError ?? e;
  const nome = String((erro as { name?: string })?.name ?? '');
  const status = Number((erro as { statusCode?: number })?.statusCode ?? 0);
  const texto = String((erro as { message?: string })?.message ?? erro);
  const tecnico = `${nome || 'Erro'}${status ? ` ${status}` : ''}: ${texto.split('\n')[0].slice(0, 160)}`;
  if (/Authentication|Forbidden/.test(nome) || status === 401 || status === 403 || /api key|unauthori[sz]ed|permission/i.test(texto)) {
    return { mensagem: 'A IA ainda não está liberada neste servidor. Avise a equipe do Revisaí e registre à mão por enquanto.', tecnico };
  }
  if (status === 402 || /credit|insufficient|funds|balance|billing|quota/i.test(texto)) {
    return { mensagem: 'A IA chegou ao limite de uso por agora. Registre à mão e tente de novo mais tarde.', tecnico };
  }
  if (/RateLimit/.test(nome) || status === 429) {
    return { mensagem: 'Muitas ordens ao mesmo tempo na IA. Tente de novo em um minuto.', tecnico };
  }
  if (acao === 'ouvir') return { mensagem: 'A IA não conseguiu passar o áudio para texto agora. O áudio está guardado: tente de novo em instantes.', tecnico };
  return { mensagem: 'A IA não conseguiu montar a ordem agora. Tente de novo em instantes ou registre à mão.', tecnico };
}

export interface EstadoDaIA {
  caminho: 'gateway' | 'google' | null;
  modelo: string | null;
  ok: boolean;
  creditos?: 'ok' | 'acabando' | 'zerado';
  motivo?: string;
}

/** Diagnóstico sem gastar: no AI Gateway, consulta os créditos (confere a autenticação também). */
export async function estadoDaIA(): Promise<EstadoDaIA> {
  const c = caminho();
  if (!c) return { caminho: null, modelo: null, ok: false, motivo: 'Sem chave do Google e fora da Vercel.' };
  if (c.tipo === 'google') return { caminho: 'google', modelo: c.nome, ok: true };
  try {
    const r = await gateway.getCredits();
    const saldo = Number(r.balance);
    return { caminho: 'gateway', modelo: c.nome, ok: saldo > 0, creditos: saldo <= 0 ? 'zerado' : saldo < 0.5 ? 'acabando' : 'ok' };
  } catch (e) {
    return { caminho: 'gateway', modelo: c.nome, ok: false, motivo: motivoDoErro(e).tecnico };
  }
}

/** O áudio que o navegador ou o WhatsApp manda, no tipo que o modelo entende. */
function tipoDoAudio(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'audio/mp4';
  if (base === 'audio/opus') return 'audio/ogg';
  return base || 'audio/webm';
}

function pareceFormatoDeAudio(e: unknown): boolean {
  const t = String((e as { message?: string })?.message ?? e).toLowerCase();
  return /audio|mime|media ?type|unsupported|format|invalid argument/.test(t);
}

// ---------------------------------------------------------------- passo 1: o áudio vira texto

const PRAZO_TEXTO = 45_000;
const PRAZO_WHISPER = 25_000;
const PRAZO_ORDEM = 45_000;

async function transcrever(c: Caminho, audios: Midia[]): Promise<{ texto: string; fim: string }> {
  const conteudo: UserContent = [{ type: 'text', text: audios.length > 1 ? `Transcreva os ${audios.length} áudios, na ordem.` : 'Transcreva o áudio.' }];
  audios.forEach((a, i) => conteudo.push({ type: 'file', data: a.bytes, mediaType: tipoDoAudio(a.mime), filename: `audio-${i + 1}` }));
  const r = await generateText({
    model: c.modelo,
    system: INSTRUCOES_TRANSCRICAO,
    messages: [{ role: 'user', content: conteudo }],
    temperature: 0,
    // transcrever não pede raciocínio: sem ele a resposta vem mais rápido
    reasoning: 'none',
    maxOutputTokens: 8000,
    maxRetries: 1,
    timeout: PRAZO_TEXTO
  });
  return { texto: r.text, fim: r.finishReason };
}

export async function transcreverComIA(audios: Midia[]): Promise<ResultadoTexto> {
  const c = caminho();
  if (!c) return { ok: false, erro: DESLIGADA };
  if (!audios.length) return { ok: false, erro: 'Nenhum áudio para passar para texto.' };
  let ultimo: unknown;
  try {
    const r = await transcrever(c, audios);
    const texto = limparTranscricao(r.texto);
    if (texto) return { ok: true, texto, modelo: c.nome };
    // resposta vazia cortada pelo modelo (filtro, limite) não é "sem fala": dá para tentar de novo
    if (r.fim !== 'stop') throw new Error(`Transcrição vazia (${r.fim})`);
    return { ok: false, erro: SEM_FALA };
  } catch (e) {
    ultimo = e;
    console.error('[agente] transcrição', motivoDoErro(e, 'ouvir').tecnico, e);
  }
  if (c.tipo === 'gateway' && pareceFormatoDeAudio(ultimo)) {
    try {
      const partes: string[] = [];
      for (const a of audios) {
        const t = await transcribe({
          model: gateway.transcriptionModel('openai/whisper-1'),
          audio: a.bytes,
          providerOptions: { openai: { language: 'pt' } },
          abortSignal: AbortSignal.timeout(PRAZO_WHISPER)
        });
        partes.push(t.text);
      }
      const texto = limparTranscricao(partes.join('\n\n'));
      return texto ? { ok: true, texto, modelo: 'openai/whisper-1' } : { ok: false, erro: SEM_FALA };
    } catch (e2) {
      ultimo = e2;
      console.error('[agente] transcrição pelo Whisper', motivoDoErro(e2, 'ouvir').tecnico, e2);
    }
  }
  return { ok: false, erro: motivoDoErro(ultimo, 'ouvir').mensagem };
}

// ---------------------------------------------------------------- passo 2: o texto vira a ordem

async function preencher(c: Caminho, contexto: ContextoOrdem, imagens: Midia[]): Promise<OrdemIA> {
  const conteudo: UserContent = [{ type: 'text', text: textoDoPedido(contexto) }];
  imagens.forEach((img, i) => {
    conteudo.push({ type: 'text', text: `Foto ${i + 1}:` });
    conteudo.push({ type: 'image', image: img.bytes, mediaType: img.mime });
  });
  const r = await generateText({
    model: c.modelo,
    system: INSTRUCOES_AGENTE,
    messages: [{ role: 'user', content: conteudo }],
    output: Output.object({ schema: esquemaPreenchimento, name: 'ordem_de_servico' }),
    temperature: 0.2,
    // um pouco de raciocínio ajuda a separar o feito do recomendado sem deixar o mecânico esperando
    reasoning: 'minimal',
    maxOutputTokens: 8000,
    maxRetries: 1,
    timeout: PRAZO_ORDEM
  });
  return limparOrdem({ ...r.output, transcricao: contexto.transcricao?.trim() ?? '' });
}

export async function preencherComIA(contexto: ContextoOrdem, imagens: Midia[]): Promise<ResultadoIA> {
  const c = caminho();
  if (!c) return { ok: false, erro: DESLIGADA };
  try {
    return { ok: true, ordem: await preencher(c, contexto, imagens), modelo: c.nome };
  } catch (e) {
    console.error('[agente] preencher a ordem', motivoDoErro(e).tecnico, e);
    return { ok: false, erro: motivoDoErro(e).mensagem };
  }
}

/**
 * O caminho inteiro de uma vez (o do WhatsApp): os áudios viram texto e o texto, com as fotos, vira a
 * ordem. O que o mecânico escreveu entra no relato junto com o que falou, para ficar na ordem e valer
 * quando ele preencher de novo no app.
 */
export async function interpretarComIA(contexto: ContextoOrdem, audios: Midia[], imagens: Midia[]): Promise<ResultadoIA> {
  let falado = contexto.transcricao?.trim() ?? '';
  let modeloDoTexto: string | null = null;
  if (audios.length) {
    const t = await transcreverComIA(audios);
    if (t.ok) {
      falado = juntarRelato(falado, t.texto);
      modeloDoTexto = t.modelo;
    } else if (!(t.erro === SEM_FALA && (falado || contexto.anotacao || imagens.length))) {
      // um áudio sem fala não estraga a ordem quando há texto ou foto; outro erro para tudo
      return t;
    }
  }
  const relato = juntarRelato(falado, contexto.anotacao ?? '');
  if (!relato && !imagens.length) return { ok: false, erro: SEM_FALA };
  const r = await preencherComIA({ ...contexto, transcricao: relato || null, anotacao: null }, imagens);
  return r.ok && modeloDoTexto && modeloDoTexto !== r.modelo ? { ...r, modelo: `${r.modelo} + ${modeloDoTexto}` } : r;
}
