// Monta a lista de avisos: para cada carro, o último registro de cada serviço abre um "ciclo"
// que vence pela data ou pelo km. Os contatos com o cliente movem o carro pelas etapas.

import { calcularVencimento, estimarRodagem, kmEstimado, pontosDoVeiculo, type Rodagem, type Vencimento } from './agenda';
import { dataLocal, diasEntre } from './datas';
import { lembretesDoDia } from './lembretes';
import type { Lembrete } from './registros-oficina';
import type { Atendimento, Cliente, Contato, Id, Leitura, Preferencias, ProdutoUsado, ServicoId, Veiculo } from './tipos';

export type Situacao = 'atrasado' | 'avisar' | 'futuro';

/** Etapas do carro na lista de avisos. */
export type Etapa = 'avisar' | 'aguardando' | 'agendado' | 'adiado' | 'recusou' | 'futuro';

/** Depois de quantos dias sem resposta o carro volta para "Avisar". */
export const DIAS_PARA_REAVISAR = 7;

/** Por quantos dias vale o "cliente não quer agora" de um item. */
export const DIAS_DE_RECUSA = 60;

export interface ItemAviso {
  chave: string;
  veiculoId: Id;
  servico: ServicoId;
  atendimentoId: Id;
  base: { data: string; km: number };
  intervalo: { km: number | null; meses: number | null };
  produto: ProdutoUsado | null;
  venc: Vencimento;
  situacao: Situacao;
  contato: Contato | null;
}

export interface GrupoAviso {
  veiculo: Veiculo;
  cliente: Cliente | undefined;
  /** Itens vencidos ou dentro da antecedência (ou os próximos, na etapa "futuro"). */
  itens: ItemAviso[];
  etapa: Etapa;
  situacao: Situacao;
  dataPrevista: string | null;
  diasRestantes: number | null;
  rodagem: Rodagem;
  kmHoje: number;
  /** Último contato sobre estes itens. */
  ultimoContato: Contato | null;
  /** Avisado e sem resposta há mais de DIAS_PARA_REAVISAR dias. */
  reavisar: boolean;
}

export interface DadosOficina {
  clientes: Record<Id, Cliente>;
  veiculos: Record<Id, Veiculo>;
  atendimentos: Record<Id, Atendimento>;
  leituras: Record<Id, Leitura>;
  contatos: Record<Id, Contato>;
  preferencias: Preferencias;
}

export function situacaoDe(venc: Vencimento, prefs: Pick<Preferencias, 'antecedenciaDias' | 'antecedenciaKm'>): Situacao {
  if (venc.dataPrevista == null) return 'futuro';
  if ((venc.diasRestantes ?? 0) < 0 || (venc.kmRestante != null && venc.kmRestante < 0)) return 'atrasado';
  if ((venc.diasRestantes ?? Infinity) <= prefs.antecedenciaDias) return 'avisar';
  if (venc.kmRestante != null && venc.kmRestante <= prefs.antecedenciaKm) return 'avisar';
  return 'futuro';
}

/** O ciclo atual de cada serviço do carro (o registro mais recente). */
export function ciclosDoVeiculo(veiculoId: Id, atendimentos: Atendimento[]) {
  const doCarro = atendimentos
    .filter((a) => a.veiculoId === veiculoId)
    .sort((a, b) => (a.data !== b.data ? (a.data < b.data ? 1 : -1) : a.km !== b.km ? b.km - a.km : a.criadoEm < b.criadoEm ? 1 : -1));
  const ciclos = new Map<ServicoId, { atendimento: Atendimento; item: Atendimento['itens'][number] }>();
  for (const a of doCarro) for (const item of a.itens) if (!ciclos.has(item.servico)) ciclos.set(item.servico, { atendimento: a, item });
  return ciclos;
}

