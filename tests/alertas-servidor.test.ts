import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { codigosDoMesmoDono } = await import('@/lib/alertas');

describe('códigos do Pro da mesma oficina', () => {
  const assinaturas = [
    { codigo: 'AAAA1111AAAA1111', oficina_nome: 'Auto Center Silva', oficina_whatsapp: '5521987650000' },
    { codigo: 'BBBB2222BBBB2222', oficina_nome: 'Auto Center Silva', oficina_whatsapp: '5521987650000' },
    { codigo: 'CCCC3333CCCC3333', oficina_nome: 'Outra Oficina', oficina_whatsapp: '5511912340000' },
    { codigo: 'DDDD4444DDDD4444', oficina_nome: 'Mecânica Sem Zap', oficina_whatsapp: null },
    { codigo: 'EEEE5555EEEE5555', oficina_nome: ' mecânica sem zap ', oficina_whatsapp: null },
    { codigo: 'FFFF6666FFFF6666', oficina_nome: 'Mecânica Sem Zap', oficina_whatsapp: '5531900000000' }
  ];

  it('renovar o Pro (código novo) mantém os créditos: junta pelo WhatsApp', () => {
    expect(codigosDoMesmoDono('BBBB2222BBBB2222', assinaturas).sort()).toEqual(['AAAA1111AAAA1111', 'BBBB2222BBBB2222']);
  });

  it('sem WhatsApp, junta pelo nome (sem caixa nem espaços), e só com quem também não tem WhatsApp', () => {
    expect(codigosDoMesmoDono('DDDD4444DDDD4444', assinaturas).sort()).toEqual(['DDDD4444DDDD4444', 'EEEE5555EEEE5555']);
  });

  it('código desconhecido fica sozinho', () => {
    expect(codigosDoMesmoDono('ZZZZ9999ZZZZ9999', assinaturas)).toEqual(['ZZZZ9999ZZZZ9999']);
  });
});
