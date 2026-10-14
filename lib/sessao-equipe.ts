// Sessão do painel da equipe: um cookie assinado com HMAC, sem guardar nada no banco.
// A chave que assina depende da senha, então trocar a senha na Vercel derruba quem estava dentro.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_EQUIPE = 'revisai_equipe';
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

function hmac(chave: string | Buffer, texto: string): Buffer {
  return createHmac('sha256', chave).update(texto).digest();
}

function chaveDaSessao(segredo: string, senha: string): Buffer {
  return hmac(segredo, `sessao:${normalizarSenha(senha)}`);
}

/** Senha sem espaços nas pontas e em minúsculas: o teclado do celular costuma pôr maiúscula na primeira letra. */
export function normalizarSenha(senha: string): string {
  return (senha ?? '').trim().toLowerCase();
}

export function senhaConfere(digitada: string, senha: string): boolean {
  if (!senha) return false;
  const a = createHash('sha256').update(normalizarSenha(digitada)).digest();
  const b = createHash('sha256').update(normalizarSenha(senha)).digest();
  return timingSafeEqual(a, b);
}

export function criarSessao(segredo: string, senha: string, agora = Date.now()): string {
  const expira = agora + DURACAO_SESSAO_MS;
  const assinatura = hmac(chaveDaSessao(segredo, senha), `equipe:${expira}`).toString('base64url');
  return `${expira}.${assinatura}`;
}

export function sessaoValida(valor: string | undefined, segredo: string, senha: string, agora = Date.now()): boolean {
  if (!valor || !segredo || !senha) return false;
  const partes = valor.split('.');
  if (partes.length !== 2 || !/^\d{13}$/.test(partes[0]) || !/^[A-Za-z0-9_-]{43}$/.test(partes[1])) return false;
  const expira = Number(partes[0]);
  if (expira <= agora || expira - agora > DURACAO_SESSAO_MS) return false;
  const esperada = hmac(chaveDaSessao(segredo, senha), `equipe:${expira}`);
  const recebida = Buffer.from(partes[1], 'base64url');
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}
