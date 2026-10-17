import { afterAll, describe, expect, it } from 'vitest';
import { como, criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

async function registrar(b: Banco, p: Parameters<typeof linhas>[1], oficina: string, itens: unknown[]) {
  const [r] = await linhas(b, p, 'select public.gravar_registros($1, $2::jsonb) as r', [oficina, JSON.stringify(itens)]);
  return r.r as { colecao: string; id: string; versao: number }[];
}

d('oficinas separadas', () => {
  it('uma oficina não vê nem grava nada da outra', () =>
    emTransacao(async (b) => {
      const ana = await criarPessoa(b, pessoa('ana'));
      const bia = await criarPessoa(b, pessoa('bia'));
      const oa = await criarOficina(b, ana, 'Oficina da Ana');
      const ob = await criarOficina(b, bia, 'Oficina da Bia');
      await registrar(b, ana, oa, [{ colecao: 'clientes', id: 'c1', dados: { nome: 'João' } }]);
      await registrar(b, bia, ob, [{ colecao: 'clientes', id: 'c1', dados: { nome: 'Maria' } }]);

      expect(await linhas(b, ana, 'select dados->>\'nome\' as n from public.registros')).toEqual([{ n: 'João' }]);
      expect(await linhas(b, bia, 'select dados->>\'nome\' as n from public.registros')).toEqual([{ n: 'Maria' }]);
      expect((await linhas(b, ana, 'select id from public.oficinas')).map((x) => x.id)).toEqual([oa]);
      expect(await linhas(b, ana, 'select * from public.oficina_membros where oficina_id = $1', [ob])).toEqual([]);

      const grava = await tentar(b, ana, 'select public.gravar_registros($1, $2::jsonb)', [ob, JSON.stringify([{ colecao: 'clientes', id: 'x', dados: {} }])]);
      expect(grava.codigo).toBe('42501');
      const le = await tentar(b, ana, 'select public.ler_registros($1, 0)', [ob]);
      expect(le.codigo).toBe('42501');
      // direto na tabela também não
      expect((await tentar(b, ana, `insert into public.registros (oficina_id, colecao, id, dados) values ($1, 'clientes', 'y', '{}')`, [ob])).erro).toBeTruthy();
      expect((await tentar(b, ana, `update public.registros set dados = '{}' where oficina_id = $1`, [ob])).erro).toBeTruthy();
    }));

  it('quem não entrou não vê dados de oficina', () =>
    emTransacao(async (b) => {
      const ana = await criarPessoa(b, pessoa('ana'));
      const oa = await criarOficina(b, ana);
      await registrar(b, ana, oa, [{ colecao: 'clientes', id: 'c1', dados: { nome: 'João' } }]);
      expect((await tentar(b, null, 'select * from public.registros')).erro).toBeTruthy();
      expect(await linhas(b, null, 'select * from public.oficinas')).toEqual([]);
      expect((await tentar(b, null, 'select public.ler_registros($1, 0)', [oa])).erro).toBeTruthy();
    }));

  it('mecânico grava dados mas não o cadastro; convite por e-mail', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const mec = await criarPessoa(b, pessoa('mec'));
      const ger = await criarPessoa(b, pessoa('ger'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email.toUpperCase()]);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'gerente')`, [o, ger.email]);
      // o convite aparece para o convidado e é aceito com o e-mail da conta
      const conta = (await linhas(b, mec, 'select public.minha_conta() as c'))[0].c as { convites: { tipo: string }[] };
      expect(conta.convites).toHaveLength(1);
      expect((await linhas(b, mec, 'select public.aceitar_convite() as n'))[0].n).toBe(1);
      expect((await linhas(b, ger, 'select public.aceitar_convite() as n'))[0].n).toBe(1);

      const r = await registrar(b, mec, o, [
        { colecao: 'clientes', id: 'c1', dados: { nome: 'João' } },
        { colecao: 'config', id: 'oficina', dados: { nome: 'Nome Trocado' } }
      ]);
      expect(r.map((x) => x.colecao)).toEqual(['clientes']);
      // o gerente convida mecânico, mas não dono
      expect((await tentar(b, ger, `select public.convidar('oficina', $1, 'x@teste.dev', 'dono')`, [o])).codigo).toBe('42501');
      expect((await tentar(b, ger, `select public.convidar('oficina', $1, 'x@teste.dev', 'mecanico')`, [o])).erro).toBeNull();
      // mecânico não convida e não tira ninguém
      expect((await tentar(b, mec, `select public.convidar('oficina', $1, 'y@teste.dev', 'mecanico')`, [o])).codigo).toBe('42501');
      expect((await tentar(b, mec, `select public.remover_membro('oficina', $1, $2)`, [o, ger.id])).codigo).toBe('42501');
      // o último dono não sai
      expect((await tentar(b, dono, `select public.remover_membro('oficina', $1, $2)`, [o, dono.id])).codigo).toBe('P0001');
      // o dono tira o mecânico, que deixa de ver os dados
      await linhas(b, dono, `select public.remover_membro('oficina', $1, $2)`, [o, mec.id]);
      expect(await linhas(b, mec, 'select * from public.registros')).toEqual([]);
    }));

  it('o cadastro sincronizado vai para a tabela oficinas; o plano não muda pela oficina', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      await registrar(b, dono, o, [{ colecao: 'config', id: 'oficina', dados: { nome: 'Auto Center Bom', whatsapp: '(21) 98888-7777', uf: 'sp', cidade: 'Santos' } }]);
      const [of] = await linhas(b, dono, 'select nome, whatsapp, uf, cidade from public.oficinas where id = $1', [o]);
      expect(of).toEqual({ nome: 'Auto Center Bom', whatsapp: '5521988887777', uf: 'SP', cidade: 'Santos' });
      expect((await tentar(b, dono, `update public.oficinas set pro_ate = '2099-01-01' where id = $1`, [o])).linhas).toEqual([]);
      const [depois] = await linhas(b, dono, 'select pro_ate from public.oficinas where id = $1', [o]);
      expect(depois.pro_ate).toBeNull();
    }));
});

d('sincronização', () => {
  it('lê o que mudou desde a marca, em páginas, sem perder nada', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const itens = Array.from({ length: 25 }, (_, i) => ({ colecao: 'clientes', id: `c${String(i).padStart(2, '0')}`, dados: { n: i } }));
      await registrar(b, dono, o, itens);
      const vistos = new Set<string>();
      let cursor = { desde: 0, colecao: '', id: '' };
      let primeiraMarca: number | null = null;
      for (let pagina = 0; pagina < 10; pagina++) {
        const [r] = await linhas(b, dono, 'select public.ler_registros($1, $2, $3, $4, 10) as r', [o, cursor.desde, cursor.colecao, cursor.id]);
        const res = r.r as { itens: { colecao: string; id: string; tx: number }[]; mais: boolean; marca: number };
        primeiraMarca ??= res.marca;
        for (const x of res.itens) vistos.add(x.id);
        if (!res.mais) break;
        const ult = res.itens.at(-1)!;
        cursor = { desde: ult.tx, colecao: ult.colecao, id: ult.id };
      }
      expect(vistos.size).toBe(25);
      // apagar vira marca de apagado, com versão nova
      const [v] = await registrar(b, dono, o, [{ colecao: 'clientes', id: 'c00', dados: {}, apagado: true }]);
      expect(v.versao).toBe(2);
      const [r2] = await linhas(b, dono, 'select public.ler_registros($1, 0) as r', [o]);
      const c00 = (r2.r as { itens: { id: string; apagado: boolean; dados: unknown }[] }).itens.find((x) => x.id === 'c00');
      expect(c00).toMatchObject({ apagado: true, dados: null });
    }));

  it('coleção desconhecida e lote grande são recusados', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      expect((await tentar(b, dono, 'select public.gravar_registros($1, $2::jsonb)', [o, JSON.stringify([{ colecao: 'senhas', id: '1', dados: {} }])])).codigo).toBe('22023');
      const muitos = Array.from({ length: 501 }, (_, i) => ({ colecao: 'clientes', id: String(i), dados: {} }));
      expect((await tentar(b, dono, 'select public.gravar_registros($1, $2::jsonb)', [o, JSON.stringify(muitos)])).codigo).toBe('22023');
    }));
});

d('lojas separadas', () => {
  it('a loja vê os próprios produtos inativos, não os da outra; não se ativa sozinha', () =>
    emTransacao(async (b) => {
      const la = await criarPessoa(b, pessoa('loja-a'));
      const lb = await criarPessoa(b, pessoa('loja-b'));
      const a = await criarLoja(b, la, { nome: 'Loja A' });
      const bb = await criarLoja(b, lb, { nome: 'Loja B' });
      await b.query('update public.produtos set ativo = false where id = $1', [bb.produtoId]);
      expect(await linhas(b, la, 'select id from public.produtos where id = $1', [bb.produtoId])).toEqual([]);
      expect(await linhas(b, lb, 'select id from public.produtos where id = $1', [bb.produtoId])).toHaveLength(1);
      // não muda produto da outra
      expect((await tentar(b, la, 'update public.produtos set preco = 1 where id = $1 returning id', [bb.produtoId])).linhas).toEqual([]);
      // não troca o produto de loja
      expect((await tentar(b, la, 'update public.produtos set fornecedor_id = $2 where id = $1', [a.produtoId, bb.fornecedorId])).erro).toBeTruthy();
      // não se ativa nem vira Destaque
      await b.query('update public.fornecedores set ativo = false where id = $1', [a.fornecedorId]);
      expect((await tentar(b, la, 'update public.fornecedores set ativo = true where id = $1', [a.fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, la, 'update public.fornecedores set destaque = true where id = $1', [a.fornecedorId])).codigo).toBe('42501');
      // muda a descrição
      expect((await tentar(b, la, `update public.fornecedores set descricao = 'Peças' where id = $1`, [a.fornecedorId])).erro).toBeNull();
      // contrato: vê o próprio, não o da outra, não muda
      expect(await linhas(b, la, 'select * from public.fornecedores_contrato where fornecedor_id = $1', [bb.fornecedorId])).toEqual([]);
    }));

  it('loja nova pela conta nasce desligada e esperando conferência', () =>
    emTransacao(async (b) => {
      const p = await criarPessoa(b, pessoa('nova'));
      const [r] = await linhas(b, p, `select public.criar_loja('Auto Peças Nova', '12345678000199', '5521977776666', 'Niterói', 'RJ') as id`);
      const [f] = await linhas(b, p, 'select ativo, verificacao from public.fornecedores where id = $1', [r.id]);
      expect(f).toEqual({ ativo: false, verificacao: 'pendente' });
      expect(await linhas(b, null, 'select id from public.fornecedores where id = $1', [r.id])).toEqual([]);
    }));
});

d('pedidos', () => {
  async function pedido(b: Banco) {
    const dono = await criarPessoa(b, pessoa('oficina'));
    const outra = await criarPessoa(b, pessoa('outra'));
    const lojista = await criarPessoa(b, pessoa('lojista'));
    const rival = await criarPessoa(b, pessoa('rival'));
    const o = await criarOficina(b, dono);
    await criarOficina(b, outra);
    const loja = await criarLoja(b, lojista);
    const lojaRival = await criarLoja(b, rival, { nome: 'Rival' });
    const [ped] = await linhas(
      b,
      dono,
      `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ('ABC123', $1, 'Nome inventado', '5521911112222', $2::jsonb) returning id, oficina_nome`,
      [o, JSON.stringify([{ produto_id: loja.produtoId, quantidade: 2 }, { produto_id: lojaRival.produtoId, quantidade: 1 }])]
    );
    const [parte] = await b.query('select id from public.pedidos_fornecedores where pedido_id = $1 and fornecedor_id = $2', [ped.id, loja.fornecedorId]).then((r) => r.rows);
    return { dono, outra, lojista, rival, o, loja, lojaRival, ped, parteId: Number(parte.id) };
  }

  it('o nome da oficina vem da conta; cada loja vê só a própria parte', () =>
    emTransacao(async (b) => {
      const x = await pedido(b);
      expect(x.ped.oficina_nome).toBe('Oficina Teste');
      const partes = await linhas(b, x.lojista, 'select fornecedor_id, itens from public.pedidos_fornecedores');
      expect(partes).toHaveLength(1);
      expect((partes[0].itens as unknown[]).length).toBe(1);
      expect(await linhas(b, x.lojista, 'select * from public.pedidos')).toEqual([]);
      expect(await linhas(b, x.outra, 'select * from public.pedidos_fornecedores')).toEqual([]);
      expect(await linhas(b, x.outra, 'select * from public.pedidos')).toEqual([]);
      expect(await linhas(b, x.dono, 'select * from public.pedidos_fornecedores')).toHaveLength(2);
      // pedido em nome de outra oficina não entra
      const [o2] = await linhas(b, x.outra, 'select id from public.oficinas');
      expect((await tentar(b, x.dono, `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ('ZZZ999', $1, 'x', '5521911112222', $2::jsonb)`, [o2.id, JSON.stringify([{ produto_id: x.loja.produtoId, quantidade: 1 }])])).erro).toBeTruthy();
      // sem conta não manda pedido
      expect((await tentar(b, null, `insert into public.pedidos (codigo, oficina_nome, oficina_whatsapp, itens) values ('QQQ999', 'x', '5521911112222', $1::jsonb)`, [JSON.stringify([{ produto_id: x.loja.produtoId, quantidade: 1 }])])).erro).toBeTruthy();
    }));

  it('a situação anda pelas regras e fica no histórico', () =>
    emTransacao(async (b) => {
      const x = await pedido(b);
      const muda = (p: typeof x.lojista, sql: string) => tentar(b, p, sql, [x.parteId]);
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set status = 'entregue' where id = $1`)).codigo).toBe('RV010');
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set status = 'cancelado' where id = $1`)).codigo).toBe('RV011');
      expect((await muda(x.rival, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1 returning id`)).linhas).toEqual([]);
      // a oficina não confirma o pedido nem avisa pagamento antes da confirmação
      expect((await muda(x.dono, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`)).codigo).toBe('42501');
      expect((await muda(x.dono, `update public.pedidos_fornecedores set pagamento = 'informado' where id = $1`)).codigo).toBe('42501');
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`)).erro).toBeNull();
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set subtotal = 1 where id = $1`)).codigo).toBe('42501');
      expect((await muda(x.dono, `update public.pedidos_fornecedores set pagamento = 'informado' where id = $1`)).erro).toBeNull();
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set pagamento = 'confirmado' where id = $1`)).erro).toBeNull();
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set status = 'entregue' where id = $1`)).erro).toBeNull();
      expect((await muda(x.lojista, `update public.pedidos_fornecedores set status = 'cancelado', cancelado_motivo = 'x' where id = $1`)).codigo).toBe('RV010');
      const hist = await linhas(b, x.dono, 'select campo, de, para, quem from public.pedidos_historico where parte_id = $1 order by id', [x.parteId]);
      expect(hist).toEqual([
        { campo: 'status', de: 'novo', para: 'confirmado', quem: 'loja' },
        { campo: 'pagamento', de: 'pendente', para: 'informado', quem: 'oficina' },
        { campo: 'pagamento', de: 'informado', para: 'confirmado', quem: 'loja' },
        { campo: 'status', de: 'confirmado', para: 'entregue', quem: 'loja' }
      ]);
      expect(await linhas(b, x.rival, 'select * from public.pedidos_historico where parte_id = $1', [x.parteId])).toEqual([]);
    }));

  it('o entregador só mexe na posição e no entregue, pelo link', () =>
    emTransacao(async (b) => {
      const x = await pedido(b);
      const token = 'a'.repeat(43);
      await linhas(b, x.lojista, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`, [x.parteId]);
      await linhas(b, x.lojista, `update public.pedidos_fornecedores set status = 'saiu_entrega', entrega_saiu_em = now(), entrega_hash = encode(sha256(convert_to($2, 'UTF8')), 'hex') where id = $1`, [x.parteId, token]);
      const [ver] = await linhas(b, null, 'select public.entrega_ver($1) as v', [token]);
      expect((ver.v as { oficina: string }).oficina).toBe('Oficina Teste');
      expect((await linhas(b, null, 'select public.entrega_posicao($1, -22.9, -43.2, 10) as ok', [token]))[0].ok).toBe(true);
      expect((await linhas(b, null, 'select public.entrega_ver($1) as v', ['b'.repeat(43)]))[0].v).toBeNull();
      expect((await linhas(b, null, 'select public.entrega_concluir($1) as ok', [token]))[0].ok).toBe(true);
      const [fim] = await linhas(b, x.dono, 'select status, entrega_hash, entrega_lat from public.pedidos_fornecedores where id = $1', [x.parteId]);
      expect(fim).toEqual({ status: 'entregue', entrega_hash: null, entrega_lat: null });
    }));

  it('Pix: a loja troca a chave só logo depois de entrar; a troca espera 24 horas; a oficina vê só depois da confirmação', () =>
    emTransacao(async (b) => {
      const x = await pedido(b);
      x.lojista.entrouHa = 3600;
      expect((await tentar(b, x.lojista, `select public.loja_trocar_pix($1, 'cnpj', '12345678000199', 'Loja Teste', 'Rio')`, [x.loja.fornecedorId])).codigo).toBe('RV020');
      x.lojista.entrouHa = 60;
      const [p1] = await linhas(b, x.lojista, `select public.loja_trocar_pix($1, 'cnpj', '12345678000199', 'Loja Teste', 'Rio') as r`, [x.loja.fornecedorId]);
      expect((p1.r as { imediata: boolean }).imediata).toBe(true);
      const [p2] = await linhas(b, x.lojista, `select public.loja_trocar_pix($1, 'email', 'golpe@x.com', 'Golpe', 'Rio') as r`, [x.loja.fornecedorId]);
      expect((p2.r as { imediata: boolean }).imediata).toBe(false);
      // o rival não troca a chave da outra loja
      x.rival.entrouHa = 60;
      expect((await tentar(b, x.rival, `select public.loja_trocar_pix($1, 'email', 'r@x.com', 'R', 'Rio')`, [x.loja.fornecedorId])).codigo).toBe('42501');
      // antes da confirmação, a oficina não vê o Pix
      expect((await tentar(b, x.dono, 'select public.pix_da_parte($1)', [x.parteId])).codigo).toBe('RV021');
      await linhas(b, x.lojista, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`, [x.parteId]);
      const [pix] = await linhas(b, x.dono, 'select public.pix_da_parte($1) as p', [x.parteId]);
      expect((pix.p as { chave: string }).chave).toBe('12345678000199');
      // outra oficina não vê
      expect((await tentar(b, x.outra, 'select public.pix_da_parte($1)', [x.parteId])).codigo).toBe('42501');
      // passadas 24 horas, vale a nova
      await b.query(`update public.fornecedores_pix_troca set vale_em = now() - interval '1 minute' where fornecedor_id = $1`, [x.loja.fornecedorId]);
      const [pix2] = await linhas(b, x.dono, 'select public.pix_da_parte($1) as p', [x.parteId]);
      expect((pix2.p as { chave: string }).chave).toBe('golpe@x.com');
      // a loja não muda a tabela do Pix direto
      expect((await tentar(b, x.lojista, `update public.fornecedores_pix set chave = 'z@z.com' where fornecedor_id = $1`, [x.loja.fornecedorId])).erro).toBeTruthy();
    }));
});

d('alertas de preço', () => {
  async function cenario(b: Banco, pro: boolean) {
    const dono = await criarPessoa(b, pessoa('oficina'));
    const lojista = await criarPessoa(b, pessoa('lojista'));
    const longe = await criarPessoa(b, pessoa('longe'));
    const o = await criarOficina(b, dono);
    if (pro) await b.query(`update public.oficinas set pro_ate = current_date + 30 where id = $1`, [o]);
    const loja = await criarLoja(b, lojista);
    const lojaSp = await criarLoja(b, longe, { uf: 'SP' });
    const produtos = [loja.produtoId];
    for (let i = 0; i < 12; i++) {
      const p = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco) values ($1, 'oleo_motor', $2, 'un', 50) returning id`, [loja.fornecedorId, `Óleo ${i}`]);
      produtos.push(Number(p.rows[0].id));
    }
    return { dono, lojista, longe, o, loja, lojaSp, produtos };
  }
  const novo = (b: Banco, x: Awaited<ReturnType<typeof cenario>>, produto: number) =>
    tentar(
      b,
      x.dono,
      `insert into public.alertas_preco (oficina_id, oficina_uf, categoria, titulo, produto_id, quantidade, preco_alvo, expira_em) values ($1, 'RJ', 'oleo_motor', 'Óleo', $2, 4, 30, now() + interval '48 hours') returning id, usou_credito`,
      [x.o, produto]
    );

  it('sem Pro: 3 a cada 30 dias; a loja do estado vê, a de outro estado não; a loja não sabe quem pediu', () =>
    emTransacao(async (b) => {
      const x = await cenario(b, false);
      for (let i = 0; i < 3; i++) expect((await novo(b, x, x.produtos[i])).erro).toBeNull();
      expect((await novo(b, x, x.produtos[3])).erro).toMatch(/teste esgotados/);
      expect(await linhas(b, x.lojista, 'select id from public.alertas_preco')).toHaveLength(3);
      expect(await linhas(b, x.longe, 'select id from public.alertas_preco')).toHaveLength(0);
      const colunas = Object.keys((await linhas(b, x.lojista, 'select * from public.alertas_preco limit 1'))[0]);
      expect(colunas).not.toContain('oficina_nome');
      expect(colunas).not.toContain('oficina_whatsapp');
    }));

  it('Pro: 10 no mês, depois os pacotes; cancelado sem proposta não conta', () =>
    emTransacao(async (b) => {
      const x = await cenario(b, true);
      // gasta um alerta: a loja manda proposta e a oficina cancela (conta, porque teve proposta)
      const gastar = async (produto: number) => {
        const r = await novo(b, x, produto);
        if (r.erro) return r;
        await linhas(b, x.lojista, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'aceita', $3, 30, 1)`, [r.linhas[0].id, x.loja.fornecedorId, x.loja.produtoId]);
        await linhas(b, x.dono, `update public.alertas_preco set status = 'cancelado' where id = $1`, [r.linhas[0].id]);
        return r;
      };
      // cinco abertos de uma vez é o máximo
      const abertos: string[] = [];
      for (let i = 0; i < 5; i++) abertos.push(String((await novo(b, x, x.produtos[i])).linhas[0].id));
      expect((await novo(b, x, x.produtos[5])).erro).toMatch(/abertos demais/);
      // cancelados sem proposta não contam
      for (const id of abertos) await linhas(b, x.dono, `update public.alertas_preco set status = 'cancelado' where id = $1`, [id]);
      for (let i = 0; i < 10; i++) {
        const r = await gastar(x.produtos[i]);
        expect(r.erro).toBeNull();
        expect(r.linhas[0].usou_credito).toBe(false);
      }
      expect((await novo(b, x, x.produtos[10])).erro).toMatch(/esgotados/);
      // com um pacote de 1, sai mais um, marcado como do pacote (o banco decide)
      await b.query(`insert into public.alertas_creditos (oficina_id, quantidade) values ($1, 1)`, [x.o]);
      const extra = await gastar(x.produtos[10]);
      expect(extra.erro).toBeNull();
      expect(extra.linhas[0].usou_credito).toBe(true);
      expect((await novo(b, x, x.produtos[11])).erro).toMatch(/esgotados/);
      // a oficina não fecha o alerta à mão (só pelo pedido), nem muda o preço
      const [a] = await linhas(b, x.dono, `select id from public.alertas_preco limit 1`);
      expect((await tentar(b, x.dono, `update public.alertas_preco set status = 'fechado' where id = $1`, [a.id])).codigo).toBe('42501');
      expect((await tentar(b, x.dono, `update public.alertas_preco set preco_alvo = 1 where id = $1`, [a.id])).codigo).toBe('42501');
    }));

  it('a loja responde só com produto dela e só alerta aberto do estado dela', () =>
    emTransacao(async (b) => {
      const x = await cenario(b, false);
      const a = (await novo(b, x, x.produtos[0])).linhas[0].id;
      expect((await tentar(b, x.longe, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'aceita', $3, 30, 1)`, [a, x.lojaSp.fornecedorId, x.lojaSp.produtoId])).erro).toBeTruthy();
      expect((await tentar(b, x.lojista, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'aceita', $3, 30, 1)`, [a, x.loja.fornecedorId, x.lojaSp.produtoId])).codigo).toBe('22023');
      const ok = await tentar(b, x.lojista, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'aceita', $3, 30, 1) returning oficina_id`, [a, x.loja.fornecedorId, x.loja.produtoId]);
      expect(ok.linhas[0].oficina_id).toBe(x.o);
      expect(await linhas(b, x.dono, 'select id from public.alertas_respostas')).toHaveLength(1);
    }));
});

