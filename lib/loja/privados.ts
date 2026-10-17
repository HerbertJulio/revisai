import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// O e-mail, o CNPJ e a observação da verificação das lojas não saem na leitura normal da tabela
// (que serve ao catálogo de todo mundo): vêm da função lojas_dados_privados, que só responde para
// quem é da loja, para a equipe e para o servidor. Aqui eles voltam para dentro das linhas.

export interface DadosPrivadosDaLoja {
  email: string | null;
  cnpj: string | null;
  verificacao_obs: string | null;
}

const VAZIO: DadosPrivadosDaLoja = { email: null, cnpj: null, verificacao_obs: null };

/** Os dados privados das lojas que a pessoa pode ver (null quando o banco falha). */
export async function dadosPrivadosDasLojas(sb: SupabaseClient, ids: number[]): Promise<Map<number, DadosPrivadosDaLoja> | null> {
  const unicos = [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))];
  const m = new Map<number, DadosPrivadosDaLoja>();
  if (!unicos.length) return m;
  const { data, error } = await sb.rpc('lojas_dados_privados', { p_ids: unicos });
  if (error) {
    console.error('[loja] dados privados', error.code, error.message);
    return null;
  }
  for (const x of (Array.isArray(data) ? data : []) as { id: number | string; email?: string | null; cnpj?: string | null; verificacao_obs?: string | null }[]) {
    m.set(Number(x.id), { email: x.email ?? null, cnpj: x.cnpj ?? null, verificacao_obs: x.verificacao_obs ?? null });
  }
  return m;
}

/** As linhas das lojas com o e-mail, o CNPJ e a observação (nulos quando a pessoa não pode ver). */
export async function comDadosPrivados<T extends { id?: unknown }>(sb: SupabaseClient, linhas: T[] | null | undefined): Promise<{ linhas: (T & DadosPrivadosDaLoja)[]; erro: boolean }> {
  const lista = Array.isArray(linhas) ? linhas : [];
  if (!lista.length) return { linhas: [], erro: false };
  const m = await dadosPrivadosDasLojas(
    sb,
    lista.map((l) => Number(l.id))
  );
  return { linhas: lista.map((l) => ({ ...l, ...(m?.get(Number(l.id)) ?? VAZIO) })), erro: m === null };
}

/** Uma linha só (ou null). */
export async function lojaComDadosPrivados<T extends { id?: unknown }>(sb: SupabaseClient, linha: T | null | undefined): Promise<(T & DadosPrivadosDaLoja) | null> {
  if (!linha) return null;
  return (await comDadosPrivados(sb, [linha])).linhas[0] ?? null;
}
