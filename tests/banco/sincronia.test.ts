import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, URL_BANCO, type Banco, type Pessoa } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

type Item = { colecao: string; id: string; dados: Record<string, unknown>; apagado?: boolean };

async function gravar(b: Banco, p: Pessoa, oficina: string, itens: Item[]) {
  const [r] = await linhas(b, p, 'select public.gravar_registros($1, $2::jsonb) as r', [oficina, JSON.stringify(itens)]);
  return r.r as { colecao: string; id: string; versao: number }[];
}

function doc(id: string, tipo: 'ordem' | 'orcamento', numero: unknown, extra: Record<string, unknown> = {}): Item {
  return { colecao: 'documentos', id, dados: { id, tipo, numero, situacao: 'aberta', linhas: [], ...extra } };
}

async function numeros(b: Banco, oficina: string): Promise<Record<string, number | null>> {
  const r = await b.query(`select id, privado.numero_inteiro(dados -> 'numero') as n from public.registros where oficina_id = $1 and colecao = 'documentos' and not apagado`, [oficina]);
  return Object.fromEntries(r.rows.map((x) => [x.id, x.n == null ? null : Number(x.n)]));
}

async function contadores(b: Banco, oficina: string): Promise<{ dados: Record<string, number>; versao: number } | null> {
  const r = await b.query(`select dados, versao from public.registros where oficina_id = $1 and colecao = 'config' and id = 'contadores'`, [oficina]);
  return r.rows[0] ? { dados: r.rows[0].dados, versao: Number(r.rows[0].versao) } : null;
}

d('numeração dos documentos com vários aparelhos', () => {
  it('número repetido ganha o próximo livre, e o contador acompanha', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const o = await criarOficina(b, dono, 'Oficina Numeração');
      // dois aparelhos sem internet deram o número 1 a ordens diferentes
      await gravar(b, dono, o, [doc('a', 'ordem', 1)]);
      await gravar(b, dono, o, [doc('b', 'ordem', 1)]);
      // orçamento tem a sua própria sequência
      await gravar(b, dono, o, [doc('c', 'orcamento', 1)]);
      expect(await numeros(b, o)).toEqual({ a: 1, b: 2, c: 1 });
      expect((await contadores(b, o))?.dados).toEqual({ ordem: 2, orcamento: 1 });
      // o aparelho recebe o número novo na busca
      const [lido] = await linhas(b, dono, 'select public.ler_registros($1, 0) as r', [o]);
      const itens = (lido.r as { itens: { colecao: string; id: string; dados: { numero: number } }[] }).itens;
      expect(itens.find((x) => x.id === 'b')?.dados.numero).toBe(2);
    }));

  it('a cópia atrasada de um aparelho não troca o número que o banco deu', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const o = await criarOficina(b, dono);
      await gravar(b, dono, o, [doc('a', 'ordem', 5), doc('b', 'ordem', 5)]);
      expect(await numeros(b, o)).toEqual({ a: 5, b: 6 });
      const antes = await contadores(b, o);
      // o aparelho de b editou de novo antes de buscar: manda o 5 outra vez
      await gravar(b, dono, o, [doc('b', 'ordem', 5, { observacao: 'trocar a correia' })]);
      // e um aparelho velho manda a com outro número
      await gravar(b, dono, o, [doc('a', 'ordem', 9)]);
      expect(await numeros(b, o)).toEqual({ a: 5, b: 6 });
      const depois = await contadores(b, o);
      // o contador não subiu à toa (sem pular números)
      expect(depois?.dados).toEqual({ ordem: 6 });
      expect(depois?.versao).toBe(antes?.versao);
    }));

  it('o contador nunca fica abaixo do maior número em uso, e o maior dos dois vale para o próximo', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const o = await criarOficina(b, dono);
      await gravar(b, dono, o, [doc('a', 'ordem', 1), doc('b', 'ordem', 2)]);
      // um aparelho com o contador velho
      await gravar(b, dono, o, [{ colecao: 'config', id: 'contadores', dados: { ordem: 0, orcamento: 3 } }]);
      expect((await contadores(b, o))?.dados).toEqual({ ordem: 2, orcamento: 3 });
      // subir o contador pode (documentos apagados deixam o contador na frente)
      await gravar(b, dono, o, [{ colecao: 'config', id: 'contadores', dados: { ordem: 10, orcamento: 3 } }]);
      await gravar(b, dono, o, [doc('c', 'ordem', 2)]);
      expect((await numeros(b, o)).c).toBe(11);
      expect((await contadores(b, o))?.dados).toEqual({ ordem: 11, orcamento: 3 });
    }));

  it('documento apagado libera o número; número inválido ganha um número', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const o = await criarOficina(b, dono);
      await gravar(b, dono, o, [doc('a', 'orcamento', 1)]);
      await gravar(b, dono, o, [{ colecao: 'documentos', id: 'a', dados: {}, apagado: true }]);
      await gravar(b, dono, o, [doc('b', 'orcamento', 1)]);
      await gravar(b, dono, o, [doc('c', 'orcamento', 'dois'), doc('d', 'orcamento', null), doc('e', 'orcamento', 2.5)]);
      expect(await numeros(b, o)).toEqual({ b: 1, c: 2, d: 3, e: 4 });
      // voltar um documento apagado confere o número de novo
      await gravar(b, dono, o, [doc('a', 'orcamento', 1)]);
      expect((await numeros(b, o)).a).toBe(5);
    }));

  it('o mecânico cria documentos e o contador sobe, mesmo sem ele poder mudar a config', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const mec = await criarPessoa(b, pessoa('num-mec'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email]);
      await linhas(b, mec, 'select public.aceitar_convite() as n');
      await gravar(b, dono, o, [doc('a', 'ordem', 1)]);
      const r = await gravar(b, mec, o, [doc('b', 'ordem', 1), { colecao: 'config', id: 'contadores', dados: { ordem: 1 } }]);
      // a linha da config que o mecânico mandou não entra, mas o banco cuida do contador
      expect(r.map((x) => x.colecao)).toEqual(['documentos']);
      expect(await numeros(b, o)).toEqual({ a: 1, b: 2 });
      expect((await contadores(b, o))?.dados).toEqual({ ordem: 2 });
    }));

  it('quem não é da oficina continua sem gravar', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const outro = await criarPessoa(b, pessoa('num-outro'));
      const o = await criarOficina(b, dono);
      const r = await tentar(b, outro, 'select public.gravar_registros($1, $2::jsonb)', [o, JSON.stringify([doc('x', 'ordem', 1)])]);
      expect(r.codigo).toBe('42501');
      // e as funções de apoio não ficam abertas
      expect((await tentar(b, dono, `select privado.maior_numero($1, 'ordem', '')`, [o])).codigo).toBe('42501');
    }));

  it('documentos que já estavam repetidos antes da regra ganham números livres', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('num-dono'));
      const o = await criarOficina(b, dono);
      await b.query('alter table public.registros disable trigger registros_numeracao');
      for (const [id, quando] of [
        ['velho', '2026-10-01T10:00:00Z'],
        ['meio', '2026-10-02T10:00:00Z'],
        ['novo', '2026-10-03T10:00:00Z']
      ])
        await b.query(`insert into public.registros (oficina_id, colecao, id, dados, atualizado_em) values ($1, 'documentos', $2, $3, $4)`, [o, id, JSON.stringify({ id, tipo: 'ordem', numero: 4 }), quando]);
      await b.query('alter table public.registros enable trigger registros_numeracao');
      const sql = fs.readFileSync(new URL('../../supabase/migrations/20261017080000_sincronia_numeracao.sql', import.meta.url), 'utf8');
      const correcao = sql.slice(sql.lastIndexOf('do $$'));
      await b.query(correcao);
      expect(await numeros(b, o)).toEqual({ velho: 4, meio: 5, novo: 6 });
      expect((await contadores(b, o))?.dados).toEqual({ ordem: 6 });
    }));
});