d('equipe', () => {
  it('só com segundo fator recente; cada ação fica registrada', () =>
    emTransacao(async (b) => {
      const sem = await criarPessoa(b, pessoa('sem2fa'));
      const velho = await criarPessoa(b, pessoa('velho', { totpHa: 13 * 3600 }));
      const ok = await criarPessoa(b, pessoa('ok', { totpHa: 60 }));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      for (const p of [sem, velho, ok]) await criarEquipe(b, p, 'admin');
      await criarEquipe(b, sup, 'suporte');
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      expect(await linhas(b, sem, 'select id from public.oficinas')).toEqual([]);
      expect(await linhas(b, velho, 'select id from public.oficinas')).toEqual([]);
      expect(await linhas(b, ok, 'select id from public.oficinas')).toHaveLength(1);
      // a equipe não lê os dados internos da oficina (clientes, carros)
      await registrar(b, dono, o, [{ colecao: 'clientes', id: 'c1', dados: { nome: 'João' } }]);
      expect(await linhas(b, ok, 'select * from public.registros')).toEqual([]);
      // financeiro/admin muda o plano; suporte também (papel suporte) não
      expect((await tentar(b, ok, `update public.oficinas set pro_ate = current_date + 30 where id = $1`, [o])).erro).toBeNull();
      const [log] = await b.query(`select acao, email, tabela from privado.auditoria where tabela = 'public.oficinas' and user_id = $1`, [ok.id]).then((r) => r.rows);
      expect(log).toMatchObject({ acao: 'update', email: ok.email, tabela: 'public.oficinas' });
      expect((await tentar(b, sup, `update public.oficinas set pro_ate = current_date + 60 where id = $1`, [o])).codigo).toBe('42501');
      // só admin vê o histórico
      expect((await tentar(b, sup, 'select public.auditoria_listar()')).codigo).toBe('42501');
      expect((await linhas(b, ok, 'select jsonb_array_length(public.auditoria_listar()) as n'))[0].n).toBeGreaterThan(0);
    }));

  it('convite da equipe vira membro ao entrar com segundo fator; aparelho novo é avisado', () =>
    emTransacao(async (b) => {
      const admin = await criarPessoa(b, pessoa('admin', { totpHa: 60 }));
      await criarEquipe(b, admin, 'admin');
      const nova = await criarPessoa(b, pessoa('nova'));
      await linhas(b, admin, `select public.equipe_convidar($1, 'suporte', 'Nova')`, [nova.email]);
      // sem o segundo fator, nada
      expect((await linhas(b, nova, `select public.equipe_entrar($1, 'Chrome', '1.1.1.1') as r`, ['a'.repeat(64)]))[0].r).toEqual({ papel: null });
      nova.totpHa = 30;
      const [r] = await linhas(b, nova, `select public.equipe_entrar($1, 'Chrome', '1.1.1.1') as r`, ['a'.repeat(64)]);
      expect(r.r).toEqual({ papel: 'suporte', aparelhoNovo: true });
      const [r2] = await linhas(b, nova, `select public.equipe_entrar($1, 'Chrome', '1.1.1.1') as r`, ['a'.repeat(64)]);
      expect(r2.r).toEqual({ papel: 'suporte', aparelhoNovo: false });
      // o admin não se tira do admin
      expect((await tentar(b, admin, `select public.equipe_mudar($1, 'suporte', true)`, [admin.id])).codigo).toBe('P0001');
    }));
});

