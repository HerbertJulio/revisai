import 'server-only';

// WhatsApp Cloud API (Meta). Grátis para responder quem mandou mensagem nas últimas 24 horas,
// que é o caso do mecânico falando com o agente. Variáveis na Vercel:
//   WHATSAPP_TOKEN            token permanente de um usuário do sistema do Business Manager
//   WHATSAPP_PHONE_NUMBER_ID  id do número do agente (aparece no painel do app na Meta)
//   WHATSAPP_VERIFY_TOKEN     texto qualquer, o mesmo cadastrado no webhook da Meta
//   WHATSAPP_APP_SECRET       segredo do app na Meta (confere a assinatura de cada chamada)
//   WHATSAPP_NUMERO           o número do agente como as oficinas veem, ex.: +55 21 99999-0000

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const VERSAO = process.env.WHATSAPP_API_VERSAO?.trim() || 'v23.0';

export interface ConfigWhatsApp {
  token: string;
  numeroId: string;
  verificacao: string;
  segredo: string;
  numero: string | null;
}

export function configWhatsApp(): ConfigWhatsApp | null {
  const token = process.env.WHATSAPP_TOKEN?.trim() ?? '';
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '';
  const verificacao = process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? '';
  const segredo = process.env.WHATSAPP_APP_SECRET?.trim() ?? '';
  if (!token || !numeroId || !verificacao || !segredo) return null;
  return { token, numeroId, verificacao, segredo, numero: process.env.WHATSAPP_NUMERO?.trim() || null };
}

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC do corpo com o segredo do app). */
export function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false;
  const recebida = Buffer.from(cabecalho.slice(7), 'hex');
  const esperada = createHmac('sha256', segredo).update(corpo, 'utf8').digest();
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

const esquemaMensagem = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
  voice: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
  image: z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() }).optional()
});

const esquemaWebhook = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string().optional(),
          value: z.object({
            messages: z.array(z.unknown()).optional(),
            contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional()
          })
        })
      )
    })
  )
});

export type MensagemRecebida =
  | { tipo: 'texto'; de: string; id: string; texto: string }
  | { tipo: 'audio'; de: string; id: string; midiaId: string; mime: string }
  | { tipo: 'imagem'; de: string; id: string; midiaId: string; mime: string; legenda: string | null }
  | { tipo: 'outro'; de: string; id: string };

/** As mensagens de um aviso do webhook, já no formato do app (o resto é ignorado). */
export function lerMensagens(corpo: unknown): MensagemRecebida[] {
  const r = esquemaWebhook.safeParse(corpo);
  if (!r.success || r.data.object !== 'whatsapp_business_account') return [];
  const lista: MensagemRecebida[] = [];
  for (const entrada of r.data.entry)
    for (const mudanca of entrada.changes)
      for (const bruta of mudanca.value.messages ?? []) {
        const m = esquemaMensagem.safeParse(bruta);
        if (!m.success) continue;
        const { from: de, id, type } = m.data;
        if (!/^\d{10,15}$/.test(de)) continue;
        const audio = m.data.audio ?? m.data.voice;
        if (type === 'text' && m.data.text) lista.push({ tipo: 'texto', de, id, texto: m.data.text.body.slice(0, 2000) });
        else if ((type === 'audio' || type === 'voice') && audio) lista.push({ tipo: 'audio', de, id, midiaId: audio.id, mime: audio.mime_type ?? 'audio/ogg' });
        else if (type === 'image' && m.data.image) lista.push({ tipo: 'imagem', de, id, midiaId: m.data.image.id, mime: m.data.image.mime_type ?? 'image/jpeg', legenda: m.data.image.caption?.slice(0, 500) ?? null });
        else lista.push({ tipo: 'outro', de, id });
      }
  return lista;
}

/** Os endereços de onde a Meta entrega a mídia (o token não vai para mais ninguém). */
const HOSTS_DA_META = [/^lookaside\.fbsbx\.com$/, /(^|\.)fbcdn\.net$/, /(^|\.)whatsapp\.net$/, /^graph\.facebook\.com$/];

