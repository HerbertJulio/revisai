// Ponta a ponta no navegador: o dono e o mecânico em navegadores separados, a internet caindo no
// meio, "Levar para a conta", sair (a cópia dos dados sai do aparelho) e entrar de novo.
// Roda com E2E_URL (o app, ex.: http://localhost:3107) e SUPABASE_TESTE_URL (o gateway local,
// de onde vêm os códigos do e-mail). O gateway local não tem tempo real: o app vive da busca de
// reserva, que é o caminho sem tempo real. Com BANCO_TESTE_URL, apaga no fim o que criou.
// E2E_FOTOS=<pasta> guarda a tela de cada navegador se algo falhar.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const APP = process.env.E2E_URL ?? '';
const SB = process.env.SUPABASE_TESTE_URL ?? 'http://127.0.0.1:54321';
const CHAVE = process.env.SUPABASE_TESTE_CHAVE ?? 'sb_publishable_local';
const d = APP ? describe : describe.skip;

// o Playwright fica fora do projeto (não é dependência do app)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualquer = any;
function playwright(): Qualquer {
  const require = createRequire(path.join(process.env.PLAYWRIGHT_MODULOS ?? '/opt/npm-tools/node_modules', 'x.js'));
  return require('playwright');
}

const marca = Date.now().toString(36);
const emails = { dono: `e2e-sinc-dono-${marca}@teste.dev`, mec: `e2e-sinc-mec-${marca}@teste.dev` };
const LONGO = 60_000;

