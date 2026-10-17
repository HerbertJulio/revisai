import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar } from './ajuda';
import { cenario, darCredito, mudarParte, pedir, tentarPedir, vendedorDaLoja } from './loja2-ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

d('venda faturada: a linha de crédito', () => {
  it('só o dono da loja dá crédito, e só para a oficina que já comprou dela', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      // ainda não comprou: a política barra
      expect((await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 30)).codigo).toBe('42501');
      await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }]);
      expect((await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 30)).erro).toBeNull();
      // o vendedor vê, mas não dá nem muda crédito
      const vendedor = await vendedorDaLoja(b, c.lojista, c.loja.fornecedorId);
      expect(await linhas(b, vendedor, 'select limite from public.lojas_credito where fornecedor_id = $1', [c.loja.fornecedorId])).toHaveLength(1);
      expect((await tentar(b, vendedor, 'update public.lojas_credito set limite = 9000 where fornecedor_id = $1 returning id', [c.loja.fornecedorId])).linhas).toHaveLength(0);
      expect((await darCredito(b, vendedor, c.loja.fornecedorId, c.oficina, 9000, 30)).codigo).toBe('42501');
      // outra loja não dá crédito em nome desta, nem vê
      const rival = await criarPessoa(b, pessoa('rival'));
      await criarLoja(b, rival, { nome: 'Rival' });
      expect((await darCredito(b, rival, c.loja.fornecedorId, c.oficina, 9000, 30)).codigo).toBe('42501');
      expect(await linhas(b, rival, 'select id from public.lojas_credito where oficina_id = $1', [c.oficina])).toHaveLength(0);
      // a oficina vê o próprio crédito e não muda nada
      const [linha] = await linhas(b, c.donoOficina, 'select limite, prazo_dias, ativo, criado_por from public.lojas_credito where oficina_id = $1', [c.oficina]);
      expect(Number(linha.limite)).toBe(500);
      expect(linha.prazo_dias).toBe(30);
      expect(linha.criado_por).toBe(c.lojista.id);
      expect((await tentar(b, c.donoOficina, 'update public.lojas_credito set limite = 9000 where oficina_id = $1 returning id', [c.oficina])).linhas).toHaveLength(0);
      expect((await darCredito(b, c.donoOficina, c.loja.fornecedorId, c.oficina, 9000, 30)).codigo).toBe('42501');
      // outra oficina não vê
      const outroDono = await criarPessoa(b, pessoa('outra-oficina'));
      await criarOficina(b, outroDono, 'Outra');
      expect(await linhas(b, outroDono, 'select id from public.lojas_credito')).toHaveLength(0);
      // o crédito não muda de oficina
      const outra = await criarOficina(b, outroDono, 'Mais uma');
      expect((await tentar(b, c.lojista, 'update public.lojas_credito set oficina_id = $2 where fornecedor_id = $1', [c.loja.fornecedorId, outra])).codigo).toBe('42501');
      // o dono muda o limite e o prazo
      expect((await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 800, 45)).erro).toBeNull();
      const [mudou] = await linhas(b, c.lojista, 'select limite, prazo_dias from public.lojas_credito where fornecedor_id = $1', [c.loja.fornecedorId]);
      expect([Number(mudou.limite), mudou.prazo_dias]).toEqual([800, 45]);
    }));

  it('limite e prazo fora da faixa não entram', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      expect((await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 0, 30)).codigo).toBe('23514');
      expect((await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 0)).codigo).toBe('23514');
      expect((await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 121)).codigo).toBe('23514');
    }));
});

