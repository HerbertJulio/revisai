import { describe, expect, it } from 'vitest';
import {
  diasEntreDatas,
  esquemaCredito,
  lerClientesComCredito,
  lerFaturas,
  livreNoCredito,
  mensagemDeCobranca,
  mensagemDoCredito,
  pagamentosDoPedido,
  resumirFaturas,
  situacaoDaFatura,
  textoDoVencimento,
  type Fatura
} from '@/lib/loja/credito-dados';

const HOJE = '2026-10-17';

function fatura(extra: Partial<Fatura>): Fatura {
  return {
    id: 1,
    pedidoId: 10,
    codigo: 'ABC123',
    oficinaId: '00000000-0000-4000-8000-000000000001',
    oficina: 'Oficina do Zé',
    whatsapp: '5521999990000',
    valor: 100,
    cashback: 0,
    status: 'entregue',
    pagamento: 'pendente',
    pagamentoEm: null,
    prazoDias: 30,
    vencimento: '2026-10-20',
    entregueEm: '2026-09-20T12:00:00Z',
    criadoEm: '2026-09-19T12:00:00Z',
    ...extra
  };
}

describe('faturas da venda faturada', () => {
  it('a situação sai do pagamento, da entrega e do vencimento', () => {
    expect(situacaoDaFatura(fatura({ vencimento: null, status: 'confirmado' }), HOJE)).toBe('aguardando_entrega');
    expect(situacaoDaFatura(fatura({ vencimento: '2026-10-17' }), HOJE)).toBe('aberta');
    expect(situacaoDaFatura(fatura({ vencimento: '2026-10-16' }), HOJE)).toBe('vencida');
    expect(situacaoDaFatura(fatura({ vencimento: '2026-10-16', pagamento: 'confirmado' }), HOJE)).toBe('recebida');
    expect(situacaoDaFatura(fatura({ status: 'cancelado' }), HOJE)).toBe('cancelada');
    // a oficina disse que pagou, mas a loja ainda não confirmou: continua a receber
    expect(situacaoDaFatura(fatura({ vencimento: '2026-10-10', pagamento: 'informado' }), HOJE)).toBe('vencida');
  });

  it('o resumo soma o que está em aberto, o vencido e o recebido no mês, com as vencidas mais antigas primeiro', () => {
    const r = resumirFaturas(
      [
        fatura({ id: 1, valor: 100, vencimento: '2026-10-10' }),
        fatura({ id: 2, valor: 50.5, vencimento: '2026-10-01' }),
        fatura({ id: 3, valor: 30, vencimento: '2026-10-25' }),
        fatura({ id: 4, valor: 20, vencimento: null, status: 'confirmado' }),
        fatura({ id: 5, valor: 70, pagamento: 'confirmado', pagamentoEm: '2026-10-05T12:00:00Z' }),
        fatura({ id: 6, valor: 99, pagamento: 'confirmado', pagamentoEm: '2026-09-30T12:00:00Z' }),
        fatura({ id: 7, valor: 500, status: 'cancelado' })
      ],
      HOJE
    );
    expect(r.aberto).toBe(200.5);
    expect(r.vencido).toBe(150.5);
    expect(r.recebidoNoMes).toBe(70);
    expect(r.porSituacao.vencida.map((f) => f.id)).toEqual([2, 1]);
    expect(r.porSituacao.aberta.map((f) => f.id)).toEqual([3]);
    expect(r.porSituacao.aguardando_entrega.map((f) => f.id)).toEqual([4]);
    expect(r.porSituacao.recebida.map((f) => f.id)).toEqual([5, 6]);
  });

  it('o vencimento em palavras', () => {
    expect(textoDoVencimento({ vencimento: null, prazoDias: 30 }, HOJE)).toBe('vence 30 dias depois da entrega');
    expect(textoDoVencimento({ vencimento: null, prazoDias: 1 }, HOJE)).toBe('vence 1 dia depois da entrega');
    expect(textoDoVencimento({ vencimento: HOJE, prazoDias: 30 }, HOJE)).toBe('vence hoje');
    expect(textoDoVencimento({ vencimento: '2026-10-20', prazoDias: 30 }, HOJE)).toBe('vence em 3 dias (20/10/2026)');
    expect(textoDoVencimento({ vencimento: '2026-10-16', prazoDias: 30 }, HOJE)).toBe('venceu há 1 dia (16/10/2026)');
    expect(diasEntreDatas('2026-10-30', '2026-11-02')).toBe(3);
  });

  it('a mensagem de cobrança pelo WhatsApp é educada e tem o pedido, o valor e o vencimento', () => {
    const vencida = mensagemDeCobranca(fatura({ vencimento: '2026-10-10', valor: 1234.5 }), 'Auto Peças Centro', HOJE);
    expect(vencida).toMatch(/^Olá, Oficina do Zé! Aqui é da Auto Peças Centro\./);
    expect(vencida).toMatch(/pedido ABC123/);
    expect(vencida).toMatch(/R\$\s1\.234,50/);
    expect(vencida).toMatch(/venceu em 10\/10\/2026/);
    expect(mensagemDeCobranca(fatura({ vencimento: '2026-10-25' }), 'Loja', HOJE)).toMatch(/vence em 25\/10\/2026/);
    expect(mensagemDeCobranca(fatura({ vencimento: HOJE }), 'Loja', HOJE)).toMatch(/vence hoje/);
    expect(mensagemDeCobranca(fatura({ vencimento: null, prazoDias: 14 }), 'Loja', HOJE)).toMatch(/vence 14 dias depois da entrega/);
  });

  it('lê as faturas do banco e descarta linha estranha', () => {
    const lidas = lerFaturas([
      {
        id: '7',
        pedido_id: 3,
        codigo: 'XYZ999',
        oficina_id: 'o1',
        oficina_nome: 'Oficina',
        oficina_whatsapp: '5521911112222',
        subtotal: '150.00',
        cashback: '20.50',
        status: 'entregue',
        pagamento: 'pendente',
        pagamento_em: null,
        prazo_dias: 28,
        vencimento: '2026-11-14',
        entregue_em: '2026-10-17T10:00:00Z',
        criado_em: '2026-10-16T10:00:00Z'
      },
      { id: 'x' }
    ]);
    // o valor da fatura é o que a oficina deve: o subtotal menos o cashback usado
    expect(lidas).toEqual([expect.objectContaining({ id: 7, valor: 129.5, cashback: 20.5, prazoDias: 28, vencimento: '2026-11-14', codigo: 'XYZ999' })]);
  });
});

