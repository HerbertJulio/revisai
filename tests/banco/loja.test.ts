import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

/** Uma oficina manda n pedidos de um produto da loja; devolve os ids das partes da loja. */
async function pedidos(b: Banco, n: number) {
  const dono = await criarPessoa(b, pessoa('oficina'));
  const lojista = await criarPessoa(b, pessoa('lojista'));
  const o = await criarOficina(b, dono);
  const loja = await criarLoja(b, lojista);
  const partes: number[] = [];
  // código do pedido: 6 letras e números, sem repetir entre chamadas do mesmo teste
  const prefixo = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, 'X');
  for (let i = 0; i < n; i++) {
    const [ped] = await linhas(
      b,
      dono,
      `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb) returning id`,
      [`${prefixo}${String(i).padStart(3, '0')}`, o, JSON.stringify([{ produto_id: loja.produtoId, quantidade: 1 }])]
    );
    const r = await b.query('select id from public.pedidos_fornecedores where pedido_id = $1', [ped.id]);
    partes.push(Number(r.rows[0].id));
  }
  return { dono, lojista, loja, partes };
}

const muda = (b: Banco, p: Parameters<typeof linhas>[1], parte: number, sql: string) => tentar(b, p, `update public.pedidos_fornecedores set ${sql} where id = $1`, [parte]);

