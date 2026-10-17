import { afterEach, describe, expect, it, vi } from 'vitest';
import { assinarLojaDaOficina, juntarAvisos, TABELAS_DA_OFICINA, type EstadoDoCanal } from '@/components/oficina/loja/tempo-real';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { montarPedidos, pixTrocadoHaPouco, textoDaMudanca, textoDoCancelamento, textoDoFaturado, type LinhaDaParte, type LinhaDoHistorico } from '@/lib/entregas-dados';
import { esquemaContatoDoPedido, lerReputacoes, mensagemDoPedido, seloDaReputacao } from '@/lib/marketplace-dados';
import { ordensDisponiveis, semPrecos, temPreco } from '@/lib/vitrine';

const parte = (x: Partial<LinhaDaParte> = {}): LinhaDaParte => ({
  id: 1,
  codigo: 'K7P2MX',
  fornecedor_id: 10,
  status: 'novo',
  subtotal: 120,
  itens: [{ produto_id: 5, nome: 'Óleo 5W30 1L', fornecedor_id: 10, fornecedor: 'Central de Filtros', quantidade: 4, preco_unitario: 30, combinado: false }],
  pagamento: 'pendente',
  pagamento_em: null,
  entrega_previsao: null,
  entrega_saiu_em: null,
  entrega_lat: null,
  entrega_lng: null,
  entrega_precisao: null,
  entrega_posicao_em: null,
  entregue_em: null,
  cancelado_motivo: null,
  cancelado_por: null,
  criado_em: '2026-10-17T12:00:00.000Z',
  atualizado_em: '2026-10-17T12:00:00.000Z',
  ...x
});

