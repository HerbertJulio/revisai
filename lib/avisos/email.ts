import 'server-only';

// E-mail pelos avisos, pela API do Resend (plano grátis: 3 mil por mês). Sem RESEND_API_KEY
// e AVISOS_REMETENTE ("Revisaí <avisos@howlks.com>"), não manda nada e não dá erro.

export interface ConfigEmail {
  chave: string;
  remetente: string;
  url: string;
}

export function configEmail(): ConfigEmail | null {
  const chave = (process.env.RESEND_API_KEY ?? '').trim();
  const remetente = (process.env.AVISOS_REMETENTE ?? '').trim();
  if (!chave || !remetente) return null;
  return { chave, remetente, url: (process.env.AVISOS_RESEND_URL?.trim() || 'https://api.resend.com').replace(/\/+$/, '') };
}

export type ResultadoEmail = 'ok' | 'tentar' | 'erro';

export async function enviarEmail(c: ConfigEmail, para: string, assunto: string, html: string, texto: string): Promise<ResultadoEmail> {
  try {
    const r = await fetch(`${c.url}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.remetente, to: [para], subject: assunto.slice(0, 200), html, text: texto }),
      signal: AbortSignal.timeout(10_000)
    });
    if (r.ok) return 'ok';
    if (r.status === 429 || r.status >= 500) return 'tentar';
    console.error('[avisos] e-mail recusado', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return 'erro';
  } catch (e) {
    console.error('[avisos] e-mail falhou', e instanceof Error ? e.message : e);
    return 'tentar';
  }
}
