import 'server-only';

// A verificação de pessoa (Cloudflare Turnstile) nos formulários públicos que não passam pelo
// login: o pedido de horário pelo link da oficina e o cadastro de interesse do site. O token vem do
// navegador e é conferido aqui, no servidor, com a chave secreta. Sem TURNSTILE_SECRET_KEY, a
// verificação fica desligada e os limites por IP seguram sozinhos. Só liga com as duas chaves: com
// a secreta e sem a do site, o servidor exigiria um desafio que o formulário não mostra.

const ENDERECO = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function captchaLigado(): boolean {
  return !!(process.env.TURNSTILE_SECRET_KEY ?? '').trim() && !!(process.env.TURNSTILE_SITE_KEY ?? '').trim();
}

/** A chave pública do site, para o formulário mostrar o desafio (null quando desligado). */
export function chaveDoSiteCaptcha(): string | null {
  return captchaLigado() ? (process.env.TURNSTILE_SITE_KEY ?? '').trim() : null;
}

/** O token resolve um desafio de verdade? Desligado: sempre sim. Falha de rede: não. */
export async function captchaValido(token: unknown, ip: string | null): Promise<boolean> {
  if (!captchaLigado()) return true;
  const segredo = (process.env.TURNSTILE_SECRET_KEY ?? '').trim();
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  try {
    const corpo = new URLSearchParams({ secret: segredo, response: token });
    if (ip && ip !== 'local') corpo.set('remoteip', ip);
    const r = await fetch(ENDERECO, { method: 'POST', body: corpo, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const d = (await r.json()) as { success?: boolean };
    return d.success === true;
  } catch (e) {
    console.error('[captcha] conferir', e instanceof Error ? e.message : e);
    return false;
  }
}