async function codigoDoEmail(email: string, desde: number): Promise<string> {
  for (let i = 0; i < 120; i++) {
    const lista = (await (await fetch(`${SB}/__mail?para=${encodeURIComponent(email)}`)).json()) as { quando: number; texto: string; html: string }[];
    const m = lista.filter((x) => x.quando >= desde).at(-1);
    const cod = m && `${m.texto} ${m.html}`.match(/\b(\d{6})\b/);
    if (cod) return cod[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`sem e-mail para ${email}`);
}

/** Espera o React assumir o elemento (no modo de desenvolvimento a página chega antes do JS). */
async function esperarReact(p: Qualquer, seletor: string) {
  await p.waitForFunction(
    (s: string) => {
      const el = document.querySelector(s);
      return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
    },
    seletor,
    { timeout: LONGO }
  );
}

/**
 * Entra pelo código do e-mail, como a pessoa faria, e aceita os termos se pedir. `depois` é o que
 * a tela mostra quando terminou de entrar (o formulário da oficina, o convite, a oficina...).
 */
async function entrar(p: Qualquer, email: string, depois: (p: Qualquer) => Qualquer) {
  await p.goto(`${APP}/entrar?para=%2Foficina`, { timeout: LONGO });
  await esperarReact(p, '#email-entrada');
  // sem o Google ligado no servidor, o botão não aparece
  expect(await p.getByRole('button', { name: 'Entrar com Google' }).count()).toBe(0);
  const desde = Date.now();
  await p.fill('#email-entrada', email);
  await p.getByRole('button', { name: 'Receber o código' }).click();
  await p.waitForSelector('#codigo-entrada', { timeout: LONGO });
  // o código completo confere sozinho, sem tocar no botão
  await p.fill('#codigo-entrada', await codigoDoEmail(email, desde));
  await p.waitForURL((u: URL) => !u.pathname.startsWith('/entrar'), { timeout: LONGO });
  const termos = p.getByRole('button', { name: 'Aceitar e continuar' });
  // o que aparecer primeiro (as duas esperas terminam sem erro solto)
  await Promise.race([termos.waitFor({ timeout: LONGO }).catch(() => {}), depois(p).first().waitFor({ timeout: LONGO }).catch(() => {})]);
  if (await termos.isVisible()) {
    await esperarReact(p, 'input[type="checkbox"]');
    await p.locator('input[type="checkbox"]').check();
    await termos.click();
  }
  await depois(p).first().waitFor({ timeout: LONGO });
}

const naOficina = (p: Qualquer) => p.locator('aside').getByText(/Salvo na nuvem|Salvando/);

async function noIndicador(p: Qualquer, texto: RegExp, timeout = LONGO) {
  await p.locator('aside').getByText(texto).first().waitFor({ timeout });
}

async function lerAparelho(p: Qualquer): Promise<{ clientes: Record<string, unknown>; contaOficinaId: string | null } | null> {
  const bruto = await p.evaluate(
    () =>
      new Promise<string | null>((res) => {
        const r = indexedDB.open('keyval-store');
        r.onerror = () => res(null);
        r.onsuccess = () => {
          try {
            const g = r.result.transaction('keyval', 'readonly').objectStore('keyval').get('revisai:oficina');
            g.onsuccess = () => res((g.result as string | undefined) ?? null);
            g.onerror = () => res(null);
          } catch {
            res(null);
          }
        };
      })
  );
  return bruto ? JSON.parse(bruto).state : null;
}

d('sincronização no navegador', () => {
  let navegador: Qualquer;
  const contextos: Qualquer[] = [];
  const paginas: Record<string, Qualquer> = {};
  let oficinaId = '';
  let carroUrl = '';
  let sbDono: Qualquer = null;

  /** Espera o banco ter um cliente com este nome (conferido pela conta do dono). */
  async function noBanco(nome: string, ms = 45_000) {
    const ate = Date.now() + ms;
    while (Date.now() < ate) {
      const { data } = await sbDono.rpc('ler_registros', { p_oficina: oficinaId, p_desde: 0, p_limite: 2000 });
      const itens = ((data as { itens?: { colecao: string; dados: { nome?: string } | null }[] } | null)?.itens ?? []).filter((x) => x.colecao === 'clientes');
      if (itens.some((x) => x.dados?.nome === nome)) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`o cliente ${nome} não chegou ao banco`);
  }

  async function fechar(nome: string) {
    const p = paginas[nome];
    if (!p) return;
    const pasta = process.env.E2E_FOTOS;
    if (pasta) {
      fs.mkdirSync(pasta, { recursive: true });
      await p.screenshot({ path: path.join(pasta, `sincronia-${nome}.png`), fullPage: true }).catch(() => {});
    }
    await p.context().close().catch(() => {});
    delete paginas[nome];
  }

  async function novaPagina(nome: string) {
    const c = await navegador.newContext({ viewport: { width: 1280, height: 860 }, locale: 'pt-BR' });
    contextos.push(c);
    const p = await c.newPage();
    p.setDefaultTimeout(LONGO);
    p.on('crash', () => console.error(`[e2e] a página ${nome} caiu em ${p.url()}`));
    p.on('pageerror', (e: Error) => console.error(`[e2e] erro na página ${nome}:`, String(e).slice(0, 300)));
    paginas[nome] = p;
    return { c, p };
  }

  beforeAll(async () => {
    // o gateway local não libera no CORS o cabeçalho de versão que o cliente de login manda
    // (o Supabase de verdade libera); aqui o navegador de teste não confere o CORS
    navegador = await playwright().chromium.launch({ args: ['--disable-dev-shm-usage', ...(process.env.E2E_CORS_LIVRE === '0' ? [] : ['--disable-web-security'])] });
  }, LONGO);

  afterAll(async () => {
    const pasta = process.env.E2E_FOTOS;
    if (pasta) {
      fs.mkdirSync(pasta, { recursive: true });
      for (const [nome, p] of Object.entries(paginas)) await p.screenshot({ path: path.join(pasta, `sincronia-${nome}.png`), fullPage: true }).catch(() => {});
    }
    await navegador?.close();
    if (!process.env.BANCO_TESTE_URL) return;
    const pool = new pg.Pool({ connectionString: process.env.BANCO_TESTE_URL, max: 1 });
    try {
      if (oficinaId) await pool.query('delete from public.oficinas where id = $1', [oficinaId]);
      await pool.query('delete from auth.users where email = any($1)', [Object.values(emails)]);
    } finally {
      await pool.end();
    }
  }, LONGO);

  it('o dono entra, cria a oficina e o primeiro cliente sobe para a nuvem', async () => {
    const { p } = await novaPagina('dono');
    await entrar(p, emails.dono, (x) => x.locator('#of-nome'));
    await esperarReact(p, '#of-nome');
    await p.fill('#of-nome', 'Oficina E2E Sincronia');
    await p.fill('#of-whats', '21999990000');
    await p.fill('#of-cidade', 'Rio');
    await p.getByRole('button', { name: 'Criar a oficina' }).click();
    await p.waitForURL(/\/oficina$/);
    await noIndicador(p, /Salvo na nuvem/);

    await p.goto(`${APP}/oficina/clientes`);
    await esperarReact(p, 'main button');
    await p.getByRole('button', { name: 'Cliente novo' }).click();
    await p.fill('#cli-nome', 'Cliente do Dono');
    await p.fill('#v-placa', 'ABC1D23');
    await p.fill('#v-modelo', 'Onix');
    await p.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
    await p.waitForURL(/\/oficina\/carro\?id=/);
    carroUrl = p.url();
    await noIndicador(p, /Salvo na nuvem/);
  }, 240_000);

  it('o mecânico convidado aceita na conta e vê os dados da oficina', async () => {
    // o convite sai pela conta do dono (como em Ajustes, na parte Equipe)
    const sb = createClient(SB, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
    sbDono = sb;
    const desde = Date.now();
    await sb.auth.signInWithOtp({ email: emails.dono });
    await sb.auth.verifyOtp({ email: emails.dono, token: await codigoDoEmail(emails.dono, desde), type: 'email' });
    const conta = (await sb.rpc('minha_conta')).data as { oficinas: { id: string }[] };
    oficinaId = conta.oficinas[0].id;
    const convite = await sb.rpc('convidar', { p_tipo: 'oficina', p_alvo: oficinaId, p_email: emails.mec, p_papel: 'mecanico' });
    expect(convite.error).toBeNull();

    const { p } = await novaPagina('mecanico');
    await entrar(p, emails.mec, (x) => x.getByRole('button', { name: 'Aceitar', exact: true }));
    const aceitar = p.getByRole('button', { name: 'Aceitar', exact: true });
    await esperarReact(p, 'main button');
    await aceitar.click();
    // com uma oficina só, a conta já abre a oficina
    await p.waitForURL(/\/oficina$/);
    await p.goto(carroUrl);
    await p.getByText('Cliente do Dono').first().waitFor();
    await noIndicador(p, /Salvo na nuvem/);
  }, 240_000);

  it('sem internet, a mudança fica no aparelho e sobe quando a internet volta; o outro recebe sem tempo real', async () => {
    const p = paginas.mecanico;
    const c = contextos[1];
    await esperarReact(p, 'main button');
    await c.setOffline(true);
    await p.getByRole('button', { name: 'Editar cliente' }).click();
    await p.fill('#cli-nome', 'Cliente Editado Sem Internet');
    await p.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
    await noIndicador(p, /Sem internet/, 20_000);
    const guardado = await lerAparelho(p);
    expect(Object.values(guardado?.clientes ?? {}).some((x) => (x as { nome: string }).nome === 'Cliente Editado Sem Internet')).toBe(true);
    await c.setOffline(false);
    await noIndicador(p, /Salvo na nuvem/, 30_000);
    // o dono, com a mesma tela aberta, recebe pela busca de reserva (o local não tem tempo real)
    const dono = paginas.dono;
    await dono.getByText('Cliente Editado Sem Internet').first().waitFor({ timeout: 45_000 });
    // a máquina de teste tem pouca memória: o navegador do dono não volta a ser usado
    await fechar('dono');
  }, 180_000);

  it('quem usava sem conta leva os dados do aparelho para a oficina', async () => {
    const { p } = await novaPagina('local');
    await p.goto(`${APP}/oficina`);
    await esperarReact(p, '#nome');
    await p.fill('#nome', 'Oficina do Aparelho');
    await p.getByRole('button', { name: 'Testar do zero' }).click();
    await p.goto(`${APP}/oficina/clientes`);
    await esperarReact(p, 'main button');
    await p.getByRole('button', { name: 'Cliente novo' }).click();
    await p.fill('#cli-nome', 'Cliente de Antes da Conta');
    await p.fill('#v-placa', 'LOC1A23');
    await p.fill('#v-modelo', 'Gol');
    await p.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
    await p.waitForURL(/\/oficina\/carro\?id=/);

    await entrar(p, emails.dono, (x) => x.getByRole('heading', { name: /Levar os dados deste aparelho/ }));
    await p.getByRole('button', { name: 'Levar para a conta' }).click();
    await noIndicador(p, /Salvo na nuvem/);
    await noBanco('Cliente de Antes da Conta');
    // e o aparelho recebeu o que já estava na oficina
    await p.goto(`${APP}/oficina/clientes`);
    await p.getByText('Cliente Editado Sem Internet').first().waitFor({ timeout: 45_000 });
    await p.getByText('Cliente de Antes da Conta').first().waitFor();
    await fechar('local');
  }, 240_000);

  it('sair tira a cópia dos dados do aparelho; entrando de novo, eles voltam', async () => {
    const p = paginas.mecanico;
    await p.goto(`${APP}/oficina/clientes`);
    await noIndicador(p, /Salvo na nuvem/);
    await p.getByRole('button', { name: `Sua conta: ${emails.mec}` }).click();
    await p.getByRole('dialog').getByRole('button', { name: 'Sair', exact: true }).click();
    await p.waitForURL((u: URL) => u.pathname === '/');
    const depois = await lerAparelho(p);
    expect(depois?.contaOficinaId ?? null).toBeNull();
    expect(Object.keys(depois?.clientes ?? {})).toHaveLength(0);
    await p.goto(`${APP}/oficina`);
    await p.getByRole('heading', { name: 'Vamos montar a sua oficina' }).waitFor();

    await entrar(p, emails.mec, naOficina);
    await p.goto(`${APP}/oficina/clientes`);
    await p.getByText('Cliente de Antes da Conta').first().waitFor({ timeout: 45_000 });
    await p.getByText('Cliente Editado Sem Internet').first().waitFor();
  }, 240_000);
});
