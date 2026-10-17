import { describe, expect, it, vi } from 'vitest';
import { lerAplicacao, lerAplicacoesDoTexto, rotuloDaAplicacao, serveNoCarro } from '@/lib/loja/aplicacoes';
import { textoDoPrazoDeEntrega, type LinhaProdutoDaLoja } from '@/lib/loja/dados';
import { escreverCsv, lerCsv, lerPlanilha, planilhaDosProdutos } from '@/lib/loja/planilha';
import { bancoFalso } from './loja-ajuda';

vi.mock('server-only', () => ({}));

describe('em que carros a peça serve', () => {
  it('entende o modelo, a marca e os anos como a loja escreve', () => {
    const a = lerAplicacao('Gol 1.0 2015 a 2020')!;
    expect(a).toMatchObject({ marca: 'Volkswagen', modelo: 'Gol', anoDe: 2015, anoAte: 2020 });
    expect(rotuloDaAplicacao(a)).toBe('Volkswagen Gol 2015–2020');
    expect(lerAplicacao('Onix 2019')).toMatchObject({ modelo: 'Onix', anoDe: 2019, anoAte: 2019 });
    expect(lerAplicacao('HB20 2016 em diante')).toMatchObject({ marca: 'Hyundai', modelo: 'HB20', anoDe: 2016, anoAte: null });
    expect(lerAplicacao(' ')).toBeNull();
    expect(lerAplicacoesDoTexto('Gol 2015-2020\nGol 2015-2020 | Prisma 1.4; ')).toHaveLength(2);
  });

  it('confere se serve no carro da oficina', () => {
    const lista = lerAplicacoesDoTexto('Gol 1.0 2015 a 2020\nOnix 2017-2022');
    expect(serveNoCarro(lista, { marca: 'Volkswagen', modelo: 'Gol', ano: 2018 })).toBe('sim');
    expect(serveNoCarro(lista, { marca: 'VW', modelo: 'Gol 1.6', ano: 2016 })).toBe('sim');
    expect(serveNoCarro(lista, { marca: 'Volkswagen', modelo: 'Gol', ano: 2012 })).toBe('nao');
    expect(serveNoCarro(lista, { marca: 'Fiat', modelo: 'Uno', ano: 2018 })).toBe('nao');
    expect(serveNoCarro([], { marca: 'Fiat', modelo: 'Uno', ano: 2018 })).toBe('sem-informacao');
  });

  it('o prazo de entrega da loja em texto', () => {
    expect(textoDoPrazoDeEntrega(4)).toBe('Entrega em até 4 horas');
    expect(textoDoPrazoDeEntrega(8)).toBe('Entrega no mesmo dia');
    expect(textoDoPrazoDeEntrega(120)).toBe('Entrega em até 5 dias');
    expect(textoDoPrazoDeEntrega(null)).toBeNull();
  });
});

describe('planilha de produtos', () => {
  const atual: LinhaProdutoDaLoja = {
    id: 7,
    fornecedor_id: 1,
    categoria: 'oleo_motor',
    nome: 'Óleo 5W30 sintético',
    marca: 'Lubrax',
    descricao: null,
    unidade: 'L',
    conteudo: 1,
    preco: 39.9,
    especificacao: { viscosidade: '5W30', acea: ['C2', 'A5/B5'] },
    intervalo_km: 10000,
    intervalo_meses: 12,
    ativo: true,
    imagem_url: null,
    referencia_id: null,
    codigo: 'OL-01',
    estoque: 30,
    aplicacoes: []
  };

  it('lê CSV com ponto e vírgula, aspas e linhas em branco', () => {
    expect(lerCsv('﻿a;b\r\n"x;y";"diz ""oi"""\n\n1;2')).toEqual([
      ['a', 'b'],
      ['x;y', 'diz "oi"'],
      ['1', '2']
    ]);
    expect(lerCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
    expect(lerCsv(escreverCsv([['a;b', 'c'], ['1', '']]))).toEqual([
      ['a;b', 'c'],
      ['1', '']
    ]);
  });

  it('a planilha baixada volta sem mudar nada', () => {
    const r = lerPlanilha(planilhaDosProdutos([atual]), [atual]);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].acao).toBe('mudar');
    expect(r.linhas[0].produto).toMatchObject({ id: 7, codigo: 'OL-01', preco: 39.9, estoque: 30, conteudo: 1, especificacao: { viscosidade: '5W30', acea: ['C2', 'A5/B5'] } });
  });

  it('muda pelo código, cria o que é novo e aponta os erros por linha', () => {
    const csv = [
      'codigo;nome;categoria;preco;estoque;aplicacoes',
      'OL-01;Óleo 5W30 sintético;;35,50;12;',
      'FO-9;Filtro de óleo PSL 140;Filtro de óleo;24,90;;Gol 1.0 2015 a 2020 | Onix 2019',
      ';Vela;Velas;abc;;',
      'X;Pneu;Peneus;300;;',
      'FO-9;Repetido;Filtro de óleo;10;;'
    ].join('\n');
    const r = lerPlanilha(csv, [atual]);
    expect(r.linhas.map((l) => [l.numero, l.acao])).toEqual([
      [2, 'mudar'],
      [3, 'novo']
    ]);
    expect(r.linhas[0].produto).toMatchObject({ id: 7, nome: 'Óleo 5W30 sintético', categoria: 'oleo_motor', preco: 35.5, estoque: 12 });
    expect(r.linhas[1].produto.aplicacoes.map((a) => a.modelo)).toEqual(['Gol', 'Onix']);
    expect(r.erros.map((e) => e.numero)).toEqual([4, 5, 6]);
    expect(r.erros[1].erro).toMatch(/Categoria "Peneus"/);
  });

  it('não aceita produto de outra loja nem planilha sem nome', () => {
    expect(lerPlanilha('id;nome;categoria;preco\n999;X;Velas;10', [atual]).erros[0].erro).toMatch(/não é desta loja/);
    expect(lerPlanilha('preco\n10', [atual]).erros[0].erro).toMatch(/Falta a coluna/);
  });
});

