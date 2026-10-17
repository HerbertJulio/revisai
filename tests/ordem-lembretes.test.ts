import { describe, expect, it } from 'vitest';
import { grupoDeLembretes } from '@/lib/avisos';
import { lembretesDoDia, lembretesDoOrcamento, mensagemDoLembrete, MOTIVOS_DO_LEMBRETE } from '@/lib/lembretes';
import type { Lembrete } from '@/lib/registros-oficina';
import type { Cliente, Documento, Veiculo } from '@/lib/tipos';

const doc: Pick<Documento, 'id' | 'linhas' | 'veiculoId'> = {
  id: 'orc1',
  veiculoId: 'v1',
  linhas: [
    { id: 'a', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140 },
    { id: 'b', tipo: 'servico', servico: 'pastilhas', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: 80 },
    { id: 'c', tipo: 'peca', descricao: 'Lâmpada do farol', quantidade: 2, unidade: 'un', valorUnitario: 25 },
    { id: 'd', tipo: 'servico', servico: 'troca_oleo', descricao: 'Troca de óleo', quantidade: 1, unidade: 'un', valorUnitario: null },
    { id: 'e', tipo: 'outro', descricao: 'Vistoria abatida', quantidade: 1, unidade: 'un', valorUnitario: -50 }
  ]
};

function lembrete(extra: Partial<Lembrete>): Lembrete {
  return { id: 'l1', descricao: 'Pastilhas de freio', motivo: 'recusado', data: '2026-11-16', situacao: 'aberto', criadoEm: '2026-10-17T10:00:00Z', atualizadoEm: '2026-10-17T10:00:00Z', ...extra };
}

describe('o que o cliente recusou vira lembrete', () => {
  it('um por serviço (peça e mão de obra juntas) e um por linha avulsa, daqui a 30 dias, com o valor', () => {
    const r = lembretesDoOrcamento(doc, ['a', 'b', 'c'], { hoje: '2026-10-17', clienteId: 'c1' });
    expect(r).toEqual([
      { veiculoId: 'v1', clienteId: 'c1', documentoId: 'orc1', descricao: 'Pastilhas de freio', motivo: 'recusado', data: '2026-11-16', valorEstimado: 220, situacao: 'aberto', avisadoEm: null },
      { veiculoId: 'v1', clienteId: 'c1', documentoId: 'orc1', descricao: 'Lâmpada do farol', motivo: 'recusado', data: '2026-11-16', valorEstimado: 50, situacao: 'aberto', avisadoEm: null }
    ]);
  });

  it('recusado inteiro: todas as linhas (sem a vistoria abatida); sem preço, sem valor', () => {
    const r = lembretesDoOrcamento(doc, 'todas', { hoje: '2026-10-17' });
    expect(r.map((x) => [x.descricao, x.valorEstimado])).toEqual([
      ['Pastilhas de freio', 220],
      ['Lâmpada do farol', 50],
      ['Troca de óleo', null]
    ]);
    expect(lembretesDoOrcamento(doc, [], { hoje: '2026-10-17' })).toEqual([]);
  });

  it('a mensagem muda com o motivo', () => {
    const ctx = { cliente: 'Ana Souza', oficina: 'Auto Center Serra', veiculo: { modelo: 'Gol' } };
    expect(mensagemDoLembrete(lembrete({ valorEstimado: 220 }), ctx)).toBe(
      'Oi, Ana! Aqui é da Auto Center Serra. Lembra do que vimos no seu Gol e ficou para depois: pastilhas de freio? Quer marcar um horário para fazer? É só responder esta mensagem.'
    );
    expect(mensagemDoLembrete(lembrete({ valorEstimado: 220 }), { ...ctx, mostrarValor: true })).toContain('pastilhas de freio (ficou em R$');
    expect(mensagemDoLembrete(lembrete({ motivo: 'recall', descricao: 'Troca do airbag do motorista' }), ctx)).toContain('Saiu um recall para o seu Gol: troca do airbag do motorista.');
    expect(mensagemDoLembrete(lembrete({ motivo: 'manual', descricao: 'ABS acendendo de vez em quando' }), { ...ctx, cliente: '' })).toBe(
      'Oi! Aqui é da Auto Center Serra. Passando para lembrar sobre o seu Gol: ABS acendendo de vez em quando. Quer marcar um horário? É só responder esta mensagem.'
    );
    expect(MOTIVOS_DO_LEMBRETE).toEqual({ recusado: 'Recusado no orçamento', recall: 'Recall', manual: 'Lembrete' });
  });
});

describe('o grupo de lembretes do início', () => {
  const veiculos: Record<string, Veiculo> = { v1: { id: 'v1', clienteId: 'c1', placa: 'RBA5G44', marca: 'VW', modelo: 'Gol', criadoEm: '' } };
  const clientes: Record<string, Cliente> = { c1: { id: 'c1', nome: 'Ana', telefone: '21990001007', criadoEm: '' } };

  it('só os abertos que chegaram na data (todos os motivos), os mais antigos primeiro, com o carro e o cliente', () => {
    const lista: Record<string, Lembrete> = {
      a: lembrete({ id: 'a', data: '2026-10-10', motivo: 'recall', veiculoId: 'v1' }),
      b: lembrete({ id: 'b', data: '2026-10-01', motivo: 'manual', veiculoId: 'v1', clienteId: 'c1' }),
      c: lembrete({ id: 'c', data: '2026-10-30', veiculoId: 'v1' }),
      d: lembrete({ id: 'd', data: '2026-10-02', situacao: 'avisado', veiculoId: 'v1' }),
      e: lembrete({ id: 'e', data: '2026-10-03', situacao: 'feito' }),
      f: lembrete({ id: 'f', data: '2026-10-17', veiculoId: 'v1' })
    };
    const g = grupoDeLembretes(lista, { veiculos, clientes }, '2026-10-17');
    expect(g.map((x) => x.lembrete.id)).toEqual(['b', 'a', 'f']);
    expect(g[1].veiculo?.placa).toBe('RBA5G44');
    // sem clienteId, o cliente vem do carro
    expect(g[1].cliente?.nome).toBe('Ana');
    expect(lembretesDoDia(Object.values(lista), '2026-09-30')).toEqual([]);
  });
});