export function urlDaMeta(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_DA_META.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

/** Os tipos que o agente aceita e o tamanho máximo de cada um. */
export const LIMITES_DE_MIDIA: Record<'audio' | 'imagem', { tipos: string[]; maximo: number }> = {
  audio: { tipos: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm'], maximo: 16_000_000 },
  imagem: { tipos: ['image/jpeg', 'image/png', 'image/webp'], maximo: 5_000_000 }
};

export function midiaAceita(tipo: 'audio' | 'imagem', mime: string, tamanho: number): boolean {
  const l = LIMITES_DE_MIDIA[tipo];
  return l.tipos.includes(mime.split(';')[0].trim().toLowerCase()) && tamanho > 0 && tamanho <= l.maximo;
}

/** Lê o corpo até `maximo` bytes (passou, para e devolve null). */
async function lerAte(r: Response, maximo: number): Promise<Uint8Array | null> {
  const declarado = Number(r.headers.get('content-length') ?? 0);
  if (declarado > maximo) return null;
  if (!r.body) return null;
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > maximo) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    bytes.set(p, i);
    i += p.length;
  }
  return bytes;
}

/**
 * Baixa um áudio ou foto que chegou (dois passos: pega a URL e depois o arquivo, com o token).
 * Só de endereços da Meta, só os tipos aceitos e com tamanho máximo (16 MB áudio, 5 MB foto).
 */
export async function baixarMidia(c: ConfigWhatsApp, midiaId: string, tipo: 'audio' | 'imagem' = 'audio'): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!/^[A-Za-z0-9_.-]{1,200}$/.test(midiaId)) return null;
  const limite = LIMITES_DE_MIDIA[tipo];
  try {
    const info = await fetch(`https://graph.facebook.com/${VERSAO}/${encodeURIComponent(midiaId)}`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(15_000) });
    if (!info.ok) return null;
    const j = (await info.json()) as { url?: string; mime_type?: string; file_size?: number };
    const mime = (j.mime_type ?? '').split(';')[0].trim().toLowerCase();
    if (!j.url || !urlDaMeta(j.url) || !limite.tipos.includes(mime) || (j.file_size ?? 0) > limite.maximo) return null;
    // segue no máximo 3 redirecionamentos, e só para endereços da Meta
    let url = j.url;
    let arquivo: Response | null = null;
    for (let salto = 0; salto < 4; salto++) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${c.token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
      const destino = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (!destino) {
        arquivo = r;
        break;
      }
      const proximo = new URL(destino, url).toString();
      if (!urlDaMeta(proximo)) return null;
      url = proximo;
    }
    if (!arquivo?.ok) return null;
    const bytes = await lerAte(arquivo, limite.maximo);
    if (!bytes || !midiaAceita(tipo, mime, bytes.length)) return null;
    return { bytes, mime };
  } catch (e) {
    console.error('[whatsapp] baixar mídia', e);
    return null;
  }
}

/** Responde com texto (dentro da janela de 24 horas da conversa, sem custo). */
export async function responder(c: ConfigWhatsApp, para: string, texto: string): Promise<boolean> {
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSAO}/${c.numeroId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'text', text: { body: texto.slice(0, 4000), preview_url: true } })
    });
    if (!r.ok) console.error('[whatsapp] responder', r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (e) {
    console.error('[whatsapp] responder', e);
    return false;
  }
}

/** O que o mecânico escreveu é um comando? */
export function comando(texto: string): 'fechar' | 'texto' | 'ajuda' | 'cancelar' | { conectar: string } | null {
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  const c = /^(conectar|ligar|codigo)\s*:?\s*(\d{8})$/.exec(t) ?? /^(\d{8})$/.exec(t);
  if (c) return { conectar: c[c.length - 1] };
  if (/^(fechar|pronto|finalizar|terminei|fim|montar)( a ordem)?[!.\s]*$/.test(t)) return 'fechar';
  if (/^(texto|mensagem)( para| pro)?( o)? ?(cliente)?[!.?\s]*$/.test(t) || /(arruma|faz|escreve|manda)( um| o)? texto (para|pro) (o )?cliente/.test(t)) return 'texto';
  if (/^(ajuda|menu|oi|ola|bom dia|boa tarde|boa noite)[!.,\s]*$/.test(t)) return 'ajuda';
  if (/^(cancelar|descartar|apagar)( a ordem)?[!.\s]*$/.test(t)) return 'cancelar';
  return null;
}
