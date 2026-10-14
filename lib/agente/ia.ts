import 'server-only';

// A IA da ordem de serviço por voz, em dois passos, no app e no WhatsApp:
// 1. o áudio do mecânico vira texto (transcreverComIA);
// 2. o texto, com as fotos, vira a ordem preenchida (preencherComIA).
// Dois caminhos, os dois com camada grátis:
// - chave grátis do Google AI Studio em GOOGLE_GENERATIVE_AI_API_KEY. Os modelos ficam em
//   AGENTE_MODELO_GOOGLE (um ou vários, separados por vírgula, tentados em ordem);
// - Vercel AI Gateway, quando roda na Vercel (autentica sozinho por OIDC). Modelos em AGENTE_MODELO,
//   padrão google/gemini-3.6-flash. Se o modelo recusar o formato do áudio, o texto sai pelo Whisper.
// Quando um modelo está cheio ou sem cota, o próximo da lista tenta. Os prazos dos dois passos somados
// cabem nos 120 segundos da função do WhatsApp, que faz os dois.

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

type Caminho = { tipo: 'google' | 'gateway'; modelo: LanguageModel; nome: string };

// Na camada grátis os modelos "lite" respondem mesmo quando os maiores estão cheios, e o
// gemini-2.5-flash já não aceita chaves novas. O 3.8 Flash fica de reserva.
export const MODELOS_GOOGLE = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash'];
const MODELOS_GATEWAY = ['google/gemini-3.6-flash'];

