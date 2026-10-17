import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { FORMATO_DO_TOKEN, prefixoDoToken } from './api-dados';
import { mensagemDaLoja } from './comum';

// Os tokens da API da loja: o servidor sorteia, o banco guarda só o SHA-256 e o prefixo, e o token
// aparece uma vez para o dono copiar. Sem o token, ninguém refaz nem recupera: perdeu, revoga e cria outro.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 8 letras e números sorteados (sem viés: descarta o byte que passaria do alfabeto). */
function oitoSorteados(): string {
  let r = '';
  while (r.length < 8) {
    for (const b of randomBytes(16)) {
      if (b < 252 && r.length < 8) r += ALFABETO[b % 36];
    }
  }
  return r;
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Um token novo: rvl_<8>_<43>, com o prefixo (o que o painel mostra) e o hash (o que o banco guarda). */
export function gerarToken(): { token: string; prefixo: string; hash: string } {
  const prefixo = `rvl_${oitoSorteados()}`;
  const token = `${prefixo}_${randomBytes(32).toString('base64url')}`;
  if (!FORMATO_DO_TOKEN.test(token) || prefixoDoToken(token) !== prefixo) throw new Error('token fora do formato');
  return { token, prefixo, hash: hashDoToken(token) };
}

export interface TokenDaLoja {
  id: string;
  nome: string;
  prefixo: string;
  criadoEm: string;
  ultimoUsoEm: string | null;
  revogado: boolean;
  revogadoEm: string | null;
}

export interface ChamadaDaApi {
  quando: string;
  metodo: 'GET' | 'PATCH';
  situacao: number;
  vezes: number;
  recebidos: number;
  devolvidos: number;
  atualizados: number;
  naoEncontrados: number;
  erros: number;
  token: string | null;
  nome: string | null;
}

const numero = z.union([z.number(), z.string()]).transform(Number);
const texto = z.string().nullish().transform((v) => v ?? null);

export async function tokensDaLoja(sb: SupabaseClient, fornecedorId: number): Promise<TokenDaLoja[] | null> {
  const { data, error } = await sb
    .from('lojas_api_tokens')
    .select('id, nome, prefixo, criado_em, ultimo_uso_em, revogado, revogado_em')
    .eq('fornecedor_id', fornecedorId)
    .order('revogado')
    .order('criado_em', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[loja] tokens', error);
    return null;
  }
  return (Array.isArray(data) ? data : []).flatMap((x) => {
    const r = z
      .object({ id: z.string(), nome: z.string(), prefixo: z.string(), criado_em: z.string(), ultimo_uso_em: texto, revogado: z.boolean(), revogado_em: texto })
      .safeParse(x);
    return r.success ? [{ id: r.data.id, nome: r.data.nome, prefixo: r.data.prefixo, criadoEm: r.data.criado_em, ultimoUsoEm: r.data.ultimo_uso_em, revogado: r.data.revogado, revogadoEm: r.data.revogado_em }] : [];
  });
}

export async function chamadasDaApi(sb: SupabaseClient, fornecedorId: number): Promise<{ hoje: number; chamadas: ChamadaDaApi[] } | null> {
  const { data, error } = await sb.rpc('loja_api_chamadas', { p_fornecedor: fornecedorId, p_limite: 30 });
  if (error) {
    console.error('[loja] chamadas da API', error);
    return null;
  }
  const r = z
    .object({
      hoje: numero,
      chamadas: z.array(
        z.object({
          quando: z.string(),
          metodo: z.enum(['GET', 'PATCH']),
          situacao: numero,
          vezes: numero,
          recebidos: numero,
          devolvidos: numero,
          atualizados: numero,
          naoEncontrados: numero,
          erros: numero,
          token: texto,
          nome: texto
        })
      )
    })
    .safeParse(data);
  return r.success ? r.data : { hoje: 0, chamadas: [] };
}

export const esquemaNomeDoToken = z.string().trim().min(2, 'Dê um nome ao token, como "Bling" ou "Planilha do estoque".').max(60, 'O nome tem até 60 letras.');

/** Cria o token e devolve o texto dele (só agora: o banco guarda o hash). */
export async function criarToken(sb: SupabaseClient, fornecedorId: number, nome: unknown): Promise<Gravacao<{ token: string; prefixo: string }>> {
  const n = esquemaNomeDoToken.safeParse(nome);
  if (!n.success) return { ok: false, erro: n.error.issues[0]?.message ?? 'Confira o nome.' };
  const t = gerarToken();
  const { error } = await sb.rpc('loja_api_criar_token', { p_fornecedor: fornecedorId, p_nome: n.data, p_prefixo: t.prefixo, p_hash: t.hash });
  if (error) {
    if (error.code === 'RV067') return { ok: false, erro: 'A loja já tem 10 tokens ativos. Revogue um antes de criar outro.' };
    if (error.code === '42501') return { ok: false, erro: 'Só o dono da loja cria tokens da API.' };
    console.error('[loja] criar token', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para criar o token agora. Tente de novo.') };
  }
  return { ok: true, token: t.token, prefixo: t.prefixo };
}

export async function revogarToken(sb: SupabaseClient, id: string): Promise<Gravacao> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, erro: 'Token inválido.' };
  const { error } = await sb.rpc('loja_api_revogar_token', { p_id: id });
  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'Token não encontrado.' };
    console.error('[loja] revogar token', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para revogar agora. Tente de novo.') };
  }
  return { ok: true };
}
