import { beforeEach, describe, expect, it, vi } from 'vitest';

// O que acontece no aparelho quando o orçamento é aprovado ou recusado e quando a ordem é
// concluída (sem conta: nada vai para o servidor).

const banco = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => banco.get(k),
  set: async (k: string, v: unknown) => void banco.set(k, v),
  del: async (k: string) => void banco.delete(k)
}));

const { useOficina } = await import('@/lib/store');
const { aoAprovarServico, aoConcluirServico, aoRecusarServico } = await import('@/components/oficina/servico/efeitos');

const s = () => useOficina.getState();

function preparar() {
  const clienteId = s().salvarCliente({ nome: 'Ana Souza', telefone: '21990001007' });
  const veiculoId = s().salvarVeiculo({ clienteId, placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol' });
  const orcId = s().salvarDocumento({
    tipo: 'orcamento',
    situacao: 'rascunho',
    veiculoId,
    km: 90000,
    data: '2026-10-16',
    desconto: null,
    validadeDias: 10,
    linhas: [
      { id: 'a', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140 },
      { id: 'b', tipo: 'servico', servico: 'pastilhas', descricao: 'Troca das pastilhas', quantidade: 1, unidade: 'un', valorUnitario: 80 },
      { id: 'c', tipo: 'peca', servico: 'palhetas', descricao: 'Palhetas', quantidade: 1, unidade: 'un', valorUnitario: 90 }
    ]
  });
  s().marcarEnviado(orcId);
  return { clienteId, veiculoId, orcId };
}

const abertos = () => Object.values(s().lembretes).filter((l) => l.situacao === 'aberto');

describe('lembretes do que o cliente recusou', () => {
  beforeEach(() => s().apagarTudo());

  it('aprovado em parte: o recusado vira lembrete uma vez só', () => {
    const { orcId, clienteId, veiculoId } = preparar();
    const ordemId = s().aprovarOrcamento(orcId, ['c'])!;
    aoAprovarServico(orcId, ordemId, ['c']);
    aoAprovarServico(orcId, ordemId, ['c']);
    expect(abertos()).toHaveLength(1);
    expect(abertos()[0]).toMatchObject({ descricao: 'Palhetas', motivo: 'recusado', valorEstimado: 90, documentoId: orcId, veiculoId, clienteId });
  });

  it('recusado inteiro: um lembrete por serviço; aprovado depois, o que foi aprovado sai dos lembretes', () => {
    const { orcId } = preparar();
    s().recusarOrcamento(orcId);
    aoRecusarServico(orcId);
    expect(abertos().map((l) => [l.descricao, l.valorEstimado])).toEqual([
      ['Pastilhas de freio', 220],
      ['Palhetas', 90]
    ]);
    // o cliente mudou de ideia e aprovou só as pastilhas
    const ordemId = s().aprovarOrcamento(orcId, ['c'])!;
    aoAprovarServico(orcId, ordemId, ['c']);
    expect(abertos().map((l) => l.descricao)).toEqual(['Palhetas']);
    expect(Object.values(s().lembretes).find((l) => l.descricao === 'Pastilhas de freio')?.situacao).toBe('descartado');
  });

  it('o checklist de entrada feito no orçamento segue na ordem', () => {
    const { orcId, veiculoId } = preparar();
    const checklistId = s().salvarRegistro('checklists', { documentoId: orcId, veiculoId, itens: {}, avarias: [], fotos: [] });
    s().salvarDocumento({ ...s().documentos[orcId], checklistId });
    const ordemId = s().aprovarOrcamento(orcId, [])!;
    aoAprovarServico(orcId, ordemId, []);
    expect(s().documentos[ordemId].checklistId).toBe(checklistId);
    expect(abertos()).toEqual([]);
  });
});

describe('a ordem concluída', () => {
  beforeEach(() => s().apagarTudo());

  it('gera a garantia e fica pronta para o cliente; concluir de novo não gera outra', () => {
    const { orcId } = preparar();
    const ordemId = s().aprovarOrcamento(orcId, ['c'])!;
    s().concluirOrdem(ordemId, { itens: [{ servico: 'pastilhas', intervaloKm: 30000, intervaloMeses: 24 }], km: 90000, data: '2026-10-17' });
    aoConcluirServico(ordemId);
    const os = s().documentos[ordemId];
    const g = s().garantias[os.garantiaId!];
    expect(g.itens.map((i) => [i.descricao, i.tipo, i.dias])).toEqual([
      ['Pastilha dianteira', 'peca', 90],
      ['Troca das pastilhas', 'servico', 90]
    ]);
    expect(g.placa).toBe('RBA5G44');
    expect(os.etapa).toBe('pronto');
    expect(os.andamento?.map((a) => a.etapa)).toEqual(['pronto']);
    aoConcluirServico(ordemId);
    expect(Object.keys(s().garantias)).toHaveLength(1);
    expect(s().documentos[ordemId].andamento).toHaveLength(1);
  });

  it('a ordem aberta não gera garantia', () => {
    const { orcId } = preparar();
    const ordemId = s().aprovarOrcamento(orcId, [])!;
    aoConcluirServico(ordemId);
    expect(Object.keys(s().garantias)).toHaveLength(0);
  });
});
