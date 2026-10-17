import { describe, expect, it } from 'vitest';
import { CONDICOES_PADRAO, dadosDaGarantia, diasDoLinkDaGarantia, fimDaGarantia, fimDoItem, garantiaDaOrdem, lerGarantiaDoLink, prazosDaOficina, situacaoDoItem } from '@/lib/garantia';
import type { Garantia } from '@/lib/registros-oficina';
import type { Documento, ItemEstoque, Veiculo } from '@/lib/tipos';

const veiculo: Veiculo = { id: 'v1', clienteId: 'c1', placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol', ano: 2018, criadoEm: '2026-01-01T00:00:00Z' };
const estoque: Record<string, ItemEstoque> = {
  e1: { id: 'e1', nome: 'Pastilha dianteira', marca: 'Cobreq', categoria: 'pastilha_freio', unidade: 'un', quantidade: 3, minimo: 1, custo: 80, preco: 140, criadoEm: '', atualizadoEm: '' }
};

function ordem(extra: Partial<Documento> = {}): Documento {
  return {
    id: 'os1',
    numero: 7,
    tipo: 'ordem',
    situacao: 'concluida',
    veiculoId: 'v1',
    km: 90000,
    data: '2026-10-16',
    concluidoEm: '2026-10-17T18:00:00.000Z',
    desconto: null,
    linhas: [
      { id: 'a', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140, estoqueId: 'e1' },
      { id: 'b', tipo: 'servico', servico: 'pastilhas', descricao: 'Troca das pastilhas', quantidade: 1, unidade: 'un', valorUnitario: 80 },
      { id: 'c', tipo: 'outro', descricao: 'Vistoria já paga (abatida)', quantidade: 1, unidade: 'un', valorUnitario: -50 },
      { id: 'd', tipo: 'peca', descricao: 'Palhetas', quantidade: 1, unidade: 'un', valorUnitario: 90, recusada: true },
      { id: 'e', tipo: 'servico', descricao: 'Revisão do freio de mão', quantidade: 1, unidade: 'un', valorUnitario: null }
    ],
    criadoEm: '2026-10-16T12:00:00.000Z',
    atualizadoEm: '2026-10-17T18:00:00.000Z',
    ...extra
  };
}

describe('garantia da ordem concluída', () => {
  it('um item por serviço e por peça aprovados, com 90 dias pelo CDC e a marca da peça do estoque', () => {
    const g = garantiaDaOrdem(ordem(), { preferencias: {}, estoque, veiculo, hoje: '2026-10-18' })!;
    expect(g.itens).toEqual([
      { descricao: 'Pastilha dianteira', tipo: 'peca', dias: 90, km: null, marca: 'Cobreq' },
      { descricao: 'Troca das pastilhas', tipo: 'servico', dias: 90, km: null },
      { descricao: 'Revisão do freio de mão', tipo: 'servico', dias: 90, km: null }
    ]);
    // a garantia começa na entrega (conclusão da ordem)
    expect(g).toMatchObject({ documentoId: 'os1', veiculoId: 'v1', clienteId: 'c1', placa: 'RBA5G44', inicio: '2026-10-17', condicoes: CONDICOES_PADRAO });
  });

  it('usa os prazos e as condições da oficina', () => {
    const preferencias = { garantiaPadrao: { servicosDias: 180, pecasDias: 365, condicoes: 'Vale com a nota.' } };
    const g = garantiaDaOrdem(ordem(), { preferencias, estoque, veiculo, hoje: '2026-10-18' })!;
    expect(g.itens.map((i) => [i.tipo, i.dias])).toEqual([
      ['peca', 365],
      ['servico', 180],
      ['servico', 180]
    ]);
    expect(g.condicoes).toBe('Vale com a nota.');
    expect(prazosDaOficina({ garantiaPadrao: { servicosDias: 0, pecasDias: -1, condicoes: '  ' } })).toEqual({ servicosDias: 90, pecasDias: 90, condicoes: CONDICOES_PADRAO });
  });

  it('sem serviço nem peça, não tem garantia; sem data de conclusão, começa hoje', () => {
    expect(garantiaDaOrdem(ordem({ linhas: [{ id: 'x', tipo: 'outro', descricao: 'Lavagem', quantidade: 1, unidade: 'un', valorUnitario: 30 }] }), { preferencias: {}, hoje: '2026-10-18' })).toBeNull();
    expect(garantiaDaOrdem(ordem({ concluidoEm: undefined }), { preferencias: {}, hoje: '2026-10-18' })!.inicio).toBe('2026-10-18');
  });

  it('as datas: até quando vale, se ainda vale e por quanto tempo o link fica no ar', () => {
    expect(fimDoItem('2026-10-17', { dias: 90 })).toBe('2027-01-15');
    expect(situacaoDoItem('2026-10-17', { dias: 90 }, '2027-01-15')).toEqual({ vigente: true, ate: '2027-01-15', diasRestantes: 0 });
    expect(situacaoDoItem('2026-10-17', { dias: 90 }, '2027-01-16').vigente).toBe(false);
    const g = { inicio: '2026-10-17', itens: [{ descricao: 'a', tipo: 'servico' as const, dias: 90 }, { descricao: 'b', tipo: 'peca' as const, dias: 730 }] };
    expect(fimDaGarantia(g)).toBe('2028-10-16');
    expect(diasDoLinkDaGarantia({ inicio: '2026-10-17', itens: [{ descricao: 'a', tipo: 'servico', dias: 90 }] }, '2026-10-18')).toBe(365);
    expect(diasDoLinkDaGarantia(g, '2026-10-18')).toBe(729 + 30);
  });

  it('o certificado do link passa nas regras da leitura e não leva o nome inteiro do cliente', () => {
    const base = garantiaDaOrdem(ordem(), { preferencias: {}, estoque, veiculo, hoje: '2026-10-18' })!;
    const g: Garantia = { ...base, id: 'g1', criadoEm: '2026-10-17T18:00:00Z', atualizadoEm: '2026-10-17T18:00:00Z' };
    const dados = dadosDaGarantia(g, { numero: 7, cliente: { id: 'c1', nome: 'Ana Souza', telefone: '', criadoEm: '' }, veiculo });
    expect(lerGarantiaDoLink(JSON.parse(JSON.stringify(dados)))).toEqual(dados);
    expect(dados.cliente).toBe('Ana');
    expect(dados.carro).toEqual({ nome: 'Volkswagen Gol', placa: 'RBA5G44', ano: 2018 });
  });
});
