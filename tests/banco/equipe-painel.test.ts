import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

type Json = Record<string, unknown>;

async function rpc<T = Json>(b: Banco, p: Pessoa | null, sql: string, params: unknown[] = []): Promise<T> {
  const [r] = await linhas(b, p, `select ${sql} as r`, params);
  return r.r as T;
}

/** Pedido de uma oficina numa loja (pela oficina, como o app faz). */
async function pedido(b: Banco, dono: Pessoa, oficina: string, produtoId: number, codigo: string, quantidade = 1): Promise<number> {
  const [p] = await linhas(
    b,
    dono,
    `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb) returning id`,
    [codigo, oficina, JSON.stringify([{ produto_id: produtoId, quantidade }])]
  );
  return Number(p.id);
}

d('entrada da equipe', () => {
  it('só quem tem convite ou é da equipe vê o segundo fator', () =>
    emTransacao(async (b) => {
      const qualquer = await criarPessoa(b, pessoa('qualquer'));
      const convidada = await criarPessoa(b, pessoa('convidada'));
      const membro = await criarPessoa(b, pessoa('membro'));
      await b.query(`insert into privado.equipe_convites (email, papel) values ($1, 'suporte')`, [convidada.email]);
      await criarEquipe(b, membro, 'financeiro');
      expect(await rpc(b, qualquer, 'public.equipe_convidado()')).toBe(false);
      expect(await rpc(b, convidada, 'public.equipe_convidado()')).toBe(true);
      expect(await rpc(b, membro, 'public.equipe_convidado()')).toBe(true);
      expect((await tentar(b, null, 'select public.equipe_convidado()')).erro).toBeTruthy();
    }));
});

d('oficinas para a equipe', () => {
  it('lista com contagens, sem o conteúdo dos dados; fora da equipe ou com código velho, nada', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Auto Center Lista');
      await linhas(b, dono, 'select public.gravar_registros($1, $2::jsonb)', [
        o,
        JSON.stringify([
          { colecao: 'clientes', id: 'c1', dados: { nome: 'Cliente Secreto' } },
          { colecao: 'clientes', id: 'c2', dados: { nome: 'Outro' } },
          { colecao: 'documentos', id: 'd1', dados: { numero: 1 } }
        ])
      ]);
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      const velho = await criarPessoa(b, pessoa('velho', { totpHa: 13 * 3600 }));
      await criarEquipe(b, sup, 'suporte');
      await criarEquipe(b, velho, 'admin');
      const lista = await rpc<Json[]>(b, sup, 'public.equipe_oficinas($1)', ['Lista']);
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ nome: 'Auto Center Lista', clientes: 2, documentos: 1, membros: 1, dono: dono.email, plano: 'gratis' });
      expect(JSON.stringify(lista)).not.toContain('Cliente Secreto');
      expect((await tentar(b, velho, 'select public.equipe_oficinas()')).codigo).toBe('42501');
      expect((await tentar(b, dono, 'select public.equipe_oficinas()')).codigo).toBe('42501');
      // a busca pelo e-mail do dono também acha
      expect(await rpc<Json[]>(b, sup, 'public.equipe_oficinas($1)', [dono.email.slice(0, 8)])).toHaveLength(1);
    }));
});

