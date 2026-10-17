// Os números da oficina num período: faturamento por mês, ticket médio, carros atendidos, mão de
// obra e peças, margem das peças, aprovação dos orçamentos, serviços mais feitos, retorno dos
// avisos e o que entrou e o que falta entrar. Funções puras; a tela fica em components/oficina/relatorios.

import { dataLocal, diasEntre, somarDias, somarMeses } from './datas';
import { totais, totalDaLinha } from './documentos';
import { somaEmReais } from './financeiro';
import { servico as infoServico, servicoExiste } from './manutencao';
import type { Lancamento } from './registros-oficina';
import type { Atendimento, Contato, Documento, Id, ItemEstoque } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- período

export type Periodo = 'este_mes' | 'mes_passado' | '3m' | '6m' | '12m';

export const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: 'este_mes', nome: 'Este mês' },
  { id: 'mes_passado', nome: 'Mês passado' },
  { id: '3m', nome: '3 meses' },
  { id: '6m', nome: '6 meses' },
  { id: '12m', nome: '12 meses' }
];

export function periodoValido(p: string | null | undefined): Periodo {
  return PERIODOS.some((x) => x.id === p) ? (p as Periodo) : 'este_mes';
}

/** Datas de início e fim (incluídas) e os meses ('AAAA-MM') do período. */
export interface Intervalo {
  inicio: string;
  fim: string;
  meses: string[];
}

function primeiroDia(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function intervaloDoPeriodo(p: Periodo, hoje: string): Intervalo {
  const mesAtual = primeiroDia(hoje);
  if (p === 'mes_passado') {
    const inicio = somarMeses(mesAtual, -1);
    return { inicio, fim: somarDias(mesAtual, -1), meses: [inicio.slice(0, 7)] };
  }
  const n = p === '3m' ? 3 : p === '6m' ? 6 : p === '12m' ? 12 : 1;
  const inicio = somarMeses(mesAtual, -(n - 1));
  return { inicio, fim: hoje, meses: Array.from({ length: n }, (_, i) => somarMeses(inicio, i).slice(0, 7)) };
}

export function dentro(dia: string | null | undefined, i: Pick<Intervalo, 'inicio' | 'fim'>): boolean {
  return !!dia && dia >= i.inicio && dia <= i.fim;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-10' vira 'out/26'. */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-');
  const n = Number(m);
  return n >= 1 && n <= 12 ? `${MESES[n - 1]}/${a.slice(2)}` : mes;
}

// ---------------------------------------------------------------- ordens concluídas

/** O dia em que a ordem foi concluída (no fuso do aparelho), ou o dia dela. */
export function diaDaConclusao(d: Pick<Documento, 'concluidoEm' | 'data'>): string {
  return d.concluidoEm ? dataLocal(d.concluidoEm) : d.data;
}

export function ordensConcluidas(documentos: Documento[], i: Pick<Intervalo, 'inicio' | 'fim'>): Documento[] {
  return documentos.filter((d) => d.tipo === 'ordem' && d.situacao === 'concluida' && dentro(diaDaConclusao(d), i));
}

export interface MesDoFaturamento {
  mes: string;
  faturamento: number;
  ordens: number;
  /** Carros diferentes atendidos no mês. */
  carros: number;
  ticket: number | null;
}

export function faturamentoPorMes(ordens: Documento[], i: Intervalo): MesDoFaturamento[] {
  return i.meses.map((mes) => {
    const doMes = ordens.filter((d) => diaDaConclusao(d).slice(0, 7) === mes);
    const faturamento = somaEmReais(doMes.map((d) => totais(d).total));
    return { mes, faturamento, ordens: doMes.length, carros: carrosDiferentes(doMes), ticket: doMes.length ? r2(faturamento / doMes.length) : null };
  });
}

export function carrosDiferentes(ordens: Pick<Documento, 'veiculoId'>[]): number {
  return new Set(ordens.map((d) => d.veiculoId).filter(Boolean)).size;
}

export interface ResumoDoPeriodo {
  faturamento: number;
  ordens: number;
  ticketMedio: number | null;
  carros: number;
  maoDeObra: number;
  pecas: number;
  outros: number;
  descontos: number;
}

