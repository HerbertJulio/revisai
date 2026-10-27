// Indicadores gerenciais da oficina: faturamento do mês, número de ordens, ticket médio,
// inadimplência (a receber em atraso) e o faturamento dos últimos meses. Funções puras.

import { diaEmBrasilia } from './datas';
import { totais } from './documentos';
import type { Lancamento } from './registros-oficina';
import type { Documento } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

function mesDe(instante: string): string {
  return diaEmBrasilia(instante).slice(0, 7);
}

function ordensConcluidasNoMes(documentos: Documento[], mes: string): Documento[] {
  return documentos.filter((d) => d.tipo === 'ordem' && d.situacao === 'concluida' && d.concluidoEm && mesDe(d.concluidoEm) === mes);
}

export interface IndicadoresMes {
  faturamento: number;
  ordens: number;
  ticketMedio: number;
  /** Contas a receber em aberto e já vencidas. */
  atrasoReceber: number;
  atrasoQtd: number;
}

export function indicadoresDoMes(documentos: Documento[], lancamentos: Lancamento[], hoje: string): IndicadoresMes {
  const concluidas = ordensConcluidasNoMes(documentos, hoje.slice(0, 7));
  const faturamento = r2(concluidas.reduce((s, d) => s + totais(d).total, 0));
  const ordens = concluidas.length;
  const atrasados = lancamentos.filter((l) => l.tipo === 'receber' && !l.pagoEm && l.valor > 0 && l.vencimento < hoje);
  return {
    faturamento,
    ordens,
    ticketMedio: ordens ? r2(faturamento / ordens) : 0,
    atrasoReceber: r2(atrasados.reduce((s, l) => s + l.valor, 0)),
    atrasoQtd: atrasados.length
  };
}

export interface MesFaturamento {
  mes: string;
  total: number;
  ordens: number;
}

/** Faturamento (ordens concluídas) dos últimos `nMeses` meses, do mais antigo para o mais novo. */
export function faturamentoPorMes(documentos: Documento[], hoje: string, nMeses = 6): MesFaturamento[] {
  const y = Number(hoje.slice(0, 4));
  const m = Number(hoje.slice(5, 7));
  const chaves: string[] = [];
  for (let i = nMeses - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    chaves.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  const porMes = new Map<string, { total: number; ordens: number }>(chaves.map((c) => [c, { total: 0, ordens: 0 }]));
  for (const d of documentos) {
    if (d.tipo !== 'ordem' || d.situacao !== 'concluida' || !d.concluidoEm) continue;
    const e = porMes.get(mesDe(d.concluidoEm));
    if (!e) continue;
    e.total = r2(e.total + totais(d).total);
    e.ordens++;
  }
  return chaves.map((mes) => ({ mes, ...porMes.get(mes)! }));
}
