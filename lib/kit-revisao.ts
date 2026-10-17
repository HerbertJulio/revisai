// O kit da revisão: as peças que os carros agendados nos próximos dias vão usar, contra o que tem
// no estoque, e o que comprar na loja do Revisaí para não faltar. Usa as mesmas contas da previsão
// do estoque: a soma da demanda (lib/recomendacao, com o óleo do manual de cada carro), o estoque
// que atende cada linha (lib/estoque) e a compra sugerida para a falta.

import { emAberto, ordenarAgendamentos, quemE, servicosDoTexto } from './agendamento';
import { ciclosDoVeiculo, type ItemAviso } from './avisos';
import type { Catalogo } from './catalogo';
import { diasEntre, somarDias } from './datas';
import { compraSugerida, preverEstoque, type LinhaPrevisao } from './estoque';
import { servico as infoServico } from './manutencao';
import { exigenciaDoCarro } from './oleos';
import { calcularDemanda, type Recomendacao } from './recomendacao';
import type { Agendamento } from './registros-oficina';
import type { Atendimento, Cliente, Id, ItemEstoque, ProdutoUsado, ServicoId, Veiculo } from './tipos';

/** O kit olha os carros marcados de hoje até 6 dias depois. */
export const DIAS_DO_KIT = 7;

/** Na troca de óleo, o filtro de óleo vai junto. */
const JUNTO_NO_KIT: Partial<Record<ServicoId, ServicoId[]>> = { troca_oleo: ['filtro_oleo'] };

export interface CarroDoKit {
  agendamentoId: Id;
  data: string;
  hora: string;
  nome: string;
  placa: string;
  carro: string;
  veiculoId: Id | null;
  /** Os serviços marcados que trocam peça (entram na conta do kit). */
  servicos: ServicoId[];
  /** Serviços em que a peça depende da avaliação (freio, pneu, bateria...): não entram na conta. */
  avaliar: ServicoId[];
  /** Troca de óleo sem o óleo do manual cadastrado (nem o último usado): não dá para dizer qual. */
  semOleo: boolean;
  /** O kit deste carro já foi pedido na loja (código do pedido). */
  pedido: string | null;
}

export interface LinhaDoKit extends LinhaPrevisao {
  /** O que comprar para a falta (null quando não falta ou a loja não tem). */
  compra: Recomendacao | null;
}

export interface Kit {
  carros: CarroDoKit[];
  linhas: LinhaDoKit[];
  /** As linhas que faltam e têm produto na loja. */
  paraComprar: LinhaDoKit[];
  /** As linhas que faltam e a loja não tem (ou o óleo sem cadastro). */
  semProduto: LinhaDoKit[];
  /** Quanto custa comprar tudo o que falta. */
  total: number;
}

const CATALOGO_VAZIO: Catalogo = { origem: 'exemplo', atualizadoEm: '', fornecedores: [], produtos: [], promocoes: [], patrocinios: [] };

function comJunto(servicos: ServicoId[]): ServicoId[] {
  const r: ServicoId[] = [];
  for (const s of servicos) for (const x of [s, ...(JUNTO_NO_KIT[s] ?? [])]) if (!r.includes(x)) r.push(x);
  return r;
}