export function itensDoVeiculo(veiculo: Veiculo, dados: DadosOficina, hoje: string) {
  const atendimentos = Object.values(dados.atendimentos);
  const pontos = pontosDoVeiculo(veiculo.id, atendimentos, Object.values(dados.leituras));
  const rodagem = estimarRodagem(pontos, veiculo, dados.preferencias.kmMesPadrao, hoje);
  const contatos = Object.values(dados.contatos).filter((c) => c.veiculoId === veiculo.id);
  const itens: ItemAviso[] = [];
  for (const [servico, { atendimento, item }] of ciclosDoVeiculo(veiculo.id, atendimentos)) {
    const intervalo = { km: item.intervaloKm, meses: item.intervaloMeses };
    const venc = calcularVencimento({ data: atendimento.data, km: atendimento.km }, intervalo, pontos, rodagem.kmDia, hoje);
    const doCiclo = contatos.filter((c) => c.servico === servico && c.atendimentoId === atendimento.id);
    const contato = doCiclo.sort((a, b) => (a.quando < b.quando ? 1 : -1))[0] ?? null;
    itens.push({
      chave: `${veiculo.id}:${servico}`,
      veiculoId: veiculo.id,
      servico,
      atendimentoId: atendimento.id,
      base: { data: atendimento.data, km: atendimento.km },
      intervalo,
      produto: item.produto ?? null,
      venc,
      situacao: situacaoDe(venc, dados.preferencias),
      contato
    });
  }
  itens.sort(porVencimento);
  return { itens, rodagem, kmHoje: kmEstimado(pontos, rodagem.kmDia, hoje) };
}

function porVencimento(a: ItemAviso, b: ItemAviso): number {
  const da = a.venc.dataPrevista ?? '9999-12-31';
  const db = b.venc.dataPrevista ?? '9999-12-31';
  return da < db ? -1 : da > db ? 1 : 0;
}

const PESO: Record<Situacao, number> = { atrasado: 0, avisar: 1, futuro: 2 };

function maisRecente(itens: ItemAviso[]): Contato | null {
  let ultimo: Contato | null = null;
  for (const i of itens) if (i.contato && (!ultimo || i.contato.quando > ultimo.quando)) ultimo = i.contato;
  return ultimo;
}

function recusadoRecente(item: ItemAviso, hoje: string): boolean {
  return item.contato?.resultado === 'recusou' && diasEntre(dataLocal(item.contato.quando), hoje) <= DIAS_DE_RECUSA;
}

/** A etapa do carro a partir do contato mais recente sobre os itens do grupo. */
function etapaPelosContatos(itens: ItemAviso[], devido: boolean, hoje: string): { etapa: Etapa; ultimo: Contato | null; reavisar: boolean } {
  const base: Etapa = devido ? 'avisar' : 'futuro';
  const ultimo = maisRecente(itens);
  if (!ultimo) return { etapa: base, ultimo: null, reavisar: false };
  let etapa: Etapa = base;
  let reavisar = false;
  if (ultimo.resultado === 'avisado') {
    if (diasEntre(dataLocal(ultimo.quando), hoje) > DIAS_PARA_REAVISAR) reavisar = devido;
    else etapa = 'aguardando';
  } else if (ultimo.resultado === 'agendado') etapa = 'agendado';
  else if (ultimo.resultado === 'adiado') etapa = ultimo.data && ultimo.data > hoje ? 'adiado' : base;
  // um item vencido que entrou na lista depois do último contato pede um novo aviso
  if (devido && (etapa === 'aguardando' || etapa === 'adiado') && itens.some((i) => !i.contato)) etapa = 'avisar';
  return { etapa, ultimo, reavisar };
}

/**
 * Um grupo por carro. Itens vencidos ou dentro da antecedência entram juntos, para a oficina
 * mandar uma mensagem só. A etapa vem do contato mais recente sobre esses itens. Os itens que o
 * cliente recusou há pouco saem do aviso; se só sobrarem eles, o carro fica em "não quis agora".
 */
export function montarGrupos(dados: DadosOficina, hoje: string, horizonteDias = 60): GrupoAviso[] {
  const grupos: GrupoAviso[] = [];
  for (const veiculo of Object.values(dados.veiculos)) {
    const { itens, rodagem, kmHoje } = itensDoVeiculo(veiculo, dados, hoje);
    if (!itens.length) continue;
    const cliente = dados.clientes[veiculo.clienteId];
    const devidosTodos = itens.filter((i) => i.situacao !== 'futuro');
    const recusados = devidosTodos.filter((i) => recusadoRecente(i, hoje));
    const devidos = devidosTodos.filter((i) => !recusados.includes(i));

    let lista: ItemAviso[];
    let etapa: Etapa;
    let ultimo: Contato | null;
    let reavisar = false;
    if (devidos.length) {
      lista = devidos;
      ({ etapa, ultimo, reavisar } = etapaPelosContatos(devidos, true, hoje));
    } else {
      const proximos = itens.filter((i) => i.situacao === 'futuro' && i.venc.diasRestantes != null && i.venc.diasRestantes <= horizonteDias && !recusadoRecente(i, hoje));
      if (proximos.length) {
        lista = proximos;
        ({ etapa, ultimo, reavisar } = etapaPelosContatos(proximos, false, hoje));
      } else if (recusados.length) {
        lista = recusados;
        etapa = 'recusou';
        ultimo = maisRecente(recusados);
      } else continue;
    }

    const situacao = lista.reduce<Situacao>((pior, i) => (PESO[i.situacao] < PESO[pior] ? i.situacao : pior), 'futuro');
    grupos.push({
      veiculo,
      cliente,
      itens: lista,
      etapa,
      situacao,
      dataPrevista: lista[0].venc.dataPrevista,
      diasRestantes: lista[0].venc.diasRestantes,
      rodagem,
      kmHoje,
      ultimoContato: ultimo,
      reavisar
    });
  }
  return grupos.sort(ordemDosGrupos);
}

