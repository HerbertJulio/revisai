// Dados de exemplo para conhecer o app: clientes e carros fictícios, com serviços montados
// a partir de hoje para cair em todas as etapas (atrasado, avisar, aguardando, agendado, próximos).
// Todos os ids começam com "ex-", para dar para apagar só o exemplo depois.

import { CATALOGO_EXEMPLO } from './catalogo-demo';
import { somarDias, somarMeses } from './datas';
import { REFERENCIAS_OLEO } from './oleos';
import { itemDoProduto } from './estoque';
import type { Atendimento, Cliente, Contato, Documento, ItemEstoque, ItemServico, Leitura, ProdutoUsado, ServicoId, Veiculo } from './tipos';

export const PREFIXO_EXEMPLO = 'ex-';

function produto(id: number): ProdutoUsado {
  const p = CATALOGO_EXEMPLO.produtos.find((x) => x.id === id)!;
  return { id: p.id, nome: p.nome, categoria: p.categoria, especificacao: p.especificacao };
}

function oleoDe(referencia: string) {
  return { ...REFERENCIAS_OLEO.find((r) => r.id === referencia)!.oleo };
}

function item(servico: ServicoId, km: number | null, meses: number | null, prod?: number): ItemServico {
  return { servico, intervaloKm: km, intervaloMeses: meses, produto: prod ? produto(prod) : null };
}