/** O serviço marcado como um item de aviso que "vence" no dia do agendamento (o que a soma da demanda lê). */
function itemDoAgendamento(a: Agendamento, veiculoId: Id, servico: ServicoId, produto: ProdutoUsado | null, dias: number): ItemAviso {
  return {
    chave: `${a.id}:${servico}`,
    veiculoId,
    servico,
    atendimentoId: '',
    base: { data: a.data, km: 0 },
    intervalo: { km: null, meses: null },
    produto,
    venc: { dataLimite: a.data, kmLimite: null, dataPorKm: null, dataPrevista: a.data, motivo: 'tempo', diasRestantes: dias, kmRestante: null, kmHoje: 0 },
    situacao: 'avisar',
    contato: null
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * O kit dos carros marcados de hoje até `dias - 1` dias depois (os que ainda vão acontecer ou estão
 * na oficina). Os carros cujo kit já foi pedido aparecem na lista, mas não entram na conta.
 */
export function montarKit(p: {
  agendamentos: Agendamento[];
  clientes: Record<Id, Cliente>;
  veiculos: Record<Id, Veiculo>;
  atendimentos: Record<Id, Atendimento>;
  estoque: Record<Id, ItemEstoque>;
  catalogo: Catalogo;
  hoje: string;
  dias?: number;
}): Kit {
  const dias = Math.max(1, p.dias ?? DIAS_DO_KIT);
  const ate = somarDias(p.hoje, dias - 1);
  const lista = ordenarAgendamentos(p.agendamentos.filter((a) => a.data >= p.hoje && a.data <= ate && emAberto(a.situacao)));
  const atendimentos = Object.values(p.atendimentos);
  const carros: CarroDoKit[] = [];
  const paraDemanda: { veiculo: Pick<Veiculo, 'oleo'>; itens: ItemAviso[] }[] = [];

  for (const a of lista) {
    const q = quemE(a, p.clientes, p.veiculos);
    const comPeca = comJunto(servicosDoTexto(a.servico)).filter((s) => infoServico(s).categoria);
    if (!comPeca.length) continue;
    const ciclos = q.veiculo ? ciclosDoVeiculo(q.veiculo.id, atendimentos) : new Map<ServicoId, { item: { produto?: ProdutoUsado | null } }>();
    const veiculoId = q.veiculo?.id ?? `agenda:${a.id}`;
    const itens = comPeca.map((s) => itemDoAgendamento(a, veiculoId, s, ciclos.get(s)?.item.produto ?? null, diasEntre(p.hoje, a.data)));
    const carro = { veiculo: { oleo: q.veiculo?.oleo }, itens };
    // a mesma regra da previsão do estoque: só entra o que costuma trocar peça
    const entram = new Set(calcularDemanda([carro], CATALOGO_VAZIO, p.hoje, dias).map((l) => l.servico));
    const servicos = comPeca.filter((s) => entram.has(s));
    const avaliar = comPeca.filter((s) => !entram.has(s));
    const semOleo = servicos.includes('troca_oleo') && !exigenciaDoCarro(q.veiculo?.oleo, ciclos.get('troca_oleo')?.item.produto?.especificacao);
    carros.push({
      agendamentoId: a.id,
      data: a.data,
      hora: a.hora,
      nome: q.nome,
      placa: q.placa,
      carro: q.carro,
      veiculoId: q.veiculo?.id ?? null,
      servicos,
      avaliar,
      semOleo,
      pedido: a.kitPedidoCodigo || null
    });
    if (!a.kitPedidoCodigo && servicos.length) paraDemanda.push({ veiculo: carro.veiculo, itens: itens.filter((i) => servicos.includes(i.servico)) });
  }

  const demanda = calcularDemanda(paraDemanda, p.catalogo, p.hoje, dias);
  const linhas: LinhaDoKit[] = preverEstoque(demanda, [], Object.values(p.estoque), p.hoje).map((l) => ({ ...l, compra: compraSugerida(l, p.estoque, p.catalogo, p.hoje) }));
  const paraComprar = linhas.filter((l) => l.faltam > 0 && l.compra);
  const semProduto = linhas.filter((l) => (l.faltam > 0 || l.semEspecificacao) && !l.compra);
  return { carros, linhas, paraComprar, semProduto, total: r2(paraComprar.reduce((s, l) => s + (l.compra?.total ?? 0), 0)) };
}

/** O que vai para o carrinho da loja: um item por produto (somando quando dois carros pedem o mesmo). */
export function itensDoKit(kit: Pick<Kit, 'paraComprar'>): { produtoId: number; quantidade: number }[] {
  const m = new Map<number, number>();
  for (const l of kit.paraComprar) if (l.compra) m.set(l.compra.produto.id, (m.get(l.compra.produto.id) ?? 0) + l.compra.quantidade);
  return [...m].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
}

/** Os agendamentos que entraram na conta do kit (para marcar o pedido neles depois). */
export function agendamentosDoKit(kit: Pick<Kit, 'carros'>): Id[] {
  return kit.carros.filter((c) => !c.pedido && c.servicos.length).map((c) => c.agendamentoId);
}
