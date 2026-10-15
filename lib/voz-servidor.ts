import 'server-only';

// A voz natural das perguntas do passo a passo. Cada frase é gerada uma vez pela IA do Google
// (voz do Gemini, no plano grátis) e guardada no Storage (bucket público "voz"); dali em diante a rota
// só repassa o arquivo. Sem chave ou se a IA falhar, a rota responde 404 e o navegador lê o texto.

import { clienteEquipe } from './equipe';
import { FRASES, versaoDaFrase, type FraseId } from './voz-frases';

const BUCKET = 'voz';
// os modelos de voz na ordem; o primeiro que responder fica
const MODELOS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'];
const VOZ = 'Achird';
const ESTILO = 'português do Brasil, simpático e calmo, como um colega de oficina, sem pressa';

function lista(env: string | undefined, padrao: string[]): string[] {
  const nomes = (env ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return nomes.length ? nomes : padrao;
}

/** Cabeçalho WAV para PCM 16 bits (o formato que a API devolve sem cabeçalho). */
export function wavDePcm(pcm: Uint8Array, taxa = 24_000, canais = 1): Uint8Array {
  const cabecalho = new ArrayBuffer(44);
  const v = new DataView(cabecalho);
  const escrever = (pos: number, texto: string) => [...texto].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  escrever(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  escrever(8, 'WAVE');
  escrever(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canais, true);
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * canais * 2, true);
  v.setUint16(32, canais * 2, true);
  v.setUint16(34, 16, true);
  escrever(36, 'data');
  v.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(cabecalho), 0);
  wav.set(pcm, 44);
  return wav;
}

function ehWav(b: Uint8Array): boolean {
  return b.length > 44 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WAVE';
}

/** Acha o áudio na resposta, seja da API de interações (steps/content) ou do generateContent (inlineData). */
export function audioDaResposta(json: unknown): { dados: string; tipo: string | null } | null {
  let achado: { dados: string; tipo: string | null } | null = null;
  const visitar = (x: unknown) => {
    if (achado || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (const y of x) visitar(y);
      return;
    }
    const o = x as Record<string, unknown>;
    const inline = (o.inlineData ?? o.inline_data) as Record<string, unknown> | undefined;
    if (inline && typeof inline.data === 'string') {
      achado = { dados: inline.data, tipo: String(inline.mimeType ?? inline.mime_type ?? '') || null };
      return;
    }
    if (o.type === 'audio' && typeof o.data === 'string') {
      achado = { dados: o.data, tipo: String(o.mime_type ?? o.mimeType ?? '') || null };
      return;
    }
    for (const y of Object.values(o)) visitar(y);
  };
  visitar(json);
  return achado;
}

/** Bytes do áudio em WAV (embrulha o PCM cru quando vem sem cabeçalho). */
export function paraWav(dados: string, tipo: string | null): Uint8Array | null {
  const bytes = new Uint8Array(Buffer.from(dados, 'base64'));
  if (bytes.length < 1000) return null;
  if (ehWav(bytes)) return bytes;
  if (!tipo || /l16|pcm/i.test(tipo)) {
    const taxa = Number(/rate=(\d+)/.exec(tipo ?? '')?.[1] ?? 24_000);
    return wavDePcm(bytes, taxa);
  }
  return null;
}

async function gerar(texto: string): Promise<Uint8Array | null> {
  const chave = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!chave) return null;
  const base = (process.env.AGENTE_GOOGLE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  // a rota tem 60 s: as tentativas param antes disso
  const limite = Date.now() + 45_000;
  for (const modelo of lista(process.env.VOZ_MODELO, MODELOS)) {
    // os modelos novos respondem na API de interações; os de antes, no generateContent
    const tentativas: { url: string; corpo: unknown }[] = [
      {
        url: `${base}/interactions`,
        corpo: {
          model: modelo,
          input: [{ type: 'user_input', content: [{ type: 'text', text: texto, annotations: [{ type: 'speech_metadata', style: ESTILO }] }] }],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice: VOZ }] }
        }
      },
      {
        url: `${base}/models/${modelo}:generateContent`,
        corpo: {
          contents: [{ parts: [{ text: `Fale em ${ESTILO}: ${texto}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } } }
        }
      }
    ];
    for (const t of tentativas) {
      const resta = limite - Date.now();
      if (resta < 3_000) return null;
      try {
        const r = await fetch(t.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
          body: JSON.stringify(t.corpo),
          signal: AbortSignal.timeout(Math.min(20_000, resta))
        });
        if (!r.ok) {
          console.warn(`[voz] ${modelo} ${t.url.endsWith('/interactions') ? 'interactions' : 'generateContent'} ${r.status}`);
          continue;
        }
        const audio = audioDaResposta(await r.json());
        const wav = audio ? paraWav(audio.dados, audio.tipo) : null;
        if (wav) return wav;
      } catch (e) {
        console.warn('[voz]', modelo, e instanceof Error ? e.message : e);
      }
    }
  }
  return null;
}

// cada instância guarda as vozes que já buscou ou gerou, não gera de novo logo depois de falhar e não
// gera a mesma frase duas vezes ao mesmo tempo
const falhas = new Map<string, number>();
const prontas = new Map<string, Uint8Array>();
const andando = new Map<string, Promise<Uint8Array | null>>();

/** O áudio da frase: o já buscado, o guardado no Storage ou, se ainda não existe e `podeGerar` deixar, um novo. */
export function vozDaFrase(id: FraseId, podeGerar: () => Promise<boolean>): Promise<Uint8Array | null> {
  const caminho = `${id}-${versaoDaFrase(id)}.wav`;
  const pronta = prontas.get(caminho);
  if (pronta) return Promise.resolve(pronta);
  let p = andando.get(caminho);
  if (!p) {
    p = buscarOuGerar(id, caminho, podeGerar).finally(() => andando.delete(caminho));
    andando.set(caminho, p);
  }
  return p;
}

async function buscarOuGerar(id: FraseId, caminho: string, podeGerar: () => Promise<boolean>): Promise<Uint8Array | null> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (url) {
    try {
      const guardado = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${caminho}`, { signal: AbortSignal.timeout(8000) });
      if (guardado.ok) {
        const bytes = new Uint8Array(await guardado.arrayBuffer());
        if (ehWav(bytes)) {
          prontas.set(caminho, bytes);
          return bytes;
        }
      }
    } catch {}
  }
  if (Date.now() - (falhas.get(caminho) ?? 0) < 10 * 60_000) return null;
  if (!(await podeGerar())) return null;
  const wav = await gerar(FRASES[id]);
  if (!wav) {
    falhas.set(caminho, Date.now());
    return null;
  }
  prontas.set(caminho, wav);
  const sb = clienteEquipe();
  if (sb) {
    const { error } = await sb.storage.from(BUCKET).upload(caminho, wav, { contentType: 'audio/wav', upsert: false, cacheControl: '31536000' });
    if (error && !/exists|duplicate/i.test(error.message)) console.warn('[voz] guardar', error.message);
  }
  return wav;
}
