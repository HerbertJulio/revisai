import { describe, expect, it } from 'vitest';
import type { Catalogo, Produto } from '@/lib/catalogo';
import { agendamentosDoKit, itensDoKit, montarKit } from '@/lib/kit-revisao';
import type { Agendamento } from '@/lib/registros-oficina';
import type { Atendimento, Cliente, ItemEstoque, Veiculo } from '@/lib/tipos';

const AGORA = '2026-10-17T12:00:00.000Z';
const HOJE = '2026-10-19';

function produto(id: number, extra: Partial<Produto>): Produto {
  return {
    id,
    fornecedorId: 1,
    categoria: 'outros',
    nome: `Produto ${id}`,
    marca: null,
    descricao: null,
    unidade: 'un',
    conteudo: null,
    preco: 10,
    especificacao: {},
    intervaloKm: null,
    intervaloMeses: null,
    imagemUrl: null,
    referenciaId: null,
    ...extra
  };
}

const catalogo: Catalogo = {
  origem: 'banco',
  atualizadoEm: AGORA,
  fornecedores: [{ id: 1, nome: 'Loja Centro', cidade: 'Rio', uf: 'RJ', demonstracao: false, destaque: false, descricao: null }],
  produtos: [
    produto(10, { categoria: 'oleo_motor', nome: 'Óleo 5W-30 sintético dexos1 1 L', unidade: 'L', conteudo: 1, preco: 42, especificacao: { viscosidade: '5W-30', base: 'sintetico', api: 'SP', normas: ['dexos1 Gen 3'] } }),
    produto(11, { categoria: 'oleo_motor', nome: 'Óleo 15W-40 mineral 1 L', unidade: 'L', conteudo: 1, preco: 25, especificacao: { viscosidade: '15W-40', base: 'mineral', api: 'SL' } }),
    produto(20, { categoria: 'filtro_oleo', nome: 'Filtro de óleo', preco: 22 }),
    produto(30, { categoria: 'filtro_ar', nome: 'Filtro de ar', preco: 35 })
  ],
  promocoes: [],
  patrocinios: []
};

const clientes: Record<string, Cliente> = { c1: { id: 'c1', nome: 'Maria', telefone: '21987654321', criadoEm: AGORA } };
const veiculos: Record<string, Veiculo> = {
  v1: { id: 'v1', clienteId: 'c1', placa: 'ABC1D23', marca: 'Chevrolet', modelo: 'Onix', ano: 2019, oleo: { viscosidades: ['5W-30'], norma: 'dexos1 Gen 3', capacidadeL: 3.5 }, criadoEm: AGORA },
  v2: { id: 'v2', clienteId: 'c1', placa: 'XYZ9A99', marca: 'Fiat', modelo: 'Uno', ano: 2012, criadoEm: AGORA }
};

function ag(id: string, extra: Partial<Agendamento>): Agendamento {
  return { id, data: HOJE, hora: '08:00', duracaoMin: 60, servico: 'Troca de óleo', situacao: 'marcado', origem: 'oficina', criadoEm: AGORA, atualizadoEm: AGORA, ...extra };
}

function estoque(itens: Partial<ItemEstoque>[]): Record<string, ItemEstoque> {
  const r: Record<string, ItemEstoque> = {};
  itens.forEach((i, n) => {
    const id = `e${n}`;
    r[id] = { id, nome: 'Item', categoria: 'outros', unidade: 'un', quantidade: 0, minimo: 0, custo: null, preco: null, criadoEm: AGORA, atualizadoEm: AGORA, ...i };
  });
  return r;
}

