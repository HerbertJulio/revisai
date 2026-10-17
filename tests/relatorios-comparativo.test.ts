import { describe, expect, it } from 'vitest';
import { formatarMetrica, lerComparativo, marcadorNaRegua, numerosDaOficina, posicaoNaFaixa, textoDaPosicao } from '@/lib/comparativo';
import type { Documento, LinhaDocumento } from '@/lib/tipos';

const agora = '2026-10-17T12:00:00.000Z';
const hoje = '2026-10-17';
let seq = 0;

function linha(p: Partial<LinhaDocumento>): LinhaDocumento {
  return { id: `l${++seq}`, tipo: 'servico', descricao: 'Item', quantidade: 1, unidade: 'un', valorUnitario: 0, ...p };
}

function doc(p: Partial<Documento>): Documento {
  return { id: `d${++seq}`, numero: seq, tipo: 'ordem', situacao: 'concluida', veiculoId: 'v1', km: 1, data: '2026-10-10', linhas: [], desconto: null, criadoEm: agora, atualizadoEm: agora, ...p };
}

describe('os números da oficina para comparar', () => {
  it('ticket, troca de óleo, carros por mês e aprovação nos últimos 90 dias', () => {
    const docs = [
      doc({ veiculoId: 'v1', linhas: [linha({ servico: 'troca_oleo', tipo: 'peca', quantidade: 4, valorUnitario: 40 }), linha({ servico: 'troca_oleo', valorUnitario: 40 }), linha({ servico: 'filtro_oleo', tipo: 'peca', valorUnitario: 30 })], desconto: 10 }),
      doc({ veiculoId: 'v2', linhas: [linha({ servico: 'troca_oleo', tipo: 'peca', valorUnitario: 180 }), linha({ servico: 'troca_oleo', valorUnitario: 50, recusada: true })] }),
      doc({ veiculoId: 'v1', linhas: [linha({ servico: 'pastilhas', valorUnitario: 300 })], concluidoEm: '2026-09-01T12:00:00.000Z', data: '2026-08-30' }),
      doc({ veiculoId: 'v3', data: '2026-07-01', linhas: [linha({ valorUnitario: 1000 })] }),
      doc({ veiculoId: 'v4', situacao: 'aberta', linhas: [linha({ valorUnitario: 1000 })] }),
      doc({ tipo: 'orcamento', situacao: 'aprovado', enviadoEm: '2026-10-01T10:00:00Z' }),
      doc({ tipo: 'orcamento', situacao: 'recusado', enviadoEm: '2026-10-02T10:00:00Z' }),
      doc({ tipo: 'orcamento', situacao: 'enviado', enviadoEm: '2026-10-03T10:00:00Z' }),
      doc({ tipo: 'orcamento', situacao: 'aprovado', data: '2026-10-05' }),
      doc({ tipo: 'orcamento', situacao: 'rascunho' }),
      doc({ tipo: 'orcamento', situacao: 'aprovado', enviadoEm: '2026-06-01T10:00:00Z' })
    ];
    expect(numerosDaOficina(docs, hoje)).toEqual({
      // (230 - 10) + 180 + 300 = 700 em 3 ordens
      ticket: 233.33,
      // 200 na primeira, 180 na segunda
      trocaOleo: 190,
      // v1 e v2 em 3 meses
      carrosMes: 0.7,
      aprovacao: 50,
      ordens: 3,
      orcamentos: 4
    });
    expect(numerosDaOficina([], hoje)).toEqual({ ticket: null, trocaOleo: null, carrosMes: null, aprovacao: null, ordens: 0, orcamentos: 0 });
  });
});

describe('onde a oficina fica na faixa da região', () => {
  const f = { p25: 200, mediana: 300, p75: 400, oficinas: 10 };

  it('quartos da faixa e o texto', () => {
    expect(posicaoNaFaixa(150, f)).toBe('abaixo');
    expect(posicaoNaFaixa(200, f)).toBe('baixo');
    expect(posicaoNaFaixa(300, f)).toBe('alto');
    expect(posicaoNaFaixa(400, f)).toBe('alto');
    expect(posicaoNaFaixa(401, f)).toBe('acima');
    expect(textoDaPosicao('ticket', 150, f)).toMatchObject({ onde: 'Abaixo de 3 em cada 4 oficinas da região.', posicao: 'abaixo' });
    expect(textoDaPosicao('ticket', 350, f)).toEqual({ onde: 'Acima da metade das oficinas da região.', dica: null, posicao: 'alto' });
    expect(textoDaPosicao('aprovacao', 250, f)?.dica).toContain('fotos');
    expect(textoDaPosicao('ticket', null, f)).toBeNull();
    expect(textoDaPosicao('ticket', 100, null)).toBeNull();
  });

  it('a régua põe a faixa no meio e o ponto dentro', () => {
    const r = marcadorNaRegua(300, f);
    expect(r.meio).toBe(50);
    expect(r.inicio).toBeLessThan(r.meio);
    expect(r.fim).toBeGreaterThan(r.meio);
    const longe = marcadorNaRegua(5000, f);
    expect(longe.ponto).toBe(100);
    expect(marcadorNaRegua(-10, f).ponto).toBe(0);
  });

  it('formata cada número', () => {
    expect(formatarMetrica('ticket', 380).replace(/ /g, ' ')).toBe('R$ 380,00');
    expect(formatarMetrica('aprovacao', 62)).toBe('62%');
    expect(formatarMetrica('carrosMes', 4.5)).toBe('4,5');
    expect(formatarMetrica('carrosMes', 42)).toBe('42');
    expect(formatarMetrica('ticket', null)).toBe('—');
  });
});

describe('o que o banco devolve', () => {
  it('confere o formato e aceita o vazio', () => {
    const faixa = { p25: 1, mediana: 2, p75: 3, oficinas: 5 };
    expect(lerComparativo({ nivel: 'cidade', uf: 'RJ', cidade: 'Guapimirim', oficinas: 5, dias: 90, ticket: faixa, trocaOleo: null, carrosMes: faixa, aprovacao: null })).toMatchObject({ nivel: 'cidade', ticket: faixa, trocaOleo: null });
    expect(lerComparativo({ nivel: 'uf', uf: 'RJ', oficinas: 10, dias: 90 })).toMatchObject({ cidade: null, ticket: null, aprovacao: null });
    expect(lerComparativo(null)).toBeNull();
    expect(lerComparativo({ nivel: 'bairro' })).toBeNull();
  });
});
