import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';
import { cenario, tentarPedir } from './loja2-ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

const DENUNCIAR = 'select public.denunciar($1, $2, $3, $4, $5) as id';

/** Uma oficina nova (com dono novo) que denuncia o produto. */
async function oficinaQueDenuncia(b: Banco, produtoId: number, motivo = 'falsificado'): Promise<{ dono: Pessoa; oficina: string; id: string }> {
  const dono = await criarPessoa(b, pessoa('denuncia'));
  const oficina = await criarOficina(b, dono, 'Oficina que denuncia');
  const [r] = await linhas(b, dono, DENUNCIAR, [oficina, produtoId, null, motivo, 'Veio sem lacre']);
  return { dono, oficina, id: String(r.id) };
}

async function oculto(b: Banco, produtoId: number): Promise<boolean> {
  const r = await b.query('select oculto_moderacao from public.produtos where id = $1', [produtoId]);
  return r.rows[0].oculto_moderacao === true;
}

async function equipe(b: Banco, papel: 'suporte' | 'financeiro' | 'admin'): Promise<Pessoa> {
  const p = await criarPessoa(b, pessoa(papel, { totpHa: 60 }));
  await criarEquipe(b, p, papel);
  return p;
}

d('denúncias das oficinas', () => {
  it('a oficina denuncia um produto uma vez enquanto está aberta, com motivo válido e até 10 por dia', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      const [r] = await linhas(b, c.donoOficina, DENUNCIAR, [c.oficina, c.loja.produtoId, null, 'preco_enganoso', 'O preço do anúncio não é o do pedido']);
      expect(String(r.id)).toMatch(/^[0-9a-f-]{36}$/);
      const repetida = await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, c.loja.produtoId, null, 'falsificado', null]);
      expect(repetida.codigo).toBe('RV064');
      expect(repetida.erro).toMatch(/já denunciou este produto/);
      expect((await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, c.loja.produtoId, null, 'qualquer', null])).codigo).toBe('22023');
      // a loja certa vem do produto; loja errada junto do produto não vale
      expect((await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, c.loja.produtoId, 999999999, 'outro', null])).codigo).toBe('22023');
      // a oficina vê a própria denúncia; a loja não vê quem denunciou
      expect(await linhas(b, c.donoOficina, 'select id from public.denuncias where oficina_id = $1', [c.oficina])).toHaveLength(1);
      expect(await linhas(b, c.lojista, 'select id from public.denuncias')).toHaveLength(0);
      // até 10 por dia por oficina
      for (let i = 0; i < 9; i++) {
        const p = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco) values ($1, 'filtro_oleo', $2, 'un', 20) returning id`, [c.loja.fornecedorId, `Filtro ${i}`]);
        expect((await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, Number(p.rows[0].id), null, 'outro', null])).erro).toBeNull();
      }
      const p11 = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco) values ($1, 'filtro_oleo', 'Filtro 11', 'un', 20) returning id`, [c.loja.fornecedorId]);
      const demais = await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, Number(p11.rows[0].id), null, 'outro', null]);
      expect(demais.codigo).toBe('P0001');
      expect(demais.erro).toMatch(/Muitas denúncias/);
    }));

  it('a loja só é denunciada (sem produto) por quem comprou dela', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      const semCompra = await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, null, c.loja.fornecedorId, 'nao_entregou', 'Paguei e não chegou']);
      expect(semCompra.codigo).toBe('RV065');
      await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }]);
      expect((await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, null, c.loja.fornecedorId, 'nao_entregou', 'Paguei e não chegou'])).erro).toBeNull();
      expect((await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, null, c.loja.fornecedorId, 'nao_entregou', null])).codigo).toBe('RV064');
      expect((await tentar(b, c.donoOficina, DENUNCIAR, [c.oficina, null, null, 'nao_entregou', null])).codigo).toBe('22023');
    }));
});