d('venda faturada: o pedido', () => {
  it('faturado sem linha ativa é recusado com RV062; com a linha, a parte nasce faturada com o prazo', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      const itens = [{ produto_id: c.loja.produtoId, quantidade: 1 }];
      const faturado = { [c.loja.fornecedorId]: 'faturado' };
      const sem = await tentarPedir(b, c, itens, faturado);
      expect(sem.codigo).toBe('RV062');
      expect(sem.hint).toBe(String(c.loja.fornecedorId));
      expect(sem.erro).toMatch(/não vende faturado/);
      // linha desligada também não vale
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 28, false);
      expect((await tentarPedir(b, c, itens, faturado)).codigo).toBe('RV062');
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 500, 28, true);
      const ok = await pedir(b, c, itens, faturado);
      expect(ok.partes).toEqual([expect.objectContaining({ forma: 'faturado', prazo: 28, subtotal: 100 })]);
      // sem escolha, ou com Pix, a parte é Pix
      expect((await pedir(b, c, itens)).partes[0]).toEqual(expect.objectContaining({ forma: 'pix', prazo: null }));
      expect((await pedir(b, c, itens, { [c.loja.fornecedorId]: 'pix' })).partes[0]).toEqual(expect.objectContaining({ forma: 'pix', prazo: null }));
    }));

  it('o que está em aberto mais a compra cabe no limite (RV061, com o valor livre); pago e cancelado liberam', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 250, 30);
      const faturado = { [c.loja.fornecedorId]: 'faturado' };
      const p1 = await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 2 }], faturado);
      expect(p1.partes[0].forma).toBe('faturado');
      // 200 em aberto + 100 passa de 250: estão livres 50
      const passou = await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }], faturado);
      expect(passou.codigo).toBe('RV061');
      expect(Number(passou.detail)).toBe(50);
      expect(passou.hint).toBe(String(c.loja.fornecedorId));
      expect(passou.erro).toMatch(/Estão livres R\$ 50,00/);
      // Pix não usa o crédito
      expect((await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 3 }])).partes[0].forma).toBe('pix');
      // a loja recebe a primeira: o limite volta
      expect((await mudarParte(b, c.lojista, p1.partes[0].id, `status = 'confirmado'`)).erro).toBeNull();
      expect((await mudarParte(b, c.lojista, p1.partes[0].id, `pagamento = 'confirmado'`)).erro).toBeNull();
      const p2 = await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 2 }], faturado);
      expect(p2.partes[0].forma).toBe('faturado');
      // cancelada também não conta
      expect((await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }], faturado)).codigo).toBe('RV061');
      expect((await mudarParte(b, c.lojista, p2.partes[0].id, `status = 'cancelado', cancelado_motivo = 'Sem estoque'`)).erro).toBeNull();
      expect((await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 2 }], faturado)).partes[0].forma).toBe('faturado');
    }));

  it('pedido com duas lojas: cada uma do seu jeito, e a forma que não confere é recusada com RV063', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      const outroLojista = await criarPessoa(b, pessoa('outro-lojista'));
      const outra = await criarLoja(b, outroLojista, { nome: 'Outra loja', preco: 30 });
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 1000, 15);
      const itens = [
        { produto_id: c.loja.produtoId, quantidade: 1 },
        { produto_id: outra.produtoId, quantidade: 1 }
      ];
      const p = await pedir(b, c, itens, { [c.loja.fornecedorId]: 'faturado', [outra.fornecedorId]: 'pix' });
      const porLoja = Object.fromEntries(p.partes.map((x) => [x.fornecedorId, x.forma]));
      expect(porLoja).toEqual({ [c.loja.fornecedorId]: 'faturado', [outra.fornecedorId]: 'pix' });
      // loja fora do pedido, valor desconhecido, formato errado
      expect((await tentarPedir(b, c, itens, { 999999999: 'faturado' })).codigo).toBe('RV063');
      expect((await tentarPedir(b, c, itens, { [c.loja.fornecedorId]: 'boleto' })).codigo).toBe('RV063');
      expect((await tentarPedir(b, c, itens, { [c.loja.fornecedorId]: true })).codigo).toBe('RV063');
      expect((await tentarPedir(b, c, itens, { abc: 'pix' })).codigo).toBe('RV063');
      const lista = await tentar(b, c.donoOficina, `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens, pagamentos) values ('ZZZ999', $1, 'x', '5521911112222', $2::jsonb, '["faturado"]'::jsonb)`, [
        c.oficina,
        JSON.stringify(itens)
      ]);
      expect(lista.codigo).toBe('RV063');
    }));
});