describe('importar a planilha e avisar a loja', async () => {
  const { importarProdutos } = await import('@/lib/loja/produtos');
  const { mandarModelo } = await import('@/lib/loja/avisos');

  it('confere de novo no servidor e grava pela função do banco', async () => {
    const b = bancoFalso({ loja_importar_produtos: { data: { novos: 1, mudados: 0 } } });
    const produto = {
      id: null,
      codigo: 'A1',
      categoria: 'vela',
      nome: 'Vela NGK',
      marca: null,
      descricao: null,
      unidade: 'jogo',
      conteudo: null,
      preco: 80.456,
      estoque: 4,
      ativo: true,
      especificacao: { tipo: '' },
      aplicacoes: [],
      intervalo_km: null,
      intervalo_meses: null
    };
    expect(await importarProdutos(b.sb, 7, [produto])).toEqual({ ok: true, novos: 1, mudados: 0 });
    const args = b.chamadas[0].args as { p_fornecedor: number; p_produtos: { preco: number; especificacao: object }[] };
    expect(args.p_fornecedor).toBe(7);
    expect(args.p_produtos[0].preco).toBe(80.46);
    expect(args.p_produtos[0].especificacao).toEqual({});
    expect((await importarProdutos(b.sb, 7, [{ ...produto, preco: 0 }])).ok).toBe(false);
    expect((await importarProdutos(b.sb, 7, [])).ok).toBe(false);
  });

  it('o aviso no WhatsApp só sai com o modelo configurado e para número do Brasil', async () => {
    const original = { ...process.env };
    const pedidos: { url: string; corpo: unknown }[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      pedidos.push({ url, corpo: JSON.parse(init.body) });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    try {
      Object.assign(process.env, { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_VERIFY_TOKEN: 'v', WHATSAPP_APP_SECRET: 's' });
      delete process.env.WHATSAPP_MODELO_LOJA_PIX;
      expect(await mandarModelo('5521999998888', 'pix', ['Loja', '17/10 10:00'])).toBe(false);
      process.env.WHATSAPP_MODELO_LOJA_PIX = 'troca_pix_loja';
      expect(await mandarModelo('21999998888', 'pix', ['Loja', '17/10 10:00'])).toBe(false);
      expect(await mandarModelo('5521999998888', 'pix', ['Loja', '17/10 10:00'])).toBe(true);
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0].url).toContain('/123/messages');
      expect(pedidos[0].corpo).toMatchObject({ to: '5521999998888', type: 'template', template: { name: 'troca_pix_loja', language: { code: 'pt_BR' } } });
    } finally {
      globalThis.fetch = fetchOriginal;
      process.env = original;
    }
  });
});