d('o produto sai da vitrine sozinho', () => {
  it('denúncias de 3 oficinas (de 3 pessoas) escondem o produto: some da vitrine, do pedido e dos alertas; a loja vê e não tira', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      await oficinaQueDenuncia(b, c.loja.produtoId);
      await oficinaQueDenuncia(b, c.loja.produtoId, 'conteudo_improprio');
      expect(await oculto(b, c.loja.produtoId)).toBe(false);
      await oficinaQueDenuncia(b, c.loja.produtoId);
      expect(await oculto(b, c.loja.produtoId)).toBe(true);

      // a vitrine (anônimo e outra oficina) não mostra
      expect(await linhas(b, null, 'select id from public.produtos where id = $1', [c.loja.produtoId])).toHaveLength(0);
      expect(await linhas(b, c.donoOficina, 'select id from public.produtos where id = $1', [c.loja.produtoId])).toHaveLength(0);
      // o pedido não passa
      const pedido = await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }]);
      expect(pedido.codigo).toBe('22023');
      // a loja dona vê, marcado, e não tira da moderação
      const [daLoja] = await linhas(b, c.lojista, 'select oculto_moderacao from public.produtos where id = $1', [c.loja.produtoId]);
      expect(daLoja.oculto_moderacao).toBe(true);
      expect((await tentar(b, c.lojista, 'update public.produtos set oculto_moderacao = false where id = $1', [c.loja.produtoId])).codigo).toBe('42501');
      // e o produto escondido não vai num alerta de preço
      const [alerta] = await linhas(
        b,
        c.donoOficina,
        `insert into public.alertas_preco (oficina_id, oficina_uf, categoria, titulo, produto_id, quantidade, preco_alvo, expira_em)
         values ($1, 'RJ', 'oleo_motor', 'Óleo', null, 4, 30, now() + interval '48 hours') returning id`,
        [c.oficina]
      );
      const resposta = await tentar(b, c.lojista, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'aceita', $3, 35, 1)`, [
        alerta.id,
        c.loja.fornecedorId,
        c.loja.produtoId
      ]);
      expect(resposta.codigo).toBe('22023');
      expect(resposta.erro).toMatch(/moderação/);
      // produto novo não nasce escondido pela loja
      const [novo] = await linhas(b, c.lojista, `insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco, oculto_moderacao) values ($1, 'oleo_motor', 'Outro', 'un', 10, true) returning oculto_moderacao`, [
        c.loja.fornecedorId
      ]);
      expect(novo.oculto_moderacao).toBe(false);
    }));

  it('uma pessoa com três oficinas não esconde o produto sozinha', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      const dono = await criarPessoa(b, pessoa('tres-oficinas'));
      for (const nome of ['Primeira', 'Segunda', 'Terceira']) {
        const o = await criarOficina(b, dono, nome);
        expect((await tentar(b, dono, DENUNCIAR, [o, c.loja.produtoId, null, 'falsificado', null])).erro).toBeNull();
      }
      expect(await oculto(b, c.loja.produtoId)).toBe(false);
    }));
});

d('a fila da equipe', () => {
  it('suporte vê a fila e decide: analisar, mostrar de novo, manter escondido, descartar e desativar a loja', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      const d1 = await oficinaQueDenuncia(b, c.loja.produtoId);
      const d2 = await oficinaQueDenuncia(b, c.loja.produtoId);
      const d3 = await oficinaQueDenuncia(b, c.loja.produtoId);
      expect(await oculto(b, c.loja.produtoId)).toBe(true);
      const suporte = await equipe(b, 'suporte');
      const financeiro = await equipe(b, 'financeiro');
      const fila = await linhas(b, suporte, `select id, situacao from public.denuncias where produto_id = $1`, [c.loja.produtoId]);
      expect(fila).toHaveLength(3);
      // a oficina vê só a dela
      expect(await linhas(b, d1.dono, 'select id from public.denuncias')).toHaveLength(1);
      // financeiro e a loja não decidem
      expect((await tentar(b, financeiro, `select public.moderacao_decidir($1, 'mostrar', null)`, [d1.id])).codigo).toBe('42501');
      expect((await tentar(b, c.lojista, `select public.moderacao_decidir($1, 'mostrar', null)`, [d1.id])).codigo).toBe('42501');
      expect((await tentar(b, financeiro, 'select id from public.denuncias')).linhas).toHaveLength(0);

      const [a] = await linhas(b, suporte, `select public.moderacao_decidir($1, 'analisar', null) as r`, [d1.id]);
      expect(a.r).toEqual({ acao: 'analisar', denuncias: 1 });
      // mostrar de novo: volta para a vitrine e as abertas do produto saem da fila
      const [m] = await linhas(b, suporte, `select public.moderacao_decidir($1, 'mostrar', 'Nota fiscal conferida') as r`, [d2.id]);
      expect(m.r).toEqual({ acao: 'mostrar', denuncias: 3 });
      expect(await oculto(b, c.loja.produtoId)).toBe(false);
      expect(await linhas(b, null, 'select id from public.produtos where id = $1', [c.loja.produtoId])).toHaveLength(1);
      const [resolvida] = await linhas(b, suporte, 'select situacao, resolucao, resolvido_por from public.denuncias where id = $1', [d3.id]);
      expect(resolvida).toEqual({ situacao: 'descartada', resolucao: 'Nota fiscal conferida', resolvido_por: suporte.id });
      // depois de mostrar, as denúncias contam de novo do zero
      const d4 = await oficinaQueDenuncia(b, c.loja.produtoId);
      expect(await oculto(b, c.loja.produtoId)).toBe(false);
      // manter escondido
      const [k] = await linhas(b, suporte, `select public.moderacao_decidir($1, 'manter_oculto', null) as r`, [d4.id]);
      expect(k.r).toEqual({ acao: 'manter_oculto', denuncias: 1 });
      expect(await oculto(b, c.loja.produtoId)).toBe(true);
      // descartar só a denúncia
      const d5 = await oficinaQueDenuncia(b, c.loja.produtoId);
      const [x] = await linhas(b, suporte, `select public.moderacao_decidir($1, 'descartar', null) as r`, [d5.id]);
      expect(x.r).toEqual({ acao: 'descartar', denuncias: 1 });
      expect(await oculto(b, c.loja.produtoId)).toBe(true);
      // o produto direto: mostrar e esconder
      expect((await tentar(b, suporte, 'select public.moderacao_produto($1, false)', [c.loja.produtoId])).erro).toBeNull();
      expect(await oculto(b, c.loja.produtoId)).toBe(false);
      expect((await tentar(b, c.lojista, 'select public.moderacao_produto($1, false)', [c.loja.produtoId])).codigo).toBe('42501');
      // desativar a loja
      const d6 = await oficinaQueDenuncia(b, c.loja.produtoId);
      const [l] = await linhas(b, suporte, `select public.moderacao_decidir($1, 'desativar_loja', 'Vendia réplica') as r`, [d6.id]);
      expect(l.r).toEqual({ acao: 'desativar_loja', denuncias: 1 });
      const loja = await b.query('select ativo from public.fornecedores where id = $1', [c.loja.fornecedorId]);
      expect(loja.rows[0].ativo).toBe(false);
      // ação inválida e denúncia que não existe
      expect((await tentar(b, suporte, `select public.moderacao_decidir($1, 'apagar', null)`, [d6.id])).codigo).toBe('22023');
      expect((await tentar(b, suporte, `select public.moderacao_decidir(gen_random_uuid(), 'descartar', null)`)).codigo).toBe('22023');
      // a decisão fica no histórico da equipe
      const historico = await b.query(`select count(*)::int as n from privado.auditoria where tabela = 'public.denuncias' and user_id = $1`, [suporte.id]);
      expect(historico.rows[0].n).toBeGreaterThan(0);
    }));

  it('denúncia de loja não aceita ação de produto', () =>
    emTransacao(async (b) => {
      const c = await cenario(b);
      await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }]);
      const [r] = await linhas(b, c.donoOficina, DENUNCIAR, [c.oficina, null, c.loja.fornecedorId, 'nao_entregou', null]);
      const suporte = await equipe(b, 'suporte');
      expect((await tentar(b, suporte, `select public.moderacao_decidir($1, 'manter_oculto', null)`, [r.id])).codigo).toBe('22023');
      expect((await tentar(b, suporte, `select public.moderacao_decidir($1, 'descartar', null)`, [r.id])).erro).toBeNull();
      // a loja de outra pessoa não é afetada
      const outro = await criarPessoa(b, pessoa('outra-loja'));
      const outra = await criarLoja(b, outro, { nome: 'Outra' });
      expect(await oculto(b, outra.produtoId)).toBe(false);
    }));
});
