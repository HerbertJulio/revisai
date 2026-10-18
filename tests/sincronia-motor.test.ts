// A sincronização de verdade: aparelhos (cada um com o seu armazenamento e o seu estado) falando
// com o Supabase local pelo gateway, com pessoas que entraram pelo código do e-mail.
// Só roda com SUPABASE_TESTE_URL (ex.: http://127.0.0.1:54321; veja scripts/supabase-local).
// Com BANCO_TESTE_URL, apaga no fim a oficina e as pessoas criadas aqui.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoMotor } from '@/components/oficina/sincronia/motor';
import type { Cliente } from '@/lib/tipos';

const URL_SB = process.env.SUPABASE_TESTE_URL ?? '';
const CHAVE = process.env.SUPABASE_TESTE_CHAVE ?? 'sb_publishable_local';
const d = URL_SB ? describe : describe.skip;

type Store = typeof import('@/lib/store');
type Motor = InstanceType<(typeof import('@/components/oficina/sincronia/motor'))['MotorDeSincronia']>;

interface Aparelho {
  store: Store;
  motor: Motor;
  estados: EstadoMotor[];
  s: () => ReturnType<Store['useOficina']['getState']>;
  sincronizar: () => Promise<void>;
  pendentes: () => number;
}

const marca = Date.now().toString(36);
const emails = { dono: `sinc-dono-${marca}@teste.dev`, mec: `sinc-mec-${marca}@teste.dev`, intruso: `sinc-intruso-${marca}@teste.dev` };
const aparelhos: Aparelho[] = [];

async function codigoDoEmail(email: string, desde: number): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const lista = (await (await fetch(`${URL_SB}/__mail?para=${encodeURIComponent(email)}`)).json()) as { quando: number; texto: string; html: string }[];
    const m = lista.filter((x) => x.quando >= desde).at(-1);
    const cod = m && `${m.texto} ${m.html}`.match(/\b(\d{6})\b/);
    if (cod) return cod[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`sem e-mail para ${email}`);
}

/** Entra pelo código do e-mail, como no app. `rede.fora` derruba a internet deste cliente. */
async function entrar(email: string, rede: { fora: boolean } = { fora: false }): Promise<SupabaseClient> {
  const sb = createClient(URL_SB, CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (entrada, init) => (rede.fora ? Promise.reject(new TypeError('fetch failed')) : fetch(entrada, init)) }
  });
  const desde = Date.now();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  const { error: e2 } = await sb.auth.verifyOtp({ email, token: await codigoDoEmail(email, desde), type: 'email' });
  if (e2) throw e2;
  return sb;
}

/** Um aparelho novo: armazenamento vazio, estado próprio, ligado à oficina. */
async function novoAparelho(sb: SupabaseClient, oficinaId: string, opcoes: { preparar?: (store: Store) => void; levar?: boolean } = {}): Promise<Aparelho> {
  vi.resetModules();
  const mapa = new Map<string, unknown>();
  vi.doMock('idb-keyval', () => ({
    get: async (k: string) => mapa.get(k),
    set: async (k: string, v: unknown) => void mapa.set(k, v),
    del: async (k: string) => void mapa.delete(k)
  }));
  const store: Store = await import('@/lib/store');
  const { MotorDeSincronia } = await import('@/components/oficina/sincronia/motor');
  await new Promise<void>((r) => (store.jaHidratou() ? r() : void store.aoHidratar(r)));
  store.ligarRastreio();
  opcoes.preparar?.(store);
  store.useOficina.getState().vincularConta(oficinaId, !!opcoes.levar);
  const estados: EstadoMotor[] = [];
  const motor = new MotorDeSincronia(sb, oficinaId, (i) => estados.push(i.estado));
  const a: Aparelho = {
    store,
    motor,
    estados,
    s: () => store.useOficina.getState(),
    sincronizar: () => motor.sincronizar(),
    pendentes: () => Object.keys(store.useOficina.getState().sinc.pendentes).length
  };
  aparelhos.push(a);
  return a;
}

