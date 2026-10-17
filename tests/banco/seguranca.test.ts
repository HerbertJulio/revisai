// Os ajustes da revisão de segurança: a suspensão da equipe não cai com o "apagar e desistir", a
// oficina e a loja mudam só o próprio cadastro, o WhatsApp de quem sai da oficina sai junto e o
// CNPJ não fica preso por loja em análise.

import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar } from './ajuda';

afterAll(fechar);

const CNPJ = '11222333000181';

describe.skipIf(!temBanco)('ajustes de segurança', () => {
  it('a oficina suspensa pela equipe não volta com o pedido de exclusão desfeito', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const admin = await criarPessoa(b, pessoa('admin', { totpHa: 60 }));
      await criarEquipe(b, admin, 'admin');
      const o = await criarOficina(b, dono);
      expect((await tentar(b, admin, 'update public.oficinas set ativa = false where id = $1', [o])).erro).toBeNull();
      expect((await b.query('select ativa, suspensa from public.oficinas where id = $1', [o])).rows[0]).toEqual({ ativa: false, suspensa: true });
      await linhas(b, dono, 'select public.oficina_pedir_exclusao($1)', [o]);
      await linhas(b, dono, 'select public.oficina_cancelar_exclusao($1)', [o]);
      expect((await b.query('select ativa, excluir_em from public.oficinas where id = $1', [o])).rows[0]).toEqual({ ativa: false, excluir_em: null });
      // a equipe reativa: a suspensão sai junto
      expect((await tentar(b, admin, 'update public.oficinas set ativa = true where id = $1', [o])).erro).toBeNull();
      expect((await b.query('select ativa, suspensa from public.oficinas where id = $1', [o])).rows[0]).toEqual({ ativa: true, suspensa: false });
    }));

  it('o dono muda o cadastro da oficina, mas não a data de criação, a suspensão nem o limite de compra', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const antes = (await b.query('select criado_em, suspensa, fundador from public.oficinas where id = $1', [o])).rows[0];
      // pela API a oficina não muda a própria linha (o cadastro vem pelos registros); nada passa
      for (const sql of [`criado_em = now() - interval '2 years'`, 'suspensa = true', 'fundador = true']) {
        await tentar(b, dono, `update public.oficinas set ${sql} where id = $1`, [o]);
      }
      expect((await b.query('select criado_em, suspensa, fundador from public.oficinas where id = $1', [o])).rows[0]).toEqual(antes);
    }));

  it('a loja muda o próprio cadastro, mas não a data de criação nem a aprovação', () =>
    emTransacao(async (b) => {
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const { fornecedorId } = await criarLoja(b, lojista);
      expect((await tentar(b, lojista, `update public.fornecedores set descricao = 'Peças em geral', pedido_minimo = 50 where id = $1`, [fornecedorId])).erro).toBeNull();
      for (const sql of [`criado_em = '2020-01-01'`, `verificacao = 'recusada'`, 'destaque = true']) {
        expect((await tentar(b, lojista, `update public.fornecedores set ${sql} where id = $1`, [fornecedorId])).codigo).toBe('42501');
      }
    }));

  it('o número que um mecânico ligou sai quando ele sai da oficina', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const mec = await criarPessoa(b, pessoa('mec'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email]);
      await linhas(b, mec, 'select public.aceitar_convite()');
      const [{ c }] = await linhas(b, mec, 'select public.whatsapp_gerar_codigo($1) as c', [o]);
      const [{ d }] = await linhas(b, dono, 'select public.whatsapp_gerar_codigo($1) as d', [o]);
      expect(d).toBeTruthy();
      // o código do dono apagou o do mecânico (um por oficina): o mecânico gera de novo
      const [{ c2 }] = await linhas(b, mec, 'select public.whatsapp_gerar_codigo($1) as c2', [o]);
      await linhas(b, null, `select public.whatsapp_vincular('5521988887777', $1)`, [c2], { sistema: true });
      expect(c).toBeTruthy();
      const vinculo = await b.query(`select criado_por from public.whatsapp_vinculos where telefone = '5521988887777'`);
      expect(vinculo.rows[0].criado_por).toBe(mec.id);
      await linhas(b, dono, `select public.remover_membro('oficina', $1, $2)`, [o, mec.id]);
      expect((await b.query(`select 1 from public.whatsapp_vinculos where telefone = '5521988887777'`)).rows).toEqual([]);
    }));

  it('loja em análise não prende o CNPJ; a mesma conta não pede duas vezes', () =>
    emTransacao(async (b) => {
      const primeiro = await criarPessoa(b, pessoa('primeiro'));
      const dono = await criarPessoa(b, pessoa('dono'));
      await b.query(`delete from public.fornecedores where cnpj = $1`, [CNPJ]);
      expect((await tentar(b, primeiro, `select public.criar_loja('Loja Pega', $1)`, [CNPJ])).erro).toBeNull();
      expect((await tentar(b, primeiro, `select public.criar_loja('Loja Pega 2', $1)`, [CNPJ])).codigo).toBe('23505');
      expect((await tentar(b, dono, `select public.criar_loja('Loja de Verdade', $1)`, [CNPJ])).erro).toBeNull();
      // aprovada, o CNPJ fica com ela
      await b.query(`update public.fornecedores set verificacao = 'aprovada', ativo = true where nome = 'Loja de Verdade' and cnpj = $1`, [CNPJ]);
      const terceiro = await criarPessoa(b, pessoa('terceiro'));
      expect((await tentar(b, terceiro, `select public.criar_loja('Outra', $1)`, [CNPJ])).codigo).toBe('23505');
    }));

  it('a exportação do titular traz a pesquisa de satisfação e esconde os IPs de acesso', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const suporte = await criarPessoa(b, pessoa('suporte', { totpHa: 60 }));
      await criarEquipe(b, suporte, 'suporte');
      await criarOficina(b, dono);
      await b.query(`insert into public.nps_respostas (user_id, nota, comentario) values ($1, 9, 'Bom')`, [dono.id]);
      const [r] = await linhas(b, suporte, 'select public.titular_exportar($1) as r', [dono.email]);
      const x = r.r as { pesquisas: { nota: number }[]; acessos: { quantidade: number } };
      expect(x.pesquisas.map((p) => p.nota)).toEqual([9]);
      expect(Object.keys(x.acessos).sort()).toEqual(['aviso', 'quantidade']);
    }));
});
