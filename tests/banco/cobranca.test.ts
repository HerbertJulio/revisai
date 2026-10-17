import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

const sistema = { sistema: true } as const;

async function assinatura(b: Banco, oficina: string, externa = `sub_${Math.random().toString(36).slice(2, 10)}`) {
  const [r] = await linhas(
    b,
    null,
    `select public.cobranca_registrar_assinatura($1, 'teste', 'pix', 'cus_1', $2, 29.90, '12345678909', 'Zé', 'ze@x.dev', current_date, null, null) as id`,
    [oficina, externa],
    sistema
  );
  return { id: String(r.id), externa };
}

async function cobranca(b: Banco, oficina: string, assinaturaId: string, externo: string, vencimento = 'current_date') {
  const [r] = await linhas(
    b,
    null,
    `select public.cobranca_registrar_pagamento('teste', $1, 'pro', $2, null, $3, 29.90, ${vencimento}, 'pix', 'Revisaí Pro', 'https://pagar.exemplo/1', '000201...', null) as id`,
    [externo, oficina, assinaturaId],
    sistema
  );
  return String(r.id);
}

d('cobrança do Pro', () => {
  it('só o servidor grava; o pagamento confirmado soma um mês uma vez só e entra no histórico', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const mec = await criarPessoa(b, pessoa('mec'));
      const o = await criarOficina(b, dono);
      await b.query(`insert into public.oficina_membros (oficina_id, user_id, papel) values ($1, $2, 'mecanico')`, [o, mec.id]);
      // a oficina não grava assinatura nem pagamento por conta própria
      expect((await tentar(b, dono, `select public.cobranca_registrar_assinatura($1, 'teste', 'pix', 'c', 's', 1, null, null, null, null, null, null)`, [o])).codigo).toBe('42501');
      expect((await tentar(b, dono, `select public.cobranca_pagamento_confirmado('teste', 'x', now())`)).codigo).toBe('42501');
      expect((await tentar(b, dono, `insert into public.pagamentos (tipo, oficina_id, provedor, valor) values ('pro', $1, 'teste', 1)`, [o])).erro).toBeTruthy();

      const a = await assinatura(b, o);
      await cobranca(b, o, a.id, 'pay_1');
      const [r1] = await linhas(b, null, `select public.cobranca_pagamento_confirmado('teste', 'pay_1', now()) as r`, [], sistema);
      expect(r1.r).toMatchObject({ achou: true, aplicado: true });
      const [r2] = await linhas(b, null, `select public.cobranca_pagamento_confirmado('teste', 'pay_1', now()) as r`, [], sistema);
      expect(r2.r).toMatchObject({ achou: true, aplicado: false });
      const [of] = await linhas(b, dono, `select pro_ate, fundador from public.oficinas where id = $1`, [o]);
      const esperado = new Date();
      esperado.setMonth(esperado.getMonth() + 1);
      expect(String(of.pro_ate instanceof Date ? of.pro_ate.toISOString() : of.pro_ate).slice(0, 7)).toBe(esperado.toISOString().slice(0, 7));
      expect(of.fundador).toBe(true);
      const [as] = await linhas(b, dono, `select situacao from public.assinaturas_pro where id = $1`, [a.id]);
      expect(as.situacao).toBe('ativa');
      // o histórico de períodos pagos ganhou uma linha
      expect((await b.query(`select count(*)::int as n from public.assinaturas where oficina_id = $1`, [o])).rows[0].n).toBe(1);
      // o dono vê; o mecânico não vê a cobrança
      expect(await linhas(b, dono, `select id from public.pagamentos where oficina_id = $1`, [o])).toHaveLength(1);
      expect(await linhas(b, mec, `select id from public.pagamentos where oficina_id = $1`, [o])).toEqual([]);
      expect(await linhas(b, mec, `select id from public.assinaturas_pro where oficina_id = $1`, [o])).toEqual([]);
    }));

  it('o mês soma a partir do fim do Pro quando ainda vale; o estorno tira o mês de volta', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      await b.query(`update public.oficinas set pro_ate = current_date + 10 where id = $1`, [o]);
      const a = await assinatura(b, o);
      await cobranca(b, o, a.id, 'pay_2');
      await linhas(b, null, `select public.cobranca_pagamento_confirmado('teste', 'pay_2', now())`, [], sistema);
      const [x] = await b.query(`select (pro_ate = (current_date + 10 + interval '1 month')::date) as ok from public.oficinas where id = $1`, [o]).then((r) => r.rows);
      expect(x.ok).toBe(true);
      await linhas(b, null, `select public.cobranca_pagamento_desfeito('teste', 'pay_2', 'estornado')`, [], sistema);
      const [y] = await b.query(`select (pro_ate = current_date + 10) as ok from public.oficinas where id = $1`, [o]).then((r) => r.rows);
      expect(y.ok).toBe(true);
      const [p] = await linhas(b, dono, `select situacao, periodo_aplicado from public.pagamentos where externo = 'pay_2'`);
      expect(p).toEqual({ situacao: 'estornado', periodo_aplicado: false });
    }));

  it('atrasado dá 5 dias de carência para quem já pagou; cancelado mantém o que já foi pago', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const a = await assinatura(b, o);
      await cobranca(b, o, a.id, 'pay_3', `current_date - 40`);
      await linhas(b, null, `select public.cobranca_pagamento_confirmado('teste', 'pay_3', now() - interval '40 days')`, [], sistema);
      // o mês pago venceu há uns 10 dias; a cobrança nova venceu ontem
      await b.query(`update public.oficinas set pro_ate = current_date - 1 where id = $1`, [o]);
      await cobranca(b, o, a.id, 'pay_4', `current_date - 1`);
      await linhas(b, null, `select public.cobranca_pagamento_atrasado('teste', 'pay_4')`, [], sistema);
      const [x] = await b.query(`select (pro_ate = current_date + 4) as ok from public.oficinas where id = $1`, [o]).then((r) => r.rows);
      expect(x.ok).toBe(true);
      expect((await linhas(b, dono, `select situacao from public.assinaturas_pro where id = $1`, [a.id]))[0].situacao).toBe('atrasada');
      await linhas(b, null, `select public.cobranca_assinatura_cancelada('teste', $1)`, [a.externa], sistema);
      expect((await linhas(b, dono, `select situacao from public.assinaturas_pro where id = $1`, [a.id]))[0].situacao).toBe('cancelada');
      // sem carência para quem nunca pagou
      const dono2 = await criarPessoa(b, pessoa('dono2'));
      const o2 = await criarOficina(b, dono2);
      const a2 = await assinatura(b, o2);
      await cobranca(b, o2, a2.id, 'pay_5', `current_date - 1`);
      await linhas(b, null, `select public.cobranca_pagamento_atrasado('teste', 'pay_5')`, [], sistema);
      expect((await b.query(`select pro_ate from public.oficinas where id = $1`, [o2])).rows[0].pro_ate).toBeNull();
    }));

  it('nova assinatura cancela a anterior; os avisos repetidos não passam duas vezes', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const a1 = await assinatura(b, o);
      const a2 = await assinatura(b, o);
      const vivas = await linhas(b, dono, `select id, situacao from public.assinaturas_pro where oficina_id = $1 order by criado_em`, [o]);
      expect(vivas.map((v) => v.situacao).sort()).toEqual(['cancelada', 'pendente']);
      expect(vivas.find((v) => v.id === a2.id)?.situacao).toBe('pendente');
      expect(a1.id).not.toBe(a2.id);
      const evento = `evt_${Math.random().toString(36).slice(2)}`;
      expect((await linhas(b, null, `select public.cobranca_webhook_guardar('teste', $1, 'PAGO', '{}'::jsonb) as novo`, [evento], sistema))[0].novo).toBe(true);
      expect((await linhas(b, null, `select public.cobranca_webhook_guardar('teste', $1, 'PAGO', '{}'::jsonb) as novo`, [evento], sistema))[0].novo).toBe(false);
      expect((await tentar(b, dono, `select public.cobranca_webhook_guardar('teste', 'x', 'PAGO', '{}'::jsonb)`)).codigo).toBe('42501');
    }));

  it('nota fiscal fica no pagamento; preço de fundadora enquanto há vaga', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const a = await assinatura(b, o);
      await cobranca(b, o, a.id, 'pay_6');
      await linhas(b, null, `select public.cobranca_nota('teste', 'pay_6', 'inv_1', '123', 'https://nota.exemplo/123.pdf', 'emitida')`, [], sistema);
      expect((await linhas(b, dono, `select nota_numero, nota_url, nota_situacao from public.pagamentos where externo = 'pay_6'`))[0]).toEqual({
        nota_numero: '123',
        nota_url: 'https://nota.exemplo/123.pdf',
        nota_situacao: 'emitida'
      });
      // atualiza pelo id da nota também
      await linhas(b, null, `select public.cobranca_nota('teste', '', 'inv_1', null, null, 'cancelada')`, [], sistema);
      expect((await linhas(b, dono, `select nota_situacao from public.pagamentos where externo = 'pay_6'`))[0].nota_situacao).toBe('cancelada');
      const [preco] = await linhas(b, dono, `select public.cobranca_preco($1) as p`, [o]);
      expect(preco.p).toMatchObject({ fundadora: false });
      expect([29.9, 39.9]).toContain(Number((preco.p as { valor: number }).valor));
      const outra = await criarPessoa(b, pessoa('outra'));
      expect((await tentar(b, outra, `select public.cobranca_preco($1)`, [o])).codigo).toBe('42501');
    }));
});

