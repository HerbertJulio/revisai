// Testes das permissões direto no Postgres (o mesmo esquema do Supabase, com as migrações do app).
// Cada teste roda numa transação que é desfeita no fim. A pessoa "entra" pondo as claims do JWT
// em request.jwt.claims, como o PostgREST faz, e o papel (anon ou authenticated) com SET ROLE.
// Só roda com BANCO_TESTE_URL (veja scripts/supabase-local).

import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

export const URL_BANCO = process.env.BANCO_TESTE_URL ?? '';
export const temBanco = URL_BANCO !== '';

/** A chave do sistema usada nos testes (o hash vai para privado.chaves dentro da transação). */
export const CHAVE_SISTEMA_TESTE = 'chave-do-sistema-so-para-testes-0123456789abcdef';

export interface Pessoa {
  id: string;
  email: string;
  aal?: 'aal1' | 'aal2';
  /** Segundos atrás em que passou pelo segundo fator (TOTP). */
  totpHa?: number;
  /** Segundos atrás em que entrou pelo código do e-mail. */
  entrouHa?: number;
}

export function pessoa(nome: string, extra: Partial<Pessoa> = {}): Pessoa {
  return { id: randomUUID(), email: `${nome}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@teste.dev`, ...extra };
}

export type Banco = pg.PoolClient;

let pool: pg.Pool | null = null;

function abrir(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: URL_BANCO, max: 4 });
  return pool;
}

export async function fechar() {
  await pool?.end();
  pool = null;
}

/** Roda fn numa transação desfeita no fim (nada fica no banco). */
export async function emTransacao<T>(fn: (b: Banco) => Promise<T>): Promise<T> {
  const c = await abrir().connect();
  try {
    await c.query('begin');
    await c.query(`insert into privado.chaves (nome, hash) values ('sistema', $1) on conflict (nome) do update set hash = excluded.hash`, [
      createHash('sha256').update(CHAVE_SISTEMA_TESTE).digest('hex')
    ]);
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => {});
    c.release();
  }
}

/** Cria a pessoa em auth.users (como o GoTrue faria no primeiro login). */
export async function criarPessoa(b: Banco, p: Pessoa): Promise<Pessoa> {
  await b.query(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), now(), now(), '{}', '{}')`,
    [p.id, p.email]
  );
  return p;
}

function claims(p: Pessoa) {
  const agora = Math.floor(Date.now() / 1000);
  const amr: { method: string; timestamp: number }[] = [{ method: 'otp', timestamp: agora - (p.entrouHa ?? 3600) }];
  if (p.totpHa != null) amr.push({ method: 'totp', timestamp: agora - p.totpHa });
  return { sub: p.id, role: 'authenticated', email: p.email, aal: p.aal ?? (p.totpHa != null ? 'aal2' : 'aal1'), amr, aud: 'authenticated' };
}

async function papel(b: Banco, role: 'anon' | 'authenticated', c: object | null, headers: Record<string, string>) {
  await b.query(`select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)`, [c ? JSON.stringify(c) : '', JSON.stringify(headers)]);
  await b.query(`set local role ${role}`);
}

/**
 * Roda fn como a pessoa (ou anônimo, com p = null), num savepoint: um erro dentro não estraga a
 * transação do teste. Volta para o superusuário no fim.
 */
export async function como<T>(b: Banco, p: Pessoa | null, fn: () => Promise<T>, opcoes: { sistema?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const headers = { ...(opcoes.headers ?? {}), ...(opcoes.sistema ? { 'x-revisai-sistema': CHAVE_SISTEMA_TESTE } : {}) };
  await b.query('savepoint como');
  try {
    await papel(b, p ? 'authenticated' : 'anon', p ? claims(p) : null, headers);
    const r = await fn();
    await b.query('reset role');
    await b.query('release savepoint como');
    return r;
  } catch (e) {
    await b.query('rollback to savepoint como');
    await b.query('reset role');
    throw e;
  }
}

/** Como a pessoa, devolvendo o erro (ou null) em vez de lançar. */
export async function tentar(b: Banco, p: Pessoa | null, sql: string, params: unknown[] = [], opcoes: { sistema?: boolean } = {}): Promise<{ erro: string | null; codigo: string | null; linhas: Record<string, unknown>[] }> {
  try {
    const r = await como(b, p, () => b.query(sql, params), opcoes);
    return { erro: null, codigo: null, linhas: r.rows };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return { erro: err.message ?? String(e), codigo: err.code ?? null, linhas: [] };
  }
}

export async function linhas(b: Banco, p: Pessoa | null, sql: string, params: unknown[] = [], opcoes: { sistema?: boolean } = {}): Promise<Record<string, unknown>[]> {
  const r = await como(b, p, () => b.query(sql, params), opcoes);
  return r.rows;
}

/** Cria a oficina como a pessoa (pela RPC, como o app faz). */
export async function criarOficina(b: Banco, dono: Pessoa, nome = 'Oficina Teste', extra: { uf?: string; whatsapp?: string } = {}): Promise<string> {
  const [r] = await linhas(b, dono, `select public.criar_oficina($1, $2, 'Rio', $3, 'Rua A, 1') as id`, [nome, extra.whatsapp ?? '5521999990000', extra.uf ?? 'RJ']);
  return String(r.id);
}

/** Loja ativa com um produto (feita pelo superusuário, como a equipe faria). */
export async function criarLoja(b: Banco, dono: Pessoa | null, opcoes: { uf?: string; nome?: string; categoria?: string; preco?: number } = {}): Promise<{ fornecedorId: number; produtoId: number }> {
  const f = await b.query(`insert into public.fornecedores (nome, cidade, uf, ativo, demonstracao) values ($1, 'Rio', $2, true, false) returning id`, [opcoes.nome ?? 'Loja Teste', opcoes.uf ?? 'RJ']);
  const fornecedorId = Number(f.rows[0].id);
  const p = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco) values ($1, $2, 'Óleo 5W30 1L', 'un', $3) returning id`, [
    fornecedorId,
    opcoes.categoria ?? 'oleo_motor',
    opcoes.preco ?? 40
  ]);
  if (dono) await b.query(`insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email) values ($1, $2, 'dono', $3)`, [fornecedorId, dono.id, dono.email]);
  return { fornecedorId, produtoId: Number(p.rows[0].id) };
}

/** Põe a pessoa na equipe (o convite seria aceito no login com segundo fator). */
export async function criarEquipe(b: Banco, p: Pessoa, papelEquipe: 'admin' | 'suporte' | 'financeiro'): Promise<void> {
  await b.query(`insert into privado.equipe (user_id, email, papel) values ($1, $2, $3)`, [p.id, p.email, papelEquipe]);
}