d('venda faturada: vencimento', () => {
  it('vence na entrega mais o prazo; forma, prazo e vencimento não mudam pelo app (só a equipe)', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 1000, 30);
      const p = await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }], { [c.loja.fornecedorId]: 'faturado' });
      const parte = p.partes[0].id;
      expect((await mudarParte(b, c.lojista, parte, `status = 'confirmado'`)).erro).toBeNull();
      const [antes] = await linhas(b, c.lojista, 'select vencimento from public.pedidos_fornecedores where id = $1', [parte]);
      expect(antes.vencimento).toBeNull();
      expect((await mudarParte(b, c.lojista, parte, `status = 'entregue'`)).erro).toBeNull();
      const [depois] = await linhas(
        b,
        c.lojista,
        `select vencimento = ((entregue_em at time zone 'America/Sao_Paulo')::date + 30) as certo, vencimento from public.pedidos_fornecedores where id = $1`,
        [parte]
      );
      expect(depois.certo).toBe(true);
      // ninguém do app muda
      for (const sql of [`vencimento = current_date + 90`, `forma_pagamento = 'pix', prazo_dias = null`, `prazo_dias = 90`]) {
        expect((await mudarParte(b, c.lojista, parte, sql)).codigo).toBe('42501');
        expect((await mudarParte(b, c.donoOficina, parte, sql)).codigo).toBe('42501');
      }
      // a equipe de suporte corrige o vencimento
      const suporte = await criarPessoa(b, pessoa('suporte', { totpHa: 60 }));
      await criarEquipe(b, suporte, 'suporte');
      expect((await mudarParte(b, suporte, parte, `vencimento = current_date + 5`)).erro).toBeNull();
    }));
});

d('venda faturada: leituras', () => {
  it('a loja vê os clientes com crédito e o que está em aberto; a oficina vê o que ainda cabe', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { comprou: true });
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 600, 20);
      await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 2 }], { [c.loja.fornecedorId]: 'faturado' });
      const vendedor = await vendedorDaLoja(b, c.lojista, c.loja.fornecedorId);
      const [r] = await linhas(b, vendedor, 'select public.loja_creditos($1) as r', [c.loja.fornecedorId]);
      const clientes = r.r as { oficinaId: string; aberto: number; faturas: number; credito: { limite: number; prazoDias: number; ativo: boolean } | null }[];
      expect(clientes).toHaveLength(1);
      expect(clientes[0]).toEqual(expect.objectContaining({ oficinaId: c.oficina, aberto: 200, faturas: 1, credito: expect.objectContaining({ limite: 600, prazoDias: 20, ativo: true }) }));
      const [o] = await linhas(b, c.donoOficina, 'select public.credito_da_oficina($1) as r', [c.oficina]);
      expect(o.r).toEqual([expect.objectContaining({ fornecedorId: c.loja.fornecedorId, limite: 600, prazoDias: 20, aberto: 200, livre: 400 })]);
      // linha desligada some da escolha da oficina
      await darCredito(b, c.lojista, c.loja.fornecedorId, c.oficina, 600, 20, false);
      const [o2] = await linhas(b, c.donoOficina, 'select public.credito_da_oficina($1) as r', [c.oficina]);
      expect(o2.r).toEqual([]);
      // quem é de outra loja ou de outra oficina não lê
      const rival = await criarPessoa(b, pessoa('rival'));
      await criarLoja(b, rival, { nome: 'Rival' });
      expect((await tentar(b, rival, 'select public.loja_creditos($1)', [c.loja.fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, rival, 'select public.credito_da_oficina($1)', [c.oficina])).codigo).toBe('42501');
    }));
});