/** Conta as chamadas de cada RPC deste cliente. */
function contarChamadas(sb: SupabaseClient): Record<string, number> {
  const n: Record<string, number> = {};
  const original = sb.rpc.bind(sb);
  vi.spyOn(sb, 'rpc').mockImplementation(((fn: string, ...resto: unknown[]) => {
    n[fn] = (n[fn] ?? 0) + 1;
    return (original as (...a: unknown[]) => unknown)(fn, ...resto);
  }) as typeof sb.rpc);
  return n;
}

d('sincronização entre aparelhos', () => {
  let dono: SupabaseClient;
  let mec: SupabaseClient;
  const redeDoMec = { fora: false };
  let oficinaId: string;
  let A: Aparelho;
  let B: Aparelho;

  beforeAll(async () => {
    dono = await entrar(emails.dono);
    const { data, error } = await dono.rpc('criar_oficina', { p_nome: 'Oficina Sincronia', p_whatsapp: '5521999990000', p_cidade: 'Rio', p_uf: 'RJ', p_endereco: 'Rua A, 1' });
    if (error) throw error;
    oficinaId = String(data);
    const convite = await dono.rpc('convidar', { p_tipo: 'oficina', p_alvo: oficinaId, p_email: emails.mec, p_papel: 'mecanico' });
    if (convite.error) throw convite.error;
    mec = await entrar(emails.mec, redeDoMec);
    const aceite = await mec.rpc('aceitar_convite');
    if (aceite.error) throw aceite.error;
    A = await novoAparelho(dono, oficinaId);
    B = await novoAparelho(mec, oficinaId);
  }, 60_000);

  afterAll(async () => {
    for (const a of aparelhos) a.motor.parar();
    if (!process.env.BANCO_TESTE_URL) return;
    const pool = new pg.Pool({ connectionString: process.env.BANCO_TESTE_URL, max: 1 });
    try {
      if (oficinaId) await pool.query('delete from public.oficinas where id = $1', [oficinaId]);
      await pool.query('delete from auth.users where email = any($1)', [Object.values(emails)]);
    } finally {
      await pool.end();
    }
  });

  it('o que um aparelho grava, edita e apaga aparece no outro', async () => {
    const c1 = A.s().salvarCliente({ nome: 'Ana', telefone: '21999990001' });
    const v1 = A.s().salvarVeiculo({ clienteId: c1, placa: 'ABC1D23', marca: 'Fiat', modelo: 'Uno' });
    await A.sincronizar();
    expect(A.pendentes()).toBe(0);
    expect(A.estados.at(-1)).toBe('em-dia');
    await B.sincronizar();
    expect(B.s().clientes[c1]?.nome).toBe('Ana');
    expect(B.s().veiculos[v1]?.placa).toBe('ABC1D23');

    B.s().salvarCliente({ id: c1, nome: 'Ana Maria', telefone: '21999990001' });
    A.s().removerVeiculo(v1);
    await A.sincronizar();
    await B.sincronizar();
    await A.sincronizar();
    expect(A.s().clientes[c1]?.nome).toBe('Ana Maria');
    expect(B.s().veiculos[v1]).toBeUndefined();
    expect(A.s().veiculos[v1]).toBeUndefined();
  }, 60_000);

  it('edições ao mesmo tempo terminam iguais nos dois aparelhos', async () => {
    const id = A.s().salvarCliente({ nome: 'Bruno', telefone: '' });
    await A.sincronizar();
    await B.sincronizar();
    A.s().salvarCliente({ id, nome: 'Bruno (A)', telefone: '' });
    B.s().salvarCliente({ id, nome: 'Bruno (B)', telefone: '' });
    await A.sincronizar();
    await B.sincronizar();
    await A.sincronizar();
    expect(A.s().clientes[id]?.nome).toBe(B.s().clientes[id]?.nome);
    expect(B.s().clientes[id]?.nome).toBe('Bruno (B)');
    expect(A.pendentes() + B.pendentes()).toBe(0);
  }, 60_000);

  it('estoque: os movimentos dos dois aparelhos somam e a quantidade fecha', async () => {
    const item = A.s().salvarItemEstoque({ nome: 'Filtro de óleo', categoria: 'filtro_oleo', unidade: 'un', quantidade: 10, minimo: 2, custo: 20, preco: 40 });
    await A.sincronizar();
    await B.sincronizar();
    expect(B.s().estoque[item]?.quantidade).toBe(10);
    // os dois mexem sem saber um do outro
    A.s().moverEstoque({ itemId: item, tipo: 'saida', quantidade: -2 });
    B.s().moverEstoque({ itemId: item, tipo: 'saida', quantidade: -3 });
    B.s().moverEstoque({ itemId: item, tipo: 'entrada', quantidade: 6, custoUnitario: 22 });
    // e B ainda salva o cadastro do item (nome novo) com a tela velha
    B.s().salvarItemEstoque({ id: item, nome: 'Filtro de óleo PSL', categoria: 'filtro_oleo', unidade: 'un', quantidade: 999, minimo: 2, custo: 20, preco: 40 });
    await A.sincronizar();
    await B.sincronizar();
    await A.sincronizar();
    expect(A.s().estoque[item]?.quantidade).toBe(11);
    expect(B.s().estoque[item]?.quantidade).toBe(11);
    expect(A.s().estoque[item]?.nome).toBe('Filtro de óleo PSL');
  }, 60_000);

  it('sem internet, as mudanças esperam no aparelho e sobem quando ela volta', async () => {
    redeDoMec.fora = true;
    const c2 = B.s().salvarCliente({ nome: 'Carla', telefone: '' });
    const c3 = B.s().salvarCliente({ nome: 'Davi', telefone: '' });
    await B.sincronizar();
    expect(B.estados.at(-1)).toBe('sem-internet');
    expect(B.pendentes()).toBe(2);
    redeDoMec.fora = false;
    await B.sincronizar();
    expect(B.estados.at(-1)).toBe('em-dia');
    expect(B.pendentes()).toBe(0);
    await A.sincronizar();
    expect(A.s().clientes[c2]?.nome).toBe('Carla');
    expect(A.s().clientes[c3]?.nome).toBe('Davi');
  }, 60_000);

  it('o primeiro envio grande sobe em lotes e o aparelho novo busca em páginas', async () => {
    const n = 5000;
    const chamadasDoDono = contarChamadas(dono);
    const C = await novoAparelho(dono, oficinaId, {
      levar: true,
      preparar: (store) => {
        const clientes: Record<string, Cliente> = {};
        for (let i = 0; i < n; i++) {
          const id = `lote-${i}`;
          clientes[id] = { id, nome: `Cliente ${i}`, telefone: '', criadoEm: '2026-10-01T10:00:00.000Z' };
        }
        store.useOficina.setState({ clientes, configurado: true });
      }
    });
    expect(C.pendentes()).toBe(n + 3);
    await C.sincronizar();
    expect(C.pendentes()).toBe(0);
    expect(chamadasDoDono.gravar_registros).toBeGreaterThanOrEqual(Math.ceil((n + 3) / 200));

    const chamadasDoMec = contarChamadas(mec);
    const D = await novoAparelho(mec, oficinaId);
    await D.sincronizar();
    expect(Object.keys(D.s().clientes).filter((id) => id.startsWith('lote-'))).toHaveLength(n);
    // páginas de 1000: o aparelho novo precisou de várias
    expect(chamadasDoMec.ler_registros).toBeGreaterThanOrEqual(Math.ceil(n / 1000));
    // e o que já estava no banco também veio
    expect(Object.values(D.s().clientes).some((c) => c.nome === 'Ana Maria')).toBe(true);
    await A.sincronizar();
    expect(Object.keys(A.s().clientes).filter((id) => id.startsWith('lote-'))).toHaveLength(n);
    vi.restoreAllMocks();
  }, 180_000);

  it('quem não é da oficina fica sem acesso; quem saiu fica sem sessão e não perde o que fez', async () => {
    const intruso = await entrar(emails.intruso);
    const E = await novoAparelho(intruso, oficinaId);
    await E.sincronizar();
    expect(E.estados.at(-1)).toBe('sem-permissao');
    expect(Object.keys(E.s().clientes)).toHaveLength(0);

    await mec.auth.signOut({ scope: 'local' });
    const id = B.s().salvarCliente({ nome: 'Depois de sair', telefone: '' });
    await B.sincronizar();
    expect(B.estados.at(-1)).toBe('sem-sessao');
    expect(B.s().sinc.pendentes[`clientes|${id}`]).toBe(true);
  }, 60_000);
});