export function resumoDoPeriodo(ordens: Documento[]): ResumoDoPeriodo {
  const t = ordens.map((d) => totais(d));
  const faturamento = somaEmReais(t.map((x) => x.total));
  return {
    faturamento,
    ordens: ordens.length,
    ticketMedio: ordens.length ? r2(faturamento / ordens.length) : null,
    carros: carrosDiferentes(ordens),
    maoDeObra: somaEmReais(t.map((x) => x.servicos)),
    pecas: somaEmReais(t.map((x) => x.pecas)),
    outros: somaEmReais(t.map((x) => x.outros)),
    descontos: somaEmReais(t.map((x) => x.desconto))
  };
}

// ---------------------------------------------------------------- margem das peças

export interface LinhaMargem {
  chave: string;
  nome: string;
  quantidade: number;
  venda: number;
  /** null: o estoque não tem o custo dessa peça. */
  custo: number | null;
  margem: number | null;
}

export interface MargemDasPecas {
  linhas: LinhaMargem[];
  /** Só as peças com custo conhecido. */
  venda: number;
  custo: number;
  margem: number;
  /** Margem sobre a venda, em %. */
  percentual: number | null;
  /** Peças vendidas sem custo conhecido (fora do estoque ou sem o preço de compra). */
  vendaSemCusto: number;
  linhasSemCusto: number;
}

/**
 * Preço cobrado contra o custo do item do estoque (o da última compra), nas peças que saíram do
 * estoque. O desconto da ordem não entra: é a margem de cada peça.
 */
export function margemDasPecas(ordens: Documento[], estoque: Record<Id, ItemEstoque>): MargemDasPecas {
  const porChave = new Map<string, LinhaMargem>();
  let vendaSemCusto = 0;
  let linhasSemCusto = 0;
  for (const d of ordens) {
    for (const l of d.linhas) {
      if (l.recusada || l.tipo !== 'peca') continue;
      const venda = totalDaLinha(l);
      const item = l.estoqueId ? estoque[l.estoqueId] : undefined;
      const custoUnitario = item?.custo != null && item.custo >= 0 ? item.custo : null;
      if (custoUnitario == null) {
        vendaSemCusto += Math.round(venda * 100);
        linhasSemCusto++;
      }
      const chave = item ? `e:${item.id}` : `d:${l.descricao.trim().toLowerCase()}`;
      const atual = porChave.get(chave) ?? { chave, nome: item ? [item.marca && !item.nome.toLowerCase().includes(item.marca.toLowerCase()) ? item.marca : '', item.nome].filter(Boolean).join(' ') : l.descricao.trim(), quantidade: 0, venda: 0, custo: custoUnitario == null ? null : 0, margem: null };
      atual.quantidade = r2(atual.quantidade + l.quantidade);
      atual.venda = somaEmReais([atual.venda, venda]);
      if (custoUnitario == null) atual.custo = null;
      else if (atual.custo != null) atual.custo = somaEmReais([atual.custo, r2(custoUnitario * l.quantidade)]);
      atual.margem = atual.custo == null ? null : somaEmReais([atual.venda, -atual.custo]);
      porChave.set(chave, atual);
    }
  }
  const linhas = [...porChave.values()].sort((a, b) => b.venda - a.venda || a.nome.localeCompare(b.nome, 'pt-BR'));
  const comCusto = linhas.filter((l) => l.custo != null);
  const venda = somaEmReais(comCusto.map((l) => l.venda));
  const custo = somaEmReais(comCusto.map((l) => l.custo ?? 0));
  const margem = somaEmReais([venda, -custo]);
  return { linhas, venda, custo, margem, percentual: venda > 0 ? Math.round((margem / venda) * 1000) / 10 : null, vendaSemCusto: vendaSemCusto / 100, linhasSemCusto };
}

// ---------------------------------------------------------------- orçamentos

export interface AprovacaoDosOrcamentos {
  enviados: number;
  aprovados: number;
  recusados: number;
  /** Mandados que o cliente ainda não respondeu. */
  esperando: number;
  valorEnviado: number;
  valorAprovado: number;
  /** % dos orçamentos aprovados (em quantidade) e do valor mandado que foi aprovado. */
  taxa: number | null;
  taxaDoValor: number | null;
  /** Tempo médio entre mandar e o cliente responder, em horas. */
  horasParaResponder: number | null;
}

/** O dia que conta para o orçamento: quando foi mandado (ou o dia dele). */
export function diaDoOrcamento(d: Pick<Documento, 'enviadoEm' | 'data'>): string {
  return d.enviadoEm ? dataLocal(d.enviadoEm) : d.data;
}