describe('kit da revisão', () => {
  it('soma o óleo do manual e o filtro de cada troca de óleo, contra o estoque, e sugere a compra', () => {
    const kit = montarKit({
      agendamentos: [ag('a1', { veiculoId: 'v1' }), ag('a2', { veiculoId: 'v1', data: '2026-10-21', servico: 'Troca de óleo e filtro de ar' })],
      clientes,
      veiculos,
      atendimentos: {},
      estoque: estoque([
        { nome: 'Óleo 5W-30 dexos1', categoria: 'oleo_motor', unidade: 'L', quantidade: 4, especificacao: { viscosidade: '5W-30', base: 'sintetico', api: 'SP', normas: ['dexos1 Gen 3'] } },
        { nome: 'Filtro de óleo', categoria: 'filtro_oleo', quantidade: 5 }
      ]),
      catalogo,
      hoje: HOJE
    });
    expect(kit.carros.map((c) => [c.agendamentoId, c.servicos])).toEqual([
      ['a1', ['troca_oleo', 'filtro_oleo']],
      ['a2', ['troca_oleo', 'filtro_oleo', 'filtro_ar']]
    ]);
    const oleo = kit.linhas.find((l) => l.categoria === 'oleo_motor')!;
    expect(oleo).toMatchObject({ precisa: 7, tem: 4, faltam: 3 });
    expect(oleo.compra).toMatchObject({ quantidade: 3, total: 126 });
    expect(oleo.compra?.produto.id).toBe(10);
    expect(kit.linhas.find((l) => l.categoria === 'filtro_oleo')).toMatchObject({ precisa: 2, tem: 5, faltam: 0, compra: null });
    const ar = kit.linhas.find((l) => l.categoria === 'filtro_ar')!;
    expect(ar).toMatchObject({ precisa: 1, tem: 0, faltam: 1 });
    expect(kit.paraComprar.map((l) => l.categoria).sort()).toEqual(['filtro_ar', 'oleo_motor']);
    expect(kit.total).toBe(161);
    expect(itensDoKit(kit)).toEqual(expect.arrayContaining([{ produtoId: 10, quantidade: 3 }, { produtoId: 30, quantidade: 1 }]));
    expect(agendamentosDoKit(kit)).toEqual(['a1', 'a2']);
  });

  it('sem o óleo do manual, usa o último óleo da troca; sem nenhum, avisa', () => {
    const atendimentos: Record<string, Atendimento> = {
      t1: {
        id: 't1',
        veiculoId: 'v2',
        data: '2026-04-01',
        km: 80000,
        itens: [{ servico: 'troca_oleo', produto: { nome: 'Óleo 15W-40', categoria: 'oleo_motor', especificacao: { viscosidade: '15W-40', base: 'mineral', api: 'SL' } }, intervaloKm: 5000, intervaloMeses: 6 }],
        criadoEm: AGORA
      }
    };
    const base = { agendamentos: [ag('a1', { veiculoId: 'v2' })], clientes, veiculos, estoque: {}, catalogo, hoje: HOJE };
    const comHistorico = montarKit({ ...base, atendimentos });
    expect(comHistorico.carros[0].semOleo).toBe(false);
    expect(comHistorico.linhas.find((l) => l.categoria === 'oleo_motor')?.compra?.produto.id).toBe(11);
    const semNada = montarKit({ ...base, atendimentos: {} });
    expect(semNada.carros[0].semOleo).toBe(true);
    expect(semNada.semProduto.map((l) => l.titulo)).toContain('Óleo de carros sem cadastro do óleo');
  });

  it('fora da semana, cancelado, já pedido ou sem peça não entram na conta', () => {
    const kit = montarKit({
      agendamentos: [
        ag('passado', { veiculoId: 'v1', data: '2026-10-18' }),
        ag('longe', { veiculoId: 'v1', data: '2026-10-26' }),
        ag('cancelado', { veiculoId: 'v1', situacao: 'cancelado' }),
        ag('pedido', { veiculoId: 'v1', kitPedidoCodigo: 'K7M2X9' }),
        ag('freio', { veiculoId: 'v1', servico: 'Pastilhas de freio' }),
        ag('barulho', { veiculoId: 'v1', servico: 'Barulho na suspensão dianteira' }),
        ag('avulso', { nome: 'João', placa: 'QWE1R23', servico: 'Filtro de ar' })
      ],
      clientes,
      veiculos,
      atendimentos: {},
      estoque: {},
      catalogo,
      hoje: HOJE
    });
    expect(kit.carros.map((c) => c.agendamentoId)).toEqual(['pedido', 'freio', 'barulho', 'avulso']);
    expect(kit.carros.find((c) => c.agendamentoId === 'pedido')?.pedido).toBe('K7M2X9');
    expect(kit.carros.find((c) => c.agendamentoId === 'freio')).toMatchObject({ servicos: [], avaliar: ['pastilhas'] });
    expect(kit.carros.find((c) => c.agendamentoId === 'barulho')).toMatchObject({ servicos: [], avaliar: ['amortecedores'] });
    // o carro sem cadastro entra pela categoria
    expect(kit.linhas.map((l) => [l.categoria, l.precisa])).toEqual([['filtro_ar', 1]]);
    expect(agendamentosDoKit(kit)).toEqual(['avulso']);
  });
});
