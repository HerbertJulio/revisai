// Uma conta sem oficina, sem loja e fora da equipe chama cada função nova e recebe 42501 (também com
// os argumentos vazios: um NULL não pode pular a conferência de quem chama). O anônimo também.

import { createHash, randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar } from './ajuda';
import { cenario, darCredito } from './loja2-ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

d('estranhos nas funções da venda faturada, da API, da moderação e do limite', () => {
  it('uma conta sem nada recebe 42501 em todas as funções, com e sem argumentos', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 30);
      const prefixo = `rvl_${randomBytes(4).toString('hex')}`;
      const token = `${prefixo}_${randomBytes(32).toString('base64url')}`;
      const [t] = await linhas(b, c.lojista, 'select public.loja_api_criar_token($1, $2, $3, $4) as id', [c.loja.fornecedorId, 'ERP', prefixo, createHash('sha256').update(token).digest('hex')]);
      const [den] = await linhas(b, c.donoOficina, `select public.denunciar($1, $2, null, 'falsificado', null) as id`, [c.oficina, c.loja.produtoId]);
      const estranho = await criarPessoa(b, pessoa('estranho'));

      const chamadas: [string, unknown[]][] = [
        ['select public.loja_creditos($1)', [c.loja.fornecedorId]],
        ['select public.loja_creditos($1)', [null]],
        ['select public.credito_da_oficina($1)', [c.oficina]],
        ['select public.credito_da_oficina($1)', [null]],
        [`select public.denunciar($1, $2, null, 'falsificado', null)`, [c.oficina, c.loja.produtoId]],
        [`select public.denunciar($1, $2, null, 'falsificado', null)`, [null, c.loja.produtoId]],
        [`select public.denunciar($1, null, $2, 'nao_entregou', null)`, [null, c.loja.fornecedorId]],
        [`select public.moderacao_decidir($1, 'mostrar', null)`, [den.id]],
        [`select public.moderacao_decidir($1, 'mostrar', null)`, [null]],
        [`select public.moderacao_decidir($1, null, null)`, [den.id]],
        ['select public.moderacao_produto($1, false)', [c.loja.produtoId]],
        ['select public.moderacao_produto($1, $2)', [null, null]],
        ['select public.loja_api_criar_token($1, $2, $3, $4)', [c.loja.fornecedorId, 'Meu ERP', prefixo, 'a'.repeat(64)]],
        ['select public.loja_api_criar_token($1, $2, $3, $4)', [null, 'Meu ERP', prefixo, 'a'.repeat(64)]],
        ['select public.loja_api_revogar_token($1)', [t.id]],
        ['select public.loja_api_revogar_token($1)', [null]],
        ['select public.loja_api_chamadas($1)', [c.loja.fornecedorId]],
        ['select public.loja_api_chamadas($1)', [null]],
        ['select public.loja_api_listar($1)', [token]],
        ['select public.loja_api_atualizar($1, $2::jsonb)', [token, '[{"codigo":"A","preco":1}]']],
        [`select public.loja_api_registrar($1, 'GET', 400, 0)`, [token]],
        ['select public.compra_limite($1)', [c.oficina]],
        ['select public.compra_limite($1)', [null]],
        ['select public.compra_registrar_bloqueio($1, 5000)', [c.oficina]],
        ['select public.compra_registrar_bloqueio($1, $2)', [null, null]],
        ['select public.equipe_bloqueios_de_compra(30)', []],
        ['select public.equipe_bloqueios_de_compra(null)', []]
      ];
      for (const [sql, params] of chamadas) {
        const conta = await tentar(b, estranho, sql, params);
        expect({ sql, params, codigo: conta.codigo }).toEqual({ sql, params, codigo: '42501' });
        const anonimo = await tentar(b, null, sql, params);
        expect({ sql, params, anonimo: anonimo.codigo }).toEqual({ sql, params, anonimo: '42501' });
      }

      // nas tabelas, o estranho não vê nada e não grava nada
      for (const tabela of ['lojas_credito', 'denuncias']) expect(await linhas(b, estranho, `select id from public.${tabela}`)).toHaveLength(0);
      expect(await linhas(b, estranho, 'select id from public.lojas_api_tokens')).toHaveLength(0);
      expect((await tentar(b, estranho, 'insert into public.lojas_credito (fornecedor_id, oficina_id, limite, prazo_dias) values ($1, $2, 100, 10)', [c.loja.fornecedorId, c.oficina])).codigo).toBe('42501');
      expect((await tentar(b, estranho, `insert into public.denuncias (oficina_id, fornecedor_id, motivo) values ($1, $2, 'outro')`, [c.oficina, c.loja.fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, estranho, `insert into public.lojas_api_tokens (fornecedor_id, nome, prefixo, token_hash) values ($1, 'x1', $2, $3)`, [c.loja.fornecedorId, prefixo, 'b'.repeat(64)])).codigo).toBe(
        '42501'
      );
      // e nada mudou
      const r = await b.query('select oculto_moderacao from public.produtos where id = $1', [c.loja.produtoId]);
      expect(r.rows[0].oculto_moderacao).toBe(false);
      const tk = await b.query('select revogado from public.lojas_api_tokens where id = $1', [t.id]);
      expect(tk.rows[0].revogado).toBe(false);
    }));
});