function lista(valor: string | undefined, padrao: string[]): string[] {
  const nomes = (valor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return nomes.length ? nomes : padrao;
}

function caminhos(): Caminho[] {
  const chaveGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (chaveGoogle) {
    // AGENTE_GOOGLE_URL: outro endereço para a API do Google (um proxy, ou um servidor de teste)
    const baseURL = process.env.AGENTE_GOOGLE_URL?.trim() || undefined;
    const google = createGoogleGenerativeAI({ apiKey: chaveGoogle, baseURL });
    return lista(process.env.AGENTE_MODELO_GOOGLE, MODELOS_GOOGLE).map((nome) => ({ tipo: 'google', modelo: google(nome), nome }));
  }
  const naVercel = !!process.env.VERCEL || !!process.env.VERCEL_OIDC_TOKEN || !!process.env.AI_GATEWAY_API_KEY;
  if (!naVercel) return [];
  return lista(process.env.AGENTE_MODELO, MODELOS_GATEWAY).map((nome) => ({ tipo: 'gateway', modelo: gateway(nome), nome }));
}

export function agenteLigado(): boolean {
  return caminhos().length > 0;
}

const DESLIGADA = 'A IA ainda não está ligada neste servidor.';

function detalhes(e: unknown) {
  const erro = (e as { lastError?: unknown })?.lastError ?? e;
  return {
    nome: String((erro as { name?: string })?.name ?? ''),
    status: Number((erro as { statusCode?: number })?.statusCode ?? 0),
    texto: String((erro as { message?: string })?.message ?? erro)
  };
}

function erroDeChave(e: unknown): boolean {
  const { nome, status, texto } = detalhes(e);
  return /Authentication|Forbidden/.test(nome) || status === 401 || status === 403 || /api key|unauthori[sz]ed|permission/i.test(texto);
}

/** O que deu errado com a IA, em palavras que a oficina entende (e o motivo técnico para o log). */
export function motivoDoErro(e: unknown, acao: 'ouvir' | 'montar' = 'montar'): { mensagem: string; tecnico: string } {
  const { nome, status, texto } = detalhes(e);
  const tecnico = `${nome || 'Erro'}${status ? ` ${status}` : ''}: ${texto.split('\n')[0].slice(0, 160)}`;
  if (erroDeChave(e)) {
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

/**
 * Tenta os modelos em ordem dentro do prazo. Um modelo cheio (503), sem cota (429) ou que recusou
 * o pedido passa a vez ao próximo; chave recusada para tudo, porque vale para todos. Cada tentativa
 * tem um teto (um modelo cheio às vezes demora para recusar) e a última fica com o resto do prazo.
 */
async function comOsModelos<T>(lista: Caminho[], prazo: number, fazer: (c: Caminho, tempo: number, novasTentativas: number) => Promise<T>): Promise<{ valor: T; caminho: Caminho }> {
  const fim = Date.now() + prazo;
  let ultimoErro: unknown = new Error('A IA não respondeu a tempo.');
  for (const [i, c] of lista.entries()) {
    const resta = fim - Date.now();
    if (resta < 5_000) break;
    const ultimo = i === lista.length - 1;
    try {
      return { valor: await fazer(c, ultimo ? resta : Math.min(resta, 35_000), ultimo ? 1 : 0), caminho: c };
    } catch (e) {
      ultimoErro = e;
      console.error(`[agente] ${c.nome}`, motivoDoErro(e).tecnico);
      if (erroDeChave(e)) break;
    }
  }
  throw ultimoErro;
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
  const l = caminhos();
  if (!l.length) return { caminho: null, modelo: null, ok: false, motivo: 'Sem chave do Google e fora da Vercel.' };
  const modelo = l.map((c) => c.nome).join(', ');
  if (l[0].tipo === 'google') return { caminho: 'google', modelo, ok: true };
  try {
    const r = await gateway.getCredits();
    const saldo = Number(r.balance);
    return { caminho: 'gateway', modelo, ok: saldo > 0, creditos: saldo <= 0 ? 'zerado' : saldo < 0.5 ? 'acabando' : 'ok' };
  } catch (e) {
    return { caminho: 'gateway', modelo, ok: false, motivo: motivoDoErro(e).tecnico };
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
  const t = detalhes(e).texto.toLowerCase();
  return /audio|mime|media ?type|unsupported|format|invalid argument/.test(t);
}

// ---------------------------------------------------------------- passo 1: o áudio vira texto

const PRAZO_TEXTO = 50_000;
const PRAZO_ORDEM = 55_000;

/** O texto do áudio; vazio quando não tem fala. Resposta cortada pelo modelo vira erro (outro modelo tenta). */
async function transcrever(c: Caminho, audios: Midia[], tempo: number, novasTentativas: number): Promise<string> {
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
    maxRetries: novasTentativas,
    timeout: tempo
  });
  const texto = limparTranscricao(r.text);
  // resposta vazia cortada pelo modelo (filtro, limite) não é "sem fala"
  if (!texto && r.finishReason !== 'stop') throw new Error(`Transcrição vazia (${r.finishReason})`);
  return texto;
}

export async function transcreverComIA(audios: Midia[]): Promise<ResultadoTexto> {
  const l = caminhos();
  if (!l.length) return { ok: false, erro: DESLIGADA };
  if (!audios.length) return { ok: false, erro: 'Nenhum áudio para passar para texto.' };
  const fim = Date.now() + PRAZO_TEXTO;
  let ultimo: unknown;
  try {
    // no Gateway sobra um tempo para o Whisper, se o modelo recusar o formato do áudio
    const prazo = l[0].tipo === 'gateway' ? PRAZO_TEXTO - 15_000 : PRAZO_TEXTO;
    const { valor: texto, caminho } = await comOsModelos(l, prazo, (c, tempo, n) => transcrever(c, audios, tempo, n));
    return texto ? { ok: true, texto, modelo: caminho.nome } : { ok: false, erro: SEM_FALA };
  } catch (e) {
    ultimo = e;
    console.error('[agente] transcrição', motivoDoErro(e, 'ouvir').tecnico);
  }
  const resta = fim - Date.now();
  if (l[0].tipo === 'gateway' && pareceFormatoDeAudio(ultimo) && resta > 8_000) {
    try {
      const partes: string[] = [];
      for (const a of audios) {
        const t = await transcribe({
          model: gateway.transcriptionModel('openai/whisper-1'),
          audio: a.bytes,
          providerOptions: { openai: { language: 'pt' } },
          abortSignal: AbortSignal.timeout(Math.max(1_000, fim - Date.now()))
        });
        partes.push(t.text);
      }
      const texto = limparTranscricao(partes.join('\n\n'));
      return texto ? { ok: true, texto, modelo: 'openai/whisper-1' } : { ok: false, erro: SEM_FALA };
    } catch (e2) {
      ultimo = e2;
      console.error('[agente] transcrição pelo Whisper', motivoDoErro(e2, 'ouvir').tecnico);
    }
  }
  return { ok: false, erro: motivoDoErro(ultimo, 'ouvir').mensagem };
}

// ---------------------------------------------------------------- passo 2: o texto vira a ordem

async function preencher(c: Caminho, contexto: ContextoOrdem, imagens: Midia[], tempo: number, novasTentativas: number): Promise<OrdemIA> {
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
    maxRetries: novasTentativas,
    timeout: tempo
  });
  return limparOrdem({ ...r.output, transcricao: contexto.transcricao?.trim() ?? '' });
}

export async function preencherComIA(contexto: ContextoOrdem, imagens: Midia[]): Promise<ResultadoIA> {
  const l = caminhos();
  if (!l.length) return { ok: false, erro: DESLIGADA };
  try {
    const { valor: ordem, caminho } = await comOsModelos(l, PRAZO_ORDEM, (c, tempo, n) => preencher(c, contexto, imagens, tempo, n));
    return { ok: true, ordem, modelo: caminho.nome };
  } catch (e) {
    console.error('[agente] preencher a ordem', motivoDoErro(e).tecnico);
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
