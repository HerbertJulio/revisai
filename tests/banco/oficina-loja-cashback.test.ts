// O cashback da oficina usado como pagamento numa compra: o saldo que o pedido confere, o uso gravado
// no livro e no valor a pagar da compra, o cadeado que impede usar o mesmo saldo duas vezes (também com
// dois pedidos ao mesmo tempo), a compra cancelada que devolve o uso e o estorno de um crédito já usado,
// que deixa o saldo negativo em vez de ser bloqueado.

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, URL_BANCO, type Banco, type Pessoa } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

function codigo(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

async function cenario(b: Banco) {
  const dono = await criarPessoa(b, pessoa('cb-dono'));
  const lojista = await criarPessoa(b, pessoa('cb-lojista'));
  const lojista2 = await criarPessoa(b, pessoa('cb-lojista2'));
  const o = await criarOficina(b, dono, 'Oficina do Cashback');
  // 2 frascos de R$ 50 = R$ 100 por compra; a loja dá 10%
  const loja = await criarLoja(b, lojista, { nome: 'Loja do Cashback', preco: 50 });
  const loja2 = await criarLoja(b, lojista2, { nome: 'Outra Loja', categoria: 'filtro_oleo', preco: 20 });
  await b.query('update public.fornecedores set cashback_percentual = 10 where id = $1', [loja.fornecedorId]);
  await b.query(`insert into public.fornecedores_pix (fornecedor_id, tipo, chave, nome, cidade) values ($1, 'email', 'pix@cashback.dev', 'Loja do Cashback', 'Rio')`, [loja.fornecedorId]);
  return { dono, lojista, lojista2, o, loja, loja2 };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

function pedir(b: Banco, quem: Pessoa, oficina: string, itens: { produto_id: number; quantidade: number }[], cashback?: unknown) {
  return tentar(
    b,
    quem,
    `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens, cashback)
     values ($1, $2, 'x', '5521911112222', $3::jsonb, $4::jsonb) returning id, total, cashback`,
    [codigo(), oficina, JSON.stringify(itens), cashback === undefined ? null : JSON.stringify(cashback)]
  );
}

async function parteDoPedido(b: Banco, pedidoId: unknown, fornecedorId: number): Promise<{ id: number; subtotal: number; cashback: number }> {
  const r = await b.query('select id, subtotal, cashback from public.pedidos_fornecedores where pedido_id = $1 and fornecedor_id = $2', [pedidoId, fornecedorId]);
  const x = r.rows[0];
  return { id: Number(x.id), subtotal: Number(x.subtotal), cashback: Number(x.cashback) };
}

const muda = (b: Banco, p: Pessoa, parte: number, sql: string) => tentar(b, p, `update public.pedidos_fornecedores set ${sql} where id = $1`, [parte]);

/** Uma compra de R$ 100 na loja, entregue e paga: R$ 10 de crédito. Devolve a parte. */
async function compraCreditada(b: Banco, x: Cenario): Promise<number> {
  const r = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 2 }]);
  expect(r.erro).toBeNull();
  const p = await parteDoPedido(b, r.linhas[0].id, x.loja.fornecedorId);
  expect((await muda(b, x.lojista, p.id, `status = 'confirmado'`)).erro).toBeNull();
  expect((await muda(b, x.lojista, p.id, `status = 'entregue'`)).erro).toBeNull();
  expect((await muda(b, x.lojista, p.id, `pagamento = 'confirmado'`)).erro).toBeNull();
  return p.id;
}

async function saldo(b: Banco, quem: Pessoa, oficina: string, loja: number): Promise<number> {
  return Number((await linhas(b, quem, 'select public.saldo_cashback($1, $2) as s', [oficina, loja]))[0].s);
}

async function livro(b: Banco, oficina: string): Promise<{ tipo: string; valor: number; parte: number | null }[]> {
  const r = await b.query('select tipo, valor, parte_id from public.cashback_movimentos where oficina_id = $1 order by id', [oficina]);
  return r.rows.map((m) => ({ tipo: String(m.tipo), valor: Number(m.valor), parte: m.parte_id == null ? null : Number(m.parte_id) }));
}

