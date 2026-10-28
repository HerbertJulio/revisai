// Fluxo de caixa projetado: pelo que ainda está em aberto (contas a receber e a pagar sem baixa),
// o que vence atrasado, o que entra e sai daqui para a frente e o saldo acumulado. Funções puras.

import type { Lancamento } from './registros-oficina';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DiaFluxo {
  data: string;
  entra: number;
  sai: number;
  /** Saldo projetado acumulado até esse dia (só do que está em aberto). */
  saldo: number;
}

export interface FluxoProjetado {
  /** Total em aberto a receber e a pagar (independente do vencimento). */
  aReceber: number;
  aPagar: number;
  saldoProjetado: number;
  /** Em aberto e já vencido (vencimento antes de hoje). */
  vencidoReceber: number;
  vencidoPagar: number;
  /** Por dia de vencimento, de hoje até `ate`. */
  porDia: DiaFluxo[];
}

export function fluxoProjetado(lancamentos: Lancamento[], hoje: string, ate: string): FluxoProjetado {
  const abertos = lancamentos.filter((l) => !l.pagoEm && l.valor > 0);
  let aReceber = 0;
  let aPagar = 0;
  let vencidoReceber = 0;
  let vencidoPagar = 0;
  const dias = new Map<string, { entra: number; sai: number }>();
  for (const l of abertos) {
    if (l.tipo === 'receber') aReceber = r2(aReceber + l.valor);
    else aPagar = r2(aPagar + l.valor);
    if (l.vencimento < hoje) {
      if (l.tipo === 'receber') vencidoReceber = r2(vencidoReceber + l.valor);
      else vencidoPagar = r2(vencidoPagar + l.valor);
      continue;
    }
    if (l.vencimento > ate) continue;
    const d = dias.get(l.vencimento) ?? { entra: 0, sai: 0 };
    if (l.tipo === 'receber') d.entra = r2(d.entra + l.valor);
    else d.sai = r2(d.sai + l.valor);
    dias.set(l.vencimento, d);
  }
  // o atrasado entra como saldo inicial da projeção
  let saldo = r2(vencidoReceber - vencidoPagar);
  const porDia: DiaFluxo[] = [...dias.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([data, { entra, sai }]) => {
      saldo = r2(saldo + entra - sai);
      return { data, entra, sai, saldo };
    });
  return { aReceber, aPagar, saldoProjetado: r2(aReceber - aPagar), vencidoReceber, vencidoPagar, porDia };
}
