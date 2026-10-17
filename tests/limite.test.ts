import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// sem Supabase configurado, o limite conta na memória do servidor
vi.stubEnv('SUPABASE_URL', '');
vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');

const { esgotadoPara, permitidoPara } = await import('@/lib/limite');

describe('limite de tentativas sem banco', () => {
  it('conta na memória e para no máximo', async () => {
    const chave = `teste:${Math.random()}`;
    expect(await permitidoPara(chave, 2, 1)).toBe(true);
    expect(await esgotadoPara(chave, 2, 1)).toBe(false);
    expect(await permitidoPara(chave, 2, 1)).toBe(true);
    expect(await permitidoPara(chave, 2, 1)).toBe(false);
    expect(await esgotadoPara(chave, 2, 1)).toBe(true);
    // outra chave tem a própria conta
    expect(await permitidoPara(`${chave}:outra`, 2, 1)).toBe(true);
  });
});
