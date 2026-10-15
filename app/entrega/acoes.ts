'use server';

// O celular do entregador manda a posição e avisa que entregou. O link é a chave: o banco guarda só
// o hash dele, e ele para de valer quando a entrega termina.

import { concluirEntrega, registrarPosicao } from '@/lib/entregas';
import { esquemaPosicao, tokenValido } from '@/lib/entregas-dados';
import { permitido } from '@/lib/limite';

type Resposta = { ok: true } | { ok: false; erro: string };

/** `guardada: false` quando chegou rápido demais e ficou de fora (a tela não mostra como mandada). */
export async function enviarPosicao(token: string, posicao: unknown): Promise<({ ok: true; guardada: boolean }) | { ok: false; erro: string }> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  const p = esquemaPosicao.safeParse(posicao);
  if (!p.success) return { ok: false, erro: 'Posição inválida.' };
  if (!(await permitido(`entrega-${token.slice(0, 12)}`, 70, 10))) return { ok: true, guardada: false };
  const r = await registrarPosicao(token, p.data);
  return r.ok ? { ok: true, guardada: true } : r;
}

export async function avisarEntregue(token: string): Promise<Resposta> {
  if (!tokenValido(token)) return { ok: false, erro: 'Link inválido.' };
  if (!(await permitido(`entregue-${token.slice(0, 12)}`, 10, 10))) return { ok: false, erro: 'Muitas tentativas. Espere um pouco.' };
  return concluirEntrega(token);
}
