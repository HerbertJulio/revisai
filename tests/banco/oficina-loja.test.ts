// A loja da oficina no banco, do jeito que o app fala com ele (como a pessoa que entrou): o pedido
// com o contato da conta, as partes com as colunas copiadas e o histórico, quais lojas aceitam Pix,
// a cota de alertas que a tela mostra contra a trava do banco, a previsão de compras, a sugestão
// para a base e o pedido de pacote.

import { afterAll, describe, expect, it } from 'vitest';
import { cotaDaOficina, inicioDoMesEmBrasilia, type AlertaParaContar } from '@/lib/alertas-dados';
import { montarPedidos, type LinhaDaParte, type LinhaDoHistorico } from '@/lib/entregas-dados';
import { oficinaDoPedidoDeAlertas, quantidadeDoPedidoDeAlertas } from '@/lib/equipe/tipos';
import { criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

async function cenario(b: Banco) {
  const dono = await criarPessoa(b, pessoa('of-loja-dono'));
  const outra = await criarPessoa(b, pessoa('of-loja-outra'));
  const lojista = await criarPessoa(b, pessoa('of-loja-lojista'));
  const lojista2 = await criarPessoa(b, pessoa('of-loja-lojista2'));
  const o = await criarOficina(b, dono, 'Oficina do Teste da Loja', { whatsapp: '5521988887777' });
  const o2 = await criarOficina(b, outra, 'Outra Oficina da Loja');
  const loja = await criarLoja(b, lojista, { nome: 'Loja Com Pix', preco: 40 });
  const loja2 = await criarLoja(b, lojista2, { nome: 'Loja Sem Pix', categoria: 'filtro_oleo', preco: 25 });
  await b.query(`insert into public.fornecedores_pix (fornecedor_id, tipo, chave, nome, cidade) values ($1, 'email', 'pix@lojacompix.dev', 'Loja Com Pix', 'Rio')`, [loja.fornecedorId]);
  return { dono, outra, lojista, lojista2, o, o2, loja, loja2 };
}

/** O pedido como enviarPedido manda (a conta decide o nome e o WhatsApp). */
async function pedir(b: Banco, quem: Pessoa | null, oficina: string, itens: { produto_id: number; quantidade: number }[], codigo: string) {
  return tentar(
    b,
    quem,
    `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, oficina_cidade, oficina_uf, oficina_endereco, itens, observacao)
     values ($1, $2, 'Nome que veio do aparelho', '5511900001111', null, 'RJ', 'Rua da Entrega, 10', $3::jsonb, 'Entregar de manhã')
     returning itens, total, oficina_nome, oficina_whatsapp, oficina_endereco`,
    [codigo, oficina, JSON.stringify(itens)]
  );
}

const COLUNAS_PARTE =
  'id, codigo, fornecedor_id, status, subtotal, itens, pagamento, pagamento_em, entrega_previsao, entrega_saiu_em, entrega_lat, entrega_lng, entrega_precisao, entrega_posicao_em, entregue_em, cancelado_motivo, cancelado_por, criado_em, atualizado_em';

function comoParte(x: Record<string, unknown>): LinhaDaParte {
  const n = (v: unknown) => (v == null ? null : Number(v));
  const t = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
  return {
    id: Number(x.id),
    codigo: String(x.codigo),
    fornecedor_id: Number(x.fornecedor_id),
    status: x.status as LinhaDaParte['status'],
    subtotal: Number(x.subtotal),
    itens: x.itens,
    pagamento: x.pagamento as LinhaDaParte['pagamento'],
    pagamento_em: t(x.pagamento_em),
    entrega_previsao: t(x.entrega_previsao),
    entrega_saiu_em: t(x.entrega_saiu_em),
    entrega_lat: n(x.entrega_lat),
    entrega_lng: n(x.entrega_lng),
    entrega_precisao: n(x.entrega_precisao),
    entrega_posicao_em: t(x.entrega_posicao_em),
    entregue_em: t(x.entregue_em),
    cancelado_motivo: t(x.cancelado_motivo),
    cancelado_por: t(x.cancelado_por),
    criado_em: t(x.criado_em)!,
    atualizado_em: t(x.atualizado_em)!
  };
}

d('loja da oficina por conta', () => {
  it('o pedido sai pela oficina da conta, com os preços do banco, e cada loja vê só a parte dela', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      const r = await pedir(b, x.dono, x.o, [{ produto_id: x.loja.produtoId, quantidade: 3 }, { produto_id: x.loja2.produtoId, quantidade: 2 }], 'LJA001');
      expect(r.erro).toBeNull();
      const [ped] = r.linhas;
      // o nome e o WhatsApp vêm do cadastro da oficina, não do aparelho; o endereço do pedido vale
      expect(ped.oficina_nome).toBe('Oficina do Teste da Loja');
      expect(ped.oficina_whatsapp).toBe('5521988887777');
      expect(ped.oficina_endereco).toBe('Rua da Entrega, 10');
      expect(Number(ped.total)).toBe(170);
      const itens = ped.itens as { produto_id: number; preco_unitario: number; fornecedor: string; fornecedor_id: number }[];
      expect(itens.map((i) => [i.produto_id, Number(i.preco_unitario), i.fornecedor])).toEqual([
        [x.loja.produtoId, 40, 'Loja Com Pix'],
        [x.loja2.produtoId, 25, 'Loja Sem Pix']
      ]);

      // outra oficina não manda pedido em nome desta, nem sem conta
      expect((await pedir(b, x.outra, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], 'LJA002')).erro).toBeTruthy();
      expect((await pedir(b, null, x.o, [{ produto_id: x.loja.produtoId, quantidade: 1 }], 'LJA003')).erro).toBeTruthy();

      // a oficina lê as partes como acompanharPedidos lê (filtro por oficina e 45 dias)
      const desde = new Date(Date.now() - 45 * 86_400_000).toISOString();
      const partes = await linhas(b, x.dono, `select ${COLUNAS_PARTE} from public.pedidos_fornecedores where oficina_id = $1 and criado_em >= $2 order by criado_em desc limit 200`, [x.o, desde]);
      expect(partes).toHaveLength(2);
      expect(await linhas(b, x.outra, `select id from public.pedidos_fornecedores where oficina_id = $1`, [x.o])).toEqual([]);
      const daLoja = await linhas(b, x.lojista, `select fornecedor_id, itens from public.pedidos_fornecedores where codigo = 'LJA001'`);
      expect(daLoja).toHaveLength(1);
      expect((daLoja[0].itens as unknown[]).length).toBe(1);

      // a loja confirma e depois cancela com motivo: o histórico chega para a oficina
      const parte = partes.find((p) => Number(p.fornecedor_id) === x.loja.fornecedorId)!;
      await linhas(b, x.lojista, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`, [parte.id]);
      const parte2 = partes.find((p) => Number(p.fornecedor_id) === x.loja2.fornecedorId)!;
      await linhas(b, x.lojista2, `update public.pedidos_fornecedores set status = 'cancelado', cancelado_motivo = 'Sem estoque do filtro' where id = $1`, [parte2.id]);
      const hist = await linhas(b, x.dono, 'select parte_id, quando, campo, de, para, quem, motivo from public.pedidos_historico where parte_id = any($1::bigint[]) order by quando', [[parte.id, parte2.id]]);
      const novas = await linhas(b, x.dono, `select ${COLUNAS_PARTE} from public.pedidos_fornecedores where oficina_id = $1`, [x.o]);
      const historico: LinhaDoHistorico[] = hist.map((h) => ({
        parte_id: Number(h.parte_id),
        quando: (h.quando as Date).toISOString(),
        campo: String(h.campo),
        de: h.de == null ? null : String(h.de),
        para: h.para == null ? null : String(h.para),
        quem: String(h.quem),
        motivo: h.motivo == null ? null : String(h.motivo)
      }));
      const [lojas] = await linhas(b, x.dono, 'select public.lojas_com_pix($1::bigint[]) as ids', [[x.loja.fornecedorId, x.loja2.fornecedorId]]);
      const comPix = new Set((lojas.ids as (number | string)[]).map(Number));
      const [pedido] = montarPedidos(novas.map(comoParte), historico, new Map(), (id) => comPix.has(id));
      expect(pedido.codigo).toBe('LJA001');
      expect(pedido.total).toBe(170);
      const confirmada = pedido.partes.find((p) => p.fornecedorId === x.loja.fornecedorId)!;
      const cancelada = pedido.partes.find((p) => p.fornecedorId === x.loja2.fornecedorId)!;
      expect(confirmada).toMatchObject({ status: 'confirmado', pix: true, cancelamento: null });
      expect(confirmada.historico.map((h) => [h.campo, h.para, h.quem])).toEqual([['status', 'confirmado', 'loja']]);
      expect(cancelada).toMatchObject({ status: 'cancelado', pix: false, cancelamento: { por: 'loja', motivo: 'Sem estoque do filtro' } });
      // sem a loja no mapa (saiu do catálogo), o nome vem do pedido
      expect(cancelada.fornecedor).toBe('Loja Sem Pix');

      // "Já paguei": só depois da confirmação, só pela oficina dona, e a loja vê no histórico
      expect((await tentar(b, x.dono, `update public.pedidos_fornecedores set pagamento = 'informado' where id = $1 and pagamento = 'pendente' returning id`, [parte2.id])).codigo).toBe('42501');
      const pago = await tentar(b, x.dono, `update public.pedidos_fornecedores set pagamento = 'informado' where id = $1 and pagamento = 'pendente' returning id, pagamento_em`, [parte.id]);
      expect(pago.erro).toBeNull();
      expect(pago.linhas[0].pagamento_em).toBeTruthy();
      expect((await tentar(b, x.outra, `update public.pedidos_fornecedores set pagamento = 'informado' where id = $1 returning id`, [parte.id])).linhas).toEqual([]);
      const ultimo = await linhas(b, x.lojista, `select campo, para, quem from public.pedidos_historico where parte_id = $1 order by id desc limit 1`, [parte.id]);
      expect(ultimo).toEqual([{ campo: 'pagamento', para: 'informado', quem: 'oficina' }]);
    }));

  it('quais lojas aceitam Pix: só o sim ou não, só para quem entrou', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      const [r] = await linhas(b, x.outra, 'select public.lojas_com_pix($1::bigint[]) as ids', [[x.loja.fornecedorId, x.loja2.fornecedorId, 999999999]]);
      expect((r.ids as (number | string)[]).map(Number)).toEqual([x.loja.fornecedorId]);
      expect((await tentar(b, null, 'select public.lojas_com_pix($1::bigint[])', [[x.loja.fornecedorId]])).codigo).toBe('42501');
      const muitos = Array.from({ length: 201 }, (_, i) => x.loja.fornecedorId + i);
      const [m] = await linhas(b, x.outra, 'select public.lojas_com_pix($1::bigint[]) as ids', [muitos]);
      expect(m.ids).toEqual([]);
      const [vazio] = await linhas(b, x.outra, 'select public.lojas_com_pix(null) as ids');
      expect(vazio.ids).toEqual([]);
      // a chave continua fora do alcance da oficina
      expect((await tentar(b, x.dono, 'select chave from public.fornecedores_pix')).linhas).toEqual([]);
    }));

  it('a cota que a tela mostra bate com a trava do banco (Pro, pacote e grátis)', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      await b.query(`update public.oficinas set pro_ate = current_date + 30 where id = $1`, [x.o]);
      const produtos: number[] = [];
      for (let i = 0; i < 12; i++) {
        const p = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco) values ($1, 'oleo_motor', $2, 'un', 50) returning id`, [x.loja.fornecedorId, `Óleo Cota ${i}`]);
        produtos.push(Number(p.rows[0].id));
      }

      /** A cota como calcularCota lê: os alertas e os créditos da oficina, como a pessoa. */
      async function cotaDaTela(oficina: string, plano: 'pro' | 'teste' | 'gratis', agora = Date.now()) {
        const desde = plano === 'pro' ? inicioDoMesEmBrasilia(agora) : new Date(agora - 30 * 86_400_000).toISOString();
        const doPeriodo = await linhas(b, x.dono, `select id, status, expira_em, criado_em, usou_credito from public.alertas_preco where oficina_id = $1 and criado_em >= $2 and (usou_credito = false or $3::boolean = false)`, [oficina, desde, plano === 'pro']);
        const dePacote = plano === 'pro' ? await linhas(b, x.dono, `select id, status, expira_em, criado_em, usou_credito from public.alertas_preco where oficina_id = $1 and usou_credito`, [oficina]) : [];
        const todos = [...doPeriodo, ...dePacote];
        const props = await linhas(b, x.dono, `select alerta_id from public.alertas_respostas where alerta_id = any($1::uuid[]) and tipo <> 'recusa'`, [todos.map((a) => a.id)]);
        const alertas: AlertaParaContar[] = todos.map((a) => ({
          status: a.status as AlertaParaContar['status'],
          expiraEm: (a.expira_em as Date).toISOString(),
          criadoEm: (a.criado_em as Date).toISOString(),
          usouCredito: a.usou_credito as boolean,
          propostas: props.filter((p) => p.alerta_id === a.id).length
        }));
        const [c] = await linhas(b, x.dono, 'select coalesce(sum(quantidade), 0)::int as n from public.alertas_creditos where oficina_id = $1', [oficina]);
        return cotaDaOficina(plano, alertas, Number(c.n), agora);
      }

      /** Manda um alerta como criarAlerta manda (sem usou_credito: o banco decide), a loja responde e a oficina desiste. */
      async function gastar(produto: number) {
        const r = await tentar(
          b,
          x.dono,
          `insert into public.alertas_preco (oficina_id, oficina_uf, oficina_cidade, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, preco_pago, mensagem, expira_em)
           values ($1, 'RJ', 'Rio', 'oleo_motor', 'Óleo', $2, null, '{}'::jsonb, 4, 30, null, null, now() + interval '48 hours') returning id, usou_credito`,
          [x.o, produto]
        );
        if (r.erro) return r;
        await linhas(b, x.lojista, `select public.loja_responder_alerta($2::bigint, $1::uuid, 'aceita', $3::bigint, 30, 1)`, [r.linhas[0].id, x.loja.fornecedorId, x.loja.produtoId]);
        await linhas(b, x.dono, `update public.alertas_preco set status = 'cancelado' where id = $1 and oficina_id = $2 and status = 'aberto' returning id`, [r.linhas[0].id, x.o]);
        return r;
      }

      for (let i = 0; i < 10; i++) {
        const antes = await cotaDaTela(x.o, 'pro');
        expect(antes.restantes).toBe(10 - i);
        expect(antes.proximoUsaCredito).toBe(false);
        const r = await gastar(produtos[i]);
        expect(r.erro).toBeNull();
        expect(r.linhas[0].usou_credito).toBe(false);
      }
      const esgotada = await cotaDaTela(x.o, 'pro');
      expect(esgotada).toMatchObject({ usados: 10, extras: 0, restantes: 0 });
      expect((await gastar(produtos[10])).erro).toMatch(/do mês esgotados/);

      await b.query(`insert into public.alertas_creditos (oficina_id, quantidade, observacao) values ($1, 2, 'pacote de teste')`, [x.o]);
      const comPacote = await cotaDaTela(x.o, 'pro');
      expect(comPacote).toMatchObject({ extras: 2, restantes: 2, proximoUsaCredito: true });
      const extra = await gastar(produtos[10]);
      expect(extra.erro).toBeNull();
      expect(extra.linhas[0].usou_credito).toBe(true);
      expect(await cotaDaTela(x.o, 'pro')).toMatchObject({ extras: 1, restantes: 1 });

      // a outra oficina (sem Pro) tem os 3 de 30 dias, e não vê nada desta
      const daOutra = await linhas(b, x.outra, 'select id from public.alertas_preco where oficina_id = $1', [x.o]);
      expect(daOutra).toEqual([]);
      expect(await linhas(b, x.outra, 'select oficina_id from public.alertas_creditos')).toEqual([]);
    }));

  it('a previsão de compras é uma linha por oficina, e só a oficina dona grava', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      const grava = (quem: Pessoa, oficina: string, n: number) =>
        tentar(
          b,
          quem,
          `insert into public.demandas (id, oficina_id, uf, cidade, itens, atualizado_em) values ($1, $1, 'RJ', 'Rio', $2::jsonb, now())
           on conflict (id) do update set uf = excluded.uf, cidade = excluded.cidade, itens = excluded.itens, atualizado_em = excluded.atualizado_em returning id`,
          [oficina, JSON.stringify([{ categoria: 'oleo_motor', titulo: '5W-30', quantidade: n, unidade: 'L', carros: 2 }])]
        );
      expect((await grava(x.dono, x.o, 8)).erro).toBeNull();
      expect((await grava(x.dono, x.o, 12)).erro).toBeNull();
      const minha = await linhas(b, x.dono, 'select itens from public.demandas where oficina_id = $1', [x.o]);
      expect(minha).toHaveLength(1);
      expect((minha[0].itens as { quantidade: number }[])[0].quantidade).toBe(12);
      expect((await grava(x.outra, x.o, 1)).erro).toBeTruthy();
      expect(await linhas(b, x.outra, 'select id from public.demandas where oficina_id = $1', [x.o])).toEqual([]);
      // id diferente da oficina não entra
      expect((await tentar(b, x.dono, `insert into public.demandas (id, oficina_id, itens) values (gen_random_uuid(), $1, '[]'::jsonb)`, [x.o])).erro).toBeTruthy();
    }));

  it('a sugestão para a base entra sem aprovação, e o pedido de pacote chega à equipe com a oficina', () =>
    emTransacao(async (b) => {
      const x = await cenario(b);
      const sugere = (aprovado: boolean) =>
        tentar(
          b,
          x.dono,
          `insert into public.produtos_referencia (categoria, marca, linha, intervalo_km, intervalo_meses, observacao, fonte_nome, confianca, origem, aprovado)
           values ('oleo_motor', 'Marca X', 'Linha Y 5W-30', 10000, 12, null, 'Sugestão de oficina pelo app', 'oficina', 'oficina', $1)`,
          [aprovado]
        );
      expect((await sugere(false)).erro).toBeNull();
      expect((await sugere(true)).erro).toBeTruthy();

      const mensagem = `Quer 10 alertas de preço extras (R$ 9,90). Oficina: ${x.o}.`;
      const pacote = await tentar(
        b,
        x.dono,
        `insert into public.interessados (tipo, nome, empresa, whatsapp, email, cidade, uf, plano, mensagem, origem, consentimento) values ('oficina', 'Oficina do Teste da Loja', 'Oficina do Teste da Loja', '5521988887777', $1, 'Rio', 'RJ', 'alertas', $2, 'app', true)`,
        [x.dono.email, mensagem]
      );
      expect(pacote.erro).toBeNull();
      expect(oficinaDoPedidoDeAlertas(mensagem, [])).toBe(x.o);
      expect(quantidadeDoPedidoDeAlertas(mensagem)).toBe(10);
    }));
});
