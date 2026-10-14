// Base de prazos por produto: o que o fabricante de cada produto (ou tecnologia) recomenda.
// Fica no Supabase (tabela produtos_referencia) e chega ao app pela rota /api/referencias.

import type { Categoria } from './tipos';

export type Confianca = 'fabricante' | 'imprensa' | 'mercado' | 'oficina' | 'fornecedor';

export interface Referencia {
  id: number;
  categoria: Categoria;
  marca: string;
  linha: string;
  tipo: string | null;
  intervaloKm: number | null;
  intervaloMeses: number | null;
  intervaloKmSevero: number | null;
  intervaloMesesSevero: number | null;
  segueManual: boolean;
  observacao: string | null;
  fonteNome: string | null;
  fonteUrl: string | null;
  confianca: Confianca;
  /** O que o prazo significa: troca, inspeção, garantia... (vem da pesquisa). */
  tipoIntervalo: string | null;
}

/** Produto que a própria oficina cadastrou, com o prazo que ela usa. Fica no aparelho. */
export interface ProdutoProprio {
  id: string;
  categoria: Categoria;
  marca: string;
  nome: string;
  intervaloKm: number | null;
  intervaloMeses: number | null;
  observacao?: string;
  criadoEm: string;
  /** Quando a oficina mandou este produto como sugestão para a base do Revisaí. */
  sugeridoEm?: string;
}

export const NOMES_TIPO_INTERVALO: Record<string, string> = {
  troca: 'troca',
  inspecao: 'inspeção',
  garantia: 'garantia',
  vida_util: 'vida útil',
  troca_por_idade: 'troca por idade',
  rodizio: 'rodízio',
  segue_manual: 'segue o manual',
  acompanha_outro_servico: 'junto com outro serviço',
  limite_de_desgaste: 'pelo desgaste',
  referencia: 'referência',
  servico: 'serviço',
  regra_de_troca: 'regra de troca',
  nao_se_aplica: 'não se aplica'
};

/** O prazo que a referência dá para o uso (normal ou severo), ou null se ela segue o manual. */
export function prazoDaReferencia(r: Referencia, severo: boolean): { km: number | null; meses: number | null } | null {
  const km = severo ? (r.intervaloKmSevero ?? r.intervaloKm) : r.intervaloKm;
  const meses = severo ? (r.intervaloMesesSevero ?? r.intervaloMeses) : r.intervaloMeses;
  if (r.segueManual || (km == null && meses == null)) return null;
  // garantia, referência e limite de desgaste não são prazo de troca
  if (r.tipoIntervalo && ['garantia', 'referencia', 'limite_de_desgaste', 'nao_se_aplica'].includes(r.tipoIntervalo)) return null;
  return { km, meses };
}

/** "NGK Velas de irídio de equipamento original". */
export function nomeDaReferencia(r: Pick<Referencia, 'marca' | 'linha'>): string {
  return r.linha.toLowerCase().startsWith(r.marca.toLowerCase()) ? r.linha : `${r.marca} ${r.linha}`;
}

/** "Indicado pela NGK" para fabricante; "Referência de mercado (Quatro Rodas)" para as outras fontes. */
export function origemDaReferencia(r: Pick<Referencia, 'marca' | 'confianca' | 'fonteNome'>): string {
  if (r.confianca === 'fabricante') return `Indicado pelo fabricante (${r.marca})`;
  if (r.confianca === 'oficina') return 'Indicado por uma oficina';
  if (r.confianca === 'fornecedor') return `Indicado pelo fornecedor (${r.marca})`;
  return `Referência de mercado${r.fonteNome ? ` (${r.fonteNome})` : ''}`;
}

/** As referências de uma categoria, as do fabricante primeiro. */
export function referenciasDaCategoria(lista: Referencia[], categoria: Categoria): Referencia[] {
  const peso: Record<Confianca, number> = { fabricante: 0, imprensa: 1, mercado: 2, fornecedor: 3, oficina: 4 };
  return lista
    .filter((r) => r.categoria === categoria)
    .sort((a, b) => peso[a.confianca] - peso[b.confianca] || nomeDaReferencia(a).localeCompare(nomeDaReferencia(b), 'pt-BR'));
}

/** "100.000 km", "24 meses", "40.000 km ou 24 meses" ou "segue o manual". */
export function textoDoPrazo(km: number | null, meses: number | null): string {
  const partes = [km ? `${new Intl.NumberFormat('pt-BR').format(km)} km` : null, meses ? `${meses} ${meses === 1 ? 'mês' : 'meses'}` : null].filter(Boolean);
  return partes.length ? partes.join(' ou ') : 'segue o manual';
}
