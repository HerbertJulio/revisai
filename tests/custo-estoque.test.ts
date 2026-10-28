// Custo médio ponderado, posição de estoque valorizada e consumo/CMV do período.

import { describe, expect, it } from 'vitest';
import { consumoValorizado, custoMedio, posicaoValorizada } from '@/lib/custo-estoque';
import type { ItemEstoque, MovimentoEstoque } from '@/lib/tipos';

function item(id: string, over: Partial<ItemEstoque> = {}): ItemEstoque {
  return { id, nome: id, categoria: 'filtro_oleo', unidade: 'un', quantidade: 0, minimo: 0, custo: null, preco: null, criadoEm: '2026-10-01T00:00:00.000Z', atualizadoEm: '2026-10-01T00:00:00.000Z', ...over };
}

describe('custo médio ponderado', () => {
  it('mistura o saldo com o que entrou', () => {
    // 7 a 20,00 + 6 a 22,00 = (140 + 132) / 13 = 20,92
    expect(custoMedio(7, 20, 6, 22)).toBe(20.92);
  });
  it('sem saldo ou sem custo, vale o que entrou', () => {
    expect(custoMedio(0, null, 10, 21.5)).toBe(21.5);
    expect(custoMedio(5, null, 10, 21.5)).toBe(21.5);
    expect(custoMedio(0, 30, 4, 25)).toBe(25);
  });
});

describe('posição valorizada', () => {
  it('soma quantidade por custo, por item e por categoria, e conta os sem custo', () => {
    const estoque = [
      item('a', { categoria: 'oleo_motor', unidade: 'L', quantidade: 10, custo: 30 }),
      item('b', { categoria: 'filtro_oleo', quantidade: 4, custo: 18 }),
      item('c', { categoria: 'oleo_motor', unidade: 'L', quantidade: 5, custo: 30 }),
      item('d', { categoria: 'pastilha_freio', quantidade: 2, custo: null }),
      item('e', { categoria: 'filtro_ar', quantidade: 0, custo: 50 })
    ];
    const p = posicaoValorizada(estoque);
    expect(p.total).toBe(10 * 30 + 4 * 18 + 5 * 30); // 522
    expect(p.itens[0].id).toBe('a'); // maior valor primeiro (300)
    expect(p.porCategoria[0]).toMatchObject({ valor: 450 }); // óleo: 300 + 150
    expect(p.semCusto).toBe(1); // o 'd' (o 'e' está zerado, não conta)
  });
});

describe('consumo valorizado (CMV)', () => {
  const mov = (itemId: string, quantidade: number, quando: string, tipo: MovimentoEstoque['tipo'] = 'saida'): MovimentoEstoque => ({ id: `${itemId}-${quando}`, itemId, quando, tipo, quantidade });
  it('soma as saídas do período pelo custo do item', () => {
    const estoque = { a: item('a', { quantidade: 2, custo: 30 }), b: item('b', { quantidade: 2, custo: 18 }) };
    const movimentos = [
      mov('a', -3, '2026-10-10T12:00:00.000Z'),
      mov('b', -2, '2026-10-20T12:00:00.000Z'),
      mov('a', -1, '2026-09-30T12:00:00.000Z'), // fora do período
      mov('a', 5, '2026-10-11T12:00:00.000Z', 'entrada') // entrada não conta
    ];
    const c = consumoValorizado(movimentos, estoque, { de: '2026-10-01', ate: '2026-10-31' });
    expect(c.total).toBe(3 * 30 + 2 * 18); // 126
    expect(c.itens[0].id).toBe('a');
  });
});
