// DRE: resultado do período por regime de caixa (pago/recebido) e de competência (vencido).

import { describe, expect, it } from 'vitest';
import { dre } from '@/lib/contabilidade';
import type { Lancamento } from '@/lib/registros-oficina';

function lanc(over: Partial<Lancamento> & Pick<Lancamento, 'tipo' | 'valor' | 'categoria'>): Lancamento {
  return {
    id: `${over.tipo}-${over.categoria}-${over.valor}`,
    descricao: 'x',
    vencimento: '2026-10-15',
    pagoEm: null,
    forma: null,
    criadoEm: '2026-10-01T00:00:00.000Z',
    atualizadoEm: '2026-10-01T00:00:00.000Z',
    ...over
  };
}

const lancamentos: Lancamento[] = [
  lanc({ tipo: 'receber', categoria: 'servico', valor: 100, pagoEm: '2026-10-05', vencimento: '2026-10-05' }),
  lanc({ tipo: 'receber', categoria: 'pecas', valor: 50, pagoEm: '2026-10-10', vencimento: '2026-10-10' }),
  lanc({ tipo: 'pagar', categoria: 'fornecedor', valor: 40, pagoEm: '2026-10-08', vencimento: '2026-10-08' }),
  lanc({ tipo: 'pagar', categoria: 'aluguel', valor: 30, pagoEm: null, vencimento: '2026-10-20' })
];

describe('DRE', () => {
  it('no caixa, conta o que foi pago e recebido no período', () => {
    const r = dre(lancamentos, { de: '2026-10-01', ate: '2026-10-31' }, 'caixa');
    expect(r.totalReceitas).toBe(150);
    expect(r.totalDespesas).toBe(40); // o aluguel não foi pago
    expect(r.resultado).toBe(110);
    expect(r.receitas[0]).toMatchObject({ categoria: 'servico', valor: 100 });
  });

  it('na competência, conta o que venceu no período, pago ou não', () => {
    const r = dre(lancamentos, { de: '2026-10-01', ate: '2026-10-31' }, 'competencia');
    expect(r.totalDespesas).toBe(70); // fornecedor 40 + aluguel 30
    expect(r.resultado).toBe(80);
  });

  it('fora do período não entra', () => {
    const r = dre(lancamentos, { de: '2026-11-01', ate: '2026-11-30' }, 'caixa');
    expect(r.totalReceitas).toBe(0);
    expect(r.resultado).toBe(0);
  });
});
