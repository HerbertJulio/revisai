import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => banco.get(k),
  set: async (k: string, v: unknown) => void banco.set(k, v),
  del: async (k: string) => void banco.delete(k)
}));

const { useOficina, dadosParaBackup } = await import('@/lib/store');
const { CATALOGO_EXEMPLO } = await import('@/lib/catalogo-demo');
const { itemDoProduto } = await import('@/lib/estoque');

const produto = (id: number) => CATALOGO_EXEMPLO.produtos.find((p) => p.id === id)!;

describe('orçamento, ordem e estoque no aparelho', () => {
  beforeEach(() => {
    useOficina.getState().apagarTudo();
  });

  it('do orçamento aprovado até o serviço registrado, com baixa no estoque', () => {
    const s = () => useOficina.getState();
    const clienteId = s().salvarCliente({ nome: 'Roberto Alves', telefone: '21990001007' });
    const veiculoId = s().salvarVeiculo({ clienteId, placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol' });
    const oleo = s().salvarItemEstoque({ ...itemDoProduto(produto(107)), quantidade: 10, minimo: 4 });
    const filtro = s().salvarItemEstoque({ ...itemDoProduto(produto(201)), quantidade: 2, minimo: 2 });

    const orcId = s().salvarDocumento({
      tipo: 'orcamento',
      situacao: 'rascunho',
      veiculoId,
      km: 134800,
      data: '2026-10-15',
      modalidade: 'pago',
      vistoria: { valor: 80, abater: true },
      validadeDias: 10,
      desconto: null,
      linhas: [
        { id: 'a', tipo: 'peca', servico: 'troca_oleo', descricao: 'Óleo 10W-40', quantidade: 4, unidade: 'L', valorUnitario: 45, estoqueId: oleo },
        { id: 'b', tipo: 'peca', servico: 'filtro_oleo', descricao: 'Filtro de óleo', quantidade: 1, unidade: 'un', valorUnitario: 40, estoqueId: filtro },
        { id: 'c', tipo: 'servico', servico: 'troca_oleo', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: 60 },
        { id: 'd', tipo: 'peca', servico: 'palhetas', descricao: 'Palhetas', quantidade: 1, unidade: 'un', valorUnitario: 90 }
      ]
    });
    expect(s().documentos[orcId].numero).toBe(1);
    s().marcarEnviado(orcId);
    expect(s().documentos[orcId].situacao).toBe('enviado');

    // o cliente não quis as palhetas
    const osId = s().aprovarOrcamento(orcId, ['d'])!;
    expect(s().documentos[orcId]).toMatchObject({ situacao: 'aprovado', ordemId: osId });
    const os = s().documentos[osId];
    expect(os).toMatchObject({ tipo: 'ordem', situacao: 'aberta', numero: 1, orcamentoId: orcId });
    expect(os.linhas.map((l) => l.descricao)).toEqual(['Óleo 10W-40', 'Filtro de óleo', 'Mão de obra', 'Vistoria já paga (abatida)']);
    // aprovar de novo não cria outra ordem
    expect(s().aprovarOrcamento(orcId)).toBe(osId);

    const atId = s().concluirOrdem(osId, {
      km: 134800,
      data: '2026-10-16',
      itens: [
        { servico: 'troca_oleo', produto: { nome: 'Óleo 10W-40', estoqueId: oleo }, intervaloKm: 5000, intervaloMeses: 6 },
        { servico: 'filtro_oleo', produto: { nome: 'Filtro de óleo', estoqueId: filtro }, intervaloKm: 5000, intervaloMeses: 6 }
      ]
    })!;
    expect(s().atendimentos[atId]).toMatchObject({ veiculoId, km: 134800, data: '2026-10-16', valor: 200 });
    expect(s().documentos[osId]).toMatchObject({ situacao: 'concluida', atendimentoId: atId });
    expect(s().estoque[oleo].quantidade).toBe(6);
    expect(s().estoque[filtro].quantidade).toBe(1);
    expect(Object.values(s().movimentos).filter((m) => m.tipo === 'saida')).toHaveLength(2);
    // concluir de novo não baixa outra vez
    expect(s().concluirOrdem(osId, { km: 1, data: '2026-10-16', itens: [] })).toBeNull();
    expect(s().estoque[oleo].quantidade).toBe(6);

    // o próximo orçamento é o nº 2; apagar o 2 não faz o 3 voltar a ser 2
    const dois = s().salvarDocumento({ tipo: 'orcamento', situacao: 'rascunho', veiculoId, km: null, data: '2026-10-16', desconto: null, linhas: [] });
    expect(s().documentos[dois].numero).toBe(2);
    s().removerDocumento(dois);
    const tres = s().salvarDocumento({ tipo: 'orcamento', situacao: 'rascunho', veiculoId, km: null, data: '2026-10-16', desconto: null, linhas: [] });
    expect(s().documentos[tres].numero).toBe(3);

    const backup = dadosParaBackup(s());
    expect(Object.keys(backup.estoque)).toHaveLength(2);
    expect(Object.keys(backup.documentos)).toHaveLength(3);
    expect(backup.contadores).toEqual({ orcamento: 3, ordem: 1 });
  });

  it('dar entrada de um pedido da loja atualiza quantidade, custo e marca o pedido', () => {
    const s = () => useOficina.getState();
    const filtro = s().salvarItemEstoque({ ...itemDoProduto(produto(201)), quantidade: 1, minimo: 5 });
    s().registrarPedido({ codigo: 'ABC123', quando: '2026-10-15T10:00:00.000Z', itens: [{ produtoId: 201, nome: 'Filtro', quantidade: 10, precoUnitario: 22.9 }], total: 229 });
    s().receberPedido('ABC123', [{ itemId: filtro, quantidade: 10, custoUnitario: 22.9, fornecedor: 'Central de Filtros' }]);
    expect(s().estoque[filtro]).toMatchObject({ quantidade: 11, custo: 22.9 });
    expect(s().pedidos[0].recebidoEm).toBeTruthy();
    const [m] = Object.values(s().movimentos);
    expect(m).toMatchObject({ tipo: 'entrada', quantidade: 10, fornecedor: 'Central de Filtros', origem: { tipo: 'pedido', id: 'ABC123' } });
  });

  it('o exemplo traz estoque e orçamentos, e sai sem deixar números para trás', () => {
    const s = () => useOficina.getState();
    s().carregarExemplo();
    expect(Object.keys(s().estoque).length).toBeGreaterThan(3);
    expect(s().contadores).toEqual({ orcamento: 1, ordem: 1 });
    s().removerExemplo();
    expect(s().estoque).toEqual({});
    expect(s().documentos).toEqual({});
    expect(s().contadores).toEqual({});
  });
});
