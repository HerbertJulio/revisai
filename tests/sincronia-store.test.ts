import { beforeEach, describe, expect, it, vi } from 'vitest';

// o aparelho: IndexedDB de mentira, num Map
const banco = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => banco.get(k),
  set: async (k: string, v: unknown) => void banco.set(k, v),
  del: async (k: string) => void banco.delete(k)
}));

const { useOficina, ligarRastreio, recarregarDoAparelho, gravarAgora, jaHidratou, aoHidratar, CHAVE_DADOS } = await import('@/lib/store');
const { valorAtual } = await import('@/lib/sincronia-dados');

await new Promise<void>((r) => (jaHidratou() ? r() : void aoHidratar(r)));
// no navegador o rastreio liga sozinho; aqui (sem window), liga à mão
ligarRastreio();

const s = () => useOficina.getState();
const pendentes = () => Object.keys(s().sinc.pendentes).sort();

const novoItem = (quantidade: number) => ({ nome: 'Óleo 5W30', categoria: 'oleo_motor' as const, unidade: 'L' as const, quantidade, minimo: 2, custo: 30, preco: 50 });

beforeEach(() => {
  s().esquecerConta();
  s().vincularConta('oficina-1', false);
});

describe('o que vira pendente', () => {
  it('sem conta, nada fica pendente', () => {
    s().esquecerConta();
    s().salvarCliente({ nome: 'Ana', telefone: '21999990000' });
    expect(pendentes()).toEqual([]);
  });

  it('com a conta, cada mudança vira pendente, inclusive o que sai em cascata', () => {
    const c = s().salvarCliente({ nome: 'Ana', telefone: '21999990000' });
    const v = s().salvarVeiculo({ clienteId: c, placa: 'ABC1D23', marca: 'Fiat', modelo: 'Uno' });
    expect(pendentes()).toEqual([`clientes|${c}`, `veiculos|${v}`].sort());
    useOficina.setState({ sinc: { ...s().sinc, pendentes: {} } });
    s().removerCliente(c);
    expect(pendentes()).toEqual([`clientes|${c}`, `veiculos|${v}`].sort());
  });

  it('o exemplo e o tema do aparelho não sobem', () => {
    s().carregarExemplo();
    expect(pendentes().filter((k) => k.includes('|ex-'))).toEqual([]);
    useOficina.setState({ sinc: { ...s().sinc, pendentes: {} } });
    s().salvarPreferencias({ tema: 'escuro' });
    expect(pendentes()).toEqual([]);
    s().salvarPreferencias({ margemPecas: 42 });
    expect(pendentes()).toEqual(['config|preferencias']);
  });

  it('o que vem do banco e a troca de conta não viram pendentes', () => {
    s().aplicarDoBanco({ clientes: { c9: { id: 'c9', nome: 'Do banco', telefone: '', criadoEm: '2026-10-01T10:00:00.000Z' } } }, 42);
    expect(s().clientes.c9.nome).toBe('Do banco');
    expect(s().sinc.marca).toBe(42);
    expect(pendentes()).toEqual([]);
    s().salvarCliente({ nome: 'Bia', telefone: '' });
    s().vincularConta('oficina-2', false);
    expect(s().contaOficinaId).toBe('oficina-2');
    expect(Object.keys(s().clientes)).toEqual([]);
    expect(pendentes()).toEqual([]);
  });

  it('recarregar o que outra aba gravou não vira pendente', async () => {
    const c = s().salvarCliente({ nome: 'Ana', telefone: '' });
    await gravarAgora();
    const guardado = JSON.parse(String(banco.get(CHAVE_DADOS)));
    guardado.state.clientes['da-outra-aba'] = { id: 'da-outra-aba', nome: 'Carla', telefone: '', criadoEm: '2026-10-01T10:00:00.000Z' };
    guardado.state.salvoEm = Date.now() + 60_000;
    banco.set(CHAVE_DADOS, JSON.stringify(guardado));
    await recarregarDoAparelho();
    expect(s().clientes['da-outra-aba'].nome).toBe('Carla');
    // só o que esta aba mudou continua pendente
    expect(pendentes()).toEqual([`clientes|${c}`]);
  });

  it('levar os dados para a conta: tudo vira pendente, menos o exemplo', () => {
    s().esquecerConta();
    s().configurar({ nome: 'Oficina do Zé' }, true);
    const c = s().salvarCliente({ nome: 'Ana', telefone: '' });
    s().vincularConta('oficina-1', true);
    expect(pendentes()).toEqual([`clientes|${c}`, 'config|contadores', 'config|oficina', 'config|preferencias']);
  });

  it('apagar tudo com a conta: tudo sobe como apagado e a oficina continua aberta', () => {
    const c = s().salvarCliente({ nome: 'Ana', telefone: '' });
    s().salvarOficina({ nome: 'Oficina' });
    useOficina.setState({ sinc: { ...s().sinc, pendentes: {} } });
    s().apagarTudo();
    expect(pendentes()).toContain(`clientes|${c}`);
    expect(s().configurado).toBe(true);
    expect(s().oficina.nome).toBe('Oficina');
    expect(s().contaOficinaId).toBe('oficina-1');
  });
});