d('reputação das lojas', () => {
  it('loja com menos de 5 pedidos aparece como nova', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 4);
      const [r] = await linhas(b, null, 'select public.reputacao_das_lojas($1) as r', [[x.loja.fornecedorId]]);
      expect((r.r as Record<string, unknown>)[String(x.loja.fornecedorId)]).toEqual({ nova: true, pedidos: 4 });
    }));

  it('conta cancelamentos da loja, atrasos depois da confirmação e o tempo para confirmar', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 6);
      const [p1, p2, p3, p4, p5, p6] = x.partes;
      // p1: a loja cancela com motivo
      expect((await muda(b, x.lojista, p1, `status = 'cancelado', cancelado_motivo = 'Sem estoque'`)).erro).toBeNull();
      // p2..p6: confirmados
      for (const p of [p2, p3, p4, p5, p6]) expect((await muda(b, x.lojista, p, `status = 'confirmado'`)).erro).toBeNull();
      // p2 entregue a tempo; p3 entregue depois de 4 dias; p4 confirmado há 5 dias e ainda não chegou
      expect((await muda(b, x.lojista, p2, `status = 'entregue'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p3, `status = 'entregue'`)).erro).toBeNull();
      // volta as datas sem passar pelas regras (sem gatilhos só nesta transação, sem travar a tabela)
      await b.query('set local session_replication_role = replica');
      await b.query(`update public.pedidos_fornecedores set criado_em = now() - interval '6 days' where id = any($1)`, [[p3, p4]]);
      await b.query(`update public.pedidos_historico set quando = now() - interval '5 days' where parte_id = any($1) and para = 'confirmado'`, [[p3, p4]]);
      await b.query(`update public.pedidos_historico set quando = now() - interval '1 day' where parte_id = $1 and para = 'entregue'`, [p3]);
      await b.query(`update public.pedidos_fornecedores set entregue_em = now() - interval '1 day' where id = $1`, [p3]);
      await b.query('set local session_replication_role = origin');

      const [r] = await linhas(b, null, 'select public.reputacao_das_lojas($1) as r', [[x.loja.fornecedorId, 999999999]]);
      const rep = (r.r as Record<string, { nova: boolean; pedidos: number; canceladosPct: number; atrasoPct: number; horasParaConfirmar: number }>)[String(x.loja.fornecedorId)];
      expect(rep.nova).toBe(false);
      expect(rep.pedidos).toBe(6);
      expect(rep.canceladosPct).toBeCloseTo(16.7, 1);
      // 5 confirmados (fora o cancelado): p3 chegou depois de 4 dias e p4 passou de 3 dias sem chegar
      expect(rep.atrasoPct).toBeCloseTo(40, 1);
      expect(rep.horasParaConfirmar).toBeGreaterThan(0);
      // a loja que não existe vem como nova, sem nada
      expect((r.r as Record<string, unknown>)['999999999']).toEqual({ nova: true, pedidos: 0 });
    }));
});

d('o que a loja faz no painel', () => {
  it('pede impulso só do próprio produto e como pedido; pede o Destaque como cadastro', () =>
    emTransacao(async (b) => {
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const rival = await criarPessoa(b, pessoa('rival'));
      const loja = await criarLoja(b, lojista);
      const outra = await criarLoja(b, rival, { nome: 'Outra' });
      expect((await tentar(b, lojista, `insert into public.impulsos (produto_id, fornecedor_id, uf, dias, valor, status) values ($1, $2, 'RJ', 7, 49, 'pedido')`, [loja.produtoId, loja.fornecedorId])).erro).toBeNull();
      expect((await tentar(b, lojista, `insert into public.impulsos (produto_id, fornecedor_id, uf, dias, valor, status, inicio, fim) values ($1, $2, 'RJ', 7, 0, 'ativo', current_date, current_date + 7)`, [loja.produtoId, loja.fornecedorId])).erro).toBeTruthy();
      expect((await tentar(b, lojista, `insert into public.impulsos (produto_id, fornecedor_id, uf, dias, valor, status) values ($1, $2, 'RJ', 7, 49, 'pedido')`, [outra.produtoId, loja.fornecedorId])).erro).toBeTruthy();
      expect((await tentar(b, lojista, `insert into public.interessados (tipo, nome, empresa, whatsapp, plano, origem, consentimento) values ('fornecedor', 'Loja Teste', 'Loja Teste', '5521977776666', 'destaque', 'painel-fornecedor', true)`)).erro).toBeNull();
    }));

  it('a loja muda a própria resposta enquanto o alerta está aberto', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('oficina'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, lojista);
      const [a] = await linhas(
        b,
        dono,
        `insert into public.alertas_preco (oficina_id, oficina_uf, categoria, titulo, produto_id, quantidade, preco_alvo, expira_em) values ($1, 'RJ', 'oleo_motor', 'Óleo', $2, 4, 30, now() + interval '48 hours') returning id`,
        [o, loja.produtoId]
      );
      // a loja vê o alerta (sem nome nem WhatsApp da oficina)
      const vistos = await linhas(b, lojista, 'select * from public.alertas_preco');
      expect(vistos.map((x) => x.id)).toEqual([a.id]);
      await linhas(b, lojista, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'contraproposta', $3, 35, 4)`, [a.id, loja.fornecedorId, loja.produtoId]);
      const mudou = await tentar(b, lojista, `update public.alertas_respostas set preco = 33, criado_em = now() where alerta_id = $1 and fornecedor_id = $2 and status = 'enviada' and pedido_id is null returning preco`, [a.id, loja.fornecedorId]);
      expect(mudou.erro).toBeNull();
      expect(Number(mudou.linhas[0].preco)).toBe(33);
      // recusa sem produto e sem preço vale
      const outraLoja = await criarPessoa(b, pessoa('outra'));
      const l2 = await criarLoja(b, outraLoja, { nome: 'Outra' });
      expect((await tentar(b, outraLoja, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo) values ($1, $2, 'recusa')`, [a.id, l2.fornecedorId])).erro).toBeNull();
    }));

  it('só o dono troca a chave Pix; o vendedor vê os pedidos', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono', { entrouHa: 30 }));
      const vendedor = await criarPessoa(b, pessoa('vendedor', { entrouHa: 30 }));
      const loja = await criarLoja(b, dono);
      await linhas(b, dono, `select public.convidar('fornecedor', $1, $2, 'vendedor')`, [String(loja.fornecedorId), vendedor.email]);
      expect((await linhas(b, vendedor, 'select public.aceitar_convite() as n'))[0].n).toBe(1);
      expect((await tentar(b, vendedor, `select public.loja_trocar_pix($1, 'cnpj', '12345678000199', 'Loja', 'Rio')`, [loja.fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, dono, `select public.loja_trocar_pix($1, 'cnpj', '12345678000199', 'Loja', 'Rio')`, [loja.fornecedorId])).erro).toBeNull();
      // o vendedor não convida nem tira ninguém
      expect((await tentar(b, vendedor, `select public.convidar('fornecedor', $1, 'z@teste.dev', 'vendedor')`, [String(loja.fornecedorId)])).codigo).toBe('42501');
      expect((await tentar(b, vendedor, `select public.remover_membro('fornecedor', $1, $2)`, [String(loja.fornecedorId), dono.id])).codigo).toBe('42501');
      // vê os colegas
      expect(await linhas(b, vendedor, 'select user_id from public.fornecedor_membros where fornecedor_id = $1', [loja.fornecedorId])).toHaveLength(2);
    }));

  it('o Pix e o cadastro são do dono: o vendedor não vê a chave, não cancela a troca e não muda a loja', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono', { entrouHa: 30 }));
      const vendedor = await criarPessoa(b, pessoa('vendedor', { entrouHa: 30 }));
      const loja = await criarLoja(b, dono);
      await linhas(b, dono, `select public.convidar('fornecedor', $1, $2, 'vendedor')`, [String(loja.fornecedorId), vendedor.email]);
      await linhas(b, vendedor, 'select public.aceitar_convite()');
      // a primeira chave vale na hora; a segunda espera 24 horas
      await linhas(b, dono, `select public.loja_trocar_pix($1, 'cnpj', '12345678000199', 'Loja', 'Rio')`, [loja.fornecedorId]);
      const [troca] = await linhas(b, dono, `select public.loja_trocar_pix($1, 'email', 'nova@loja.dev', 'Loja', 'Rio') as r`, [loja.fornecedorId]);
      expect((troca.r as { imediata: boolean }).imediata).toBe(false);

      // o vendedor não lê nada do Pix direto; pela função, só sabe que a loja recebe por Pix
      for (const t of ['fornecedores_pix', 'fornecedores_pix_troca', 'fornecedores_pix_historico']) {
        expect(await linhas(b, vendedor, `select * from public.${t} where fornecedor_id = $1`, [loja.fornecedorId])).toHaveLength(0);
      }
      const [pv] = await linhas(b, vendedor, 'select public.loja_pix($1) as p', [loja.fornecedorId]);
      expect(pv.p).toEqual({ tem: true, dono: false });

      // o dono vê a chave, a troca (e quem pediu)
      const [pd] = await linhas(b, dono, 'select public.loja_pix($1) as p', [loja.fornecedorId]);
      const p = pd.p as { atual: { chave: string }; troca: { chave: string; pedidaPor: string }; antigas: unknown[] };
      expect(p.atual.chave).toBe('12345678000199');
      expect(p.troca.chave).toBe('nova@loja.dev');
      expect(p.troca.pedidaPor).toBe(dono.email);

      // o vendedor não cancela a troca; o dono cancela
      expect((await tentar(b, vendedor, 'select public.loja_cancelar_troca_pix($1)', [loja.fornecedorId])).codigo).toBe('42501');
      expect((await linhas(b, dono, 'select public.loja_cancelar_troca_pix($1) as ok', [loja.fornecedorId]))[0].ok).toBe(true);

      // passadas as 24 horas, a leitura aplica a troca e guarda a chave antiga
      await linhas(b, dono, `select public.loja_trocar_pix($1, 'email', 'nova@loja.dev', 'Loja', 'Rio')`, [loja.fornecedorId]);
      await b.query(`update public.fornecedores_pix_troca set vale_em = now() - interval '1 minute' where fornecedor_id = $1`, [loja.fornecedorId]);
      const [depois] = await linhas(b, dono, 'select public.loja_pix($1) as p', [loja.fornecedorId]);
      const d2 = depois.p as { atual: { chave: string }; troca: unknown; antigas: { chave: string }[] };
      expect(d2.atual.chave).toBe('nova@loja.dev');
      expect(d2.troca).toBeNull();
      expect(d2.antigas.map((x) => x.chave)).toEqual(['12345678000199']);

      // quem não é da loja não vê nem o resumo
      const estranho = await criarPessoa(b, pessoa('estranho'));
      expect((await tentar(b, estranho, 'select public.loja_pix($1)', [loja.fornecedorId])).codigo).toBe('42501');

      // o cadastro: o vendedor não muda; o dono muda
      expect((await tentar(b, vendedor, `update public.fornecedores set nome = 'Golpe' where id = $1`, [loja.fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, dono, `update public.fornecedores set descricao = 'Peças e óleo' where id = $1`, [loja.fornecedorId])).erro).toBeNull();
    }));

  it('chamar ou passar alguém a dono pede o código do e-mail de novo; a loja nunca fica sem dono', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const vendedor = await criarPessoa(b, pessoa('vendedor'));
      const loja = await criarLoja(b, dono);
      const alvo = String(loja.fornecedorId);
      // entrou há uma hora: chama vendedor, mas não outro dono
      expect((await tentar(b, dono, `select public.convidar('fornecedor', $1, 'socio@teste.dev', 'dono')`, [alvo])).codigo).toBe('RV020');
      await linhas(b, dono, `select public.convidar('fornecedor', $1, $2, 'vendedor')`, [alvo, vendedor.email]);
      await linhas(b, vendedor, 'select public.aceitar_convite()');
      expect((await tentar(b, dono, 'select public.loja_mudar_papel($1, $2, $3)', [loja.fornecedorId, vendedor.id, 'dono'])).codigo).toBe('RV020');
      // o vendedor não muda papéis
      expect((await tentar(b, vendedor, 'select public.loja_mudar_papel($1, $2, $3)', [loja.fornecedorId, vendedor.id, 'dono'])).codigo).toBe('42501');
      // o único dono não deixa de ser dono
      expect((await tentar(b, dono, 'select public.loja_mudar_papel($1, $2, $3)', [loja.fornecedorId, dono.id, 'vendedor'])).codigo).toBe('P0001');

      // depois do código do e-mail, dá
      const recente = { ...dono, entrouHa: 20 };
      expect((await tentar(b, recente, `select public.convidar('fornecedor', $1, 'socio@teste.dev', 'dono')`, [alvo])).erro).toBeNull();
      expect((await linhas(b, recente, 'select public.loja_mudar_papel($1, $2, $3) as ok', [loja.fornecedorId, vendedor.id, 'dono']))[0].ok).toBe(true);
      // com dois donos, um deles pode voltar a vendedor
      expect((await linhas(b, recente, 'select public.loja_mudar_papel($1, $2, $3) as ok', [loja.fornecedorId, vendedor.id, 'vendedor']))[0].ok).toBe(true);
      expect((await tentar(b, dono, 'select public.loja_mudar_papel($1, $2, $3)', [loja.fornecedorId, vendedor.id, 'gerente'])).codigo).toBe('22023');
    }));

});

d('estoque, planilha e prazo da loja', () => {
  it('o estoque baixa quando a loja confirma e volta se ela cancelar depois; sem estoque informado, nada muda', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 2);
      await b.query('update public.produtos set estoque = 10 where id = $1', [x.loja.produtoId]);
      const [p1, p2] = x.partes;
      const estoque = async () => Number((await b.query('select estoque from public.produtos where id = $1', [x.loja.produtoId])).rows[0].estoque);
      expect((await muda(b, x.lojista, p1, `status = 'confirmado'`)).erro).toBeNull();
      expect(await estoque()).toBe(9);
      expect((await muda(b, x.lojista, p1, `status = 'saiu_entrega'`)).erro).toBeNull();
      expect(await estoque()).toBe(9);
      expect((await muda(b, x.lojista, p1, `status = 'cancelado', cancelado_motivo = 'A oficina desistiu'`)).erro).toBeNull();
      expect(await estoque()).toBe(10);
      // cancelado antes de confirmar não mexe no estoque
      expect((await muda(b, x.lojista, p2, `status = 'cancelado', cancelado_motivo = 'Sem o produto no estoque'`)).erro).toBeNull();
      expect(await estoque()).toBe(10);
      // sem estoque informado (vazio), continua vazio
      const y = await pedidos(b, 1);
      expect((await muda(b, y.lojista, y.partes[0], `status = 'confirmado'`)).erro).toBeNull();
      expect((await b.query('select estoque from public.produtos where id = $1', [y.loja.produtoId])).rows[0].estoque).toBeNull();
    }));

  it('a planilha importa numa transação só e só mexe nos produtos da própria loja', () =>
    emTransacao(async (b) => {
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const rival = await criarPessoa(b, pessoa('rival'));
      const loja = await criarLoja(b, lojista);
      const outra = await criarLoja(b, rival, { nome: 'Outra' });
      const base = { categoria: 'filtro_oleo', unidade: 'un', preco: 25.5, ativo: true, especificacao: {}, aplicacoes: [{ texto: 'Gol 1.0 2015-2020', marca: 'Volkswagen', modelo: 'Gol', anoDe: 2015, anoAte: 2020 }] };
      const [r] = await linhas(b, lojista, 'select public.loja_importar_produtos($1, $2::jsonb) as r', [
        loja.fornecedorId,
        JSON.stringify([
          { ...base, codigo: 'FO-01', nome: 'Filtro de óleo PSL 140', estoque: 12 },
          { ...base, id: loja.produtoId, codigo: 'OL-5W30', nome: 'Óleo 5W30 1L', categoria: 'oleo_motor', preco: 38 }
        ])
      ]);
      expect(r.r).toEqual({ novos: 1, mudados: 1 });
      const meus = (await b.query('select codigo, nome, preco, estoque, aplicacoes from public.produtos where fornecedor_id = $1 order by codigo', [loja.fornecedorId])).rows;
      expect(meus.map((x) => x.codigo)).toEqual(['FO-01', 'OL-5W30']);
      expect(Number(meus[1].preco)).toBe(38);
      expect(meus[0].estoque).toBe(12);
      // mexer no produto da outra loja derruba a importação toda
      const antes = (await b.query('select count(*)::int as n from public.produtos where fornecedor_id = $1', [loja.fornecedorId])).rows[0].n;
      const errada = await tentar(b, lojista, 'select public.loja_importar_produtos($1, $2::jsonb)', [
        loja.fornecedorId,
        JSON.stringify([{ ...base, codigo: 'NOVO', nome: 'Produto novo' }, { ...base, id: outra.produtoId, nome: 'Golpe' }])
      ]);
      expect(errada.codigo).toBe('42501');
      expect((await b.query('select count(*)::int as n from public.produtos where fornecedor_id = $1', [loja.fornecedorId])).rows[0].n).toBe(antes);
      expect((await b.query('select nome from public.produtos where id = $1', [outra.produtoId])).rows[0].nome).not.toBe('Golpe');
      // nem importa para a loja dos outros
      expect((await tentar(b, lojista, 'select public.loja_importar_produtos($1, $2::jsonb)', [outra.fornecedorId, JSON.stringify([{ ...base, nome: 'X' }])])).codigo).toBe('42501');
      // o código não repete na mesma loja (em outra loja pode)
      expect((await tentar(b, lojista, 'select public.loja_importar_produtos($1, $2::jsonb)', [loja.fornecedorId, JSON.stringify([{ ...base, codigo: 'FO-01', nome: 'Repetido' }])])).codigo).toBe('23505');
      expect((await tentar(b, rival, 'select public.loja_importar_produtos($1, $2::jsonb)', [outra.fornecedorId, JSON.stringify([{ ...base, codigo: 'FO-01', nome: 'Na outra loja' }])])).erro).toBeNull();
    }));

  it('o prazo de entrega e o aviso por WhatsApp são do dono', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const loja = await criarLoja(b, dono);
      expect((await tentar(b, dono, 'update public.fornecedores set prazo_entrega_horas = 4, avisar_whatsapp = false where id = $1', [loja.fornecedorId])).erro).toBeNull();
      expect((await tentar(b, dono, 'update public.fornecedores set prazo_entrega_horas = 0 where id = $1', [loja.fornecedorId])).codigo).toBe('23514');
      // o prazo aparece no catálogo público
      const [l] = await linhas(b, null, 'select prazo_entrega_horas from public.fornecedores where id = $1', [loja.fornecedorId]);
      expect(l.prazo_entrega_horas).toBe(4);
    }));
});

/** 'AAAA-MM' do mês em Brasília de um instante. */
function mesEmBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
}

d('extrato da loja (base da cobrança)', () => {
  it('soma as partes confirmadas do mês, a comissão de cada uma e a mensalidade do Destaque', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 5);
      const [p1, p2, p3, p4] = x.partes;
      expect((await muda(b, x.lojista, p1, `status = 'confirmado'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p2, `status = 'confirmado'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p2, `status = 'saiu_entrega'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p3, `status = 'confirmado'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p3, `status = 'entregue'`)).erro).toBeNull();
      expect((await muda(b, x.lojista, p4, `status = 'cancelado', cancelado_motivo = 'A oficina desistiu'`)).erro).toBeNull();
      // p5 continua novo: não entra
      await b.query(`insert into public.fornecedores_contrato (fornecedor_id, plano, comissao_percentual, mensalidade) values ($1, 'destaque', 4, 99)`, [x.loja.fornecedorId]);
      await b.query(`update public.fornecedores set destaque = true, destaque_ate = '2026-12-31' where id = $1`, [x.loja.fornecedorId]);
      const mes = mesEmBrasilia(new Date());
      const [r] = await linhas(b, x.lojista, 'select public.extrato_da_loja($1, $2) as e', [x.loja.fornecedorId, mes]);
      const e = r.e as { fornecedorId: number; nome: string; mes: string; partes: { parteId: number; situacao: string; subtotal: number; comissaoPercentual: number; comissao: number; codigo: string; data: string }[]; totalVendas: number; totalComissao: number; mensalidade: number; destaqueAte: string; total: number };
      expect(e.fornecedorId).toBe(x.loja.fornecedorId);
      expect(e.mes).toBe(mes);
      expect(e.partes.map((p) => p.parteId).sort()).toEqual([p1, p2, p3].sort());
      expect(e.partes.map((p) => p.situacao).sort()).toEqual(['confirmado', 'entregue', 'saiu_entrega']);
      const sub = Number(e.partes[0].subtotal);
      const pct = Number(e.partes[0].comissaoPercentual);
      expect(Number(e.partes[0].comissao)).toBeCloseTo(Math.round(sub * pct) / 100, 2);
      expect(Number(e.totalVendas)).toBeCloseTo(sub * 3, 2);
      expect(Number(e.totalComissao)).toBeCloseTo((Math.round(sub * pct) / 100) * 3, 2);
      expect(Number(e.mensalidade)).toBe(99);
      expect(e.destaqueAte).toBe('2026-12-31');
      expect(Number(e.total)).toBeCloseTo(Number(e.totalComissao) + 99, 2);
      expect(Object.keys(e).sort()).toEqual(['destaqueAte', 'fornecedorId', 'mensalidade', 'mes', 'nome', 'partes', 'total', 'totalComissao', 'totalVendas']);
      expect(Object.keys(e.partes[0]).sort()).toEqual(['codigo', 'comissao', 'comissaoPercentual', 'data', 'parteId', 'situacao', 'subtotal']);

      // a parte criada antes da meia-noite do dia 1 (em Brasília) é do mês anterior
      const [ini] = (await b.query(`select (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as inicio`)).rows;
      await b.query('set local session_replication_role = replica');
      await b.query(`update public.pedidos_fornecedores set criado_em = $2::timestamptz - interval '1 hour' where id = $1`, [p3, ini.inicio]);
      await b.query('set local session_replication_role = origin');
      const anterior = mesEmBrasilia(new Date(new Date(ini.inicio).getTime() - 3600_000));
      const [agora] = await linhas(b, x.lojista, 'select public.extrato_da_loja($1, $2) as e', [x.loja.fornecedorId, mes]);
      expect((agora.e as { partes: unknown[] }).partes).toHaveLength(2);
      const [antes] = await linhas(b, x.lojista, 'select public.extrato_da_loja($1, $2) as e', [x.loja.fornecedorId, anterior]);
      expect((antes.e as { partes: { parteId: number }[] }).partes.map((p) => p.parteId)).toEqual([p3]);
      // sem contrato Destaque, sem mensalidade
      await b.query(`update public.fornecedores_contrato set plano = 'vitrine' where fornecedor_id = $1`, [x.loja.fornecedorId]);
      const [vitrine] = await linhas(b, x.lojista, 'select public.extrato_da_loja($1, $2) as e', [x.loja.fornecedorId, mes]);
      expect(Number((vitrine.e as { mensalidade: number }).mensalidade)).toBe(0);
    }));

  it('a loja (dono ou vendedor) e o financeiro veem; os outros não', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 1);
      const mes = mesEmBrasilia(new Date());
      const vendedor = await criarPessoa(b, pessoa('vendedor'));
      await b.query(`insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email) values ($1, $2, 'vendedor', $3)`, [x.loja.fornecedorId, vendedor.id, vendedor.email]);
      const financeiro = await criarPessoa(b, pessoa('financeiro', { totpHa: 60 }));
      await criarEquipe(b, financeiro, 'financeiro');
      const suporte = await criarPessoa(b, pessoa('suporte', { totpHa: 60 }));
      await criarEquipe(b, suporte, 'suporte');
      const sql = 'select public.extrato_da_loja($1, $2)';
      expect((await tentar(b, vendedor, sql, [x.loja.fornecedorId, mes])).erro).toBeNull();
      expect((await tentar(b, financeiro, sql, [x.loja.fornecedorId, mes])).erro).toBeNull();
      expect((await tentar(b, suporte, sql, [x.loja.fornecedorId, mes])).codigo).toBe('42501');
      expect((await tentar(b, x.dono, sql, [x.loja.fornecedorId, mes])).codigo).toBe('42501');
      expect((await tentar(b, null, sql, [x.loja.fornecedorId, mes])).codigo).toBe('42501');
      expect((await tentar(b, null, sql, [x.loja.fornecedorId, mes], { sistema: true })).erro).toBeNull();
      expect((await tentar(b, x.lojista, sql, [x.loja.fornecedorId, '2026-13'])).codigo).toBe('22023');
    }));
});

/**
 * A ligação proposta em public.calcular_pedido (fica com quem cuida do pedido): o preço por oficina
 * entra no menor preço e o pedido mínimo é conferido no fim. Aplicada só dentro da transação do teste.
 */
async function ligarCondicoesNoPedido(b: Banco) {
  const [{ def }] = (await b.query(`select pg_get_functiondef('public.calcular_pedido'::regproc) as def`)).rows as { def: string }[];
  const trocas: [string, string][] = [
    ['v_unitario numeric(10, 2);', 'v_unitario numeric(10, 2);\n  v_especial numeric(10, 2);'],
    [
      'v_unitario := least(v_preco, coalesce(v_promocional, v_preco), coalesce(v_combinado, v_preco));',
      'v_especial := privado.preco_para_oficina(v_produto_id, new.oficina_id, v_preco);\n    v_unitario := least(v_preco, coalesce(v_promocional, v_preco), coalesce(v_combinado, v_preco), v_especial);'
    ],
    ['new.itens := v_calculados;', 'perform privado.conferir_pedido_minimo(v_calculados);\n  new.itens := v_calculados;']
  ];
  let novo = def;
  for (const [de, para] of trocas) {
    expect(novo.includes(de), `calcular_pedido mudou: não achei "${de}"`).toBe(true);
    novo = novo.replace(de, para);
  }
  await b.query(novo);
}

d('condições da loja: preço por oficina e pedido mínimo', () => {
  it('a loja combina condições só com oficinas que já compraram; cada oficina vê só as dela', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 1);
      const [{ oficina_id: oficina }] = (await b.query('select oficina_id from public.pedidos_fornecedores where id = $1', [x.partes[0]])).rows;
      const estranha = await criarPessoa(b, pessoa('estranha'));
      const outraOficina = await criarOficina(b, estranha, 'Outra Oficina');
      const rival = await criarPessoa(b, pessoa('rival'));
      const outraLoja = await criarLoja(b, rival, { nome: 'Outra' });
      const inserir = (p: Parameters<typeof tentar>[1], loja: number, of: string, produto: number | null, campo: string, valor: number) =>
        tentar(b, p, `insert into public.precos_por_oficina (fornecedor_id, oficina_id, produto_id, ${campo}) values ($1, $2, $3, $4) returning id`, [loja, of, produto, valor]);
      expect((await inserir(x.lojista, x.loja.fornecedorId, oficina, null, 'desconto_percentual', 5)).erro).toBeNull();
      expect((await inserir(x.lojista, x.loja.fornecedorId, oficina, x.loja.produtoId, 'preco', 30)).erro).toBeNull();
      // oficina que nunca comprou, produto de outra loja, loja dos outros: não
      expect((await inserir(x.lojista, x.loja.fornecedorId, outraOficina, null, 'desconto_percentual', 5)).erro).toBeTruthy();
      expect((await inserir(x.lojista, x.loja.fornecedorId, oficina, outraLoja.produtoId, 'preco', 1)).erro).toBeTruthy();
      expect((await inserir(rival, x.loja.fornecedorId, oficina, null, 'desconto_percentual', 50)).erro).toBeTruthy();
      // preço fixo só em produto, e um valor só
      expect((await inserir(x.lojista, x.loja.fornecedorId, oficina, null, 'preco', 10)).erro).toBeTruthy();
      expect((await tentar(b, x.lojista, 'insert into public.precos_por_oficina (fornecedor_id, oficina_id, desconto_percentual, preco) values ($1, $2, 5, 10)', [x.loja.fornecedorId, oficina])).erro).toBeTruthy();
      // a oficina vê as dela; a outra oficina e a outra loja não veem nada
      expect(await linhas(b, x.dono, 'select id from public.precos_por_oficina')).toHaveLength(2);
      expect(await linhas(b, estranha, 'select id from public.precos_por_oficina')).toHaveLength(0);
      expect(await linhas(b, rival, 'select id from public.precos_por_oficina')).toHaveLength(0);
      // a oficina não mexe; a loja muda e tira
      expect((await tentar(b, x.dono, 'update public.precos_por_oficina set desconto_percentual = 80 where produto_id is null returning id')).linhas).toHaveLength(0);
      expect((await tentar(b, x.lojista, 'update public.precos_por_oficina set desconto_percentual = 8 where produto_id is null returning id')).linhas).toHaveLength(1);
      expect((await tentar(b, x.lojista, 'update public.precos_por_oficina set oficina_id = $1 where produto_id is null', [outraOficina])).codigo).toBe('42501');
      expect((await tentar(b, x.lojista, 'delete from public.precos_por_oficina where produto_id is not null returning id')).linhas).toHaveLength(1);
      // a lista de clientes da loja
      const [c] = await linhas(b, x.lojista, 'select public.loja_clientes($1) as c', [x.loja.fornecedorId]);
      expect((c.c as { oficinaId: string; pedidos: number }[]).map((o) => [o.oficinaId, o.pedidos])).toEqual([[oficina, 1]]);
      expect((await tentar(b, rival, 'select public.loja_clientes($1)', [x.loja.fornecedorId])).codigo).toBe('42501');
    }));

  it('o preço para a oficina: preço fixo do produto, senão o maior desconto; o pedido mínimo recusa com RV030', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 1);
      const [{ oficina_id: oficina }] = (await b.query('select oficina_id from public.pedidos_fornecedores where id = $1', [x.partes[0]])).rows;
      const preco = async (p: Parameters<typeof linhas>[1]) => Number((await linhas(b, p, 'select privado.preco_para_oficina($1, $2, 40) as v', [x.loja.produtoId, oficina]))[0].v);
      expect(await preco(x.dono)).toBe(40);
      await linhas(b, x.lojista, `insert into public.precos_por_oficina (fornecedor_id, oficina_id, desconto_percentual) values ($1, $2, 5)`, [x.loja.fornecedorId, oficina]);
      expect(await preco(x.dono)).toBe(38);
      await linhas(b, x.lojista, `insert into public.precos_por_oficina (fornecedor_id, oficina_id, produto_id, desconto_percentual) values ($1, $2, $3, 12.5)`, [x.loja.fornecedorId, oficina, x.loja.produtoId]);
      expect(await preco(x.dono)).toBe(35);
      await linhas(b, x.lojista, `update public.precos_por_oficina set desconto_percentual = null, preco = 33.9 where produto_id is not null`);
      expect(await preco(x.dono)).toBe(33.9);
      // quem não é a oficina não enxerga a condição (fica o preço normal)
      const curiosa = await criarPessoa(b, pessoa('curiosa'));
      await criarOficina(b, curiosa);
      expect(Number((await linhas(b, curiosa, 'select privado.preco_para_oficina($1, $2, 40) as v', [x.loja.produtoId, oficina]))[0].v)).toBe(40);

      await b.query('update public.fornecedores set pedido_minimo = 100 where id = $1', [x.loja.fornecedorId]);
      const itens = (q: number) => JSON.stringify([{ fornecedor_id: x.loja.fornecedorId, preco_unitario: 40, quantidade: q }]);
      const r = await tentar(b, x.dono, 'select privado.conferir_pedido_minimo($1::jsonb)', [itens(2)]);
      expect(r.codigo).toBe('RV030');
      expect(r.erro).toContain('100,00');
      expect((await tentar(b, x.dono, 'select privado.conferir_pedido_minimo($1::jsonb)', [itens(3)])).erro).toBeNull();
    }));

  it('com a ligação proposta no cálculo do pedido, a oficina paga o preço combinado e respeita o mínimo', () =>
    emTransacao(async (b) => {
      const x = await pedidos(b, 1);
      const [{ oficina_id: oficina }] = (await b.query('select oficina_id from public.pedidos_fornecedores where id = $1', [x.partes[0]])).rows;
      await ligarCondicoesNoPedido(b);
      await linhas(b, x.lojista, `insert into public.precos_por_oficina (fornecedor_id, oficina_id, produto_id, preco) values ($1, $2, $3, 31.5)`, [x.loja.fornecedorId, oficina, x.loja.produtoId]);
      const pedir = (codigo: string, quantidade: number) =>
        tentar(b, x.dono, `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb) returning id`, [
          codigo,
          oficina,
          JSON.stringify([{ produto_id: x.loja.produtoId, quantidade }])
        ]);
      const ok = await pedir('CND001', 2);
      expect(ok.erro).toBeNull();
      const parte = (await b.query('select itens, subtotal from public.pedidos_fornecedores where pedido_id = $1', [ok.linhas[0].id])).rows[0];
      expect(Number(parte.itens[0].preco_unitario)).toBe(31.5);
      expect(Number(parte.subtotal)).toBe(63);
      // com pedido mínimo de R$ 100, duas unidades não bastam; quatro passam
      await b.query('update public.fornecedores set pedido_minimo = 100 where id = $1', [x.loja.fornecedorId]);
      expect((await pedir('CND002', 2)).codigo).toBe('RV030');
      expect((await pedir('CND003', 4)).erro).toBeNull();
    }));
});