d('cobrança pelo servidor', () => {
  it('o servidor lê assinaturas e pagamentos; sem a chave, ninguém lê', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const a = await assinatura(b, o);
      await cobranca(b, o, a.id, 'pay_s1');
      expect(await linhas(b, null, `select externo from public.pagamentos where oficina_id = $1`, [o], sistema)).toEqual([{ externo: 'pay_s1' }]);
      expect(await linhas(b, null, `select id from public.assinaturas_pro where oficina_id = $1`, [o], sistema)).toHaveLength(1);
      expect(await linhas(b, null, `select id from public.pagamentos where oficina_id = $1`, [o])).toEqual([]);
      expect(await linhas(b, null, `select id from public.assinaturas_pro where oficina_id = $1`, [o])).toEqual([]);
    }));

  it('a nota de outro gateway acha o pagamento pelo id da nota', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const a = await assinatura(b, o);
      await cobranca(b, o, a.id, 'txid_s2');
      // a nota avulsa foi pedida ao Asaas para um pagamento da cobrança 'teste'
      await linhas(b, null, `select public.cobranca_nota('teste', 'txid_s2', 'inv_asaas_9', null, null, 'agendada')`, [], sistema);
      // o aviso do Asaas chega só com o id da nota
      await linhas(b, null, `select public.cobranca_nota('asaas', null, 'inv_asaas_9', '77', 'https://nota.exemplo/77.pdf', 'emitida')`, [], sistema);
      expect((await linhas(b, dono, `select nota_numero, nota_situacao from public.pagamentos where externo = 'txid_s2'`))[0]).toEqual({ nota_numero: '77', nota_situacao: 'emitida' });
      expect((await tentar(b, null, `select public.cobranca_nota('teste', 'txid_s2', 'x', null, null, 'esquisita')`, [], sistema)).codigo).toBe('22023');
    }));

  it('a autorização aprovada no banco ativa a assinatura e tira o código da tela', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const [r] = await linhas(
        b,
        null,
        `select public.cobranca_registrar_assinatura($1, 'efi', 'pix_automatico', null, 'RR123', 29.90, null, null, null, current_date, '00020101...', null) as id`,
        [o],
        sistema
      );
      expect((await tentar(b, dono, `select public.cobranca_autorizacao_aprovada('efi', 'RR123')`)).codigo).toBe('42501');
      await linhas(b, null, `select public.cobranca_autorizacao_aprovada('efi', 'RR123')`, [], sistema);
      expect((await linhas(b, dono, `select situacao, autorizacao from public.assinaturas_pro where id = $1`, [r.id]))[0]).toEqual({ situacao: 'ativa', autorizacao: null });
    }));
});