describe('crédito dos clientes', () => {
  it('confere o crédito antes de mandar ao banco', () => {
    const ok = esquemaCredito.safeParse({ oficinaId: '00000000-0000-4000-8000-000000000001', limite: 2000, prazoDias: 28, ativo: true });
    expect(ok.success).toBe(true);
    expect(esquemaCredito.safeParse({ oficinaId: 'x', limite: 2000, prazoDias: 28, ativo: true }).success).toBe(false);
    expect(esquemaCredito.safeParse({ oficinaId: '00000000-0000-4000-8000-000000000001', limite: 0, prazoDias: 28, ativo: true }).error?.issues[0].message).toBe('Informe o limite.');
    expect(esquemaCredito.safeParse({ oficinaId: '00000000-0000-4000-8000-000000000001', limite: 10, prazoDias: 200, ativo: true }).error?.issues[0].message).toBe('O prazo vai de 1 a 120 dias.');
  });

  it('o que está livre na linha e a leitura dos clientes', () => {
    const [c] = lerClientesComCredito([
      { oficinaId: 'o1', nome: 'Oficina', cidade: 'Rio', uf: 'RJ', pedidos: 3, total: '900', ultimo: '2026-10-16T10:00:00Z', credito: { limite: '1000', prazoDias: 30, ativo: true, atualizadoEm: '2026-10-01T00:00:00Z' }, aberto: '850.5', vencido: 0, faturas: 2 }
    ]);
    expect(livreNoCredito(c)).toBe(149.5);
    expect(livreNoCredito({ credito: { limite: 100, prazoDias: 7, ativo: true, atualizadoEm: '' }, aberto: 300 })).toBe(0);
    expect(livreNoCredito({ credito: null, aberto: 0 })).toBe(0);
  });

  it('o pedido leva só as lojas faturadas que deram crédito', () => {
    const creditos = [{ fornecedorId: 7, loja: 'A', limite: 1000, prazoDias: 30, aberto: 0, livre: 1000 }];
    expect(pagamentosDoPedido({ '7': 'faturado', '8': 'faturado', '9': 'pix' }, creditos)).toEqual({ '7': 'faturado' });
    expect(pagamentosDoPedido({ '7': 'pix' }, creditos)).toBeNull();
  });

  it('as mensagens das regras do banco para a oficina', () => {
    expect(mensagemDoCredito({ code: 'RV061', message: 'O limite faturado na Loja A não cobre esta compra. Estão livres R$ 50,00' })).toBe(
      'O limite faturado na Loja A não cobre esta compra. Estão livres R$ 50,00. Pague uma fatura em aberto ou escolha Pix para essa loja.'
    );
    expect(mensagemDoCredito({ code: 'RV062', message: 'A Loja A não vende faturado para esta oficina. Escolha Pix para essa loja' })).toMatch(/Escolha Pix para essa loja\.$/);
    expect(mensagemDoCredito({ code: 'RV060', message: 'Nos primeiros 30 dias...' })).toMatch(/^Nos primeiros 30 dias/);
    expect(mensagemDoCredito({ code: 'RV063' })).toMatch(/Atualize a página/);
    expect(mensagemDoCredito({ code: '23505' })).toBeNull();
    expect(mensagemDoCredito(null)).toBeNull();
  });
});
