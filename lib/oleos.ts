// Óleo de motor: viscosidade SAE J300, categorias API/ILSAC/ACEA e normas de montadora.
// Regras práticas (AEA, Auto Papo, API): manter a viscosidade do manual, API igual ou superior,
// a norma da montadora quando o manual pede, e nunca rebaixar de sintético para mineral.

import type { BaseOleo, EspecOleo, EspecProduto } from './tipos';

export const VISCOSIDADES = ['0W-16', '0W-20', '0W-30', '0W-40', '5W-20', '5W-30', '5W-40', '10W-30', '10W-40', '15W-40', '20W-50'];

export const NIVEIS_API = ['SJ', 'SL', 'SM', 'SN', 'SN Plus', 'SP', 'SQ'];

export const NORMAS = [
  'GM dexos1 Gen 3',
  'GM dexos1 Gen 2',
  'VW 502 00',
  'VW 504 00',
  'VW 508 88',
  'VW 508 00',
  'Fiat 9.55535-GS1',
  'Fiat 9.55535-S1',
  'Renault RN17',
  'Renault RN0710',
  'Renault RN0700',
  'Ford WSS-M2C913-D',
  'Ford WSS-M2C948-B'
];

export const ACEA = ['A3/B4', 'A5/B5', 'C2', 'C3', 'C5', 'C6', 'C7'];

export const BASES: { id: BaseOleo; nome: string }[] = [
  { id: 'mineral', nome: 'Mineral' },
  { id: 'semissintetico', nome: 'Semissintético' },
  { id: 'sintetico', nome: 'Sintético' }
];

const ORDEM_BASE: Record<BaseOleo, number> = { mineral: 0, semissintetico: 1, sintetico: 2 };

/** Normas retrocompatíveis: a da esquerda atende às da direita. */
const COBRE: Record<string, string[]> = {
  'gm dexos1 gen 3': ['gm dexos1 gen 2', 'gm dexos1'],
  'gm dexos1 gen 2': ['gm dexos1'],
  'renault rn17': ['renault rn0700', 'renault rn0710'],
  'ford wss-m2c913-d': ['ford wss-m2c913-a', 'ford wss-m2c913-b', 'ford wss-m2c913-c', 'ford wss-m2c912-a']
};

export function normalizarViscosidade(v: string): string {
  return v.toUpperCase().replace(/\s+/g, '').replace(/^SAE/, '').replace(/W(\d)/, 'W-$1');
}

