// O agente do WhatsApp de ponta a ponta contra o Supabase local (banco, PostgREST e Storage pelo
// gateway de scripts/supabase-local): a Meta e a IA são simuladas; o resto é o de verdade.
// Os dados de teste ficam numa oficina própria, apagada no fim. Só roda com BANCO_TESTE_URL e com
// o gateway no ar.

import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const URL_BANCO = process.env.BANCO_TESTE_URL ?? '';
const SUPABASE = process.env.SUPABASE_TESTE_URL ?? 'http://127.0.0.1:54321';
const CHAVE_PUBLICA = process.env.SUPABASE_TESTE_CHAVE ?? 'sb_publishable_local';
const CHAVE_SISTEMA = process.env.SISTEMA_TESTE_CHAVE ?? 'chave-local-do-sistema-para-desenvolvimento-0001';
const SEGREDO_META = 'segredo-do-app-so-para-testes';

const fetchReal = globalThis.fetch;

async function gatewayNoAr(): Promise<boolean> {
  if (!URL_BANCO) return false;
  try {
    const r = await fetchReal(`${SUPABASE}/rest/v1/`, { headers: { apikey: CHAVE_PUBLICA }, signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

const ligado = await gatewayNoAr();

// a IA simulada: cada montagem tira a próxima resposta da fila (sem fila, monta certo)
const ia = vi.hoisted(() => ({ fila: [] as unknown[] }));
vi.mock('@/lib/agente/ia', async () => {
  const { esquemaOrdem } = await import('@/lib/agente/esquema');
  const ordem = esquemaOrdem.parse({
    placa: 'ABC1D23',
    km: 45210,
    veiculo: { marca: 'Chevrolet', modelo: 'Onix', motor: null, ano: 2021 },
    cliente: 'Marcos',
    servicos: [{ servico: 'troca_oleo', produto: 'Lubrax 5W-30', observacao: null }],
    diagnostico: '',
    recomendacoes: [],
    fotos: [],
    mensagemCliente: 'Olá, Marcos! Trocamos o óleo do Onix.',
    transcricao: 'troquei o óleo',
    duvidas: []
  });
  const proxima = async () => ia.fila.shift() ?? { ok: true, ordem, modelo: 'ia-de-teste' };
  return { interpretarComIA: vi.fn(proxima), preencherComIA: vi.fn(proxima), transcreverComIA: vi.fn(async () => ({ ok: true, texto: 'teste' })), estadoDaIA: vi.fn() };
});

// o after() do Next roda na hora e a promessa fica guardada para o teste esperar
const depois = vi.hoisted(() => ({ tarefas: [] as Promise<unknown>[] }));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: (f: () => unknown) => {
    depois.tarefas.push(Promise.resolve().then(f));
  }
}));

vi.stubEnv('SUPABASE_URL', SUPABASE);
vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', CHAVE_PUBLICA);
vi.stubEnv('EQUIPE_CHAVE', CHAVE_SISTEMA);
vi.stubEnv('SISTEMA_CHAVE', CHAVE_SISTEMA);
vi.stubEnv('WHATSAPP_TOKEN', 'token-de-teste');
vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890');
vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'verifica');
vi.stubEnv('WHATSAPP_APP_SECRET', SEGREDO_META);

const { tratarTodas, refazerComErro, NAO_LIGADO, SO_PRO } = await import('@/lib/agente/webhook');
const { configWhatsApp } = await import('@/lib/agente/whatsapp-cloud');
const rota = await import('@/app/api/whatsapp/route');
type Mensagem = Parameters<typeof tratarTodas>[1][number];

// ---------------------------------------------------------------- a Meta simulada

const enviadas: { para: string; texto: string }[] = [];
const midias = new Map<string, { url: string; mime: string }>();

function instalarMeta() {
  vi.stubGlobal('fetch', async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
    if (url.startsWith('https://graph.facebook.com/')) {
      if (url.endsWith('/messages')) {
        const corpo = JSON.parse(String(init?.body)) as { to: string; text: { body: string } };
        enviadas.push({ para: corpo.to, texto: corpo.text.body });
        return Response.json({ messages: [{ id: 'wamid.resposta' }] });
      }
      const m = midias.get(decodeURIComponent(url.split('/').pop() ?? ''));
      return m ? Response.json({ url: m.url, mime_type: m.mime, file_size: 1200 }) : new Response('{}', { status: 404 });
    }
    if (url.startsWith('https://lookaside.fbsbx.com/')) return new Response(new Uint8Array(1200).fill(1), { headers: { 'content-type': 'audio/ogg' } });
    if (!url.startsWith(SUPABASE)) throw new Error(`pedido inesperado para ${url}`);
    return fetchReal(entrada, init);
  });
}

