// Textos curtos da interface a partir dos cálculos (prazos, rodagem, saudação).

import type { Vencimento } from './agenda';
import type { Situacao } from './avisos';
import { formatarDataCurta, paraDia } from './datas';
import { formatarKm, formatarNumero } from './formatos';

/** "atrasado há 10 dias", "vence em 5 dias", "vence hoje", "faltam uns 400 km". */
export function rotuloPrazo(v: Vencimento, situacao: Situacao): { principal: string; detalhe: string } {
  const partes: string[] = [];
  if (v.dataPrevista) partes.push(formatarDataCurta(v.dataPrevista));
  if (v.kmLimite != null) partes.push(formatarKm(v.kmLimite));
  const detalhe = partes.join(' ou ');
  const dias = v.diasRestantes;
  if (dias == null) return { principal: 'sem prazo', detalhe };
  if (situacao === 'atrasado') {
    if (v.kmRestante != null && v.kmRestante < 0 && (v.motivo === 'km' || dias >= 0)) {
      return { principal: `passou uns ${formatarNumero(arredondarKm(-v.kmRestante))} km`, detalhe };
    }
    return { principal: dias === -1 ? 'venceu ontem' : `atrasado há ${-dias} dias`, detalhe };
  }
  if (v.motivo === 'km' && v.kmRestante != null && v.kmRestante <= 1500) {
    return { principal: `faltam uns ${formatarNumero(arredondarKm(Math.max(0, v.kmRestante)))} km`, detalhe };
  }
  if (dias === 0) return { principal: 'vence hoje', detalhe };
  if (dias === 1) return { principal: 'vence amanhã', detalhe };
  if (dias < 60) return { principal: `vence em ${dias} dias`, detalhe };
  return { principal: `vence em ${Math.round(dias / 30.4)} meses`, detalhe };
}

function arredondarKm(km: number): number {
  return km < 1000 ? Math.round(km / 50) * 50 : Math.round(km / 100) * 100;
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "terça, 13 de outubro". */
export function dataPorExtenso(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const semana = SEMANA[(((paraDia(iso) + 4) % 7) + 7) % 7];
  return `${semana}, ${d} de ${MESES[m - 1]}`;
}

/** "sexta, 16/10". */
export function diaCurto(iso: string): string {
  const semana = SEMANA[(((paraDia(iso) + 4) % 7) + 7) % 7];
  return `${semana}, ${formatarDataCurta(iso)}`;
}

export function saudacao(hora: number): string {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function rotuloRodagem(kmMes: number, origem: 'informada' | 'historico' | 'padrao'): string {
  const base = `${formatarNumero(Math.round(kmMes / 50) * 50)} km por mês`;
  if (origem === 'historico') return `Roda uns ${base}, pelo histórico`;
  if (origem === 'informada') return `Roda uns ${base}`;
  return `Sem histórico, contando ${base}`;
}