/**
 * Para a lista de compras: todos os itens de cada carro que vencem nos próximos dias
 * (inclusive os que ainda não entraram na antecedência), menos os que o cliente recusou há pouco.
 */
export function itensParaComprar(dados: DadosOficina, hoje: string, dias = 30): { veiculo: Veiculo; itens: ItemAviso[] }[] {
  const r: { veiculo: Veiculo; itens: ItemAviso[] }[] = [];
  for (const veiculo of Object.values(dados.veiculos)) {
    const { itens } = itensDoVeiculo(veiculo, dados, hoje);
    const lista = itens.filter((i) => i.venc.diasRestantes != null && i.venc.diasRestantes <= dias && !recusadoRecente(i, hoje));
    if (lista.length) r.push({ veiculo, itens: lista });
  }
  return r;
}

const ORDEM_ETAPA: Record<Etapa, number> = { avisar: 0, agendado: 1, aguardando: 2, adiado: 3, futuro: 4, recusou: 5 };

function ordemDosGrupos(a: GrupoAviso, b: GrupoAviso): number {
  if (ORDEM_ETAPA[a.etapa] !== ORDEM_ETAPA[b.etapa]) return ORDEM_ETAPA[a.etapa] - ORDEM_ETAPA[b.etapa];
  if (a.etapa === 'agendado') {
    const da = a.ultimoContato?.data ?? '';
    const db = b.ultimoContato?.data ?? '';
    if (da !== db) return da < db ? -1 : 1;
  }
  const da = a.dataPrevista ?? '9999-12-31';
  const db = b.dataPrevista ?? '9999-12-31';
  return da < db ? -1 : da > db ? 1 : 0;
}

// ---------------------------------------------------------------- lembretes

export interface ItemDeLembrete {
  lembrete: Lembrete;
  veiculo: Veiculo | undefined;
  cliente: Cliente | undefined;
}

/**
 * O grupo de lembretes do início: os abertos que chegaram na data (recusados no orçamento,
 * recalls e anotações), cada um com o carro e o cliente, dos mais antigos para os mais novos.
 */
export function grupoDeLembretes(lembretes: Record<Id, Lembrete>, dados: Pick<DadosOficina, 'veiculos' | 'clientes'>, hoje: string): ItemDeLembrete[] {
  return lembretesDoDia(Object.values(lembretes), hoje).map((lembrete) => {
    const veiculo = lembrete.veiculoId ? dados.veiculos[lembrete.veiculoId] : undefined;
    const cliente = (lembrete.clienteId ? dados.clientes[lembrete.clienteId] : undefined) ?? (veiculo ? dados.clientes[veiculo.clienteId] : undefined);
    return { lembrete, veiculo, cliente };
  });
}

export interface Resumo {
  avisar: number;
  atrasados: number;
  aguardando: number;
  agendados: number;
  agendadosHoje: number;
  proximos: number;
}

export function resumir(grupos: GrupoAviso[], hoje: string): Resumo {
  const r: Resumo = { avisar: 0, atrasados: 0, aguardando: 0, agendados: 0, agendadosHoje: 0, proximos: 0 };
  for (const g of grupos) {
    if (g.etapa === 'avisar') {
      r.avisar++;
      if (g.situacao === 'atrasado') r.atrasados++;
    } else if (g.etapa === 'aguardando') r.aguardando++;
    else if (g.etapa === 'agendado') {
      r.agendados++;
      if (g.ultimoContato?.data === hoje) r.agendadosHoje++;
    } else if (g.etapa === 'futuro') r.proximos++;
  }
  return r;
}