let seq = 0;
const id = () => `wamid.teste.${Date.now()}.${++seq}`;
const texto = (de: string, t: string): Mensagem => ({ tipo: 'texto', de, id: id(), texto: t });
const audio = (de: string, midiaId: string): Mensagem => ({ tipo: 'audio', de, id: id(), midiaId, mime: 'audio/ogg' });
const telefone = () => `55219${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const para = (tel: string) => enviadas.filter((e) => e.para === tel).map((e) => e.texto);

// ---------------------------------------------------------------- dados da oficina de teste

let pool: pg.Pool;
let oficinaId = '';
let usuarioId = '';
const nome = `Oficina do Webhook ${Math.random().toString(36).slice(2, 7)}`;
const tel = telefone();

async function sql<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(texto, params)).rows as T[];
}

const mes = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
async function montagens(): Promise<number> {
  const [r] = await sql<{ quantidade: number }>(`select quantidade from public.uso_mensal where oficina_id = $1 and recurso = 'montagem' and mes = $2`, [oficinaId, mes()]);
  return r?.quantidade ?? 0;
}
async function rascunhos() {
  return sql<{ id: string; status: string; midias: { caminho: string }[]; tentativas: number }>(
    `select id, status, midias, tentativas from public.ordens_rascunho where oficina_id = $1 order by criado_em`,
    [oficinaId]
  );
}

const d = ligado ? describe : describe.skip;

d('agente do WhatsApp de ponta a ponta', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL_BANCO, max: 2 });
    usuarioId = randomUUID();
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(
        `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), now(), now(), '{}', '{}')`,
        [usuarioId, `webhook-${usuarioId.slice(0, 8)}@teste.dev`]
      );
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: usuarioId, role: 'authenticated', email: `webhook-${usuarioId.slice(0, 8)}@teste.dev` })]);
      await c.query('set local role authenticated');
      const r = await c.query(`select public.criar_oficina($1, '5521999990000', 'Rio', 'RJ', 'Rua A, 1') as id`, [nome]);
      oficinaId = String(r.rows[0].id);
      await c.query('reset role');
      // no teste do Pro (o agente é do Pro)
      await c.query(`update public.oficinas set teste_ate = current_date + 10 where id = $1`, [oficinaId]);
      await c.query('commit');
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    instalarMeta();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!pool) return;
    if (oficinaId) {
      await pool.query(`delete from storage.objects where bucket_id = 'oficinas' and name like $1`, [`${oficinaId}/%`]).catch(() => {});
      await pool.query('delete from public.oficinas where id = $1', [oficinaId]);
    }
    if (usuarioId) await pool.query('delete from auth.users where id = $1', [usuarioId]);
    await pool.end();
  });

  it('o webhook confere a assinatura e só trata o que a Meta assinou', async () => {
    const corpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{ from: telefone(), id: id(), type: 'text', text: { body: 'oi' } }] } }] }]
    });
    const pedir = (assinatura: string) =>
      rota.POST(new Request('http://localhost/api/whatsapp', { method: 'POST', body: corpo, headers: { 'x-hub-signature-256': assinatura } }) as never);
    expect((await pedir('sha256=00')).status).toBe(401);
    depois.tarefas.length = 0;
    const r = await pedir(`sha256=${createHmac('sha256', SEGREDO_META).update(corpo).digest('hex')}`);
    expect(r.status).toBe(200);
    expect(depois.tarefas).toHaveLength(1);
    await Promise.all(depois.tarefas);
  });

  it('número desconhecido recebe uma instrução por dia e nada fica guardado', async () => {
    const estranho = telefone();
    await tratarTodas(configWhatsApp()!, [texto(estranho, 'bom dia'), audio(estranho, 'audio-x')]);
    await tratarTodas(configWhatsApp()!, [texto(estranho, 'oi de novo')]);
    expect(para(estranho)).toEqual([NAO_LIGADO]);
    expect(await sql(`select 1 from public.ordens_rascunho where telefone = $1`, [estranho])).toEqual([]);
  });

  it('liga o número pelo código, que vale uma vez', async () => {
    const codigo = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    await sql(`insert into public.whatsapp_codigos (codigo, oficina_id, oficina_nome, expira_em) values ($1, $2, $3, now() + interval '15 minutes')`, [codigo, oficinaId, nome]);
    await tratarTodas(configWhatsApp()!, [texto(tel, `conectar ${codigo === '00000000' ? '00000001' : '00000000'}`)]);
    expect(para(tel).at(-1)).toContain('Esse código não vale');
    await tratarTodas(configWhatsApp()!, [texto(tel, `Conectar ${codigo}`)]);
    expect(para(tel).at(-1)).toContain(`Pronto! Este WhatsApp está ligado à ${nome}`);
    expect(await sql(`select oficina_id from public.whatsapp_vinculos where telefone = $1`, [tel])).toEqual([{ oficina_id: oficinaId }]);
    expect(await sql(`select 1 from public.whatsapp_codigos where codigo = $1`, [codigo])).toEqual([]);
    // as tentativas contam no banco, com o número embaralhado (o telefone não fica guardado)
    const marca = createHmac('sha256', CHAVE_SISTEMA).update(tel).digest('hex').slice(0, 32);
    expect(await sql(`select n from privado.limites where chave = $1`, [`wa:conectar:${marca}`])).toEqual([{ n: 2 }]);
    expect(await sql(`select 1 from privado.limites where chave like $1`, [`%${tel}%`])).toEqual([]);
  });

  it('o áudio fica na pasta da oficina e fechar monta a ordem gastando uma da cota', async () => {
    midias.set('audio-1', { url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', mime: 'audio/ogg' });
    await tratarTodas(configWhatsApp()!, [audio(tel, 'audio-1')]);
    expect(para(tel).at(-1)).toContain('Recebi');
    const [r] = await rascunhos();
    expect(r.status).toBe('aberta');
    expect(r.midias[0].caminho.startsWith(`${oficinaId}/${r.id}/`)).toBe(true);
    expect(await sql(`select 1 from storage.objects where bucket_id = 'oficinas' and name = $1`, [r.midias[0].caminho])).toHaveLength(1);

    const antes = await montagens();
    await tratarTodas(configWhatsApp()!, [texto(tel, 'fechar')]);
    const respostas = para(tel).slice(-3);
    expect(respostas[0]).toContain('Montando a ordem');
    expect(respostas[1]).toContain('/oficina/ordem');
    expect(respostas[2]).toBe('Olá, Marcos! Trocamos o óleo do Onix.');
    expect((await rascunhos())[0].status).toBe('pronta');
    expect(await montagens()).toBe(antes + 1);
    expect(await sql(`select 1 from privado.uso_chaves where oficina_id = $1 and chave = $2`, [oficinaId, `wa:${r.id}`])).toHaveLength(1);
  });

  it('mídia que não vem da Meta é recusada', async () => {
    midias.set('audio-2', { url: 'https://coletor.evil.dev/x', mime: 'audio/ogg' });
    await tratarTodas(configWhatsApp()!, [audio(tel, 'audio-2')]);
    expect(para(tel).at(-1)).toContain('Não consegui receber esse arquivo');
  });

  it('a IA falhou: a cota volta, o rascunho fica com erro e a rotina diária monta depois', async () => {
    midias.set('audio-3', { url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=3', mime: 'audio/ogg' });
    await tratarTodas(configWhatsApp()!, [audio(tel, 'audio-3')]);
    const antes = await montagens();
    ia.fila.push({ ok: false, erro: 'A IA não respondeu.' });
    await tratarTodas(configWhatsApp()!, [texto(tel, 'fechar')]);
    expect(para(tel).at(-1)).toContain('A IA não respondeu.');
    const comErro = (await rascunhos()).find((x) => x.status === 'erro');
    expect(comErro?.tentativas).toBe(1);
    expect(await montagens()).toBe(antes);

    const r = await refazerComErro(Date.now() + 60_000);
    expect(r.montados).toBeGreaterThanOrEqual(1);
    expect((await rascunhos()).find((x) => x.id === comErro?.id)?.status).toBe('pronta');
    expect(para(tel).at(-1)).toContain('A ordem que tinha dado erro ficou pronta');
    expect(await montagens()).toBe(antes + 1);
  });

  it('sem cota no mês, fechar avisa e o rascunho continua guardado', async () => {
    await sql(
      `insert into public.uso_mensal (oficina_id, mes, recurso, quantidade) values ($1, $2, 'montagem', 300)
       on conflict (oficina_id, mes, recurso) do update set quantidade = 300`,
      [oficinaId, mes()]
    );
    midias.set('audio-4', { url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=4', mime: 'audio/ogg' });
    await tratarTodas(configWhatsApp()!, [audio(tel, 'audio-4'), texto(tel, 'fechar')]);
    expect(para(tel).at(-1)).toContain('As ordens por voz do mês acabaram');
    expect((await rascunhos()).at(-1)?.status).toBe('aberta');
    expect(await montagens()).toBe(300);
  });

  it('cancelar joga fora o que estava aberto', async () => {
    await tratarTodas(configWhatsApp()!, [texto(tel, 'cancelar')]);
    expect(para(tel).at(-1)).toContain('Joguei fora');
    const ultimo = (await rascunhos()).at(-1);
    expect(ultimo?.status).toBe('descartada');
    expect(ultimo?.midias).toEqual([]);
  });

  it('no grátis, o agente avisa que é do Pro uma vez por dia', async () => {
    await sql(`update public.oficinas set teste_ate = null where id = $1`, [oficinaId]);
    const n = para(tel).length;
    await tratarTodas(configWhatsApp()!, [texto(tel, 'oi'), audio(tel, 'audio-1')]);
    expect(para(tel).slice(n)).toEqual([SO_PRO]);
  });
});