describe('pedidos da oficina (partes do banco)', () => {
  it('junta as partes pelo código, soma o total e põe o histórico de cada parte', () => {
    const partes = [
      parte(),
      parte({ id: 2, fornecedor_id: 11, subtotal: 45.5, itens: [{ nome: 'Filtro', quantidade: 1, preco_unitario: 45.5, fornecedor: 'Distribuidora Sul' }], status: 'confirmado' }),
      parte({ id: 3, codigo: 'AB23CD', criado_em: '2026-10-16T09:00:00.000Z', subtotal: 10 })
    ];
    const historico: LinhaDoHistorico[] = [
      { parte_id: 2, quando: '2026-10-17T12:30:00.000Z', campo: 'status', de: 'novo', para: 'confirmado', quem: 'loja', motivo: null },
      { parte_id: 2, quando: '2026-10-17T12:10:00.000Z', campo: 'status', de: 'novo', para: 'em_contato', quem: 'loja', motivo: null },
      { parte_id: 9, quando: '2026-10-17T12:10:00.000Z', campo: 'status', de: 'novo', para: 'cancelado', quem: 'loja', motivo: 'x' }
    ];
    const lojas = new Map([[10, { nome: 'Central de Filtros', whatsapp: '5521999990000' }]]);
    const pedidos = montarPedidos(partes, historico, lojas, (id) => id === 10);
    expect(pedidos.map((p) => p.codigo)).toEqual(['K7P2MX', 'AB23CD']);
    const [k7] = pedidos;
    expect(k7.total).toBe(165.5);
    expect(k7.partes.map((x) => [x.id, x.fornecedor, x.pix])).toEqual([
      [1, 'Central de Filtros', true],
      // a loja que saiu do catálogo fica com o nome que veio no pedido
      [2, 'Distribuidora Sul', false]
    ]);
    expect(k7.partes[1].whatsapp).toBeNull();
    expect(k7.partes[1].historico.map((h) => h.para)).toEqual(['em_contato', 'confirmado']);
    expect(k7.partes[0].itens).toEqual([{ produtoId: 5, nome: 'Óleo 5W30 1L', quantidade: 4, precoUnitario: 30, combinado: false, especial: false }]);
    // sem o produto no item (pedido antigo), o item fica sem o número; sem cashback, zero
    expect(k7.partes[1].itens[0].produtoId).toBeNull();
    expect(k7.partes.map((x) => x.cashback)).toEqual([0, 0]);
    // sem a forma de pagamento (banco antigo) ou com Pix, não é faturado
    expect(k7.partes.map((x) => x.faturado)).toEqual([null, null]);
  });

  it('a compra faturada mostra o prazo antes da entrega e o vencimento depois', () => {
    const [antes] = montarPedidos([parte({ forma_pagamento: 'faturado', prazo_dias: 28 })], [], new Map(), () => true);
    expect(antes.partes[0].faturado).toEqual({ prazoDias: 28, vencimento: null });
    expect(textoDoFaturado(antes.partes[0].faturado!, '2026-10-17')).toBe('Faturado: vence 28 dias depois da entrega');
    const [depois] = montarPedidos([parte({ forma_pagamento: 'faturado', prazo_dias: 1, vencimento: '2026-11-14', status: 'entregue' })], [], new Map(), () => true);
    expect(textoDoFaturado(depois.partes[0].faturado!, '2026-10-17')).toBe('Faturado: vence em 14/11/2026');
    expect(textoDoFaturado(depois.partes[0].faturado!, '2026-11-15')).toBe('Faturado: venceu em 14/11/2026');
    expect(textoDoFaturado({ prazoDias: 1, vencimento: null }, '2026-10-17')).toBe('Faturado: vence 1 dia depois da entrega');
    const [pix] = montarPedidos([parte({ forma_pagamento: 'pix' })], [], new Map(), () => true);
    expect(pix.partes[0].faturado).toBeNull();
  });

  it('traz o cashback usado e o preço combinado com a oficina', () => {
    const [p] = montarPedidos(
      [parte({ cashback: 7.5, itens: [{ produto_id: 5, nome: 'Óleo', quantidade: 2, preco_unitario: 27, especial: true }] })],
      [],
      new Map(),
      () => true
    );
    expect(p.partes[0].cashback).toBe(7.5);
    expect(p.partes[0].itens[0]).toMatchObject({ produtoId: 5, especial: true, combinado: false });
  });

  it('mostra a posição do entregador só a caminho, e o motivo do cancelamento', () => {
    const [a] = montarPedidos(
      [parte({ status: 'saiu_entrega', entrega_lat: -22.9, entrega_lng: -43.1, entrega_precisao: 12, entrega_posicao_em: '2026-10-17T13:00:00.000Z', entrega_saiu_em: '2026-10-17T12:50:00.000Z' })],
      [],
      new Map(),
      () => false
    );
    expect(a.partes[0].entrega.posicao).toEqual({ lat: -22.9, lng: -43.1, precisao: 12, em: '2026-10-17T13:00:00.000Z' });
    expect(a.partes[0].cancelamento).toBeNull();
    const [b] = montarPedidos([parte({ status: 'cancelado', cancelado_por: 'loja', cancelado_motivo: ' Sem estoque ', entrega_lat: 1, entrega_lng: 1, entrega_posicao_em: 'x' })], [], new Map(), () => false);
    expect(b.partes[0].entrega.posicao).toBeNull();
    expect(b.partes[0].cancelamento).toEqual({ por: 'loja', motivo: 'Sem estoque' });
    expect(textoDoCancelamento(b.partes[0].cancelamento!)).toBe('A loja cancelou esta parte do pedido: Sem estoque.');
    expect(textoDoCancelamento({ por: 'equipe', motivo: null })).toBe('A equipe do Revisaí cancelou esta parte do pedido.');
  });

  it('cada mudança vira uma frase curta', () => {
    const m = (x: Partial<Parameters<typeof textoDaMudanca>[0]>) => textoDaMudanca({ quando: '2026-10-17T12:00:00Z', campo: 'status', de: 'novo', para: 'confirmado', quem: 'loja', motivo: null, ...x });
    expect(m({})).toBe('Pedido confirmado');
    expect(m({ para: 'saiu_entrega' })).toBe('Saiu para entrega');
    expect(m({ para: 'entregue', quem: 'entregador' })).toBe('Entregue, marcado pelo entregador');
    expect(m({ para: 'entregue', quem: 'equipe' })).toBe('Entregue (pela equipe do Revisaí)');
    expect(m({ para: 'cancelado', motivo: 'Sem estoque' })).toBe('Cancelado pela loja: Sem estoque');
    expect(m({ para: 'confirmado', de: 'saiu_entrega' })).toBe('Voltou para confirmado pela loja');
    expect(m({ campo: 'pagamento', de: 'pendente', para: 'informado', quem: 'oficina' })).toBe('Você avisou que pagou');
    expect(m({ campo: 'pagamento', de: 'informado', para: 'confirmado', quem: 'loja' })).toBe('Pagamento confirmado pela loja');
    expect(m({ campo: 'pagamento', de: 'confirmado', para: 'pendente', quem: 'loja' })).toBe('Pagamento voltou para pendente pela loja');
  });

  it('avisa quando a loja trocou a chave Pix há pouco', () => {
    const agora = Date.parse('2026-10-17T12:00:00Z');
    expect(pixTrocadoHaPouco('2026-10-15T12:00:00Z', agora)).toBe(true);
    expect(pixTrocadoHaPouco('2026-10-01T12:00:00Z', agora)).toBe(false);
    expect(pixTrocadoHaPouco(null, agora)).toBe(false);
    expect(pixTrocadoHaPouco('lixo', agora)).toBe(false);
  });
});

