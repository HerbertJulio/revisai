import { describe, expect, it } from 'vitest';
import { criarAsaas, eventosAsaas, situacaoAsaas, type ConfigAsaas } from '@/lib/cobranca/asaas';
import { ErroDoGateway, type Pagador } from '@/lib/cobranca/tipos';

// O Asaas de mentira responde como a documentação da API v3 (https://docs.asaas.com).

interface Chamada {
  metodo: string;
  url: string;
  corpo: unknown;
  cabecalhos: Record<string, string>;
}

function asaasDeMentira(rotas: Record<string, (c: Chamada) => { status?: number; json: unknown }>) {
  const chamadas: Chamada[] = [];
  const buscar = async (url: string, init: RequestInit) => {
    const c: Chamada = {
      metodo: String(init.method ?? 'GET'),
      url,
      corpo: init.body ? JSON.parse(String(init.body)) : undefined,
      cabecalhos: init.headers as Record<string, string>
    };
    chamadas.push(c);
    const caminho = url.replace('https://api-sandbox.asaas.com/v3', '');
    const chave = `${c.metodo} ${caminho.split('?')[0]}`;
    const rota = rotas[chave];
    if (!rota) return new Response(JSON.stringify({ errors: [{ code: 'not_found', description: `sem rota ${chave}` }] }), { status: 404 });
    const r = rota(c);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { buscar, chamadas };
}

const CONFIG: ConfigAsaas = { chave: '$aact_teste', ambiente: 'sandbox', tokenWebhook: 'token-do-webhook-123', nota: null };
const PAGADOR: Pagador = { nome: 'Auto Center Silva', documento: '11444777000161', email: 'dono@oficina.dev', telefone: '5521987650000', referencia: 'of-1' };

const PAGAMENTO = {
  object: 'payment',
  id: 'pay_080225913252',
  dateCreated: '2026-10-17',
  customer: 'cus_000005219613',
  subscription: 'sub_VXJBYgP2u0eO',
  value: 29.9,
  netValue: 28.91,
  billingType: 'PIX',
  status: 'PENDING',
  dueDate: '2026-10-17',
  invoiceUrl: 'https://sandbox.asaas.com/i/080225913252',
  bankSlipUrl: null,
  paymentDate: null,
  clientPaymentDate: null,
  externalReference: 'of-1'
};

describe('Asaas', () => {
  it('reaproveita o cliente pelo externalReference e cria quando não acha', async () => {
    const m = asaasDeMentira({
      'GET /customers': () => ({ json: { object: 'list', hasMore: false, totalCount: 0, data: [] } }),
      'POST /customers': () => ({ json: { object: 'customer', id: 'cus_novo' } })
    });
    const a = criarAsaas(CONFIG, m.buscar);
    expect(await a.criarCliente(PAGADOR)).toBe('cus_novo');
    expect(m.chamadas[0].url).toContain('externalReference=of-1');
    expect(m.chamadas[0].cabecalhos.access_token).toBe('$aact_teste');
    expect(m.chamadas[0].cabecalhos['user-agent']).toBeTruthy();
    expect(m.chamadas[1].corpo).toMatchObject({ name: 'Auto Center Silva', cpfCnpj: '11444777000161', externalReference: 'of-1', mobilePhone: '21987650000' });

    const m2 = asaasDeMentira({ 'GET /customers': () => ({ json: { data: [{ id: 'cus_velho', deleted: true }, { id: 'cus_existente' }] } }) });
    expect(await criarAsaas(CONFIG, m2.buscar).criarCliente(PAGADOR)).toBe('cus_existente');
    expect(m2.chamadas).toHaveLength(1);
  });

  it('cria a assinatura mensal, configura a nota e traz a 1ª cobrança com o Pix', async () => {
    const m = asaasDeMentira({
      'POST /subscriptions': () => ({ json: { object: 'subscription', id: 'sub_VXJBYgP2u0eO', nextDueDate: '2026-11-17', status: 'ACTIVE' } }),
      'POST /subscriptions/sub_VXJBYgP2u0eO/invoiceSettings': () => ({ json: { municipalServiceCode: '01.03' } }),
      'GET /subscriptions/sub_VXJBYgP2u0eO/payments': () => ({ json: { data: [PAGAMENTO] } }),
      'GET /payments/pay_080225913252/pixQrCode': () => ({ json: { encodedImage: 'iVBOR...', payload: '00020101021226820014br.gov.bcb.pix', expirationDate: '2027-10-17 23:59:59' } })
    });
    const a = criarAsaas({ ...CONFIG, nota: { codigoServico: '01.03', idServico: null, nomeServico: 'Licença de uso de software (SaaS) — Revisaí Pro', iss: 2 } }, m.buscar);
    expect(a.emiteNota).toBe(true);
    const r = await a.criarAssinatura({ cliente: 'cus_1', pagador: PAGADOR, metodo: 'pix', valor: 29.9, descricao: 'Revisaí Pro', primeiroVencimento: '2026-10-17' });
    expect(m.chamadas[0].corpo).toMatchObject({ customer: 'cus_1', billingType: 'PIX', value: 29.9, nextDueDate: '2026-10-17', cycle: 'MONTHLY', externalReference: 'of-1' });
    expect(m.chamadas[1].corpo).toMatchObject({ municipalServiceCode: '01.03', effectiveDatePeriod: 'ON_PAYMENT_CONFIRMATION', taxes: { iss: 2, retainIss: false } });
    expect(r).toMatchObject({ assinaturaExterna: 'sub_VXJBYgP2u0eO', proximoVencimento: '2026-11-17', autorizacao: null });
    expect(r.primeira).toMatchObject({
      externo: 'pay_080225913252',
      valor: 29.9,
      situacao: 'pendente',
      metodo: 'pix',
      link: 'https://sandbox.asaas.com/i/080225913252',
      pixCopiaECola: '00020101021226820014br.gov.bcb.pix'
    });
  });

  it('cartão vai para a página de pagamento do Asaas; boleto traz a linha digitável', async () => {
    const m = asaasDeMentira({
      'POST /subscriptions': (c) => ({ json: { id: (c.corpo as { billingType: string }).billingType === 'BOLETO' ? 'sub_b' : 'sub_c' } }),
      'GET /subscriptions/sub_c/payments': () => ({ json: { data: [{ ...PAGAMENTO, id: 'pay_c', billingType: 'CREDIT_CARD' }] } }),
      'GET /subscriptions/sub_b/payments': () => ({ json: { data: [{ ...PAGAMENTO, id: 'pay_b', billingType: 'BOLETO', bankSlipUrl: 'https://sandbox.asaas.com/b/pdf/pay_b' }] } }),
      'GET /payments/pay_b/identificationField': () => ({ json: { identificationField: '00190000090275928800021932978170187890000005000' } })
    });
    const a = criarAsaas(CONFIG, m.buscar);
    const c = await a.criarAssinatura({ cliente: 'cus_1', pagador: PAGADOR, metodo: 'cartao', valor: 39.9, descricao: 'Revisaí Pro', primeiroVencimento: '2026-10-17' });
    expect(c.primeira).toMatchObject({ metodo: 'cartao', link: 'https://sandbox.asaas.com/i/080225913252', pixCopiaECola: null });
    expect(m.chamadas.find((x) => x.url.includes('invoiceSettings'))).toBeUndefined();
    // os dados do cartão nunca passam pelo Revisaí: nenhum corpo leva creditCard
    expect(m.chamadas.some((x) => JSON.stringify(x.corpo ?? {}).includes('creditCard'))).toBe(false);
    const b = await a.criarAssinatura({ cliente: 'cus_1', pagador: PAGADOR, metodo: 'boleto', valor: 39.9, descricao: 'Revisaí Pro', primeiroVencimento: '2026-10-20' });
    expect(b.primeira?.boletoLinha).toBe('00190000090275928800021932978170187890000005000');
    await expect(a.criarAssinatura({ cliente: 'cus_1', pagador: PAGADOR, metodo: 'pix_automatico', valor: 1, descricao: 'x', primeiroVencimento: '2026-10-20' })).rejects.toBeInstanceOf(ErroDoGateway);
  });

  it('cancela, consulta (404 vira nulo), gera Pix avulso e emite a nota avulsa', async () => {
    const m = asaasDeMentira({
      'DELETE /subscriptions/sub_1': () => ({ json: { deleted: true, id: 'sub_1' } }),
      'GET /payments/pay_pago': () => ({ json: { ...PAGAMENTO, id: 'pay_pago', status: 'RECEIVED', paymentDate: '2026-10-17', clientPaymentDate: '2026-10-17' } }),
      'POST /payments': () => ({ json: { ...PAGAMENTO, id: 'pay_loja', subscription: null, value: 150.5, dueDate: '2026-11-10' } }),
      'GET /payments/pay_loja/pixQrCode': () => ({ json: { payload: '000201loja' } }),
      'POST /invoices': () => ({ json: { object: 'invoice', id: 'inv_1', status: 'SCHEDULED', number: null } }),
      'POST /invoices/inv_1/authorize': () => ({ json: { object: 'invoice', id: 'inv_1', status: 'AUTHORIZED', number: '345', pdfUrl: 'https://sandbox.asaas.com/nota/inv_1.pdf' } })
    });
    const a = criarAsaas({ ...CONFIG, nota: { codigoServico: '01.03', idServico: null, nomeServico: 'SaaS', iss: 2 } }, m.buscar);
    await a.cancelarAssinatura('sub_1');
    expect(m.chamadas[0]).toMatchObject({ metodo: 'DELETE' });
    expect(await a.consultarPagamento('pay_nao_existe')).toBeNull();
    const pago = await a.consultarPagamento('pay_pago');
    expect(pago).toMatchObject({ situacao: 'pago' });
    expect(pago?.pagoEm?.slice(0, 10)).toBe('2026-10-17');
    const loja = await a.gerarCobrancaAvulsa({ cliente: 'cus_loja', pagador: PAGADOR, valor: 150.5, vencimento: '2026-11-10', descricao: 'Comissão', referencia: 'loja-1-2026-10' });
    expect(loja).toMatchObject({ externo: 'pay_loja', valor: 150.5, pixCopiaECola: '000201loja' });
    expect(m.chamadas.find((x) => x.metodo === 'POST' && x.url.endsWith('/payments'))?.corpo).toMatchObject({ billingType: 'PIX', customer: 'cus_loja', externalReference: 'loja-1-2026-10' });
    const nota = await a.emitirNota({ pagamentoExterno: null, cliente: 'cus_of', valor: 29.9, descricao: 'Licença de uso de software (SaaS) — Revisaí Pro' });
    expect(nota).toEqual({ externa: 'inv_1', situacao: 'emitida', numero: '345', url: 'https://sandbox.asaas.com/nota/inv_1.pdf', erro: null });
    expect(m.chamadas.find((x) => x.url.endsWith('/invoices'))?.corpo).toMatchObject({ customer: 'cus_of', municipalServiceCode: '01.03', value: 29.9 });
  });

  it('o erro do Asaas vira mensagem legível', async () => {
    const m = asaasDeMentira({ 'POST /customers': () => ({ status: 400, json: { errors: [{ code: 'invalid_cpfCnpj', description: 'O CPF/CNPJ informado é inválido.' }] } }), 'GET /customers': () => ({ json: { data: [] } }) });
    await expect(criarAsaas(CONFIG, m.buscar).criarCliente(PAGADOR)).rejects.toMatchObject({ message: 'O CPF/CNPJ informado é inválido.', status: 400 });
  });

  it('confere o token do webhook (asaas-access-token)', () => {
    const a = criarAsaas(CONFIG, fetch);
    const pedido = (token?: string) => ({ cabecalhos: new Headers(token ? { 'asaas-access-token': token } : {}), url: new URL('https://revisai.app/api/pagamentos/asaas'), corpo: '{}' });
    expect(a.validarWebhook(pedido('token-do-webhook-123'))).toBe(true);
    expect(a.validarWebhook(pedido('token-do-webhook-124'))).toBe(false);
    expect(a.validarWebhook(pedido())).toBe(false);
    // sem token configurado, nenhum aviso passa
    expect(criarAsaas({ ...CONFIG, tokenWebhook: null }, fetch).validarWebhook(pedido('qualquer'))).toBe(false);
  });

  it('traduz os eventos de cobrança, de assinatura e de nota', () => {
    const evt = (event: string, extra: Record<string, unknown>) => eventosAsaas({ id: `evt_${event}`, event, dateCreated: '2026-10-17 10:00:00', ...extra });
    expect(evt('PAYMENT_CREATED', { payment: PAGAMENTO })[0]).toMatchObject({ tipo: 'cobranca', assinatura: 'sub_VXJBYgP2u0eO', cobranca: { externo: 'pay_080225913252' } });
    const pago = evt('PAYMENT_RECEIVED', { payment: { ...PAGAMENTO, status: 'RECEIVED', clientPaymentDate: '2026-10-17' } })[0];
    expect(pago).toMatchObject({ id: 'evt_PAYMENT_RECEIVED', tipo: 'pago', externo: 'pay_080225913252', assinatura: 'sub_VXJBYgP2u0eO' });
    expect(evt('PAYMENT_CONFIRMED', { payment: { ...PAGAMENTO, billingType: 'CREDIT_CARD', status: 'CONFIRMED' } })[0].tipo).toBe('pago');
    expect(evt('PAYMENT_OVERDUE', { payment: { ...PAGAMENTO, status: 'OVERDUE' } })[0]).toMatchObject({ tipo: 'atrasado' });
    expect(evt('PAYMENT_REFUNDED', { payment: { ...PAGAMENTO, status: 'REFUNDED' } })[0]).toMatchObject({ tipo: 'estornado' });
    expect(evt('PAYMENT_DELETED', { payment: PAGAMENTO })[0]).toMatchObject({ tipo: 'cancelado' });
    expect(evt('PAYMENT_AWAITING_RISK_ANALYSIS', { payment: PAGAMENTO })[0]).toMatchObject({ tipo: 'ignorado' });
    expect(evt('SUBSCRIPTION_DELETED', { subscription: { id: 'sub_VXJBYgP2u0eO' } })[0]).toMatchObject({ tipo: 'assinatura_cancelada', assinatura: 'sub_VXJBYgP2u0eO' });
    expect(evt('INVOICE_AUTHORIZED', { invoice: { id: 'inv_9', payment: 'pay_080225913252', status: 'AUTHORIZED', number: '12', pdfUrl: 'https://x.asaas.com/n.pdf' } })[0]).toMatchObject({
      tipo: 'nota',
      externo: 'pay_080225913252',
      nota: { externa: 'inv_9', situacao: 'emitida', numero: '12', url: 'https://x.asaas.com/n.pdf' }
    });
    expect(evt('INVOICE_ERROR', { invoice: { id: 'inv_9', status: 'ERROR', statusDescription: 'Código de serviço inválido' } })[0]).toMatchObject({ nota: { situacao: 'erro', erro: 'Código de serviço inválido' } });
    expect(eventosAsaas({ event: 'PAYMENT_RECEIVED' })).toEqual([]);
    expect(situacaoAsaas('RECEIVED_IN_CASH')).toBe('pago');
    expect(situacaoAsaas('CHARGEBACK_REQUESTED')).toBe('estornado');
  });
});
