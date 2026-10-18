import 'server-only';
import { headers } from 'next/headers';
import { clienteSistema } from './supabase-servidor';

// Limite de tentativas por IP (e por outras chaves), contado no banco: vale para todos os
// servidores da Vercel ao mesmo tempo. Se o banco não responder, conta na memória deste
// servidor, como antes (melhor um limite local que nenhum).

const janela = new Map<string, number[]>();

export async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

function recentes(id: string, minutos: number, agora: number): number[] {
  return (janela.get(id) ?? []).filter((t) => agora - t < minutos * 60_000);
}

function guardar(id: string, lista: number[]) {
  janela.set(id, lista);
  if (janela.size > 5000) janela.clear();
}

function contarNaMemoria(id: string, maximo: number, minutos: number): boolean {
  const agora = Date.now();
  const lista = recentes(id, minutos, agora);
  if (lista.length >= maximo) return false;
  lista.push(agora);
  guardar(id, lista);
  return true;
}

/** Conta uma tentativa com a chave exata (sem IP) e diz se ainda cabe. */
export async function permitidoPara(chave: string, maximo: number, minutos: number): Promise<boolean> {
  const sb = clienteSistema();
  if (sb) {
    try {
      const { data, error } = await sb.rpc('limite_consumir', { p_chave: chave.slice(0, 200), p_max: maximo, p_segundos: Math.max(1, Math.round(minutos * 60)) });
      if (!error && typeof data === 'boolean') return data;
      if (error) console.warn('[limite] banco', error.code, error.message);
    } catch (e) {
      console.warn('[limite] banco', e);
    }
  }
  return contarNaMemoria(chave, maximo, minutos);
}

/** Só confere a chave exata, sem contar. */
export async function esgotadoPara(chave: string, maximo: number, minutos: number): Promise<boolean> {
  const sb = clienteSistema();
  if (sb) {
    try {
      const { data, error } = await sb.rpc('limite_esgotado', { p_chave: chave.slice(0, 200), p_max: maximo, p_segundos: Math.max(1, Math.round(minutos * 60)) });
      if (!error && typeof data === 'boolean') return data;
    } catch {}
  }
  return recentes(chave, minutos, Date.now()).length >= maximo;
}

/** Conta esta tentativa (por IP) e diz se ela ainda cabe no limite. */
export async function permitido(chave: string, maximo: number, minutos: number): Promise<boolean> {
  return permitidoPara(`ip:${await ipDaRequisicao()}:${chave}`, maximo, minutos);
}

/** Só confere, sem contar: para limitar erros (código errado) sem punir quem acerta. */
export async function esgotado(chave: string, maximo: number, minutos: number): Promise<boolean> {
  return esgotadoPara(`ip:${await ipDaRequisicao()}:${chave}`, maximo, minutos);
}

/** Conta um erro para o limite de `esgotado`. */
export async function contarErro(chave: string, minutos: number): Promise<void> {
  // o máximo aqui não importa: só soma mais um na janela
  await permitidoPara(`ip:${await ipDaRequisicao()}:${chave}`, 1_000_000, minutos);
}
