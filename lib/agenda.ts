// Quando cada serviço vence: pela data ou pela quilometragem, o que vier primeiro.
// A quilometragem de hoje é estimada pela rodagem do carro (histórico do odômetro).

import { diasEntre, menorData, somarDias, somarMeses } from './datas';
import type { Atendimento, Intervalo, Leitura, Veiculo } from './tipos';

export const DIAS_POR_MES = 30.4375;

export interface PontoKm {
  data: string;
  km: number;
}

/** Leituras de odômetro do carro (atendimentos e anotações), da mais antiga para a mais nova. */
export function pontosDoVeiculo(veiculoId: string, atendimentos: Atendimento[], leituras: Leitura[]): PontoKm[] {
  const pontos: PontoKm[] = [];
  for (const a of atendimentos) if (a.veiculoId === veiculoId && a.km > 0) pontos.push({ data: a.data, km: a.km });
  for (const l of leituras) if (l.veiculoId === veiculoId && l.km > 0) pontos.push({ data: l.data, km: l.km });
  return pontos.sort((a, b) => (a.data === b.data ? a.km - b.km : a.data < b.data ? -1 : 1));
}

export interface Rodagem {
  kmDia: number;
  kmMes: number;
  origem: 'informada' | 'historico' | 'padrao';
}

/**
 * Rodagem do carro. Usa a informada no cadastro; senão o histórico dos últimos 2 anos
 * (pelo menos 30 dias entre a primeira e a última leitura); senão o padrão da oficina.
 */
export function estimarRodagem(pontos: PontoKm[], veiculo: Pick<Veiculo, 'kmMes'> | undefined, kmMesPadrao: number, hoje: string): Rodagem {
  if (veiculo?.kmMes && veiculo.kmMes > 0) {
    return { kmDia: veiculo.kmMes / DIAS_POR_MES, kmMes: veiculo.kmMes, origem: 'informada' };
  }
  const recentes = pontos.filter((p) => diasEntre(p.data, hoje) <= 730 && p.data <= hoje);
  if (recentes.length >= 2) {
    const primeiro = recentes[0];
    const ultimo = recentes[recentes.length - 1];
    const dias = diasEntre(primeiro.data, ultimo.data);
    const km = ultimo.km - primeiro.km;
    if (dias >= 30 && km > 0) {
      const kmDia = Math.min(600, Math.max(0.5, km / dias));
      return { kmDia, kmMes: Math.round(kmDia * DIAS_POR_MES), origem: 'historico' };
    }
  }
  const padrao = Math.max(0, kmMesPadrao);
  return { kmDia: padrao / DIAS_POR_MES, kmMes: padrao, origem: 'padrao' };
}

/** Quilometragem estimada para hoje a partir da última leitura. */
export function kmEstimado(pontos: PontoKm[], kmDia: number, hoje: string): number {
  if (!pontos.length) return 0;
  const ultimo = ultimoPonto(pontos)!;
  const dias = Math.max(0, diasEntre(ultimo.data, hoje));
  return Math.round(ultimo.km + kmDia * dias);
}

function ultimoPonto(pontos: PontoKm[]): PontoKm | undefined {
  let u: PontoKm | undefined;
  for (const p of pontos) if (!u || p.data > u.data || (p.data === u.data && p.km > u.km)) u = p;
  return u;
}

export interface Vencimento {
  /** Pela data. */
  dataLimite: string | null;
  /** Pela quilometragem. */
  kmLimite: number | null;
  /** Quando o carro deve chegar ao kmLimite, pela rodagem. */
  dataPorKm: string | null;
  /** O que vier primeiro. */
  dataPrevista: string | null;
  motivo: 'tempo' | 'km' | null;
  diasRestantes: number | null;
  kmRestante: number | null;
  kmHoje: number;
}

export function calcularVencimento(
  base: { data: string; km: number },
  intervalo: Intervalo,
  pontos: PontoKm[],
  kmDia: number,
  hoje: string
): Vencimento {
  const dataLimite = intervalo.meses != null && intervalo.meses > 0 ? somarMeses(base.data, intervalo.meses) : null;
  const kmLimite = intervalo.km != null && intervalo.km > 0 ? base.km + intervalo.km : null;
  const todos = pontos.length ? pontos : [base];
  const ultimo = ultimoPonto([...todos, base])!;
  const kmHoje = kmEstimado([...todos, base], kmDia, hoje);

  let dataPorKm: string | null = null;
  if (kmLimite != null && kmDia > 0) {
    dataPorKm = somarDias(ultimo.data, Math.round((kmLimite - ultimo.km) / kmDia));
  }

  const dataPrevista = menorData(dataLimite, dataPorKm);
  const motivo = dataPrevista == null ? null : dataPrevista === dataLimite ? 'tempo' : 'km';
  return {
    dataLimite,
    kmLimite,
    dataPorKm,
    dataPrevista,
    motivo,
    diasRestantes: dataPrevista ? diasEntre(hoje, dataPrevista) : null,
    kmRestante: kmLimite != null ? kmLimite - kmHoje : null,
    kmHoje
  };
}
