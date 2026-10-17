import { describe, expect, it } from 'vitest';
import { comissaoPorProfissional, fatorDoDesconto } from '@/lib/comissao';
import type { Profissional } from '@/lib/registros-oficina';
import type { Documento, LinhaDocumento } from '@/lib/tipos';

const agora = '2026-10-17T12:00:00.000Z';
let seq = 0;

function linha(p: Partial<LinhaDocumento>): LinhaDocumento {
  return { id: `l${++seq}`, tipo: 'servico', descricao: 'Item', quantidade: 1, unidade: 'un', valorUnitario: 0, ...p };
}

function os(p: Partial<Documento>): Documento {
  return { id: `d${++seq}`, numero: seq, tipo: 'ordem', situacao: 'concluida', veiculoId: 'v1', km: 1, data: '2026-10-10', linhas: [], desconto: null, criadoEm: agora, atualizadoEm: agora, ...p };
}

function prof(id: string, nome: string, comissaoServicos: number, comissaoPecas: number): Profissional {
  return { id, nome, comissaoServicos, comissaoPecas, ativo: true, criadoEm: agora, atualizadoEm: agora };
}

describe('comissão', () => {
  const profissionais = { p1: prof('p1', 'Zé', 40, 5), p2: prof('p2', 'Ana', 30, 0), p3: prof('p3', 'Beto', 150, -3) };

  it('o desconto da ordem sai da mão de obra e das peças na proporção', () => {
    expect(fatorDoDesconto(os({ linhas: [linha({ valorUnitario: 300 }), linha({ tipo: 'peca', valorUnitario: 100 })], desconto: 40 }))).toBe(0.9);
    expect(fatorDoDesconto(os({ linhas: [linha({ valorUnitario: 100 })], desconto: 500 }))).toBe(0);
    expect(fatorDoDesconto(os({ linhas: [linha({ valorUnitario: 100 })] }))).toBe(1);
    expect(fatorDoDesconto(os({ linhas: [linha({ tipo: 'outro', valorUnitario: 100 })], desconto: 10 }))).toBe(1);
  });

  it('cada linha é de quem está nela, senão do responsável pela ordem', () => {
    const ordens = [
      // Zé é o responsável; a troca de pastilha foi da Ana
      os({
        profissionalId: 'p1',
        desconto: 40,
        linhas: [
          linha({ valorUnitario: 200 }),
          linha({ tipo: 'peca', quantidade: 2, valorUnitario: 50 }),
          linha({ valorUnitario: 100, profissionalId: 'p2' }),
          linha({ tipo: 'outro', valorUnitario: 30 }),
          linha({ valorUnitario: 500, recusada: true })
        ]
      }),
      os({ linhas: [linha({ valorUnitario: 80, profissionalId: 'p1' }), linha({ valorUnitario: 60 })] }),
      os({ profissionalId: 'apagado', linhas: [linha({ valorUnitario: 10 })] }),
      os({ profissionalId: 'p3', linhas: [linha({ valorUnitario: 100 }), linha({ tipo: 'peca', valorUnitario: 100 })] })
    ];
    const r = comissaoPorProfissional(ordens, profissionais);
    expect(r).toEqual([
      // base da 1ª ordem: 400 de mão de obra e peças, desconto de 40 => fator 0,9
      { profissionalId: 'p1', nome: 'Zé', ordens: 2, maoDeObra: 260, pecas: 90, percentualServicos: 40, percentualPecas: 5, comissaoServicos: 104, comissaoPecas: 4.5, total: 108.5 },
      { profissionalId: 'p3', nome: 'Beto', ordens: 1, maoDeObra: 100, pecas: 100, percentualServicos: 100, percentualPecas: 0, comissaoServicos: 100, comissaoPecas: 0, total: 100 },
      { profissionalId: 'p2', nome: 'Ana', ordens: 1, maoDeObra: 90, pecas: 0, percentualServicos: 30, percentualPecas: 0, comissaoServicos: 27, comissaoPecas: 0, total: 27 },
      { profissionalId: 'apagado', nome: 'Profissional apagado', ordens: 1, maoDeObra: 10, pecas: 0, percentualServicos: 0, percentualPecas: 0, comissaoServicos: 0, comissaoPecas: 0, total: 0 },
      { profissionalId: null, nome: 'Sem profissional', ordens: 1, maoDeObra: 60, pecas: 0, percentualServicos: 0, percentualPecas: 0, comissaoServicos: 0, comissaoPecas: 0, total: 0 }
    ]);
  });

  it('arredonda em centavos', () => {
    const r = comissaoPorProfissional([os({ profissionalId: 'p2', linhas: [linha({ valorUnitario: 33.33 }), linha({ valorUnitario: 33.33 }), linha({ valorUnitario: 33.34 })] })], profissionais);
    expect(r[0]).toMatchObject({ maoDeObra: 100, comissaoServicos: 30, total: 30 });
    expect(comissaoPorProfissional([], profissionais)).toEqual([]);
  });
});
