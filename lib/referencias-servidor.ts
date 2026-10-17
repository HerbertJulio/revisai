import 'server-only';
import type { Referencia } from './referencias';
import { clientePublico } from './supabase-servidor';
import type { Categoria } from './tipos';

interface Linha {
  id: number;
  categoria: Categoria;
  marca: string;
  linha: string;
  tipo: string | null;
  especificacao: Record<string, unknown> | null;
  intervalo_km: number | null;
  intervalo_meses: number | null;
  intervalo_km_severo: number | null;
  intervalo_meses_severo: number | null;
  segue_manual: boolean;
  observacao: string | null;
  fonte_nome: string | null;
  fonte_url: string | null;
  confianca: Referencia['confianca'];
}

export function deLinha(x: Linha): Referencia {
  const tipoIntervalo = typeof x.especificacao?.tipo_intervalo === 'string' ? x.especificacao.tipo_intervalo : null;
  return {
    id: Number(x.id),
    categoria: x.categoria,
    marca: x.marca,
    linha: x.linha,
    tipo: x.tipo,
    intervaloKm: x.intervalo_km,
    intervaloMeses: x.intervalo_meses,
    intervaloKmSevero: x.intervalo_km_severo,
    intervaloMesesSevero: x.intervalo_meses_severo,
    segueManual: x.segue_manual,
    observacao: x.observacao,
    fonteNome: x.fonte_nome,
    fonteUrl: x.fonte_url,
    confianca: x.confianca,
    tipoIntervalo
  };
}

export const COLUNAS_REFERENCIA =
  'id, categoria, marca, linha, tipo, especificacao, intervalo_km, intervalo_meses, intervalo_km_severo, intervalo_meses_severo, segue_manual, observacao, fonte_nome, fonte_url, confianca';

const VALIDADE_MS = 30 * 60_000;
let guardado: { em: number; lista: Referencia[] } | null = null;

/** As referências aprovadas da base (o público só vê essas). Fica 30 minutos na memória. */
export async function buscarReferencias(): Promise<{ referencias: Referencia[]; erro?: string }> {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return { referencias: guardado.lista };
  const sb = clientePublico();
  if (!sb) return { referencias: [], erro: 'Supabase não configurado' };
  const { data, error } = await sb.from('produtos_referencia').select(COLUNAS_REFERENCIA).order('categoria').order('marca').order('linha');
  if (error) {
    console.error('[referencias]', error);
    return { referencias: guardado?.lista ?? [], erro: 'Banco indisponível' };
  }
  const lista = ((data ?? []) as Linha[]).map(deLinha);
  guardado = { em: Date.now(), lista };
  return { referencias: lista };
}