// Dois aparelhos gravando ao mesmo tempo, cada um na sua transação: aqui os dados são gravados de
// verdade (e apagados no fim), porque uma transação só não mostra a espera de uma pela outra.
d('numeração com gravações ao mesmo tempo', () => {
  it('a segunda gravação espera a primeira e pega o próximo número', async () => {
    const pool = new pg.Pool({ connectionString: URL_BANCO, max: 3 });
    const dono = pessoa('num-paralelo');
    let oficina: string | null = null;
    const como = async (c: pg.PoolClient) => {
      const claims = { sub: dono.id, role: 'authenticated', email: dono.email, aal: 'aal1', aud: 'authenticated', amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 60 }] };
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await c.query('set local role authenticated');
    };
    try {
      const prep = await pool.connect();
      try {
        await prep.query(
          `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
           values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), now(), now(), '{}', '{}')`,
          [dono.id, dono.email]
        );
        await prep.query('begin');
        await como(prep);
        oficina = String((await prep.query(`select public.criar_oficina('Oficina Paralela', '5521999990000', 'Rio', 'RJ', 'Rua A, 1') as id`)).rows[0].id);
        await prep.query('commit');
      } finally {
        prep.release();
      }

      const a = await pool.connect();
      const b = await pool.connect();
      try {
        await a.query('begin');
        await como(a);
        await a.query('select public.gravar_registros($1, $2::jsonb)', [oficina, JSON.stringify([doc(`p-${randomUUID()}`, 'ordem', 7)])]);
        await b.query('begin');
        await como(b);
        let terminou = false;
        const segunda = b.query('select public.gravar_registros($1, $2::jsonb)', [oficina, JSON.stringify([doc('p-segunda', 'ordem', 7)])]).then((r) => {
          terminou = true;
          return r;
        });
        await new Promise((r) => setTimeout(r, 400));
        // sem o cadeado, a segunda não veria a primeira (ainda aberta) e gravaria o 7 também
        expect(terminou).toBe(false);
        await a.query('commit');
        await segunda;
        await b.query('commit');
      } finally {
        a.release();
        b.release();
      }
      const r = await pool.query(`select id, (dados ->> 'numero')::int as n from public.registros where oficina_id = $1 and colecao = 'documentos' order by n`, [oficina]);
      expect(r.rows.map((x) => x.n)).toEqual([7, 8]);
      expect(r.rows[1].id).toBe('p-segunda');
    } finally {
      if (oficina) await pool.query('delete from public.oficinas where id = $1', [oficina]).catch(() => {});
      await pool.query('delete from auth.users where id = $1', [dono.id]).catch(() => {});
      await pool.end();
    }
  });
});
