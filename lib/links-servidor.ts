import 'server-only';
import { caminhoDeFotoValido } from './andamento';
import { esquemaLinkVisto, esquemaOficinaDoLink, tokenValido, type LinkVisto, type OficinaDoLink } from './links-publicos';
import { clientePublico, clienteSistema, configSupabase } from './supabase-servidor';

// Os links do cliente pelo servidor, sem conta: ver (conta a visita), responder (aprovar o
// orçamento, assinar o checklist) e consultar a garantia pela placa e pelo código. Tudo pelas
// funções públicas do banco, que conferem o link e guardam a prova.

export async function verLink(token: string): Promise<LinkVisto | null> {
  if (!tokenValido(token)) return null;
  const sb = clientePublico();
  if (!sb) return null;
  const { data, error } = await sb.rpc('ver_link', { p_token: token });
  if (error) {
    console.error('[links] ver', error);
    return null;
  }
  if (!data) return null;
  const r = esquemaLinkVisto.safeParse(data);
  if (!r.success) {
    console.error('[links] ver: formato', r.error.issues.slice(0, 3));
    return null;
  }
  return r.data;
}

export type Resposta = { ok: true; quando: string } | { ok: false; erro: string; codigo?: string };

/**
 * Guarda a resposta do cliente, com o IP e o aparelho de quem respondeu (o banco junta data e hora).
 * Vai com a chave do sistema: só o servidor responde, para o IP guardado como prova ser o de verdade.
 */
export async function responderLink(token: string, resposta: Record<string, unknown>, ip: string, agente: string): Promise<Resposta> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: 'O servidor ainda não está ligado ao banco.' };
  const { data, error } = await sb.rpc('responder_link', { p_token: token, p_resposta: resposta, p_ip: ip.slice(0, 64), p_agente: agente.slice(0, 300) });
  if (error) {
    if (error.code === 'RV051') return { ok: false, erro: 'Este link já foi respondido.', codigo: error.code };
    if (error.code === 'RV050') return { ok: false, erro: 'Este link não vale mais. Peça um novo para a oficina.', codigo: error.code };
    console.error('[links] responder', error);
    return { ok: false, erro: 'Não deu para guardar a resposta agora. Tente de novo.', codigo: error.code };
  }
  const r = (data ?? {}) as { quando?: string };
  return { ok: true, quando: r.quando ?? new Date().toISOString() };
}

export interface GarantiaConsultada {
  dados: Record<string, unknown>;
  oficina: OficinaDoLink;
  atualizadoEm: string | null;
}

export async function consultarGarantia(placa: string, codigo: string): Promise<GarantiaConsultada | null> {
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const c = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{7}$/.test(p) || !/^[A-Z0-9]{6}$/.test(c)) return null;
  const sb = clientePublico();
  if (!sb) return null;
  const { data, error } = await sb.rpc('garantia_consultar', { p_placa: p, p_codigo: c });
  if (error) {
    console.error('[links] garantia', error);
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const g = data as { dados?: unknown; oficina?: unknown; atualizadoEm?: string };
  const oficina = esquemaOficinaDoLink.safeParse(g.oficina ?? {});
  if (!g.dados || typeof g.dados !== 'object' || !oficina.success) return null;
  return { dados: g.dados as Record<string, unknown>, oficina: oficina.data, atualizadoEm: g.atualizadoEm ?? null };
}

/** O endereço público da foto no Storage (o bucket 'links' é público só para leitura). */
export function enderecoDaFotoNoStorage(caminho: string): string | null {
  const c = configSupabase();
  if (!c || !caminhoDeFotoValido(caminho)) return null;
  return `${c.url.replace(/\/$/, '')}/storage/v1/object/public/links/${caminho}`;
}
