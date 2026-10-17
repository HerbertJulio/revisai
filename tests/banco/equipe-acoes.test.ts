import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

type Json = Record<string, unknown>;

async function rpc<T = Json>(b: Banco, p: Pessoa | null, sql: string, params: unknown[] = []): Promise<T> {
  const [r] = await linhas(b, p, `select ${sql} as r`, params);
  return r.r as T;
}

async function hoje(b: Banco): Promise<string> {
  const r = await b.query(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d`);
  return String(r.rows[0].d);
}

async function maisMeses(b: Banco, dia: string, meses: number): Promise<string> {
  const r = await b.query(`select to_char(($1::date + make_interval(months => $2))::date, 'YYYY-MM-DD') as d`, [dia, meses]);
  return String(r.rows[0].d);
}

d('Pro direto na oficina', () => {
  it('o financeiro dá e estende o Pro, com a assinatura ligada à oficina e tudo no histórico', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const fin = await criarPessoa(b, pessoa('fin', { totpHa: 60 }));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, fin, 'financeiro');
      await criarEquipe(b, sup, 'suporte');
      const o = await criarOficina(b, dono, 'Oficina do Pro');
      const dia = await hoje(b);

      const r1 = await rpc<{ ate: string; assinatura: number; codigo: string }>(b, fin, 'public.equipe_dar_pro($1, 3, 89.7, $2)', [o, 'Pix em 16/10']);
      expect(r1.ate).toBe(await maisMeses(b, dia, 3));
      expect(r1.codigo).toMatch(/^[0-9A-Z]{16}$/);
      const [a] = (await b.query(`select oficina_id, oficina_nome, meses, valor::float as valor, observacao from public.assinaturas where id = $1`, [r1.assinatura])).rows;
      expect(a).toMatchObject({ oficina_id: o, oficina_nome: 'Oficina do Pro', meses: 3, valor: 89.7, observacao: 'Pix em 16/10' });

      // estender conta a partir do fim do Pro atual
      const r2 = await rpc<{ ate: string }>(b, fin, 'public.equipe_dar_pro($1, 1)', [o]);
      expect(r2.ate).toBe(await maisMeses(b, r1.ate, 1));
      const [of] = (await b.query(`select to_char(pro_ate, 'YYYY-MM-DD') as pro_ate from public.oficinas where id = $1`, [o])).rows;
      expect(of.pro_ate).toBe(r2.ate);

      // a oficina passa a ser contada como Pro no plano
      const [plano] = (await b.query(`select privado.plano_da_oficina($1) as p`, [o])).rows;
      expect(plano.p).toBe('pro');

      // quem fez fica no histórico (a assinatura e a mudança na oficina)
      const historico = (await b.query(`select tabela, acao, email from privado.auditoria where email = $1 order by id`, [fin.email])).rows;
      expect(historico).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tabela: 'public.assinaturas', acao: 'insert' }),
          expect.objectContaining({ tabela: 'public.oficinas', acao: 'update' })
        ])
      );

      // suporte, a oficina e gente de fora não dão Pro; meses fora do combinado também não
      expect((await tentar(b, sup, 'select public.equipe_dar_pro($1, 1)', [o])).codigo).toBe('42501');
      expect((await tentar(b, dono, 'select public.equipe_dar_pro($1, 1)', [o])).codigo).toBe('42501');
      expect((await tentar(b, null, 'select public.equipe_dar_pro($1, 1)', [o])).erro).toBeTruthy();
      expect((await tentar(b, fin, 'select public.equipe_dar_pro($1, 0)', [o])).codigo).toBe('22023');
      expect((await tentar(b, fin, 'select public.equipe_dar_pro($1, 1, -5)', [o])).codigo).toBe('22023');
      expect((await tentar(b, fin, `select public.equipe_dar_pro('00000000-0000-0000-0000-000000000001', 1)`)).codigo).toBe('P0001');
    }));

  it('o código vencido da equipe (mais de 12 horas) não dá Pro', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const velho = await criarPessoa(b, pessoa('velho', { totpHa: 13 * 3600 }));
      await criarEquipe(b, velho, 'financeiro');
      const o = await criarOficina(b, dono, 'Oficina Velha');
      expect((await tentar(b, velho, 'select public.equipe_dar_pro($1, 1)', [o])).codigo).toBe('42501');
    }));
});

d('alertas de preço por oficina', () => {
  it('conta os do mês, os pacotes liberados e os gastos', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const fin = await criarPessoa(b, pessoa('fin', { totpHa: 60 }));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, fin, 'financeiro');
      await criarEquipe(b, sup, 'suporte');
      const o = await criarOficina(b, dono, 'Oficina dos Alertas');
      await b.query(`update public.oficinas set pro_ate = current_date + 30 where id = $1`, [o]);
      const loja = await criarLoja(b, lojista);
      const produtos: number[] = [];
      for (let i = 0; i < 3; i++) {
        const p = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco) values ($1, 'oleo_motor', $2, 'un', 50) returning id`, [loja.fornecedorId, `Óleo ${i}`]);
        produtos.push(Number(p.rows[0].id));
      }
      for (const produto of produtos)
        await linhas(
          b,
          dono,
          `insert into public.alertas_preco (oficina_id, oficina_uf, categoria, titulo, produto_id, quantidade, preco_alvo, expira_em) values ($1, 'RJ', 'oleo_motor', 'Óleo', $2, 4, 30, now() + interval '48 hours')`,
          [o, produto]
        );
      // um cancelado sem proposta não conta
      const [primeiro] = await linhas(b, dono, `select id from public.alertas_preco where oficina_id = $1 order by criado_em limit 1`, [o]);
      await linhas(b, dono, `update public.alertas_preco set status = 'cancelado' where id = $1`, [primeiro.id]);

      // o financeiro libera um pacote pela oficina (sem código do Pro)
      await linhas(b, fin, `insert into public.alertas_creditos (oficina_id, quantidade, valor, observacao) values ($1, 20, 49.9, 'Pix')`, [o]);
      expect((await tentar(b, sup, `insert into public.alertas_creditos (oficina_id, quantidade) values ($1, 5)`, [o])).erro).toBeTruthy();

      const uso = await rpc<Json[]>(b, sup, 'public.equipe_alertas_uso($1::uuid[])', [[o]]);
      expect(uso).toEqual([{ oficinaId: o, noMes: 2, creditos: 20, gastos: 0 }]);
      // sem lista: todas as que têm alerta ou crédito (a desta oficina está lá)
      const todas = await rpc<Json[]>(b, fin, 'public.equipe_alertas_uso()');
      expect(todas.some((x) => x.oficinaId === o)).toBe(true);
      expect((await tentar(b, dono, 'select public.equipe_alertas_uso()')).codigo).toBe('42501');
    }));
});