describe('depois de subir', () => {
  it('o que mudou de novo enquanto subia continua pendente; a cópia igual sai', async () => {
    const id = s().salvarCliente({ nome: 'Ana', telefone: '' });
    const chave = `clientes|${id}`;
    const enviado = valorAtual(s(), chave);
    // outra aba gravou e esta recarregou: objetos novos, mesmo conteúdo
    await gravarAgora();
    await recarregarDoAparelho();
    expect(valorAtual(s(), chave)).not.toBe(enviado);
    s().marcarEnviados([{ chave, valor: enviado }]);
    expect(pendentes()).toEqual([]);

    s().salvarCliente({ id, nome: 'Ana', telefone: '1' });
    const primeiro = valorAtual(s(), chave);
    s().salvarCliente({ id, nome: 'Ana Maria', telefone: '1' });
    s().marcarEnviados([{ chave, valor: primeiro }]);
    expect(pendentes()).toEqual([chave]);
    expect(s().sinc.ultimaEm).toBeTruthy();
  });

  it('item recusado sai dos pendentes; editar de novo tenta outra vez', () => {
    const id = s().salvarCliente({ nome: 'Ana', telefone: '' });
    const chave = `clientes|${id}`;
    s().rejeitarItens([{ chave, motivo: 'Item grande demais (clientes)' }]);
    expect(pendentes()).toEqual([]);
    expect(s().sinc.rejeitados[chave]).toMatch(/grande/);
    s().salvarCliente({ id, nome: 'Ana', telefone: '2' });
    expect(pendentes()).toEqual([chave]);
    s().marcarEnviados([{ chave, valor: valorAtual(s(), chave) }]);
    expect(s().sinc.rejeitados).toEqual({});
  });
});

describe('estoque', () => {
  it('a quantidade de um item que já existe só muda por movimento', () => {
    const id = s().salvarItemEstoque(novoItem(5));
    expect(s().estoque[id].quantidade).toBe(5);
    // uma tela velha salva o cadastro com outra quantidade: o nome muda, a quantidade não
    s().salvarItemEstoque({ ...novoItem(99), id, nome: 'Óleo 5W30 sintético' });
    expect(s().estoque[id]).toMatchObject({ quantidade: 5, nome: 'Óleo 5W30 sintético' });
    const m = s().moverEstoque({ itemId: id, tipo: 'entrada', quantidade: 3, custoUnitario: 28 })!;
    expect(s().estoque[id]).toMatchObject({ quantidade: 8, custo: 28 });
    s().moverEstoque({ itemId: id, tipo: 'saida', quantidade: -10 });
    expect(s().estoque[id].quantidade).toBe(0);
    expect(pendentes()).toEqual(expect.arrayContaining([`estoque|${id}`, `movimentos|${m}`]));
  });

  it('o movimento de outro aparelho entra na soma, e o recebimento de um pedido também', () => {
    const id = s().salvarItemEstoque(novoItem(10));
    const base = (s().estoque[id] as { base?: { em: string } }).base!;
    const depois = new Date(new Date(base.em).getTime() + 1000).toISOString();
    const deFora = { id: 'mov-de-fora', itemId: id, quando: depois, tipo: 'saida' as const, quantidade: -4 };
    s().aplicarDoBanco({ movimentos: { ...s().movimentos, [deFora.id]: deFora } }, 1);
    s().moverEstoque({ itemId: id, tipo: 'entrada', quantidade: 1 });
    expect(s().estoque[id].quantidade).toBe(7);
    s().registrarPedido({ codigo: 'RV-77', quando: new Date().toISOString(), itens: [], total: 0 }, { manterCarrinho: true });
    s().receberPedido('RV-77', [{ itemId: id, quantidade: 2, custoUnitario: 31 }]);
    expect(s().estoque[id]).toMatchObject({ quantidade: 9, custo: 31 });
    expect(pendentes()).toContain('pedidos|RV-77');
  });
});
