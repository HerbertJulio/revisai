import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { captchaLigado, captchaValido, chaveDoSiteCaptcha } = await import('../lib/captcha');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('verificação de pessoa nos formulários públicos', () => {
  it('fica desligada sem as duas chaves e deixa passar', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('TURNSTILE_SITE_KEY', '');
    expect(captchaLigado()).toBe(false);
    expect(chaveDoSiteCaptcha()).toBeNull();
    expect(await captchaValido('', '1.2.3.4')).toBe(true);
  });

  it('com a secreta e sem a do site continua desligada (o formulário não mostraria o desafio)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'segredo');
    vi.stubEnv('TURNSTILE_SITE_KEY', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(captchaLigado()).toBe(false);
    expect(await captchaValido('', null)).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it('ligada, recusa sem token e confere o token na Cloudflare', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'segredo');
    vi.stubEnv('TURNSTILE_SITE_KEY', 'chave-do-site');
    expect(chaveDoSiteCaptcha()).toBe('chave-do-site');
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const corpo = new URLSearchParams(String(init?.body));
      return new Response(JSON.stringify({ success: corpo.get('response') === 'bom' && corpo.get('secret') === 'segredo' }), { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    expect(await captchaValido('', '1.2.3.4')).toBe(false);
    expect(await captchaValido(null, '1.2.3.4')).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(await captchaValido('ruim', '1.2.3.4')).toBe(false);
    expect(await captchaValido('bom', '1.2.3.4')).toBe(true);
    const enviado = new URLSearchParams(String(f.mock.calls[1][1]?.body));
    expect(enviado.get('remoteip')).toBe('1.2.3.4');
  });

  it('ligada, recusa quando a Cloudflare não responde', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'segredo');
    vi.stubEnv('TURNSTILE_SITE_KEY', 'chave-do-site');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fora do ar'); }));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await captchaValido('bom', null)).toBe(false);
    erro.mockRestore();
  });
});