d('números do negócio', () => {
  it('assinaturas: MRR pela assinatura paga ou pela tabela; só financeiro e admin', () =>
    emTransacao(async (b) => {
      const fin = await criarPessoa(b, pessoa('fin', { totpHa: 60 }));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, fin, 'financeiro');
      await criarEquipe(b, sup, 'suporte');
      const antes = await rpc<{ pagantes: number; mrr: number }>(b, fin, 'public.equipe_metricas_assinatura(39.9, 29.9)');
      const donos = [await criarPessoa(b, pessoa('a')), await criarPessoa(b, pessoa('b')), await criarPessoa(b, pessoa('c'))];
      const [o1, o2, o3] = [await criarOficina(b, donos[0], 'Pagou'), await criarOficina(b, donos[1], 'Fundadora'), await criarOficina(b, donos[2], 'Teste')];
      await b.query(`update public.oficinas set pro_ate = current_date + 60 where id = $1`, [o1]);
      await b.query(`update public.oficinas set pro_ate = current_date + 20, fundador = true where id = $1`, [o2]);
      await b.query(`update public.oficinas set teste_ate = current_date + 10 where id = $1`, [o3]);
      await b.query(`insert into public.assinaturas (oficina_nome, meses, valor, ate, codigo, oficina_id) values ('Pagou', 3, 90, current_date + 60, 'AAAABBBBCCCCDDDD', $1)`, [o1]);
      const m = await rpc<{ pagantes: number; mrr: number; teste: number; conversao: { testaram: number; pro: number } }>(b, fin, 'public.equipe_metricas_assinatura(39.9, 29.9)');
      expect(m.pagantes - antes.pagantes).toBe(2);
      // 90/3 = 30 da assinatura + 29,90 da fundadora sem assinatura
      expect(Math.round((m.mrr - antes.mrr) * 100) / 100).toBe(59.9);
      expect(m.teste).toBeGreaterThanOrEqual(1);
      expect((await tentar(b, sup, 'select public.equipe_metricas_assinatura()')).codigo).toBe('42501');
    }));

  it('marketplace, coortes e antifraude contam as partes dos pedidos', () =>
    emTransacao(async (b) => {
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, sup, 'suporte');
      const antes = await rpc<{ gmv: number; pedidos: number; cancelamento: { canceladas: number } }>(b, sup, 'public.equipe_painel_marketplace(30)');
      const dono = await criarPessoa(b, pessoa('dono'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const o = await criarOficina(b, dono, 'Compradora');
      // nos primeiros 30 dias a oficina compra até R$ 2.000 a cada 7 dias: a equipe libera mais para ela
      await b.query('update public.oficinas set limite_compra_7d = 100000 where id = $1', [o]);
      const loja = await criarLoja(b, lojista, { preco: 1000 });
      const p1 = await pedido(b, dono, o, loja.produtoId, 'MKT001', 3);
      await pedido(b, dono, o, loja.produtoId, 'MKT002', 1);
      const [parte] = (await b.query('select id from public.pedidos_fornecedores where pedido_id = $1', [p1])).rows;
      // a loja confirma e entrega a primeira (o histórico guarda os instantes)
      await linhas(b, lojista, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`, [parte.id]);
      await linhas(b, lojista, `update public.pedidos_fornecedores set status = 'entregue' where id = $1`, [parte.id]);
      const m = await rpc<{ gmv: number; pedidos: number; takeRate: number; horasConfirmacaoEntrega: number | null; lojas: { nome: string; gmv: number }[] }>(
        b,
        sup,
        'public.equipe_painel_marketplace(30)'
      );
      // o banco de testes é compartilhado: compara a diferença (com centavos de folga no ponto flutuante)
      expect(m.gmv - antes.gmv).toBeCloseTo(4000, 2);
      expect(m.pedidos - antes.pedidos).toBe(2);
      expect(m.takeRate).toBeGreaterThan(0);
      expect(m.horasConfirmacaoEntrega).not.toBeNull();
      expect(m.lojas.some((l) => l.nome === 'Loja Teste' && l.gmv >= 4000)).toBe(true);
      const coortes = await rpc<{ coorte: string; oficinas: number; meses: { idade: number; gmv: number }[] }[]>(b, sup, 'public.equipe_coortes_gmv(6)');
      const atual = coortes.at(-1)!;
      expect(atual.meses[0].idade).toBe(0);
      expect(atual.meses[0].gmv).toBeGreaterThanOrEqual(4000);
      // conta nova comprando mais de R$ 2.000 em 7 dias aparece no antifraude
      const sinais = await rpc<{ tipo: string; id: string; sinal: string }[]>(b, sup, 'public.equipe_antifraude()');
      expect(sinais.some((s) => s.tipo === 'oficina' && s.id === o && s.sinal === 'compras_conta_nova')).toBe(true);
      expect(sinais.some((s) => s.tipo === 'loja' && s.id === String(loja.fornecedorId) && s.sinal === 'vendas_loja_nova')).toBe(true);
      // quem não é da equipe não vê nada disso
      expect((await tentar(b, dono, 'select public.equipe_painel_marketplace(30)')).codigo).toBe('42501');
      expect((await tentar(b, lojista, 'select public.equipe_antifraude()')).codigo).toBe('42501');
    }));

  it('funil de uso: cadastro, dados, 10 clientes', () =>
    emTransacao(async (b) => {
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, sup, 'suporte');
      const antes = await rpc<{ funil: { cadastradas: number; comDados: number; com10Clientes: number } }>(b, sup, 'public.equipe_funil_uso(10)');
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Usa Muito');
      const itens = Array.from({ length: 12 }, (_, i) => ({ colecao: 'clientes', id: `c${i}`, dados: { nome: `Cliente ${i}` } }));
      await linhas(b, dono, 'select public.gravar_registros($1, $2::jsonb)', [o, JSON.stringify(itens)]);
      await criarOficina(b, await criarPessoa(b, pessoa('vazia')), 'Vazia');
      const r = await rpc<{ funil: { cadastradas: number; comDados: number; com10Clientes: number }; oficinas: { nome: string; clientes: number }[] }>(b, sup, 'public.equipe_funil_uso(10)');
      expect(r.funil.cadastradas - antes.funil.cadastradas).toBe(2);
      expect(r.funil.comDados - antes.funil.comDados).toBe(1);
      expect(r.funil.com10Clientes - antes.funil.com10Clientes).toBe(1);
      expect(r.oficinas[0]).toMatchObject({ nome: 'Usa Muito', clientes: 12 });
    }));
});

d('suporte', () => {
  it('quem abriu e a equipe conversam; os outros não veem', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outro = await criarPessoa(b, pessoa('outro'));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      const fin = await criarPessoa(b, pessoa('fin', { totpHa: 60 }));
      await criarEquipe(b, sup, 'suporte');
      await criarEquipe(b, fin, 'financeiro');
      const o = await criarOficina(b, dono);
      const id = await rpc<string>(b, dono, 'public.suporte_abrir($1, $2, $3)', ['Não consigo mandar o aviso', 'O botão não abre o WhatsApp.', o]);
      // não abre chamado em nome de outra oficina
      expect((await tentar(b, outro, 'select public.suporte_abrir($1, $2, $3)', ['x', 'y', o])).codigo).toBe('42501');
      expect(await linhas(b, outro, 'select id from public.suporte_chamados')).toEqual([]);
      expect(await linhas(b, outro, 'select id from public.suporte_mensagens')).toEqual([]);
      expect(await linhas(b, fin, 'select id from public.suporte_chamados')).toEqual([]);
      expect((await linhas(b, sup, 'select id from public.suporte_chamados where id = $1', [id])).length).toBe(1);
      await rpc(b, sup, 'public.suporte_responder($1, $2)', [id, 'Já vamos ver. Qual aparelho?']);
      expect((await linhas(b, dono, 'select situacao from public.suporte_chamados where id = $1', [id]))[0].situacao).toBe('respondido');
      await rpc(b, dono, 'public.suporte_responder($1, $2)', [id, 'Celular Android.']);
      const msgs = await linhas(b, dono, 'select autor from public.suporte_mensagens where chamado_id = $1 order by id', [id]);
      expect(msgs.map((m) => m.autor)).toEqual(['cliente', 'equipe', 'cliente']);
      expect((await linhas(b, dono, 'select situacao from public.suporte_chamados where id = $1', [id]))[0].situacao).toBe('novo');
      // quem abriu só fecha; a equipe reabre
      expect((await tentar(b, dono, `select public.suporte_situacao($1, 'respondido')`, [id])).codigo).toBe('22023');
      expect((await tentar(b, dono, `select public.suporte_situacao($1, 'fechado')`, [id])).erro).toBeNull();
      expect((await tentar(b, outro, 'select public.suporte_responder($1, $2)', [id, 'oi'])).codigo).toBe('42501');
      // ninguém grava direto na tabela
      expect((await tentar(b, dono, `insert into public.suporte_mensagens (chamado_id, autor, texto) values ($1, 'equipe', 'falso')`, [id])).erro).toBeTruthy();
    }));
});
