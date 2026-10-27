// O módulo de compras formais (funções puras): o total, o que vira entrada de estoque, a conta a
// pagar que nasce do recebimento, e a conferência antes de gravar.

import { describe, expect, it } from 'vitest';
import { contaAPagarDaCompra, entradasDaCompra, itensLimpos, podeReceber, problemaDaCompra, totalDaCompra } from '@/lib/compras';
import type { PedidoCompra } from '@/lib/registros-oficina';

function pedido(over: Partial<PedidoCompra> = {}): PedidoCompra {
  return {
    id: 'c1',
    fornecedor: 'Auto Peças Guapi',
    situacao: 'rascunho',
    itens: [
      { id: 'i1', descricao: 'Óleo 5W30', estoqueId: 'e1', quantidade: 10, custoUnitario: 29.9 },
      { id: 'i2', descricao: 'Filtro de óleo', estoqueId: null, quantidade: 2, custoUnitario: 18.5 }
    ],
    data: '2026-10-27',
    criadoEm: '2026-10-27T12:00:00.000Z',
    atualizadoEm: '2026-10-27T12:00:00.000Z',
    ...over
  };
}

describe('compras formais', () => {
  it('soma o total em centavos', () => {
    expect(totalDaCompra(pedido())).toBe(336);
    expect(totalDaCompra({ itens: [] })).toBe(0);
    expect(totalDaCompra({ itens: [{ id: 'x', descricao: 'p', quantidade: 3, custoUnitario: 0.1 }] })).toBe(0.3);
  });

  it('só os itens ligados ao estoque viram entrada', () => {
    expect(entradasDaCompra(pedido())).toEqual([{ itemId: 'e1', quantidade: 10, custoUnitario: 29.9 }]);
  });

  it('a conta a pagar nasce do recebimento, para o fornecedor', () => {
    const conta = contaAPagarDaCompra(pedido(), { vencimento: '2026-11-10', compraId: 'c1' });
    expect(conta).toMatchObject({ tipo: 'pagar', categoria: 'fornecedor', favorecido: 'Auto Peças Guapi', valor: 336, vencimento: '2026-11-10', pagoEm: null, compraId: 'c1' });
  });

  it('pode receber quando não está recebido nem cancelado e tem item', () => {
    expect(podeReceber(pedido())).toBe(true);
    expect(podeReceber(pedido({ situacao: 'recebido' }))).toBe(false);
    expect(podeReceber(pedido({ situacao: 'cancelado' }))).toBe(false);
    expect(podeReceber(pedido({ itens: [] }))).toBe(false);
  });

  it('confere antes de gravar', () => {
    expect(problemaDaCompra({ fornecedor: '', itens: pedido().itens })).toMatch(/fornecedor/i);
    expect(problemaDaCompra({ fornecedor: 'X', itens: [] })).toMatch(/item/i);
    expect(problemaDaCompra({ fornecedor: 'X', itens: [{ id: 'a', descricao: 'Peça', quantidade: 0, custoUnitario: 1 }] })).toMatch(/quantidade/i);
    expect(problemaDaCompra({ fornecedor: 'X', itens: pedido().itens })).toBeNull();
  });

  it('limpa os itens para gravar (tira vazios, arredonda o custo, gera id)', () => {
    let n = 0;
    const id = () => `novo-${++n}`;
    const limpos = itensLimpos(
      [
        { id: '', descricao: '  Pastilha  ', estoqueId: 'e9', quantidade: 4, custoUnitario: 59.999 },
        { id: '', descricao: '', estoqueId: null, quantidade: 1, custoUnitario: 0 }
      ],
      id
    );
    expect(limpos).toHaveLength(1);
    expect(limpos[0]).toEqual({ id: 'novo-1', descricao: 'Pastilha', estoqueId: 'e9', quantidade: 4, custoUnitario: 60 });
  });
});
