import { describe, expect, it } from 'vitest';
import {
  aCaminho,
  deveMandar,
  distanciaEmMetros,
  etapa,
  haQuantoTempo,
  linkDoCaminho,
  mapaEmbutido,
  mensagemDoEntregador,
  mudancasDaSituacao,
  pedidoEmAndamento,
  posicaoRecente,
  tokenValido
} from '@/lib/entregas-dados';

const agora = Date.parse('2026-10-15T15:00:00Z');

describe('a caminho', () => {
  it('só nos 3 dias do link: depois, a entrega que a loja esqueceu de marcar não conta', () => {
    const saiu = (h: number) => ({ status: 'saiu_entrega' as const, entrega: { saiuEm: new Date(agora - h * 3_600_000).toISOString() } });
    expect(aCaminho(saiu(1), agora)).toBe(true);
    expect(aCaminho(saiu(71), agora)).toBe(true);
    expect(aCaminho(saiu(73), agora)).toBe(false);
    expect(aCaminho({ status: 'saiu_entrega', entrega: { saiuEm: null } }, agora)).toBe(true);
    expect(aCaminho({ status: 'confirmado', entrega: { saiuEm: null } }, agora)).toBe(false);
  });
});

describe('acompanhar o pedido', () => {
  it('etapas', () => {
    expect(etapa('novo')).toBe(0);
    expect(etapa('em_contato')).toBe(0);
    expect(etapa('confirmado')).toBe(1);
    expect(etapa('saiu_entrega')).toBe(2);
    expect(etapa('entregue')).toBe(3);
    expect(etapa('cancelado')).toBe(-1);
  });

  it('o pedido anda enquanto alguma loja não terminou', () => {
    expect(pedidoEmAndamento({ partes: [{ status: 'entregue' }, { status: 'saiu_entrega' }] as never })).toBe(true);
    expect(pedidoEmAndamento({ partes: [{ status: 'entregue' }, { status: 'cancelado' }] as never })).toBe(false);
  });

  it('há quanto tempo e posição recente', () => {
    expect(haQuantoTempo(new Date(agora - 20_000).toISOString(), agora)).toBe('agora');
    expect(haQuantoTempo(new Date(agora - 3 * 60_000).toISOString(), agora)).toBe('há 3 min');
    expect(haQuantoTempo(new Date(agora - 2 * 3_600_000).toISOString(), agora)).toBe('há 2 h');
    expect(posicaoRecente({ lat: 0, lng: 0, precisao: 5, em: new Date(agora - 10 * 60_000).toISOString() }, agora)).toBe(true);
    expect(posicaoRecente({ lat: 0, lng: 0, precisao: 5, em: new Date(agora - 40 * 60_000).toISOString() }, agora)).toBe(false);
    expect(posicaoRecente(null, agora)).toBe(false);
  });

  it('mapa e caminho', () => {
    const url = mapaEmbutido(-22.90685, -43.1729);
    expect(url.startsWith('https://www.openstreetmap.org/export/embed.html?bbox=')).toBe(true);
    expect(url).toContain('marker=-22.90685%2C-43.17290');
    expect(linkDoCaminho('Rua A, 10, Niterói')).toBe('https://www.google.com/maps/dir/?api=1&destination=Rua%20A%2C%2010%2C%20Niter%C3%B3i');
  });
});

describe('celular do entregador', () => {
  it('manda a cada 20 segundos, ou depois de 10 se andou 60 metros', () => {
    const a = { t: 0, lat: -22.9, lng: -43.17 };
    expect(deveMandar(null, a)).toBe(true);
    expect(deveMandar(a, { ...a, t: 5_000 })).toBe(false);
    expect(deveMandar(a, { ...a, t: 15_000 })).toBe(false);
    expect(deveMandar(a, { ...a, t: 20_000 })).toBe(true);
    // andou 100 m: espera pelo menos 10 s entre um envio e outro
    expect(deveMandar(a, { t: 5_000, lat: -22.9009, lng: -43.17 })).toBe(false);
    expect(deveMandar(a, { t: 10_000, lat: -22.9009, lng: -43.17 })).toBe(true);
    expect(Math.round(distanciaEmMetros({ lat: -22.9, lng: -43.17 }, { lat: -22.901, lng: -43.17 }))).toBe(111);
  });

  it('o link é um código de 43 letras', () => {
    expect(tokenValido('a'.repeat(43))).toBe(true);
    expect(tokenValido('a'.repeat(42))).toBe(false);
    expect(tokenValido('../../etc/passwd')).toBe(false);
  });

  it('a entrega termina: o link para de valer', () => {
    const fim = { entrega_hash: null, entrega_lat: null, entrega_lng: null, entrega_precisao: null, entrega_posicao_em: null };
    expect(mudancasDaSituacao('entregue', { entrega_saiu_em: null }, 'T')).toEqual({ status: 'entregue', atualizado_em: 'T', entregue_em: 'T', ...fim });
    expect(mudancasDaSituacao('cancelado', { entrega_saiu_em: null }, 'T')).toEqual({ status: 'cancelado', atualizado_em: 'T', ...fim });
    expect(mudancasDaSituacao('saiu_entrega', { entrega_saiu_em: null }, 'T')).toMatchObject({ entrega_saiu_em: 'T' });
    expect(mudancasDaSituacao('saiu_entrega', { entrega_saiu_em: 'antes' }, 'T')).not.toHaveProperty('entrega_saiu_em');
  });

  it('mensagem para o entregador', () => {
    const m = mensagemDoEntregador({ loja: 'Central de Filtros', codigo: 'K7P2MX', oficina: 'Auto Center', endereco: 'Rua A, 10', link: 'https://x/entrega/abc' });
    expect(m).toContain('pedido K7P2MX da Central de Filtros para a Auto Center, Rua A, 10');
    expect(m).toContain('https://x/entrega/abc');
  });
});
