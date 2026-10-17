import 'server-only';
import { z } from 'zod';
import { clientePublico } from '../supabase-servidor';

// A página do entregador, sem conta: o link é a chave. O banco guarda só o hash do código e as
// funções entrega_* mostram a entrega, guardam a posição e marcam o "entregue" enquanto o link vale.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

export interface DadosDaEntrega {
  codigo: string;
  loja: string;
  oficina: string;
  whatsapp: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  itens: { nome: string; quantidade: number }[];
  previsao: string | null;
  posicaoEm: string | null;
}

const SEM_BANCO = 'O servidor ainda não está ligado ao banco.';
const ERRO = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';
const VENCIDO = 'Este link não vale mais. A entrega pode ter terminado.';

const texto = z.string().nullish().transform((v) => v ?? null);
const esquemaEntrega = z.object({
  codigo: z.string().nullish().transform((v) => v ?? '------'),
  loja: z.string().nullish().transform((v) => v ?? 'Loja'),
  oficina: z.string().nullish().transform((v) => v ?? 'Oficina'),
  whatsapp: z.string().nullish().transform((v) => v ?? ''),
  endereco: texto,
  cidade: texto,
  uf: texto,
  itens: z
    .array(z.object({ nome: z.string().nullish().transform((v) => v ?? ''), quantidade: z.union([z.number(), z.string()]).transform(Number) }))
    .catch([]),
  previsao: texto,
  posicaoEm: texto
});

/** O que o entregador vê pelo link (ou null se o link não vale mais). */
export async function dadosDaEntrega(token: string): Promise<DadosDaEntrega | null> {
  const sb = clientePublico();
  if (!sb) return null;
  const { data, error } = await sb.rpc('entrega_ver', { p_token: token });
  if (error) {
    console.error('[entrega] ver', error);
    return null;
  }
  if (!data) return null;
  const r = esquemaEntrega.safeParse(data);
  return r.success ? r.data : null;
}

/**
 * Guarda a posição do entregador. `guardada: false` quando chegou rápido demais (o banco guarda no
 * máximo uma a cada 3 segundos); se o link venceu, avisa.
 */
export async function registrarPosicao(token: string, pos: { lat: number; lng: number; precisao: number | null }): Promise<Gravacao<{ guardada: boolean }>> {
  const sb = clientePublico();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const { data, error } = await sb.rpc('entrega_posicao', {
    p_token: token,
    p_lat: Math.round(pos.lat * 1e6) / 1e6,
    p_lng: Math.round(pos.lng * 1e6) / 1e6,
    p_precisao: pos.precisao == null ? null : Math.round(pos.precisao)
  });
  if (error) {
    console.error('[entrega] posição', error);
    return { ok: false, erro: ERRO };
  }
  if (data === true) return { ok: true, guardada: true };
  // não guardou: ou chegou cedo demais, ou o link não vale mais
  return (await dadosDaEntrega(token)) ? { ok: true, guardada: false } : { ok: false, erro: VENCIDO };
}

export async function concluirEntrega(token: string): Promise<Gravacao> {
  const sb = clientePublico();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const { data, error } = await sb.rpc('entrega_concluir', { p_token: token });
  if (error) {
    console.error('[entrega] concluir', error);
    return { ok: false, erro: ERRO };
  }
  return data === true ? { ok: true } : { ok: false, erro: 'Este link não vale mais. A entrega pode já ter sido marcada.' };
}
