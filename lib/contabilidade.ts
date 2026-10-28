// Resultado do período (DRE): agrupa os lançamentos em receitas e despesas por categoria e mostra
// o que sobrou. No regime de caixa conta o que foi pago/recebido (por pagoEm); no de competência,
// o que venceu no período (por vencimento). Funções puras, sem banco nem navegador.

import { CATEGORIAS } from './financeiro';
import type { Lancamento } from './registros-oficina';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function nomeDaCategoria(tipo: Lancamento['tipo'], id: string): string {
  return CATEGORIAS[tipo].find((c) => c.id === id)?.nome ?? id;
}

export type RegimeDre = 'caixa' | 'competencia';

export interface LinhaDre {
  categoria: string;
  nome: string;
  valor: number;
}

export interface Dre {
  regime: RegimeDre;
  receitas: LinhaDre[];
  despesas: LinhaDre[];
  totalReceitas: number;
  totalDespesas: number;
  resultado: number;
}

function dataDoLancamento(l: Lancamento, regime: RegimeDre): string | null {
  return regime === 'caixa' ? l.pagoEm : l.vencimento;
}

export function dre(lancamentos: Lancamento[], periodo: { de: string; ate: string }, regime: RegimeDre = 'caixa'): Dre {
  const rec = new Map<string, number>();
  const desp = new Map<string, number>();
  for (const l of lancamentos) {
    const d = dataDoLancamento(l, regime);
    if (!d || d < periodo.de || d > periodo.ate) continue;
    const mapa = l.tipo === 'receber' ? rec : desp;
    mapa.set(l.categoria, r2((mapa.get(l.categoria) ?? 0) + l.valor));
  }
  const linhas = (tipo: Lancamento['tipo'], m: Map<string, number>): LinhaDre[] =>
    [...m.entries()].map(([categoria, valor]) => ({ categoria, nome: nomeDaCategoria(tipo, categoria), valor })).sort((a, b) => b.valor - a.valor);
  const receitas = linhas('receber', rec);
  const despesas = linhas('pagar', desp);
  const totalReceitas = r2(receitas.reduce((s, x) => s + x.valor, 0));
  const totalDespesas = r2(despesas.reduce((s, x) => s + x.valor, 0));
  return { regime, receitas, despesas, totalReceitas, totalDespesas, resultado: r2(totalReceitas - totalDespesas) };
}