describe('erros do pedido', () => {
  it('cada trava do banco vira a frase de sempre', () => {
    expect(mensagemDoPedido({ code: 'RV001', message: 'A proposta não vale mais' })).toMatch(/não vale mais/);
    expect(mensagemDoPedido({ code: 'RV002', message: 'A loja mudou a proposta' })).toMatch(/mudou a proposta/);
    expect(mensagemDoPedido({ code: 'RV003', message: 'Quantidade fora da proposta' })).toMatch(/quantidade não bate/);
    expect(mensagemDoPedido({ code: 'P0001', message: 'Muitos pedidos seguidos' })).toMatch(/muitos pedidos seguidos/);
    expect(mensagemDoPedido({ code: '22023', message: 'Produto 9 indisponível' })).toMatch(/saiu da loja/);
    expect(mensagemDoPedido({ code: '28000', message: 'Entre na sua conta para fazer pedidos' })).toMatch(/Entre na sua conta/);
    expect(mensagemDoPedido({ code: '23514', message: 'new row violates check constraint "pedidos_oficina_whatsapp_check"' })).toMatch(/WhatsApp/);
    expect(mensagemDoPedido({ code: 'XX000', message: 'falhou' })).toBeNull();
    expect(mensagemDoPedido(null)).toBeNull();
  });

  it('o contato do pedido é opcional e confere o estado', () => {
    expect(esquemaContatoDoPedido.parse(undefined)).toEqual({ whatsapp: '', cidade: '', uf: '', endereco: '' });
    expect(esquemaContatoDoPedido.parse({ whatsapp: '21 98765-4321', uf: 'RJ' })).toMatchObject({ whatsapp: '21 98765-4321', uf: 'RJ' });
    expect(esquemaContatoDoPedido.safeParse({ uf: 'rj' }).success).toBe(false);
  });
});

describe('reputação das lojas', () => {
  it('lê o que o banco devolve e deixa de fora o que vier errado', () => {
    const m = lerReputacoes({
      '10': { nova: true, pedidos: 2 },
      '11': { nova: false, pedidos: 40, canceladosPct: 2.5, atrasoPct: 5, horasParaConfirmar: 1.4 },
      '12': { nova: false, pedidos: 30, canceladosPct: 20, atrasoPct: null, horasParaConfirmar: null },
      abc: { nova: true, pedidos: 1 },
      '13': { nada: 1 }
    });
    expect([...m.keys()]).toEqual([10, 11, 12]);
    expect(seloDaReputacao(m.get(10)!)).toMatchObject({ texto: 'Loja nova no Revisaí', tom: 'neutro' });
    expect(seloDaReputacao(m.get(11)!)).toMatchObject({ texto: 'Confirma em 1 h', tom: 'ok' });
    expect(seloDaReputacao(m.get(11)!).detalhe).toBe('40 pedidos em 90 dias, 2,5% cancelados pela loja, 5% entregues com atraso');
    expect(seloDaReputacao(m.get(12)!)).toMatchObject({ texto: 'Cancela ou atrasa mais que as outras', tom: 'atencao' });
    expect(lerReputacoes(null).size).toBe(0);
    expect(lerReputacoes([1, 2]).size).toBe(0);
  });
});

