// Acesso do fornecedor ao painel dele. A equipe gera um link com um código aleatório; o banco
// guarda só o hash do código. Quem abre o link ganha um cookie assinado que carrega o id do
// fornecedor e um pedaço do hash do link: gerar um link novo derruba as sessões do link antigo.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_FORNECEDOR = 'revisai_fornecedor';
export const DURACAO_FORNECEDOR_MS = 30 * 24 * 60 * 60 * 1000;

/** Código do link (43 caracteres, 256 bits). */
export function gerarCodigoDeAcesso(): string {
  return randomBytes(32).toString('base64url');
}

export function codigoValido(codigo: string | null | undefined): codigo is string {
  return typeof codigo === 'string' && /^[A-Za-z0-9_-]{43}$/.test(codigo);
}

export function hashDoCodigo(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}

function assinar(segredo: string, texto: string): Buffer {
  const chave = createHmac('sha256', segredo).update('fornecedor:sessao').digest();
  return createHmac('sha256', chave).update(texto).digest();
}

/** Os primeiros 16 caracteres do hash do link: identificam qual link abriu a sessão. */
export function marcaDoLink(hash: string): string {
  return hash.slice(0, 16);
}

export function criarSessaoFornecedor(segredo: string, fornecedorId: number, hashDoLink: string, agora = Date.now()): string {
  const expira = agora + DURACAO_FORNECEDOR_MS;
  const corpo = `${fornecedorId}.${marcaDoLink(hashDoLink)}.${expira}`;
  return `${corpo}.${assinar(segredo, corpo).toString('base64url')}`;
}

export interface SessaoFornecedor {
  fornecedorId: number;
  marca: string;
}

/** Confere a assinatura e a validade. Quem chama ainda precisa conferir a marca do link no banco. */
export function lerSessaoFornecedor(valor: string | undefined, segredo: string, agora = Date.now()): SessaoFornecedor | null {
  if (!valor || !segredo) return null;
  const partes = valor.split('.');
  if (partes.length !== 4) return null;
  const [id, marca, expiraTexto, assinatura] = partes;
  if (!/^\d{1,12}$/.test(id) || !/^[0-9a-f]{16}$/.test(marca) || !/^\d{13}$/.test(expiraTexto) || !/^[A-Za-z0-9_-]{43}$/.test(assinatura)) return null;
  const expira = Number(expiraTexto);
  if (expira <= agora || expira - agora > DURACAO_FORNECEDOR_MS) return null;
  const esperada = assinar(segredo, `${id}.${marca}.${expiraTexto}`);
  const recebida = Buffer.from(assinatura, 'base64url');
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  return { fornecedorId: Number(id), marca };
}
