// A rotina diária (/api/cron/manter-ativo) e o diagnóstico (/api/saude) contra o Supabase local.
// Só roda com BANCO_TESTE_URL e com o gateway de scripts/supabase-local no ar.

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// a rotina pode tentar de novo montagens com erro: a IA não sai daqui
vi.mock('@/lib/agente/ia', () => ({
  interpretarComIA: vi.fn(async () => ({ ok: false, erro: 'IA desligada no teste.' })),
  preencherComIA: vi.fn(),
  transcreverComIA: vi.fn(),
  estadoDaIA: vi.fn(async () => ({ ligada: false }))
}));

const URL_BANCO = process.env.BANCO_TESTE_URL ?? '';
const SUPABASE = process.env.SUPABASE_TESTE_URL ?? 'http://127.0.0.1:54321';
const CHAVE_PUBLICA = process.env.SUPABASE_TESTE_CHAVE ?? 'sb_publishable_local';
const CHAVE_SISTEMA = process.env.SISTEMA_TESTE_CHAVE ?? 'chave-local-do-sistema-para-desenvolvimento-0001';

async function gatewayNoAr(): Promise<boolean> {
  if (!URL_BANCO) return false;
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/`, { headers: { apikey: CHAVE_PUBLICA }, signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

const ligado = await gatewayNoAr();
const d = ligado ? describe : describe.skip;

function ambiente(extra: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('SUPABASE_URL', SUPABASE);
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', CHAVE_PUBLICA);
  vi.stubEnv('EQUIPE_CHAVE', CHAVE_SISTEMA);
  vi.stubEnv('SISTEMA_CHAVE', CHAVE_SISTEMA);
  vi.stubEnv('WHATSAPP_TOKEN', '');
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

d('rotina diária', () => {
  const pedir = async (cabecalho?: string) => {
    const { GET } = await import('@/app/api/cron/manter-ativo/route');
    return GET(new NextRequest('http://localhost/api/cron/manter-ativo', { headers: cabecalho ? { authorization: cabecalho } : {} }));
  };

  it('sem CRON_SECRET configurado, não roda', async () => {
    ambiente({ CRON_SECRET: '' });
    expect((await pedir('Bearer qualquer')).status).toBe(503);
  });

  it('com o segredo errado (ou sem), recusa', async () => {
    ambiente({ CRON_SECRET: 'segredo-local-do-cron' });
    expect((await pedir()).status).toBe(401);
    expect((await pedir('Bearer segredo-errado')).status).toBe(401);
    expect((await pedir('segredo-local-do-cron')).status).toBe(401);
  });

  it('com o segredo certo, roda a rotina do banco e devolve o resumo', async () => {
    ambiente({ CRON_SECRET: 'segredo-local-do-cron' });
    const r = await pedir('Bearer segredo-local-do-cron');
    const corpo = (await r.json()) as Record<string, unknown>;
    expect(r.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.erros).toEqual([]);
    expect(corpo.rotina).toMatchObject({ oficinas: expect.any(Number), acessos: expect.any(Number) });
    expect(typeof corpo.chavesDaCotaLimpas).toBe('number');
    expect(corpo.montagensRefeitas).toMatchObject({ tentados: expect.any(Number), montados: expect.any(Number) });
  });
});

d('diagnóstico', () => {
  it('banco respondendo: 200', async () => {
    ambiente();
    const { GET } = await import('@/app/api/saude/route');
    const r = await GET(new NextRequest('http://localhost/api/saude'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, banco: 'respondendo' });
  });

  it('banco fora do ar: 503 com ok false', async () => {
    ambiente({ SUPABASE_URL: 'http://127.0.0.1:9' });
    const { GET } = await import('@/app/api/saude/route');
    const r = await GET(new NextRequest('http://localhost/api/saude'));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, banco: 'sem resposta' });
  });
});
