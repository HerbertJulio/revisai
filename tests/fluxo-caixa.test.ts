// Fluxo de caixa projetado: o que está em aberto, o que está atrasado e o saldo acumulado por dia.

import { describe, expect, it } from 'vitest';
import { fluxoProjetado } from '@/lib/fluxo-caixa';
import type { Lancamento } from '@/lib/registros-oficina';

function lanc(over: Partial<Lancamento> & Pick<Lancamento, 'tipo' | 'valor' | 'vencimento'>): Lancamento {
  return { id: `${over.tipo}-${over.vencimento}-${over.valor}`, descricao: 'x', pagoEm: null, forma: null, categoria: 'outros', criadoEm: '2026-10-01T00:00:00.000Z', atualizadoEm: '2026-10-01T00:00:00.000Z', ...over };
}

const lancamentos: Lancamento[] = [
  lanc({ tipo: 'receber', valor: 200, vencimento: '2026-10-20' }),
  lanc({ tipo: 'pagar', valor: 80, vencimento: '2026-10-25' }),
  lanc({ tipo: 'receber', valor: 50, vencimento: '2026-10-01' }), // vencido
  lanc({ tipo: 'pagar', valor: 30, vencimento: '2026-10-10' }), // vencido
  lanc({ tipo: 'receber', valor: 999, vencimento: '2026-10-22', pagoEm: '2026-10-22' }) // pago, não entra
];

describe('fluxo de caixa projetado', () => {
  const f = fluxoProjetado(lancamentos, '2026-10-15', '2026-11-15');

  it('soma o que está em aberto, ignorando o que já foi pago', () => {
    expect(f.aReceber).toBe(250);
    expect(f.aPagar).toBe(110);
    expect(f.saldoProjetado).toBe(140);
  });

  it('separa o que está atrasado', () => {
    expect(f.vencidoReceber).toBe(50);
    expect(f.vencidoPagar).toBe(30);
  });

  it('projeta por dia com saldo acumulado a partir do atrasado', () => {
    expect(f.porDia).toHaveLength(2);
    expect(f.porDia[0]).toMatchObject({ data: '2026-10-20', entra: 200, sai: 0, saldo: 220 }); // começa em 50-30=20
    expect(f.porDia[1]).toMatchObject({ data: '2026-10-25', sai: 80, saldo: 140 });
  });
});