describe('catálogo sem preços (quem não entrou)', () => {
  it('tira os preços e as promoções, e as ordens por preço', () => {
    const c = semPrecos(CATALOGO_EXEMPLO);
    expect(c.produtos.length).toBe(CATALOGO_EXEMPLO.produtos.length);
    expect(c.produtos.every((p) => p.preco === 0 && !temPreco(p))).toBe(true);
    expect(c.promocoes).toEqual([]);
    expect(c.patrocinios).toEqual(CATALOGO_EXEMPLO.patrocinios);
    expect(CATALOGO_EXEMPLO.produtos.some((p) => temPreco(p))).toBe(true);
    expect(ordensDisponiveis(false).map((o) => o.id)).toEqual(['relevancia', 'nome']);
    expect(ordensDisponiveis(true).length).toBe(4);
  });
});

describe('tempo real da loja', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function canalFalso() {
    const ligacoes: { tipo: string; filtro: Record<string, string>; fazer: () => void }[] = [];
    let aoStatus: ((s: string) => void) | null = null;
    const removidos: unknown[] = [];
    const canal = {
      on(tipo: string, filtro: Record<string, string>, fazer: () => void) {
        ligacoes.push({ tipo, filtro, fazer });
        return canal;
      },
      subscribe(cb: (s: string) => void) {
        aoStatus = cb;
        return canal;
      }
    };
    const nomes: string[] = [];
    const sb = {
      channel(nome: string) {
        nomes.push(nome);
        return canal;
      },
      removeChannel(c: unknown) {
        removidos.push(c);
        return Promise.resolve('ok');
      }
    };
    return { sb, ligacoes, nomes, removidos, status: (s: string) => aoStatus?.(s), canal };
  }

  it('assina as tabelas da oficina filtradas por ela e avisa o estado do canal', () => {
    const f = canalFalso();
    const mudou: string[] = [];
    const estados: EstadoDoCanal[] = [];
    const desligar = assinarLojaDaOficina(f.sb as never, 'of-1', (t) => mudou.push(t), (e) => estados.push(e));
    expect(f.nomes).toEqual(['loja-oficina-of-1']);
    expect(f.ligacoes.map((l) => [l.tipo, l.filtro.table, l.filtro.filter, l.filtro.event, l.filtro.schema])).toEqual(
      TABELAS_DA_OFICINA.map((t) => ['postgres_changes', t, 'oficina_id=eq.of-1', '*', 'public'])
    );
    f.ligacoes[0].fazer();
    f.ligacoes[1].fazer();
    expect(mudou).toEqual(['pedidos_fornecedores', 'alertas_respostas']);
    f.status('SUBSCRIBED');
    f.status('CHANNEL_ERROR');
    f.status('TIMED_OUT');
    expect(estados).toEqual(['ligado', 'caiu', 'caiu']);
    desligar();
    desligar();
    expect(f.removidos).toEqual([f.canal]);
  });

  it('sem o canal (erro ao ligar), avisa que caiu e não quebra', () => {
    const estados: EstadoDoCanal[] = [];
    const sb = {
      channel() {
        throw new Error('sem websocket');
      },
      removeChannel() {
        return Promise.resolve('ok');
      }
    };
    const desligar = assinarLojaDaOficina(sb as never, 'of-1', () => {}, (e) => estados.push(e));
    expect(estados).toEqual(['caiu']);
    expect(() => desligar()).not.toThrow();
  });

  it('avisos em sequência viram uma busca só', () => {
    vi.useFakeTimers();
    let buscas = 0;
    const j = juntarAvisos(() => buscas++, 800);
    j.avisar();
    vi.advanceTimersByTime(500);
    j.avisar();
    vi.advanceTimersByTime(500);
    j.avisar();
    expect(buscas).toBe(0);
    vi.advanceTimersByTime(800);
    expect(buscas).toBe(1);
    j.avisar();
    j.parar();
    vi.advanceTimersByTime(2000);
    expect(buscas).toBe(1);
  });
});
