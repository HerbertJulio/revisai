// Os erros que os navegadores relatam, limpos antes de guardar: sem e-mail, sem números longos
// (telefone, CPF, CNPJ), sem placa, sem códigos de link, sem o que vem depois de ? e #.
// Sem nada de servidor aqui, para testar e para o navegador usar os mesmos limites.

export const LIMITES_DO_RELATO = { mensagem: 500, pilha: 4000, linhas: 25, rota: 200, agente: 200, versao: 60, corpo: 16_000 } as const;

export type OrigemDoErro = 'janela' | 'promessa' | 'tela' | 'servidor';

export interface RelatoDeErro {
  mensagem: string;
  pilha: string | null;
  rota: string | null;
  origem: OrigemDoErro;
  versao: string | null;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PLACA = /\b[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}\b/g;
const DIGITOS = /\d[\d.\-/ ]{5,}\d/g;
// a consulta (?a=b) e o fragmento (#x) de endereços completos e de caminhos (mantém :linha:coluna)
const CONSULTA_URL = /(https?:\/\/[^\s"'()?#]+)[?#][^\s"'():]*/g;
const CONSULTA_CAMINHO = /((?:^|[\s"'(])\/[A-Za-z0-9_\-/.]*)[?#][^\s"'():]*/g;

/** Tira do texto o que poderia identificar alguém. */
export function limparTexto(t: string): string {
  return t
    .replace(JWT, '[token]')
    .replace(EMAIL, '[e-mail]')
    .replace(CONSULTA_URL, '$1')
    .replace(CONSULTA_CAMINHO, '$1')
    .replace(UUID, ':id')
    .replace(TOKEN, '[código]')
    .replace(PLACA, '[placa]')
    .replace(DIGITOS, '[número]');
}

/** O caminho da página sem consulta e sem os pedaços que são códigos ou números. */
export function limparRota(rota: string | null | undefined): string | null {
  if (!rota) return null;
  let caminho = String(rota);
  try {
    caminho = new URL(caminho, 'https://x').pathname;
  } catch {
    caminho = caminho.split(/[?#]/)[0];
  }
  const partes = caminho
    .split('/')
    .map((p) => (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(p) || /^[A-Za-z0-9_-]{20,}$/.test(p) || /\d{3,}/.test(p) ? ':id' : p.slice(0, 60)));
  return partes.join('/').slice(0, LIMITES_DO_RELATO.rota) || '/';
}

function limparPilha(pilha: string | null | undefined): string | null {
  if (!pilha) return null;
  const linhas = String(pilha)
    .split('\n')
    .slice(0, LIMITES_DO_RELATO.linhas)
    .map((l) => limparTexto(l).trimEnd());
  return linhas.join('\n').slice(0, LIMITES_DO_RELATO.pilha) || null;
}

const ORIGENS: OrigemDoErro[] = ['janela', 'promessa', 'tela', 'servidor'];

/** Lê o que o navegador mandou; null quando não serve. */
export function lerRelato(entrada: unknown): RelatoDeErro | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  const mensagem = typeof e.mensagem === 'string' ? limparTexto(e.mensagem).trim().slice(0, LIMITES_DO_RELATO.mensagem) : '';
  if (!mensagem) return null;
  const origem = ORIGENS.includes(e.origem as OrigemDoErro) ? (e.origem as OrigemDoErro) : 'janela';
  const versao = typeof e.versao === 'string' ? e.versao.replace(/[^A-Za-z0-9._-]/g, '').slice(0, LIMITES_DO_RELATO.versao) || null : null;
  return { mensagem, pilha: typeof e.pilha === 'string' ? limparPilha(e.pilha) : null, rota: typeof e.rota === 'string' ? limparRota(e.rota) : null, origem, versao };
}

/** O navegador e o sistema, sem a versão completa (que pode identificar o aparelho). */
export function agenteResumido(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser\//.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Outro';
  const sistema = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  const versao = (ua.match(/(?:Chrome|Firefox|Version|Edg|OPR|SamsungBrowser)\/(\d+)/) ?? [])[1];
  return `${navegador}${versao ? ` ${versao}` : ''} · ${sistema}`.slice(0, LIMITES_DO_RELATO.agente);
}