d('cobrança das lojas', () => {
  it('o financeiro lança, a loja dona vê, outra loja não; marcar como pago', () =>
    emTransacao(async (b) => {
      const fin = await criarPessoa(b, pessoa('fin', { totpHa: 60 }));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, fin, 'financeiro');
      await criarEquipe(b, sup, 'suporte');
      const dona = await criarPessoa(b, pessoa('dona'));
      const rival = await criarPessoa(b, pessoa('rival'));
      const loja = await criarLoja(b, dona);
      await criarLoja(b, rival, { nome: 'Rival' });
      expect((await tentar(b, sup, `select public.cobranca_lancar_loja($1, '2026-10', 150)`, [loja.fornecedorId])).codigo).toBe('42501');
      const [l] = await linhas(b, fin, `select public.cobranca_lancar_loja($1, '2026-10', 150.5) as id`, [loja.fornecedorId]);
      expect(await linhas(b, dona, `select valor from public.pagamentos where id = $1`, [l.id])).toEqual([{ valor: '150.50' }]);
      expect(await linhas(b, rival, `select valor from public.pagamentos where id = $1`, [l.id])).toEqual([]);
      const [m] = await linhas(b, fin, `select public.cobranca_marcar_pago($1) as r`, [l.id]);
      expect(m.r).toMatchObject({ achou: true });
      expect((await linhas(b, dona, `select situacao from public.pagamentos where id = $1`, [l.id]))[0].situacao).toBe('pago');
      // a equipe sem financeiro não marca
      expect((await tentar(b, sup, `select public.cobranca_marcar_pago($1)`, [l.id])).codigo).toBe('42501');
    }));
});
