// Uma conta sem vínculo nenhum (nem oficina, nem loja, nem equipe) chamando as funções que mudam
// coisas dos outros. Os papéis vêm nulos para quem não é membro, e um "not (nulo = 'dono')" num IF
// não barra nada: cada chamada aqui tem que ser recusada.

import { afterAll, describe, expect, it } from 'vitest';
import { criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar } from './ajuda';

afterAll(fechar);

describe.skipIf(!temBanco)('conta sem vínculo', () => {
  it('não convida, não cancela convite, não ativa o Pro nem começa o teste da oficina dos outros', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const estranho = await criarPessoa(b, pessoa('estranho'));
      const o = await criarOficina(b, dono);
      const { fornecedorId } = await criarLoja(b, null);

      expect((await tentar(b, estranho, `select public.convidar('oficina', $1, $2, 'dono')`, [o, estranho.email])).codigo).toBe('42501');
      expect((await tentar(b, estranho, `select public.convidar('fornecedor', $1, $2, 'dono')`, [String(fornecedorId), estranho.email])).codigo).toBe('42501');
      expect((await b.query('select 1 from public.convites where email = $1', [estranho.email])).rows).toEqual([]);

      const [c] = await linhas(b, dono, `select public.convidar('oficina', $1, 'mecanico@teste.dev', 'mecanico') as id`, [o]);
      expect((await tentar(b, estranho, 'select public.cancelar_convite($1)', [c.id])).codigo).toBe('42501');

      await b.query(`insert into public.assinaturas (oficina_nome, meses, valor, ate, codigo) values ('Venda', 12, 300, current_date + 300, 'ZZZZYYYYXXXXWWWW')`);
      const antes = (await b.query('select teste_ate, pro_ate from public.oficinas where id = $1', [o])).rows[0];
      expect((await tentar(b, estranho, `select public.ativar_codigo_pro($1, 'ZZZZYYYYXXXXWWWW')`, [o])).codigo).toBe('42501');
      expect((await tentar(b, estranho, 'select public.comecar_teste_pro($1)', [o])).codigo).toBe('42501');
      expect((await b.query('select teste_ate, pro_ate from public.oficinas where id = $1', [o])).rows[0]).toEqual(antes);
      expect((await b.query(`select oficina_id from public.assinaturas where codigo = 'ZZZZYYYYXXXXWWWW'`)).rows[0].oficina_id).toBeNull();
    }));

  it('não vê o Pix da compra dos outros, nem de pedido antigo sem oficina', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const estranho = await criarPessoa(b, pessoa('estranho'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, null);
      const [ped] = await linhas(
        b,
        dono,
        `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ('EST001', $1, 'x', '5521911112222', $2::jsonb) returning id`,
        [o, JSON.stringify([{ produto_id: loja.produtoId, quantidade: 1 }])]
      );
      const parte = Number((await b.query('select id from public.pedidos_fornecedores where pedido_id = $1', [ped.id])).rows[0].id);
      expect((await tentar(b, estranho, 'select public.pix_da_parte($1)', [parte])).codigo).toBe('42501');
      // pedido de antes das contas: a parte não tem oficina
      await b.query(`set local session_replication_role = replica`);
      await b.query('update public.pedidos_fornecedores set oficina_id = null, status = $2 where id = $1', [parte, 'confirmado']);
      await b.query(`set local session_replication_role = origin`);
      expect((await tentar(b, estranho, 'select public.pix_da_parte($1)', [parte])).codigo).toBe('42501');
    }));

  it('não mexe na loja, no saldo nem no chamado de suporte dos outros', () =>
    emTransacao(async (b) => {
      const estranho = await criarPessoa(b, pessoa('estranho'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const { fornecedorId } = await criarLoja(b, lojista);
      expect((await tentar(b, estranho, 'select public.loja_cancelar_troca_pix($1)', [fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, estranho, 'select public.loja_cancelar_troca_pix(null)')).codigo).toBe('42501');
      expect((await tentar(b, estranho, `select public.loja_importar_produtos(null, '[]'::jsonb)`)).codigo).toBe('42501');
      expect((await tentar(b, estranho, 'select public.saldo_cashback(null, $1)', [fornecedorId])).codigo).toBe('42501');
      // chamado de quem apagou a conta (user_id nulo): ninguém de fora responde nem fecha
      const ch = await b.query(`insert into public.suporte_chamados (user_id, email, assunto) values (null, 'saiu@teste.dev', 'Ajuda') returning id`);
      const id = String(ch.rows[0].id);
      expect((await tentar(b, estranho, `select public.suporte_responder($1, 'oi')`, [id])).codigo).toBe('42501');
      expect((await tentar(b, estranho, `select public.suporte_situacao($1, 'fechado')`, [id])).codigo).toBe('42501');
    }));

  it('resposta do cliente sem ação não vale no orçamento', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const [pub] = await linhas(b, dono, `select public.publicar_link($1, 'orcamento', 'doc-x', '{"total":10,"linhas":[{"id":"l1"},{"id":"l2"}]}'::jsonb) as r`, [o]);
      const token = (pub.r as { token: string }).token;
      // direto pela API, sem passar pelo servidor (que guarda o IP de verdade), não vale
      expect((await tentar(b, null, `select public.responder_link($1, '{"acao":"aprovar"}'::jsonb, '1.2.3.4', 'forjado')`, [token])).codigo).toBe('42501');
      expect((await tentar(b, null, `select public.responder_link($1, '{}'::jsonb)`, [token], { sistema: true })).codigo).toBe('22023');
      // recusar um item que não estava no orçamento não vale
      expect((await tentar(b, null, `select public.responder_link($1, '{"acao":"aprovar","recusadas":["x9"]}'::jsonb)`, [token], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, `select public.responder_link($1, '{"acao":"aprovar","recusadas":["l2"]}'::jsonb)`, [token], { sistema: true })).erro).toBeNull();
    }));

  it('o IP do cabeçalho só vale assinado pelo servidor', () =>
    emTransacao(async (b) => {
      const { createHash, createHmac } = await import('node:crypto');
      const { CHAVE_SISTEMA_TESTE } = await import('./ajuda');
      const segredo = createHash('sha256').update(CHAVE_SISTEMA_TESTE).digest('hex');
      const ip = '200.10.20.30';
      const ler = async (headers: Record<string, string>) => {
        await b.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
        return (await b.query('select privado.ip_confiavel() as ip')).rows[0].ip as string | null;
      };
      expect(await ler({ 'x-revisai-ip': ip })).toBeNull();
      expect(await ler({ 'x-revisai-ip': ip, 'x-revisai-ip-prova': 'f'.repeat(64) })).toBeNull();
      expect(await ler({ 'x-revisai-ip': ip, 'x-revisai-ip-prova': createHmac('sha256', segredo).update(ip).digest('hex') })).toBe(ip);
    }));
});
