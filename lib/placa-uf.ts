// A parte grátis do reconhecimento pela placa: o que dá para saber sem internet e sem custo.
//
// Normalizar, validar e formatar já moram em ./formatos. Aqui entra só o que falta: o tipo da
// placa (antiga ou Mercosul) e o estado onde o carro foi emplacado pela primeira vez, lido das
// faixas de letras. Marca, modelo, ano, cor, chassi e situação de roubo/furto NÃO saem da placa;
// vêm da consulta paga (lib/placa.ts + app/api/veiculos/placa), o módulo "Despachante".

import { formatarPlaca, normalizarPlaca, placaValida } from './formatos';

export type TipoDePlaca = 'antiga' | 'mercosul';

/** 'antiga' (ABC1234), 'mercosul' (ABC1D23) ou null quando não é placa. */
export function tipoDaPlaca(valor: string): TipoDePlaca | null {
  const p = normalizarPlaca(valor);
  if (/^[A-Z]{3}[0-9]{4}$/.test(p)) return 'antiga';
  if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p)) return 'mercosul';
  return null;
}

// Faixas de três letras por estado (primeiro ciclo nacional de emplacamento). Cada faixa aqui é
// certa; faixas de expansão mais recentes e fragmentadas ficam de fora de propósito, então placas
// delas voltam como null em vez de um estado errado. A Mercosul segue a mesma alocação por UF,
// então a leitura também vale de melhor esforço para ela.
const FAIXAS_UF: ReadonlyArray<readonly [string, string, string]> = [
  ['AAA', 'BEZ', 'PR'],
  ['BFA', 'GKI', 'SP'],
  ['GKJ', 'HOK', 'MG'],
  ['HOL', 'HQE', 'MA'],
  ['HQF', 'HTW', 'MS'],
  ['HTX', 'HZA', 'CE'],
  ['HZB', 'IAP', 'SE'],
  ['IAQ', 'JDO', 'RS'],
  ['JDP', 'JKR', 'DF'],
  ['JKS', 'JSZ', 'BA'],
  ['JTA', 'JWE', 'PA'],
  ['JWF', 'JXY', 'AM'],
  ['JXZ', 'KAU', 'MT'],
  ['KAV', 'KFC', 'GO'],
  ['KFD', 'KME', 'PE'],
  ['KMF', 'LVE', 'RJ'],
  ['LVF', 'LWQ', 'PI'],
  ['LWR', 'MMM', 'SC'],
  ['MMN', 'MOW', 'PB'],
  ['MOX', 'MTZ', 'ES'],
  ['MUA', 'MVK', 'AL'],
  ['MVL', 'MXG', 'TO'],
  ['MXH', 'MZM', 'RN'],
  ['MZN', 'NAG', 'AC'],
  ['NAH', 'NBA', 'RR']
];

/** O estado de emplacamento pela placa, ou null quando não dá para afirmar com certeza. */
export function ufDaPlaca(valor: string): string | null {
  const p = normalizarPlaca(valor);
  if (!placaValida(p)) return null;
  const prefixo = p.slice(0, 3);
  for (const [inicio, fim, uf] of FAIXAS_UF) {
    if (prefixo >= inicio && prefixo <= fim) return uf;
  }
  return null;
}

export interface LeituraGratisDaPlaca {
  placa: string;
  formatada: string;
  tipo: TipoDePlaca | null;
  valida: boolean;
  uf: string | null;
}

/** Tudo que a gente consegue de graça só com a placa, de uma vez — para adiantar o cadastro. */
export function lerPlacaGratis(valor: string): LeituraGratisDaPlaca {
  const placa = normalizarPlaca(valor);
  return { placa, formatada: formatarPlaca(placa), tipo: tipoDaPlaca(placa), valida: placaValida(placa), uf: ufDaPlaca(placa) };
}