d('cashback usado na compra', () => {
  it('o pedido usa o saldo: grava o uso ligado à compra, baixa o valor a pagar e o Pix sai sem o cashback', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      await compraCreditada(b, x);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(10);
      const saldos = await linhas(b, x.dono, 'select fornecedor_id, saldo from public.saldos_de_cashback($1)', [x.o]);
      expect(saldos.map((s) => [Number(s.fornecedor_id), Number(s.saldo)])).toEqual([[x.loja.fornecedorId, 10]]);

      const r = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }, { produto_id: x.loja2.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 7.5 });
      expect(r.erro).toBeNull();
      const p = await parteDoPedido(b, r.linhas[0].id, x.loja.fornecedorId);
      expect(p).toMatchObject({ subtotal: 50, cashback: 7.5 });
      // a outra loja do pedido não muda
      expect((await parteDoPedido(b, r.linhas[0].id, x.loja2.fornecedorId)).cashback).toBe(0);
      expect((await livro(b, x.o)).slice(-1)).toEqual([{ tipo: 'uso', valor: 7.5, parte: p.id }]);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(2.5);
      expect(await saldo(b, x.lojista, x.o, x.loja.fornecedorId)).toBe(2.5);
      // a oficina e a loja leem o cashback da compra
      expect(Number((await linhas(b, x.dono, 'select cashback from public.pedidos_fornecedores where id = $1', [p.id]))[0].cashback)).toBe(7.5);
      expect(Number((await linhas(b, x.lojista, 'select cashback from public.pedidos_fornecedores where id = $1', [p.id]))[0].cashback)).toBe(7.5);

      // o Pix é do que falta pagar
      expect((await muda(b, x.lojista, p.id, `status = 'confirmado'`)).erro).toBeNull();
      const [pix] = await linhas(b, x.dono, 'select public.pix_da_parte($1) as p', [p.id]);
      expect(pix.p).toMatchObject({ valor: 42.5, subtotal: 50, cashback: 7.5 });

      // entregue e pago: o crédito novo é sobre o que a oficina pagou (R$ 42,50 x 10%)
      expect((await muda(b, x.lojista, p.id, `status = 'entregue'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p.id, `pagamento = 'confirmado'`)).erro).toBeNull();
      expect((await livro(b, x.o)).slice(-1)).toEqual([{ tipo: 'credito', valor: 4.25, parte: p.id }]);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(6.75);
    }));

  it('o mesmo saldo não paga duas compras, nem passa do valor da compra; o pedido inteiro não entra', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      await compraCreditada(b, x);
      expect((await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 6 })).erro).toBeNull();
      const antes = (await b.query('select count(*)::int as n from public.pedidos where oficina_id = $1', [x.o])).rows[0].n;

      // sobram R$ 4: o segundo uso de R$ 6 é recusado, com a loja no detail
      const segundo = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }, { produto_id: x.loja2.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 6 });
      expect(segundo.codigo).toBe('RV031');
      expect(segundo.erro).toBe('O seu cashback na Loja do Cashback é de R$ 4,00');
      expect((await b.query('select count(*)::int as n from public.pedidos where oficina_id = $1', [x.o])).rows[0].n).toBe(antes);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(4);

      // mais que a compra na loja
      const demais = await pedir(b, x.dono, x.o, [{ produto_id: x.loja2.produtoId, quantidade: 1 }, { produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 50.01 });
      expect(demais.codigo).toBe('RV032');
      // a loja tem de estar no pedido, e o pedido de cashback tem de ser { loja: valor positivo com centavos }
      expect((await pedir(b, x.dono, x.o, [{ produto_id: x.loja2.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 1 })).codigo).toBe('RV033');
      for (const errado of [[1], { [x.loja.fornecedorId]: -1 }, { [x.loja.fornecedorId]: '1' }, { [x.loja.fornecedorId]: 1.234 }, { abc: 1 }, { [x.loja.fornecedorId]: 0 }]) {
        expect((await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], errado)).codigo).toBe('RV033');
      }
      // vazio ou nulo é pedido sem cashback
      expect((await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], {})).erro).toBeNull();
      // o que cabe ainda passa
      expect((await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 4 })).erro).toBeNull();
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(0);
      expect((await livro(b, x.o)).filter((m) => m.tipo === 'uso').map((m) => m.valor)).toEqual([6, 4]);
    }));

  it('ninguém muda o cashback da compra direto; o cashback que cobre tudo não tem Pix', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      await compraCreditada(b, x);
      const r = await pedir(b, x.dono, x.o, [{ produto_id: x.loja2.produtoId, quantidade: 1 }, { produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 10 });
      expect(r.erro).toBeNull();
      const p = await parteDoPedido(b, r.linhas[0].id, x.loja.fornecedorId);
      for (const quem of [x.dono, x.lojista]) {
        const t = await muda(b, quem, p.id, 'cashback = 0');
        expect(t.codigo).toBe('42501');
      }
      // a loja segue mudando a situação normalmente
      expect((await muda(b, x.lojista, p.id, `status = 'confirmado'`)).erro).toBeNull();
      expect((await parteDoPedido(b, r.linhas[0].id, x.loja.fornecedorId)).cashback).toBe(10);

      // R$ 50 de compra, R$ 10 de cashback: Pix de R$ 40. Com o cashback cobrindo tudo, sem Pix.
      await b.query(`insert into public.cashback_movimentos (oficina_id, fornecedor_id, valor, tipo) values ($1, $2, 50, 'credito')`, [x.o, x.loja.fornecedorId]);
      const tudo = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 50 });
      expect(tudo.erro).toBeNull();
      const pt = await parteDoPedido(b, tudo.linhas[0].id, x.loja.fornecedorId);
      expect((await muda(b, x.lojista, pt.id, `status = 'confirmado'`)).erro).toBeNull();
      expect((await tentar(b, x.dono, 'select public.pix_da_parte($1)', [pt.id])).codigo).toBe('RV023');
    }));

  it('a compra cancelada devolve o cashback usado; o estorno de um crédito já usado deixa o saldo negativo', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      const creditada = await compraCreditada(b, x);
      const r = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 10 });
      expect(r.erro).toBeNull();
      const p = await parteDoPedido(b, r.linhas[0].id, x.loja.fornecedorId);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(0);

      // a loja cancela a compra: o uso volta
      expect((await muda(b, x.lojista, p.id, `status = 'cancelado', cancelado_motivo = 'Sem o produto'`)).erro).toBeNull();
      expect((await livro(b, x.o)).slice(-1)).toEqual([{ tipo: 'uso_desfeito', valor: 10, parte: p.id }]);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(10);

      // usa de novo e a loja desfaz o pagamento da compra que deu o crédito: o estorno vale e o saldo fica em -R$ 10
      const r2 = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 10 });
      expect(r2.erro).toBeNull();
      expect((await muda(b, x.lojista, creditada, `pagamento = 'pendente'`)).erro).toBeNull();
      expect((await livro(b, x.o)).slice(-1)).toEqual([{ tipo: 'estorno', valor: 10, parte: creditada }]);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(-10);
      const lista = await linhas(b, x.dono, 'select saldo from public.saldos_de_cashback($1)', [x.o]);
      expect(Number(lista[0].saldo)).toBe(-10);

      // com o saldo negativo, nem um centavo de cashback
      expect((await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 0.01 })).codigo).toBe('RV031');
      // o pagamento confirmado de novo devolve o crédito, que cobre a diferença primeiro
      expect((await muda(b, x.lojista, creditada, `pagamento = 'confirmado'`)).erro).toBeNull();
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(0);
      expect((await livro(b, x.o)).map((m) => m.tipo)).toEqual(['credito', 'uso', 'uso_desfeito', 'uso', 'estorno', 'credito']);
    }));

  it('a equipe que tira o cancelamento faz o uso voltar', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      await compraCreditada(b, x);
      const r = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], { [x.loja.fornecedorId]: 5 });
      const p = await parteDoPedido(b, r.linhas[0].id, x.loja.fornecedorId);
      expect((await muda(b, x.lojista, p.id, `status = 'cancelado', cancelado_motivo = 'Sem o produto'`)).erro).toBeNull();
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(10);
      // SQL direto (equipe técnica): volta para confirmado
      await b.query(`update public.pedidos_fornecedores set status = 'confirmado' where id = $1`, [p.id]);
      expect(await saldo(b, x.dono, x.o, x.loja.fornecedorId)).toBe(5);
      expect((await livro(b, x.o)).map((m) => m.tipo)).toEqual(['credito', 'uso', 'uso_desfeito', 'uso']);
    }));
});

d('quem não é da oficina', () => {
  it('uma conta sem oficina nem loja recebe 42501 em cada função; um NULL nunca passa da conferência', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      const parte = await compraCreditada(b, x);
      const estranho = await criarPessoa(b, pessoa('cb-estranho'));
      const chamadas: [string, unknown[]][] = [
        ['select public.saldo_cashback($1, $2)', [x.o, x.loja.fornecedorId]],
        ['select public.saldo_cashback($1, null)', [x.o]],
        ['select public.saldo_cashback(null, $1)', [x.loja.fornecedorId]],
        ['select * from public.saldos_de_cashback($1)', [x.o]],
        ['select * from public.saldos_de_cashback(null)', []],
        ['select public.pix_da_parte($1)', [parte]],
        ['select public.lojas_com_pix($1::bigint[])', [[x.loja.fornecedorId]]]
      ];
      for (const [sql, params] of chamadas) {
        const r = await tentar(b, estranho, sql, params);
        expect([sql, r.codigo]).toEqual([sql, '42501']);
      }
      // quem é de outra oficina também não vê o saldo nem o Pix desta
      const outro = await criarPessoa(b, pessoa('cb-outra-oficina'));
      await criarOficina(b, outro, 'Outra Oficina do Cashback');
      expect((await tentar(b, outro, 'select public.saldo_cashback($1, $2)', [x.o, x.loja.fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, outro, 'select * from public.saldos_de_cashback($1)', [x.o])).codigo).toBe('42501');
      expect((await tentar(b, outro, 'select public.pix_da_parte($1)', [parte])).codigo).toBe('42501');
      // a loja vê o saldo da oficina nela, mas não sem dizer a oficina
      expect((await tentar(b, x.lojista, 'select public.saldo_cashback(null, $1)', [x.loja.fornecedorId])).codigo).toBe('42501');

      // uma compra sem oficina (de antes das contas): o NULL não abre o Pix para ninguém
      await b.query('set local session_replication_role = replica');
      const ped = await b.query(`insert into public.pedidos (codigo, oficina_nome, oficina_whatsapp, itens, total) values ($1, 'Antiga', '5521900000000', $2::jsonb, 10) returning id`, [
        codigo(),
        JSON.stringify([{ produto_id: x.loja.produtoId, quantidade: 1 }])
      ]);
      const solta = await b.query(`insert into public.pedidos_fornecedores (pedido_id, fornecedor_id, subtotal, status, codigo) values ($1, $2, 10, 'confirmado', 'ANTIGA') returning id`, [ped.rows[0].id, x.loja.fornecedorId]);
      await b.query('set local session_replication_role = origin');
      expect((await tentar(b, x.dono, 'select public.pix_da_parte($1)', [solta.rows[0].id])).codigo).toBe('42501');
      expect((await tentar(b, estranho, 'select public.pix_da_parte($1)', [solta.rows[0].id])).codigo).toBe('42501');
    }));
});

// Dois pedidos ao mesmo tempo, cada um na sua transação, querendo o mesmo saldo: aqui os dados são
// gravados de verdade (e apagados no fim), porque uma transação só não mostra a espera de uma pela outra.
d('cashback com dois pedidos ao mesmo tempo', () => {
  it('o segundo espera o primeiro e é recusado, sem usar o saldo duas vezes', async () => {
    const pool = new pg.Pool({ connectionString: URL_BANCO, max: 3 });
    const dono = pessoa('cb-paralelo');
    const lojista = pessoa('cb-paralelo-loja');
    let oficina: string | null = null;
    let loja: { fornecedorId: number; produtoId: number } | null = null;
    const como = async (c: pg.PoolClient) => {
      const claims = { sub: dono.id, role: 'authenticated', email: dono.email, aal: 'aal1', aud: 'authenticated', amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 60 }] };
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await c.query('set local role authenticated');
    };
    const inserir = (c: pg.PoolClient) =>
      c.query(
        `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens, cashback) values ($1, $2, 'x', '5521911112222', $3::jsonb, $4::jsonb) returning id`,
        [codigo(), oficina, JSON.stringify([{ produto_id: loja!.produtoId, quantidade: 1 }]), JSON.stringify({ [loja!.fornecedorId]: 8 })]
      );
    try {
      const prep = await pool.connect();
      try {
        await prep.query('begin');
        for (const p of [dono, lojista]) await criarPessoa(prep, p);
        await como(prep);
        oficina = String((await prep.query(`select public.criar_oficina('Oficina Paralela do Cashback', '5521999990000', 'Rio', 'RJ', 'Rua A, 1') as id`)).rows[0].id);
        await prep.query('reset role');
        loja = await criarLoja(prep, lojista, { nome: 'Loja Paralela', preco: 50 });
        await prep.query(`insert into public.cashback_movimentos (oficina_id, fornecedor_id, valor, tipo) values ($1, $2, 10, 'credito')`, [oficina, loja.fornecedorId]);
        await prep.query('commit');
      } finally {
        prep.release();
      }

      const a = await pool.connect();
      const c2 = await pool.connect();
      let erroDaSegunda: { code?: string } | null = null;
      try {
        await a.query('begin');
        await como(a);
        await inserir(a);
        await c2.query('begin');
        await como(c2);
        let terminou = false;
        const segunda = inserir(c2).then(
          () => {
            terminou = true;
          },
          (e: { code?: string }) => {
            terminou = true;
            erroDaSegunda = e;
          }
        );
        await new Promise((r) => setTimeout(r, 400));
        // sem o cadeado, a segunda não veria o uso da primeira (ainda aberta) e usaria os mesmos R$ 8
        expect(terminou).toBe(false);
        await a.query('commit');
        await segunda;
        await c2.query('rollback');
      } finally {
        a.release();
        c2.release();
      }
      expect(erroDaSegunda).toMatchObject({ code: 'RV031' });
      const usos = await pool.query(`select valor from public.cashback_movimentos where oficina_id = $1 and tipo = 'uso'`, [oficina]);
      expect(usos.rows.map((u) => Number(u.valor))).toEqual([8]);
      const s = await pool.query('select privado.saldo_do_cashback($1, $2) as s', [oficina, loja!.fornecedorId]);
      expect(Number(s.rows[0].s)).toBe(2);
    } finally {
      if (oficina) {
        await pool.query('delete from public.cashback_movimentos where oficina_id = $1', [oficina]).catch(() => {});
        await pool.query('delete from public.pedidos_fornecedores where oficina_id = $1', [oficina]).catch(() => {});
        await pool.query('delete from public.pedidos where oficina_id = $1', [oficina]).catch(() => {});
      }
      if (loja) {
        await pool.query('delete from public.produtos where fornecedor_id = $1', [loja.fornecedorId]).catch(() => {});
        await pool.query('delete from public.fornecedores where id = $1', [loja.fornecedorId]).catch(() => {});
      }
      if (oficina) await pool.query('delete from public.oficinas where id = $1', [oficina]).catch(() => {});
      await pool.query('delete from auth.users where id = any($1)', [[dono.id, lojista.id]]).catch(() => {});
      await pool.end();
    }
  });
});