export function gerarExemplo(hoje: string, agora: Date = new Date()) {
  const criadoEm = agora.toISOString();
  const clientes: Cliente[] = [
    { id: 'ex-c1', nome: 'Fernanda Lima', telefone: '21990001001', criadoEm },
    { id: 'ex-c2', nome: 'João Batista', telefone: '21990001002', observacao: 'Motorista de aplicativo', criadoEm },
    { id: 'ex-c3', nome: 'Marcos Pereira', telefone: '21990001003', criadoEm },
    { id: 'ex-c4', nome: 'Ana Souza', telefone: '21990001004', criadoEm },
    { id: 'ex-c5', nome: 'Carlos Henrique', telefone: '21990001005', criadoEm },
    { id: 'ex-c6', nome: 'Patrícia Gomes', telefone: '21990001006', criadoEm },
    { id: 'ex-c7', nome: 'Roberto Alves', telefone: '21990001007', criadoEm },
    { id: 'ex-c8', nome: 'Luciana Martins', telefone: '21990001008', criadoEm },
    { id: 'ex-c9', nome: 'Diego Rocha', telefone: '21990001009', observacao: 'Carro com kit GNV', criadoEm }
  ];

  const veiculos: Veiculo[] = [
    { id: 'ex-v1', clienteId: 'ex-c1', placa: 'FLM2C24', marca: 'Chevrolet', modelo: 'Onix Plus', motor: '1.0 turbo', ano: 2022, combustivel: 'flex', kmMes: 700, oleo: oleoDe('onix-turbo'), criadoEm },
    { id: 'ex-v2', clienteId: 'ex-c2', placa: 'JBT7A11', marca: 'Volkswagen', modelo: 'Polo', motor: '1.0 TSI', ano: 2021, combustivel: 'flex', usoSevero: true, oleo: oleoDe('vw-tsi'), criadoEm },
    { id: 'ex-v3', clienteId: 'ex-c3', placa: 'MPR4D56', marca: 'Fiat', modelo: 'Strada', motor: '1.3 Firefly', ano: 2023, combustivel: 'flex', kmMes: 600, oleo: { ...oleoDe('fiat-firefly'), capacidadeL: 3.3 }, criadoEm },
    { id: 'ex-v4', clienteId: 'ex-c4', placa: 'ANS1B90', marca: 'Hyundai', modelo: 'HB20', motor: '1.0', ano: 2020, combustivel: 'flex', kmMes: 650, oleo: oleoDe('hb20-aspirado'), criadoEm },
    { id: 'ex-v5', clienteId: 'ex-c5', placa: 'CHQ8E37', marca: 'Jeep', modelo: 'Compass', motor: '1.3 turbo', ano: 2022, combustivel: 'flex', kmMes: 800, oleo: oleoDe('jeep-t270'), criadoEm },
    { id: 'ex-v6', clienteId: 'ex-c6', placa: 'PTG3F12', marca: 'Chevrolet', modelo: 'Onix', motor: '1.0', ano: 2020, combustivel: 'flex', kmMes: 900, oleo: { ...oleoDe('onix-aspirado'), capacidadeL: 3.5 }, criadoEm },
    { id: 'ex-v7', clienteId: 'ex-c7', placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol', motor: '1.6', ano: 2014, combustivel: 'flex', kmMes: 500, criadoEm },
    { id: 'ex-v8', clienteId: 'ex-c8', placa: 'LCM6H08', marca: 'Toyota', modelo: 'Corolla', motor: '2.0', ano: 2021, combustivel: 'flex', kmMes: 750, criadoEm },
    { id: 'ex-v9', clienteId: 'ex-c9', placa: 'DGR9J71', marca: 'Renault', modelo: 'Kwid', motor: '1.0', ano: 2022, combustivel: 'gnv', usoSevero: true, kmMes: 3500, criadoEm }
  ];

  const m = (meses: number, dias = 0) => somarDias(somarMeses(hoje, -meses), dias);
  const a = (id: string, veiculoId: string, data: string, km: number, itens: ItemServico[], valor?: number): Atendimento => ({
    id,
    veiculoId,
    data,
    km,
    itens,
    valor: valor ?? null,
    criadoEm
  });

  const atendimentos: Atendimento[] = [
    // vence pela data em 5 dias
    a('ex-a1', 'ex-v1', m(12, 5), 31200, [item('troca_oleo', 10000, 12, 101), item('filtro_oleo', 10000, 12, 201)], 289.9),
    // aplicativo, uso severo: vence pelo km em poucos dias
    a('ex-a2', 'ex-v2', somarDias(hoje, -47), 88400, [item('troca_oleo', 5000, 6, 103), item('filtro_oleo', 5000, 6, 202)], 319.9),
    // atrasado 10 dias
    a('ex-a3', 'ex-v3', m(12, -10), 18700, [item('troca_oleo', 10000, 12, 102), item('filtro_oleo', 10000, 12, 201)], 279.9),
    // avisado anteontem, vence em 10 dias
    a('ex-a4', 'ex-v4', m(12, 10), 41000, [item('troca_oleo', 10000, 12, 105), item('filtro_oleo', 10000, 12, 201), item('alinhamento', 10000, 12)], 349.9),
    // agendado
    a('ex-a5', 'ex-v5', m(12, 6), 22300, [item('troca_oleo', 10000, 12, 104), item('filtro_oleo', 10000, 12, 201)], 459.9),
    // revisão de 2 anos vencendo junto, e uma troca de óleo recente
    a('ex-a6', 'ex-v6', m(24, 5), 34000, [item('filtro_ar', 20000, 24, 203), item('fluido_freio', null, 24, 303), item('arrefecimento', 40000, 24, 112)], 412.0),
    a('ex-a6b', 'ex-v6', m(4), 49500, [item('troca_oleo', 10000, 12, 102), item('filtro_oleo', 10000, 12, 201)], 289.9),
    // próximos: vence em uns 25 dias
    a('ex-a7', 'ex-v7', m(6, 25), 132000, [item('troca_oleo', 5000, 6, 107), item('filtro_oleo', 5000, 6, 202)], 219.9),
    // próximos: vence em uns 40 dias
    a('ex-a8', 'ex-v8', m(12, 40), 36100, [item('troca_oleo', 10000, 12, 102), item('filtro_oleo', 10000, 12, 201), item('filtro_cabine', 10000, 12, 204)], 398.0),
    // GNV atrasado; óleo feito há pouco
    a('ex-a9', 'ex-v9', m(12, -3), 61000, [item('gnv', null, 12)], 180.0),
    a('ex-a9b', 'ex-v9', somarDias(hoje, -12), 99800, [item('troca_oleo', 5000, 6, 105), item('filtro_oleo', 5000, 6, 202)], 229.9)
  ];

  const leituras: Leitura[] = [{ id: 'ex-l1', veiculoId: 'ex-v2', data: somarDias(hoje, -15), km: 91600 }];

  const contatos: Contato[] = [
    ...['troca_oleo', 'filtro_oleo', 'alinhamento'].map(
      (s, i): Contato => ({ id: `ex-k4${i}`, veiculoId: 'ex-v4', servico: s as ServicoId, atendimentoId: 'ex-a4', quando: `${somarDias(hoje, -2)}T14:20:00.000Z`, resultado: 'avisado' })
    ),
    ...['troca_oleo', 'filtro_oleo'].map(
      (s, i): Contato => ({
        id: `ex-k5${i}`,
        veiculoId: 'ex-v5',
        servico: s as ServicoId,
        atendimentoId: 'ex-a5',
        quando: `${somarDias(hoje, -1)}T16:05:00.000Z`,
        resultado: 'agendado',
        data: somarDias(hoje, 3)
      })
    )
  ];

  // estoque: o óleo 5W-30 e o filtro abaixo do mínimo, as pastilhas zeradas
  const doCatalogo = (id: string, produtoId: number, quantidade: number, minimo: number, preco: number | null = null): ItemEstoque => {
    const p = CATALOGO_EXEMPLO.produtos.find((x) => x.id === produtoId)!;
    return { ...itemDoProduto(p), id, quantidade, minimo, preco, criadoEm, atualizadoEm: criadoEm };
  };
  const estoque: ItemEstoque[] = [
    doCatalogo('ex-e1', 105, 6, 10, 59.9),
    doCatalogo('ex-e2', 102, 14, 8, 69.9),
    doCatalogo('ex-e3', 201, 3, 5, 45),
    doCatalogo('ex-e4', 203, 2, 2),
    doCatalogo('ex-e5', 301, 0, 1),
    doCatalogo('ex-e6', 303, 4, 2)
  ];

  const ontem = somarDias(hoje, -1);
  const documentos: Documento[] = [
    {
      id: 'ex-d1',
      numero: 1,
      tipo: 'orcamento',
      situacao: 'enviado',
      veiculoId: 'ex-v7',
      km: 134800,
      data: ontem,
      modalidade: 'pago',
      vistoria: { valor: 80, abater: true },
      validadeDias: 10,
      enviadoEm: `${ontem}T15:10:00.000Z`,
      linhas: [
        { id: 'ex-d1-1', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilhas de freio dianteiras', quantidade: 1, unidade: 'un', valorUnitario: 189.9, estoqueId: 'ex-e5', produto: produto(301) },
        { id: 'ex-d1-2', tipo: 'peca', servico: 'discos', descricao: 'Discos de freio dianteiros ventilados (par)', quantidade: 1, unidade: 'un', valorUnitario: 429.9, produto: produto(302) },
        { id: 'ex-d1-3', tipo: 'peca', servico: 'fluido_freio', descricao: 'Fluido de freio DOT 4 (500 ml)', quantidade: 2, unidade: 'un', valorUnitario: 45, estoqueId: 'ex-e6', produto: produto(303) },
        { id: 'ex-d1-4', tipo: 'servico', servico: 'pastilhas', descricao: 'Mão de obra dos freios', quantidade: 1, unidade: 'un', valorUnitario: 180 }
      ],
      desconto: null,
      diagnostico: 'Pastilhas no fim e discos com sulco. Fluido escuro, com umidade acima do recomendado.',
      prazo: '1 dia útil',
      criadoEm: `${ontem}T14:40:00.000Z`,
      atualizadoEm: `${ontem}T15:10:00.000Z`
    },
    {
      id: 'ex-d2',
      numero: 1,
      tipo: 'ordem',
      situacao: 'aberta',
      veiculoId: 'ex-v8',
      km: 47200,
      data: hoje,
      linhas: [
        { id: 'ex-d2-1', tipo: 'peca', servico: 'troca_oleo', descricao: 'Óleo 0W-20 sintético API SP dexos1 Gen 3', quantidade: 4, unidade: 'L', valorUnitario: 69.9, estoqueId: 'ex-e2', produto: produto(102) },
        { id: 'ex-d2-2', tipo: 'peca', servico: 'filtro_oleo', descricao: 'Filtro de óleo blindado', quantidade: 1, unidade: 'un', valorUnitario: 45, estoqueId: 'ex-e3', produto: produto(201) },
        { id: 'ex-d2-3', tipo: 'servico', servico: 'troca_oleo', descricao: 'Mão de obra da troca de óleo', quantidade: 1, unidade: 'un', valorUnitario: 60 }
      ],
      desconto: null,
      criadoEm: `${hoje}T09:00:00.000Z`,
      atualizadoEm: `${hoje}T09:00:00.000Z`
    }
  ];

  const porId = <T extends { id: string }>(lista: T[]) => Object.fromEntries(lista.map((x) => [x.id, x])) as Record<string, T>;
  return {
    clientes: porId(clientes),
    veiculos: porId(veiculos),
    atendimentos: porId(atendimentos),
    leituras: porId(leituras),
    contatos: porId(contatos),
    estoque: porId(estoque),
    documentos: porId(documentos)
  };
}

export function ehExemplo(id: string): boolean {
  return id.startsWith(PREFIXO_EXEMPLO);
}