const MOSTRADOS = new Set(['enviado', 'aprovado', 'recusado']);

/** Os orçamentos mostrados ao cliente no período (mandados ou aprovados na hora) e quantos ele aprovou. */
export function aprovacaoDosOrcamentos(documentos: Documento[], i: Pick<Intervalo, 'inicio' | 'fim'>): AprovacaoDosOrcamentos {
  const orc = documentos.filter((d) => d.tipo === 'orcamento' && MOSTRADOS.has(d.situacao) && dentro(diaDoOrcamento(d), i));
  const aprovados = orc.filter((d) => d.situacao === 'aprovado');
  // o valor mandado conta todos os itens; o aprovado, só os que o cliente quis
  const valorEnviado = somaEmReais(orc.map((d) => totais({ ...d, linhas: d.linhas.map((l) => ({ ...l, recusada: false })) }).total));
  const valorAprovado = somaEmReais(aprovados.map((d) => totais(d).total));
  const tempos = orc
    .filter((d) => d.situacao !== 'enviado' && d.enviadoEm && d.respondidoEm)
    .map((d) => (new Date(d.respondidoEm!).getTime() - new Date(d.enviadoEm!).getTime()) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);
  return {
    enviados: orc.length,
    aprovados: aprovados.length,
    recusados: orc.filter((d) => d.situacao === 'recusado').length,
    esperando: orc.filter((d) => d.situacao === 'enviado').length,
    valorEnviado,
    valorAprovado,
    taxa: orc.length ? Math.round((aprovados.length / orc.length) * 100) : null,
    taxaDoValor: valorEnviado > 0 ? Math.round((valorAprovado / valorEnviado) * 100) : null,
    horasParaResponder: tempos.length ? Math.round((tempos.reduce((s, h) => s + h, 0) / tempos.length) * 10) / 10 : null
  };
}