function normalizarNorma(n: string): string {
  return n.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Posição da categoria API (SP > SN Plus > SN ...). -1 se desconhecida. */
export function nivelApi(api?: string | null): number {
  if (!api) return -1;
  const a = api.toUpperCase().replace(/^API\s*/, '').replace(/\s+/g, ' ').replace('SN+', 'SN PLUS').trim();
  return NIVEIS_API.findIndex((n) => n.toUpperCase() === a);
}

/** ILSAC GF-6A equivale ao API SP; GF-7A ao SQ. */
function apiDoProduto(p: EspecProduto): number {
  const direto = nivelApi(p.api);
  const ilsac = (p.ilsac ?? '').toUpperCase();
  const pelaIlsac = ilsac.startsWith('GF-7') ? nivelApi('SQ') : ilsac.startsWith('GF-6') ? nivelApi('SP') : -1;
  return Math.max(direto, pelaIlsac);
}

export function normaAtendida(normasProduto: string[] | undefined, exigida: string): boolean {
  if (!normasProduto?.length) return false;
  const alvo = normalizarNorma(exigida);
  return normasProduto.some((n) => {
    const p = normalizarNorma(n);
    return p === alvo || (COBRE[p]?.includes(alvo) ?? false);
  });
}

export interface Compatibilidade {
  atende: boolean;
  /** O que bate, para explicar a recomendação. */
  motivos: string[];
  /** O que não bate. */
  faltas: string[];
}

export function oleoAtende(produto: EspecProduto, exigido: EspecOleo): Compatibilidade {
  const motivos: string[] = [];
  const faltas: string[] = [];
  const aceitas = exigido.viscosidades.map(normalizarViscosidade);

  if (!produto.viscosidade || !aceitas.length) faltas.push('viscosidade desconhecida');
  else if (aceitas.includes(normalizarViscosidade(produto.viscosidade))) motivos.push(normalizarViscosidade(produto.viscosidade));
  else faltas.push(`viscosidade ${produto.viscosidade} (o manual pede ${exigido.viscosidades.join(' ou ')})`);

  if (exigido.api) {
    const pedido = nivelApi(exigido.api);
    const tem = apiDoProduto(produto);
    if (pedido >= 0 && tem < pedido) faltas.push(`API abaixo de ${exigido.api}`);
    else if (pedido >= 0) motivos.push(`API ${NIVEIS_API[tem] ?? exigido.api}`);
  }

  if (exigido.acea) {
    if (produto.acea?.some((a) => a.toUpperCase() === exigido.acea!.toUpperCase())) motivos.push(`ACEA ${exigido.acea}`);
    else faltas.push(`sem ACEA ${exigido.acea}`);
  }

  if (exigido.norma) {
    if (normaAtendida(produto.normas, exigido.norma)) motivos.push(exigido.norma);
    else faltas.push(`sem a norma ${exigido.norma}`);
  }

  if (exigido.base && produto.base && ORDEM_BASE[produto.base] < ORDEM_BASE[exigido.base]) {
    faltas.push('não rebaixe a base do óleo (de sintético para mineral, por exemplo)');
  }

  return { atende: faltas.length === 0, motivos, faltas };
}

/** A exigência a partir do cadastro do carro ou, na falta dele, do último óleo usado. */
export function exigenciaDoCarro(oleo: EspecOleo | undefined, ultimo?: EspecProduto | null): EspecOleo | null {
  if (oleo?.viscosidades?.length) {
    return { ...oleo, base: oleo.base ?? ultimo?.base };
  }
  // Sem o manual, repete a viscosidade, a API e a base do último óleo. A norma de montadora
  // do último produto não vira exigência: pode ser só uma qualidade a mais daquele óleo.
  if (ultimo?.viscosidade) {
    return {
      viscosidades: [ultimo.viscosidade],
      api: ultimo.api,
      base: ultimo.base,
      capacidadeL: oleo?.capacidadeL
    };
  }
  return null;
}

export function nomeBase(base?: BaseOleo): string {
  return BASES.find((b) => b.id === base)?.nome ?? '';
}

// Referências de óleo por motor, para ajudar a preencher o cadastro.
// Confiança média: tiradas de matérias da revista O Mecânico e de manuais. Confira sempre no manual.

export interface ReferenciaOleo {
  id: string;
  descricao: string;
  /** Palavras que identificam o modelo (todas minúsculas, sem acento). */
  busca: string[];
  /** Se aparecer na busca, não é este motor. */
  exclui?: string[];
  /** Pelo menos uma destas palavras precisa aparecer. */
  exige?: string[];
  oleo: EspecOleo;
  distribuicao: 'corrente' | 'correia' | 'correia banhada a óleo';
  nota?: string;
}

export const REFERENCIAS_OLEO: ReferenciaOleo[] = [
  {
    id: 'onix-turbo',
    descricao: 'Chevrolet Onix e Onix Plus 1.0 turbo (2020 a 2025)',
    busca: ['onix', 'turbo'],
    exclui: ['aspirado', '2026'],
    exige: ['turbo'],
    oleo: { viscosidades: ['5W-30'], norma: 'GM dexos1 Gen 3', capacidadeL: 3.75 },
    distribuicao: 'correia banhada a óleo',
    nota: 'A correia banhada a óleo se degrada com óleo fora da norma. Use só dexos1 Gen 3.'
  },
  {
    id: 'onix-aspirado',
    descricao: 'Chevrolet Onix e Onix Plus 1.0 aspirado (2020 a 2025)',
    busca: ['onix'],
    exclui: ['turbo', '2026'],
    oleo: { viscosidades: ['0W-20'], api: 'SP', norma: 'GM dexos1 Gen 3' },
    distribuicao: 'correia banhada a óleo',
    nota: 'A correia banhada a óleo se degrada com óleo fora da norma. Use só dexos1 Gen 3.'
  },
  {
    id: 'onix-2026',
    descricao: 'Chevrolet Onix 2026, motores com a nova correia',
    busca: ['onix', '2026'],
    exige: ['2026'],
    oleo: { viscosidades: ['0W-20'], norma: 'GM dexos1 Gen 3' },
    distribuicao: 'correia banhada a óleo',
    nota: 'O manual de 2026 passou a pedir 0W-20 dexos1 para os dois motores.'
  },
  {
    id: 'hb20-aspirado',
    descricao: 'Hyundai HB20 1.0 aspirado',
    busca: ['hb20'],
    exclui: ['turbo', 'tgdi'],
    oleo: { viscosidades: ['5W-30', '0W-30'], api: 'SL', capacidadeL: 2.9 },
    distribuicao: 'corrente',
    nota: 'O manual aceita 5W-30 (API SL ou ACEA A5, ou superior) ou 0W-30 (API SP ou ILSAC GF-6).'
  },
  {
    id: 'hb20-turbo',
    descricao: 'Hyundai HB20 1.0 turbo e Creta 1.0 TGDI',
    busca: ['hb20', 'creta', 'turbo', 'tgdi'],
    exclui: ['aspirado'],
    exige: ['turbo', 'tgdi'],
    oleo: { viscosidades: ['5W-30', '0W-30'], api: 'SL', capacidadeL: 3.6 },
    distribuicao: 'corrente',
    nota: 'Capacidade do manual do HB20; a revista O Mecânico cita 3,5 L para o Creta.'
  },
  {
    id: 'vw-tsi',
    descricao: 'VW Polo, Virtus, Nivus e T-Cross 1.0 TSI; T-Cross e Taos 1.4 TSI',
    busca: ['polo', 'virtus', 'nivus', 't-cross', 'tcross', 'taos', 'tsi'],
    exclui: ['mpi'],
    exige: ['tsi'],
    oleo: { viscosidades: ['5W-40'], norma: 'VW 508 88', capacidadeL: 4 },
    distribuicao: 'correia',
    nota: 'Motor EA211: correia dentada a cada 120 mil km ou 4,5 anos, metade no uso severo.'
  },
  {
    id: 'fiat-firefly',
    descricao: 'Fiat Argo 1.0 e 1.3 e Strada 1.3 Firefly (aspirados)',
    busca: ['argo', 'strada', 'mobi', 'firefly', 'cronos'],
    exclui: ['turbo', 't200'],
    oleo: { viscosidades: ['0W-20'], api: 'SP' },
    distribuicao: 'corrente',
    nota: 'A especificação vale para o Firefly; confira no manual se o seu Mobi tem esse motor.'
  },
  {
    id: 'fiat-t200',
    descricao: 'Fiat Strada 1.0 Turbo (T200)',
    busca: ['strada', 'pulse', 'fastback', 't200', 'turbo'],
    exclui: ['1.3 turbo', 't270'],
    exige: ['turbo', 't200'],
    oleo: { viscosidades: ['0W-30'], acea: 'C2', norma: 'Fiat 9.55535-GS1' },
    distribuicao: 'corrente'
  },
  {
    id: 'jeep-t270',
    descricao: 'Jeep Compass, Renegade e Commander 1.3 Turbo (T270)',
    busca: ['compass', 'renegade', 'commander', 't270', '1.3 turbo'],
    exige: ['turbo', 't270'],
    oleo: { viscosidades: ['0W-30'], acea: 'C2', norma: 'Fiat 9.55535-GS1', capacidadeL: 4.8 },
    distribuicao: 'corrente'
  }
];

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Procura referências pelo texto do carro ("Chevrolet Onix 1.0 Turbo 2022"). */
export function buscarReferencias(texto: string): ReferenciaOleo[] {
  const t = ` ${semAcento(texto)} `;
  if (t.trim().length < 2) return [];
  const pontuadas = REFERENCIAS_OLEO.map((r) => {
    if (r.exclui?.some((e) => t.includes(e))) return { r, pontos: 0 };
    if (r.exige && !r.exige.some((e) => t.includes(e))) return { r, pontos: 0 };
    let pontos = 0;
    for (const b of r.busca) if (t.includes(b)) pontos += b.length >= 4 ? 2 : 1;
    // precisa bater pelo menos um nome de modelo, não só "turbo"
    const modelo = r.busca.some((b) => !['turbo', 'tsi', 'tgdi', 't200', 't270', 'firefly', '2026', '1.3 turbo'].includes(b) && t.includes(b));
    return { r, pontos: modelo ? pontos : 0 };
  });
  return pontuadas
    .filter((p) => p.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map((p) => p.r);
}