d('consulta de acessos pelo e-mail', () => {
  it('só o admin acha a conta de um e-mail', () =>
    emTransacao(async (b) => {
      const alvo = await criarPessoa(b, pessoa('alvo'));
      const adm = await criarPessoa(b, pessoa('adm', { totpHa: 60 }));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, adm, 'admin');
      await criarEquipe(b, sup, 'suporte');
      expect(await rpc(b, adm, 'public.equipe_id_do_email($1)', [` ${alvo.email.toUpperCase()} `])).toBe(alvo.id);
      expect(await rpc(b, adm, 'public.equipe_id_do_email($1)', ['ninguem@teste.dev'])).toBeNull();
      expect((await tentar(b, sup, 'select public.equipe_id_do_email($1)', [alvo.email])).codigo).toBe('42501');
    }));
});

d('convites da equipe no histórico', () => {
  it('o convite do dono de uma loja feito pela equipe fica registrado; o da própria loja, não', () =>
    emTransacao(async (b) => {
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      await criarEquipe(b, sup, 'suporte');
      const loja = await criarLoja(b, lojista);
      await rpc(b, sup, `public.convidar('fornecedor', $1, 'novo-dono@teste.dev', 'dono')`, [String(loja.fornecedorId)]);
      await rpc(b, lojista, `public.convidar('fornecedor', $1, 'vendedor@teste.dev', 'vendedor')`, [String(loja.fornecedorId)]);
      const r = (await b.query(`select depois ->> 'email' as email from privado.auditoria where tabela = 'public.convites' and depois ->> 'fornecedor_id' = $1`, [String(loja.fornecedorId)])).rows;
      expect(r.map((x) => x.email)).toEqual(['novo-dono@teste.dev']);
    }));
});
