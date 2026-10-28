// Indicadores gerenciais: faturamento do mês, ordens, ticket médio, inadimplência e o histórico.

import { describe, expect, it } from 'vitest';
import { faturamentoPorMes, indicadoresDoMes } from '@/lib/indicadores';
import type { Lancamento } from '@/lib/registros-oficina';
import type { Documento, LinhaDocumento } from '@/lib/tipos';

function linha(valor: number): LinhaDocumento {
  return { id: `l${valor}`, tipo: 'servico', descricao: 'Serviço', quantidade: 1, unidade: 'un', valorUnitario: valor };
}

function ordem(concluidoEm: string | undefined, valor: number, situacao: Documento['situacao'] = 'concluida'): Documento {
  return {
    id: `o-${concluidoEm}-${valor}`,
    numero: 1,
    tipo: 'ordem',
    situacao,
    veiculoId: 'v1',
    km: 0,
    data: '2026-10-01',
    linhas: [linha(valor)],
    desconto: null,
    concluidoEm,
    criadoEm: '2026-10-01T00:00:00.000Z',
    atualizadoEm: '2026-10-01T00:00:00.000Z'
  };
}

function receber(valor: number, vencimento: string, pagoEm: string | null = null): Lancamento {
  return { id: `r-${vencimento}-${valor}`, tipo: 'receber', descricao: 'x', valor, vencimento, pagoEm, forma: null, categoria: 'servico', criadoEm: '2026-10-01T00:00:00.000Z', atualizadoEm: '2026-10-01T00:00:00.000Z' };
}

describe('indicadores do mês', () => {
  const documentos = [
    ordem('2026-10-05T12:00:00.000Z', 300),
    ordem('2026-10-20T12:00:00.000Z', 100),
    ordem('2026-09-15T12:00:00.000Z', 500), // mês passado
    ordem(undefined, 999, 'aberta') // não concluída
  ];
  const lancamentos = [receber(200, '2026-10-01'), receber(80, '2026-11-30'), receber(50, '2026-09-20', '2026-09-21')];

  it('fatura, conta ordens e calcula o ticket médio', () => {
    const i = indicadoresDoMes(documentos, lancamentos, '2026-10-27');
    expect(i.faturamento).toBe(400);
    expect(i.ordens).toBe(2);
    expect(i.ticketMedio).toBe(200);
  });

  it('inadimplência é o que venceu e não foi pago', () => {
    const i = indicadoresDoMes(documentos, lancamentos, '2026-10-27');
    expect(i.atrasoReceber).toBe(200); // o de 01/10 venceu; o de 30/11 ainda não; o de set já foi pago
    expect(i.atrasoQtd).toBe(1);
  });

  it('faturamento por mês cobre a janela e bucketiza certo', () => {
    const h = faturamentoPorMes(documentos, '2026-10-27', 3);
    expect(h.map((x) => x.mes)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(h[1]).toMatchObject({ mes: '2026-09', total: 500, ordens: 1 });
    expect(h[2]).toMatchObject({ mes: '2026-10', total: 400, ordens: 2 });
  });
});