d('sistema e público', () => {
  it('a chave do sistema abre só o que o servidor precisa', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      expect((await tentar(b, null, `insert into public.ordens_rascunho (oficina_id, telefone) values ($1, '5521999990000')`, [o])).erro).toBeTruthy();
      expect((await tentar(b, null, `insert into public.ordens_rascunho (oficina_id, telefone) values ($1, '5521999990000')`, [o], { sistema: true })).erro).toBeNull();
      expect(await linhas(b, dono, 'select id from public.ordens_rascunho')).toHaveLength(1);
      // com a chave errada, nada
      expect((await como(b, null, () => b.query('select privado.sistema_autorizado() as ok'), { headers: { 'x-revisai-sistema': 'errada-errada-errada-errada-errada-errada' } })).rows[0].ok).toBe(false);
      // o sistema não lê os dados internos da oficina
      expect((await tentar(b, null, 'select * from public.registros', [], { sistema: true })).erro).toBeTruthy();
    }));

  it('o site recebe cadastro com consentimento; o catálogo é público', () =>
    emTransacao(async (b) => {
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const loja = await criarLoja(b, lojista);
      expect(await linhas(b, null, 'select id from public.produtos where id = $1', [loja.produtoId])).toHaveLength(1);
      expect((await tentar(b, null, `insert into public.interessados (tipo, nome, whatsapp, consentimento) values ('oficina', 'Zé', '5521912345678', true)`)).erro).toBeNull();
      expect((await tentar(b, null, `insert into public.interessados (tipo, nome, whatsapp, consentimento) values ('oficina', 'Zé', '5521912345679', false)`)).erro).toBeTruthy();
      expect((await tentar(b, null, 'select * from public.interessados')).linhas).toEqual([]);
    }));
});
