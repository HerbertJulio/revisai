import 'server-only';

// Web Push: as chaves VAPID do Revisaí (geradas no primeiro uso e guardadas no banco, que só
// entrega à chave do sistema) e o envio de cada aviso cifrado para o navegador da pessoa.
// A cifragem e a assinatura vêm do pacote web-push (padrão RFC 8291 e RFC 8292); a entrega é um
// fetch comum, que funciona igual na Vercel e nos testes.

import webpush from 'web-push';
import { clienteSistema } from '../supabase-servidor';

export interface ChavesVapid {
  publica: string;
  privada: string;
}

export interface InscricaoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let emMemoria: ChavesVapid | null = null;

function lerChaves(dados: unknown): ChavesVapid | null {
  const d = dados as { publica?: unknown; privada?: unknown } | null;
  return d && typeof d.publica === 'string' && typeof d.privada === 'string' ? { publica: d.publica, privada: d.privada } : null;
}

/** As chaves VAPID, criando e guardando no banco na primeira vez (vale a primeira gravada). */
export async function chavesVapid(): Promise<ChavesVapid | null> {
  if (emMemoria) return emMemoria;
  const sb = clienteSistema();
  if (!sb) return null;
  const atual = await sb.rpc('vapid_obter');
  if (atual.error) {
    console.error('[avisos] vapid_obter', atual.error.message);
    return null;
  }
  let chaves = lerChaves(atual.data);
  if (!chaves) {
    const novas = webpush.generateVAPIDKeys();
    const gravadas = await sb.rpc('vapid_guardar', { p_publica: novas.publicKey, p_privada: novas.privateKey });
    if (gravadas.error) {
      console.error('[avisos] vapid_guardar', gravadas.error.message);
      return null;
    }
    chaves = lerChaves(gravadas.data);
  }
  emMemoria = chaves;
  return chaves;
}

/** Quem manda (o serviço de push pode avisar esse contato se algo der errado). */
function assunto(): string {
  const contato = (process.env.VAPID_ASSUNTO ?? '').trim();
  if (/^(mailto:|https:\/\/)/.test(contato)) return contato;
  return (process.env.SITE_URL?.trim() || 'https://revisai.howlks.com').replace(/\/+$/, '');
}

export type ResultadoPush = 'ok' | 'sumiu' | 'tentar' | 'erro';

/**
 * Só os serviços de push dos navegadores (Chrome, Firefox, Safari, Edge): o endereço vem do
 * navegador da pessoa, e o servidor não pode ser usado para chamar qualquer endereço da internet.
 */
export function servicoDePushValido(endpoint: string, local = process.env.NODE_ENV !== 'production'): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (local && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return true;
  if (u.protocol !== 'https:' || u.port !== '' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return (
    h === 'fcm.googleapis.com' ||
    h === 'android.googleapis.com' ||
    h === 'updates.push.services.mozilla.com' ||
    h === 'web.push.apple.com' ||
    h.endsWith('.push.apple.com') ||
    h.endsWith('.notify.windows.com')
  );
}

/** Manda um aviso para um navegador. 'sumiu' = a inscrição não existe mais (apagar). */
export async function enviarPush(inscricao: InscricaoPush, carga: string, chaves: ChavesVapid, ttlSegundos = 86_400): Promise<ResultadoPush> {
  let pedido: { endpoint: string; method: string; headers: Record<string, string | number>; body: Buffer | null };
  if (!servicoDePushValido(inscricao.endpoint)) return 'sumiu';
  try {
    pedido = webpush.generateRequestDetails(
      { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
      carga,
      { vapidDetails: { subject: assunto(), publicKey: chaves.publica, privateKey: chaves.privada }, TTL: ttlSegundos, urgency: 'normal', contentEncoding: 'aes128gcm' }
    ) as typeof pedido;
  } catch (e) {
    console.error('[avisos] push inválido', e instanceof Error ? e.message : e);
    return 'sumiu';
  }
  try {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(pedido.headers)) headers[k] = String(v);
    const r = await fetch(pedido.endpoint, {
      method: pedido.method,
      headers,
      body: pedido.body ? new Uint8Array(pedido.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    if (r.status >= 200 && r.status < 300) return 'ok';
    if (r.status === 404 || r.status === 410) return 'sumiu';
    if (r.status === 429 || r.status >= 500) return 'tentar';
    console.error('[avisos] push recusado', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return 'erro';
  } catch (e) {
    console.error('[avisos] push falhou', e instanceof Error ? e.message : e);
    return 'tentar';
  }
}
