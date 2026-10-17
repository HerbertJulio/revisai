// Apagar uma oficina, uma conta ou uma loja tira a referência delas das tabelas ligadas (on delete
// set null). As regras das partes do pedido, das devoluções e das respostas de alerta não podem
// barrar isso: senão a rotina diária e a exclusão de conta (LGPD) param de vez.

import { afterAll, describe, expect, it } from 'vitest';
import { como, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco } from './ajuda';

afterAll(fechar);

async function pedir(b: Banco, dono: Parameters<typeof linhas>[1], oficina: string, produtoId: number, codigo: string): Promise<number> {
  const [ped] = await linhas(
    b,
    dono,
    `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb) returning id`,
    [codigo, oficina, JSON.stringify([{ produto_id: produtoId, quantidade: 1 }])]
  );
  return Number((await b.query('select id from public.pedidos_fornecedores where pedido_id = $1', [ped.id])).rows[0].id);
}

/** Muda a parte direto, sem as regras (como se o tempo tivesse passado). */
async function forcar(b: Banco, parte: number, sql: string) {
  await b.query('set local session_replication_role = replica');
  await b.query(`update public.pedidos_fornecedores set ${sql} where id = $1`, [parte]);
  await b.query('set local session_replication_role = origin');
}

describe.skipIf(!temBanco)('exclusão com dados ligados', () => {
  it('a rotina diária apaga a oficina que pediu exclusão mesmo com compras na loja', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, lojista);
      const parte = await pedir(b, dono, o, loja.produtoId, 'EXC001');
      await linhas(b, dono, 'select public.oficina_pedir_exclusao($1)', [o]);
      await b.query(`update public.oficinas set excluir_em = now() - interval '1 minute' where id = $1`, [o]);
      const r = await como(b, null, () => b.query('select public.rotina_diaria() as r'), { sistema: true });
      expect((r.rows[0].r as { oficinas: number }).oficinas).toBeGreaterThanOrEqual(1);
      expect((await b.query('select 1 from public.oficinas where id = $1', [o])).rows).toEqual([]);
      const p = await b.query('select oficina_id, itens from public.pedidos_fornecedores where id = $1', [parte]);
      expect(p.rows[0].oficina_id).toBeNull();
      expect((p.rows[0].itens as unknown[]).length).toBe(1);
    }));

  it('a oficina continua sem mudar o próprio pedido, nem tirando a oficina dele', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, lojista);
      const parte = await pedir(b, dono, o, loja.produtoId, 'EXC002');
      const r = await tentar(b, dono, 'update public.pedidos_fornecedores set oficina_id = null where id = $1', [parte]);
      expect(r.erro).toBeTruthy();
    }));

  it('quem abriu ou respondeu uma devolução consegue apagar a própria conta', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const gerente = await criarPessoa(b, pessoa('gerente'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const vendedor = await criarPessoa(b, pessoa('vendedor'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, lojista);
      await b.query(`insert into public.oficina_membros (oficina_id, user_id, papel, email) values ($1, $2, 'gerente', $3)`, [o, gerente.id, gerente.email]);
      await b.query(`insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email) values ($1, $2, 'vendedor', $3)`, [loja.fornecedorId, vendedor.id, vendedor.email]);
      const parte = await pedir(b, dono, o, loja.produtoId, 'EXC003');
      await forcar(b, parte, `status = 'entregue', entregue_em = now() - interval '2 days'`);
      const [dev] = await linhas(b, gerente, `insert into public.devolucoes (parte_id, tipo, motivo) values ($1, 'devolucao', 'Veio a peça errada') returning id`, [parte]);
      await linhas(b, vendedor, `update public.devolucoes set situacao = 'aceita', resposta = 'Pode trazer' where id = $1`, [dev.id]);
      expect((await tentar(b, gerente, 'select public.apagar_minha_conta()')).erro).toBeNull();
      expect((await tentar(b, vendedor, 'select public.apagar_minha_conta()')).erro).toBeNull();
      const d = await b.query('select aberta_por, respondida_por, situacao from public.devolucoes where id = $1', [dev.id]);
      expect(d.rows[0]).toEqual({ aberta_por: null, respondida_por: null, situacao: 'aceita' });
    }));

  it('o criador que já não é dono apaga a conta, e a oficina continua sem trocar de criador pela API', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const novo = await criarPessoa(b, pessoa('novo'));
      const o = await criarOficina(b, dono);
      await b.query(`insert into public.oficina_membros (oficina_id, user_id, papel, email) values ($1, $2, 'dono', $3)`, [o, novo.id, novo.email]);
      await tentar(b, novo, 'update public.oficinas set criado_por = null where id = $1', [o]);
      expect((await b.query('select criado_por from public.oficinas where id = $1', [o])).rows[0].criado_por).toBe(dono.id);
      expect((await tentar(b, dono, 'select public.apagar_minha_conta()')).erro).toBeNull();
      expect((await b.query('select criado_por from public.oficinas where id = $1', [o])).rows[0].criado_por).toBeNull();
    }));
});
