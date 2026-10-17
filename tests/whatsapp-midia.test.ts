import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { baixarMidia, midiaAceita, urlDaMeta } = await import('@/lib/agente/whatsapp-cloud');

const config = { token: 'token-de-teste', numeroId: '123', verificacao: 'v', segredo: 's', numero: null };

type Rota = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Troca o fetch por respostas combinadas e guarda cada endereço pedido (com o token, se foi). */
function simular(rota: Rota) {
  const pedidos: { url: string; token: string | null }[] = [];
  vi.stubGlobal('fetch', async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    const h = new Headers(init?.headers);
    pedidos.push({ url, token: h.get('authorization') });
    return rota(url, init);
  });
  return pedidos;
}

const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
const bytes = (n: number, extra: Record<string, string> = {}) => new Response(new Uint8Array(n).fill(7), { headers: { 'content-type': 'application/octet-stream', ...extra } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('endereços e tipos de mídia', () => {
  it('só endereços https da Meta', () => {
    expect(urlDaMeta('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1')).toBe(true);
    expect(urlDaMeta('https://scontent.xx.fbcdn.net/v/t1/abc')).toBe(true);
    expect(urlDaMeta('https://mmg.whatsapp.net/d/f/abc')).toBe(true);
    expect(urlDaMeta('http://lookaside.fbsbx.com/x')).toBe(false);
    expect(urlDaMeta('https://lookaside.fbsbx.com.evil.dev/x')).toBe(false);
    expect(urlDaMeta('https://xfbcdn.net/x')).toBe(false);
    expect(urlDaMeta('https://169.254.169.254/latest')).toBe(false);
    expect(urlDaMeta('nada')).toBe(false);
  });

  it('tipos aceitos e tamanho máximo', () => {
    expect(midiaAceita('audio', 'audio/ogg; codecs=opus', 1000)).toBe(true);
    expect(midiaAceita('audio', 'audio/ogg', 16_000_001)).toBe(false);
    expect(midiaAceita('audio', 'video/mp4', 1000)).toBe(false);
    expect(midiaAceita('imagem', 'image/webp', 5_000_000)).toBe(true);
    expect(midiaAceita('imagem', 'image/gif', 1000)).toBe(false);
    expect(midiaAceita('imagem', 'image/jpeg', 0)).toBe(false);
  });
});

describe('baixar a mídia da Meta', () => {
  it('pega o endereço, segue o redirecionamento da Meta e devolve os bytes', async () => {
    const pedidos = simular((url) => {
      if (url.startsWith('https://graph.facebook.com/')) return json({ url: 'https://lookaside.fbsbx.com/a?mid=1', mime_type: 'audio/ogg', file_size: 2000 });
      if (url.startsWith('https://lookaside.fbsbx.com/')) return new Response(null, { status: 302, headers: { location: 'https://scontent.xx.fbcdn.net/b' } });
      if (url === 'https://scontent.xx.fbcdn.net/b') return bytes(2000);
      return new Response('não', { status: 404 });
    });
    const m = await baixarMidia(config, 'midia.1', 'audio');
    expect(m?.mime).toBe('audio/ogg');
    expect(m?.bytes.length).toBe(2000);
    expect(pedidos.map((p) => new URL(p.url).hostname)).toEqual(['graph.facebook.com', 'lookaside.fbsbx.com', 'scontent.xx.fbcdn.net']);
  });

  it('endereço fora da Meta: não pede nada lá (o token não sai)', async () => {
    const pedidos = simular((url) => (url.startsWith('https://graph.facebook.com/') ? json({ url: 'https://coletor.evil.dev/x', mime_type: 'audio/ogg', file_size: 10 }) : bytes(10)));
    expect(await baixarMidia(config, 'midia1')).toBeNull();
    expect(pedidos).toHaveLength(1);
  });

  it('redirecionamento para fora da Meta para', async () => {
    const pedidos = simular((url) => {
      if (url.startsWith('https://graph.facebook.com/')) return json({ url: 'https://lookaside.fbsbx.com/a', mime_type: 'image/jpeg', file_size: 10 });
      if (url.startsWith('https://lookaside.fbsbx.com/')) return new Response(null, { status: 301, headers: { location: 'https://coletor.evil.dev/x' } });
      return bytes(10);
    });
    expect(await baixarMidia(config, 'midia1', 'imagem')).toBeNull();
    expect(pedidos.some((p) => p.url.includes('evil'))).toBe(false);
  });

  it('redirecionamentos demais, tipo errado ou arquivo grande demais não passam', async () => {
    simular((url) => (url.startsWith('https://graph.facebook.com/') ? json({ url: 'https://lookaside.fbsbx.com/a', mime_type: 'audio/ogg', file_size: 10 }) : new Response(null, { status: 302, headers: { location: 'https://lookaside.fbsbx.com/a' } })));
    expect(await baixarMidia(config, 'm1')).toBeNull();

    simular((url) => (url.startsWith('https://graph.facebook.com/') ? json({ url: 'https://lookaside.fbsbx.com/a', mime_type: 'image/gif', file_size: 10 }) : bytes(10)));
    expect(await baixarMidia(config, 'm1', 'imagem')).toBeNull();

    // a Meta diz um tamanho pequeno, mas o arquivo vem maior que o limite da foto
    simular((url) => (url.startsWith('https://graph.facebook.com/') ? json({ url: 'https://lookaside.fbsbx.com/a', mime_type: 'image/jpeg', file_size: 10 }) : bytes(5_000_001)));
    expect(await baixarMidia(config, 'm1', 'imagem')).toBeNull();

    simular((url) => (url.startsWith('https://graph.facebook.com/') ? json({ url: 'https://lookaside.fbsbx.com/a', mime_type: 'image/jpeg', file_size: 10 }) : bytes(10, { 'content-length': '9000000' })));
    expect(await baixarMidia(config, 'm1', 'imagem')).toBeNull();
  });

  it('id de mídia estranho nem chega a pedir', async () => {
    const pedidos = simular(() => json({}));
    expect(await baixarMidia(config, '../../me?fields=x')).toBeNull();
    expect(pedidos).toHaveLength(0);
  });
});