/** "3 horas", "2 dias". */
export function textoDasHoras(horas: number): string {
  if (horas < 1) return 'menos de 1 hora';
  if (horas < 36) {
    const h = Math.round(horas);
    return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.round(horas / 24);
  return `${d} dias`;
}

// ---------------------------------------------------------------- serviços mais feitos

export interface ServicoFeito {
  chave: string;
  nome: string;
  /** Em quantas ordens apareceu. */
  vezes: number;
  valor: number;
}

/** Os serviços das ordens concluídas, pelo serviço de manutenção da linha (ou pela descrição da mão de obra). */
export function servicosMaisFeitos(ordens: Documento[], limite = 10): ServicoFeito[] {
  const mapa = new Map<string, { nome: string; ordens: Set<Id>; centavos: number }>();
  for (const d of ordens) {
    for (const l of d.linhas) {
      if (l.recusada) continue;
      let chave: string;
      let nome: string;
      if (l.servico && servicoExiste(l.servico)) {
        chave = `s:${l.servico}`;
        nome = infoServico(l.servico).nome;
      } else if (l.tipo === 'servico' && l.descricao.trim()) {
        nome = l.descricao.trim().replace(/\s+/g, ' ');
        chave = `d:${nome.toLowerCase()}`;
      } else continue;
      const atual = mapa.get(chave) ?? { nome, ordens: new Set<Id>(), centavos: 0 };
      atual.ordens.add(d.id);
      atual.centavos += Math.round(totalDaLinha(l) * 100);
      mapa.set(chave, atual);
    }
  }
  return [...mapa.entries()]
    .map(([chave, x]) => ({ chave, nome: x.nome, vezes: x.ordens.size, valor: x.centavos / 100 }))
    .sort((a, b) => b.vezes - a.vezes || b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, limite);
}

// ---------------------------------------------------------------- retorno dos avisos

export interface RetornoDosAvisos {
  /** Avisos (um por carro e por ciclo) no período. */
  avisados: number;
  voltaram: number;
  taxa: number | null;
  /** O que somaram os serviços dos que voltaram. */
  valor: number;
}

/**
 * Dos carros avisados (ou agendados) no período, quantos fizeram serviço em até `janela` dias
 * depois do aviso e quanto esses serviços somaram. Conta um aviso por carro e por ciclo (o serviço
 * que estava vencendo), e cada serviço uma vez só.
 */
export function retornoDosAvisos(
  contatos: Pick<Contato, 'veiculoId' | 'atendimentoId' | 'quando' | 'resultado'>[],
  atendimentos: Pick<Atendimento, 'id' | 'veiculoId' | 'data' | 'valor'>[],
  i: Pick<Intervalo, 'inicio' | 'fim'>,
  janela = 60
): RetornoDosAvisos {
  const primeiro = new Map<string, { veiculoId: Id; atendimentoId: Id; dia: string }>();
  for (const c of contatos) {
    if (c.resultado !== 'avisado' && c.resultado !== 'agendado') continue;
    const dia = dataLocal(c.quando);
    if (!dentro(dia, i)) continue;
    const chave = `${c.veiculoId}|${c.atendimentoId}`;
    const atual = primeiro.get(chave);
    if (!atual || dia < atual.dia) primeiro.set(chave, { veiculoId: c.veiculoId, atendimentoId: c.atendimentoId, dia });
  }
  const usados = new Set<Id>();
  let voltaram = 0;
  let centavos = 0;
  for (const a of [...primeiro.values()].sort((x, y) => x.dia.localeCompare(y.dia))) {
    const depois = atendimentos
      .filter((x) => x.veiculoId === a.veiculoId && x.id !== a.atendimentoId && !usados.has(x.id) && x.data >= a.dia && diasEntre(a.dia, x.data) <= janela)
      .sort((x, y) => x.data.localeCompare(y.data));
    if (!depois.length) continue;
    voltaram++;
    for (const x of depois) {
      usados.add(x.id);
      centavos += Math.round((x.valor ?? 0) * 100);
    }
  }
  return { avisados: primeiro.size, voltaram, taxa: primeiro.size ? Math.round((voltaram / primeiro.size) * 100) : null, valor: centavos / 100 };
}

// ---------------------------------------------------------------- recebido e a receber

export interface MesDoCaixa {
  mes: string;
  recebido: number;
  /** Em aberto que vence no mês. */
  aReceber: number;
  pago: number;
  aPagar: number;
}

export interface RecebidoEAReceber {
  meses: MesDoCaixa[];
  recebido: number;
  aReceber: number;
  /** Do que está em aberto, quanto já venceu (até hoje). */
  vencido: number;
  pago: number;
  aPagar: number;
}

/** Pelo financeiro: o que entrou e saiu em cada mês e o que está em aberto com vencimento no mês. */
export function recebidoEAReceber(lancamentos: Lancamento[], i: Intervalo, hoje: string): RecebidoEAReceber {
  const meses = i.meses.map((mes) => {
    const soma = (fn: (l: Lancamento) => boolean) => somaEmReais(lancamentos.filter(fn).map((l) => l.valor));
    return {
      mes,
      recebido: soma((l) => l.tipo === 'receber' && !!l.pagoEm && l.pagoEm.slice(0, 7) === mes && dentro(l.pagoEm, i)),
      aReceber: soma((l) => l.tipo === 'receber' && !l.pagoEm && l.vencimento.slice(0, 7) === mes),
      pago: soma((l) => l.tipo === 'pagar' && !!l.pagoEm && l.pagoEm.slice(0, 7) === mes && dentro(l.pagoEm, i)),
      aPagar: soma((l) => l.tipo === 'pagar' && !l.pagoEm && l.vencimento.slice(0, 7) === mes)
    };
  });
  return {
    meses,
    recebido: somaEmReais(meses.map((m) => m.recebido)),
    aReceber: somaEmReais(meses.map((m) => m.aReceber)),
    vencido: somaEmReais(lancamentos.filter((l) => l.tipo === 'receber' && !l.pagoEm && l.vencimento < hoje && dentro(l.vencimento, i)).map((l) => l.valor)),
    pago: somaEmReais(meses.map((m) => m.pago)),
    aPagar: somaEmReais(meses.map((m) => m.aPagar))
  };
}

// ---------------------------------------------------------------- CSV

export type Celula = string | number | null | undefined;

const numeroCsv = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, useGrouping: false });

function celulaCsv(v: Celula): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? numeroCsv.format(v) : '';
  let t = String(v);
  // texto que começa com = + - @ vira fórmula na planilha: vai com um apóstrofo na frente
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * Tabela em CSV do jeito que o Excel e o Google Planilhas em português abrem: ponto e vírgula entre
 * as colunas e vírgula nos decimais. O arquivo baixado leva o BOM do UTF-8 na frente (para os acentos).
 */
export function csv(cabecalho: string[], linhas: Celula[][]): string {
  return [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n');
}