describe('condições por oficina', async () => {
  const { removerCondicao, salvarCondicao } = await import('@/lib/loja/clientes');
  const oficinaId = '7c8e8f6a-1b2c-4d3e-8f9a-0b1c2d3e4f5a';

  it('grava desconto ou preço fixo, um valor só, na chave da loja, oficina e produto', async () => {
    const b = bancoFalso();
    expect(await salvarCondicao(b.sb, 9, { oficinaId, produtoId: null, tipo: 'desconto', valor: 7.255 })).toEqual({ ok: true });
    expect(b.chamadas[0]).toMatchObject({
      nome: 'precos_por_oficina',
      op: 'upsert',
      dados: { fornecedor_id: 9, oficina_id: oficinaId, produto_id: null, desconto_percentual: 7.26, preco: null },
      args: { onConflict: 'fornecedor_id,oficina_id,produto_id' }
    });
    expect(await salvarCondicao(b.sb, 9, { oficinaId, produtoId: 3, tipo: 'preco', valor: 31.5 })).toEqual({ ok: true });
    expect(b.chamadas[1].dados).toMatchObject({ produto_id: 3, desconto_percentual: null, preco: 31.5 });
    // preço fixo na loja toda e desconto acima de 90% não valem
    expect((await salvarCondicao(b.sb, 9, { oficinaId, produtoId: null, tipo: 'preco', valor: 10 })).ok).toBe(false);
    expect((await salvarCondicao(b.sb, 9, { oficinaId, produtoId: null, tipo: 'desconto', valor: 95 })).ok).toBe(false);
    expect((await salvarCondicao(b.sb, 9, { oficinaId: 'x', produtoId: null, tipo: 'desconto', valor: 5 })).ok).toBe(false);
    expect(b.chamadas).toHaveLength(2);
    // o banco recusa oficina que nunca comprou: a mensagem explica
    const recusa = bancoFalso({ precos_por_oficina: { error: { code: '42501', message: 'new row violates row-level security policy' } } });
    expect(await salvarCondicao(recusa.sb, 9, { oficinaId, produtoId: null, tipo: 'desconto', valor: 5 })).toEqual({ ok: false, erro: 'Só dá para combinar condições com oficinas que já compraram da loja.' });
    // tirar só na própria loja
    const t = bancoFalso();
    expect(await removerCondicao(t.sb, 9, 4)).toEqual({ ok: true });
    expect(t.chamadas[0]).toMatchObject({ op: 'delete', filtros: [['eq', 'id', 4], ['eq', 'fornecedor_id', 9]] });
  });
});

describe('anúncios da loja', async () => {
  const { pedirImpulso } = await import('@/lib/loja/produtos');
  const { anunciosComOrcamento, registrarClique, registrarImpressoes } = await import('@/lib/loja/anuncios');
  const produto = { id: 3, fornecedor_id: 9, categoria: 'vela', nome: 'Vela', marca: null, descricao: null, unidade: 'jogo', conteudo: null, preco: 80, especificacao: {}, intervalo_km: null, intervalo_meses: null, ativo: true, imagem_url: null, referencia_id: null };

  it('pede o anúncio por clique com o teto do dia, sem valor de período', async () => {
    const b = bancoFalso({ 'produtos.select': { data: produto }, 'impulsos.select': { count: 0 } });
    expect(await pedirImpulso(b.sb, 9, 3, 30, 'RJ', { cpc: 0.5, orcamentoDiario: 15 })).toEqual({ ok: true });
    expect(b.chamadas.find((c) => c.op === 'insert')!.dados).toMatchObject({ dias: 30, valor: 0, cpc: 0.5, orcamento_diario: 15, status: 'pedido' });
    // período continua com o preço da tabela e sem clique
    const p = bancoFalso({ 'produtos.select': { data: produto }, 'impulsos.select': { count: 0 } });
    expect(await pedirImpulso(p.sb, 9, 3, 7, '')).toEqual({ ok: true });
    expect(p.chamadas.find((c) => c.op === 'insert')!.dados).toMatchObject({ dias: 7, valor: 29, cpc: null, orcamento_diario: null });
    // clique abaixo do mínimo ou teto menor que um clique não valem
    expect((await pedirImpulso(b.sb, 9, 3, 30, 'RJ', { cpc: 0.1, orcamentoDiario: 15 })).ok).toBe(false);
    expect((await pedirImpulso(b.sb, 9, 3, 30, 'RJ', { cpc: 5, orcamentoDiario: 2 })).ok).toBe(false);
  });

  it('a vitrine registra impressões e cliques pelas funções do banco', async () => {
    const b = bancoFalso({ registrar_impressoes: { data: 2 }, registrar_clique: { data: { registrado: true, cobrado: 0.5, esgotado: false } }, anuncios_com_orcamento: { data: [4] } });
    expect(await registrarImpressoes(b.sb, [4, 4, 5, -1])).toBe(2);
    expect(b.chamadas[0].args).toEqual({ p_impulsos: [4, 5], p_oficina: null });
    expect(await registrarClique(b.sb, 4)).toEqual({ registrado: true, cobrado: 0.5, esgotado: false });
    expect([...(await anunciosComOrcamento(b.sb, [4, 5]))]).toEqual([4]);
    expect(await registrarClique(b.sb, 0)).toBeNull();
  });
});

