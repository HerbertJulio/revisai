import { describe, expect, it, vi } from 'vitest';
import { aplicarEvento, precisaEmitirNota, type BancoCobranca, type RegistroPagamento } from '@/lib/cobranca/aplicar';
import { cpfValido, documentoValido, formatarDocumento, hojeEmBrasilia, maisDias, maisUmMes, novoTxid } from '@/lib/cobranca/documento';
import { criarTeste, eventosTeste } from '@/lib/cobranca/teste';
import type { LinhaAssinatura, LinhaPagamento, Nota } from '@/lib/cobranca/tipos';

vi.mock('server-only', () => ({}));

const { gatewaysDoAmbiente, metodosDisponiveis, provedorPara, provedorDeNota, provedorAvulso, cobrancaLigada, configAsaas, testeLigado } = await import('@/lib/cobranca');

describe('documento e datas', () => {
  it('confere CPF e CNPJ', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('52998224724')).toBe(false);
    expect(documentoValido('529.982.247-25')).toBe('52998224725');
    expect(documentoValido('11.444.777/0001-61')).toBe('11444777000161');
    expect(documentoValido('11.444.777/0001-62')).toBeNull();
    expect(documentoValido('123')).toBeNull();
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento('11444777000161')).toBe('11.444.777/0001-61');
  });

  it('soma um mês sem pular o fim do mês', () => {
    expect(maisUmMes('2026-01-31')).toBe('2026-02-28');
    expect(maisUmMes('2028-01-31')).toBe('2028-02-29');
    expect(maisUmMes('2026-12-15')).toBe('2027-01-15');
    expect(maisDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(hojeEmBrasilia(new Date('2026-10-18T02:30:00Z'))).toBe('2026-10-17');
  });

  it('txid do Pix entre 26 e 35 letras e números', () => {
    const t = novoTxid('rvp');
    expect(t).toMatch(/^rvp[A-Za-z0-9]{29}$/);
    expect(novoTxid()).not.toBe(novoTxid());
  });
});

describe('gateway de teste', () => {
  it('cria assinatura e cobrança de mentira com links https e Pix válido', async () => {
    const t = criarTeste('s1');
    const r = await t.criarAssinatura({
      cliente: 'cus',
      pagador: { nome: 'Zé', documento: '52998224725', email: 'z@x.dev', referencia: 'of' },
      metodo: 'pix',
      valor: 29.9,
      descricao: 'Revisaí Pro',
      primeiroVencimento: '2026-10-17'
    });
    expect(r.primeira?.link).toMatch(/^https:\/\//);
    expect(r.primeira?.pixCopiaECola).toMatch(/^000201/);
    expect(r.primeira?.pixCopiaECola).toContain('54052');
    const auto = await t.criarAssinatura({ cliente: 'cus', pagador: { nome: 'Zé', documento: '52998224725', email: 'z@x.dev', referencia: 'of' }, metodo: 'pix_automatico', valor: 29.9, descricao: 'x', primeiroVencimento: '2026-10-17' });
    expect(auto.autorizacao).toBeTruthy();
    const nota = await t.emitirNota({ pagamentoExterno: 'pay', cliente: null, valor: 29.9, descricao: 'x' });
    expect(nota).toMatchObject({ situacao: 'emitida' });
    expect(nota.url).toMatch(/^https:\/\/.*\.pdf$/);
  });

  it('só aceita o aviso com o segredo certo', () => {
    const t = criarTeste('s1');
    const pedido = (s?: string) => ({ cabecalhos: new Headers(s ? { 'x-teste-segredo': s } : {}), url: new URL('http://localhost/api/pagamentos/teste'), corpo: '{}' });
    expect(t.validarWebhook(pedido('s1'))).toBe(true);
    expect(t.validarWebhook(pedido('s2'))).toBe(false);
    expect(t.validarWebhook(pedido())).toBe(false);
    expect(eventosTeste({ id: 'e1', tipo: 'pago', externo: 'pay_1' })[0]).toMatchObject({ tipo: 'pago', externo: 'pay_1' });
    expect(eventosTeste({ id: 'e2', tipo: 'nota', externo: 'pay_1', nota: { externa: 'nf', situacao: 'emitida', url: 'http://inseguro' } })[0]).toMatchObject({ nota: { url: null } });
    expect(eventosTeste({ tipo: 'pago' })).toEqual([]);
  });
});

describe('qual gateway atende', () => {
  const ASAAS = { ASAAS_API_KEY: '$aact_x', ASAAS_WEBHOOK_TOKEN: 't' };
  const EFI = { EFI_CLIENT_ID: 'id', EFI_CLIENT_SECRET: 's', EFI_CERTIFICADO_BASE64: Buffer.from('c').toString('base64'), EFI_CHAVE_PIX: 'pix@x.dev' };

  it('sem nada configurado, a assinatura é pelo WhatsApp', () => {
    const g = gatewaysDoAmbiente({});
    expect(cobrancaLigada(g)).toBe(false);
    expect(metodosDisponiveis(g)).toEqual([]);
    expect(provedorPara('pix', g)).toBeNull();
    expect(provedorDeNota(g)).toBeNull();
    expect(provedorAvulso(g)).toBeNull();
  });

  it('Asaas atende Pix, cartão e boleto; a Efí, o Pix Automático', () => {
    expect(metodosDisponiveis(gatewaysDoAmbiente(ASAAS))).toEqual(['pix', 'cartao', 'boleto']);
    expect(metodosDisponiveis(gatewaysDoAmbiente(EFI))).toEqual(['pix_automatico']);
    const ambos = gatewaysDoAmbiente({ ...ASAAS, ...EFI });
    expect(metodosDisponiveis(ambos)).toEqual(['pix_automatico', 'pix', 'cartao', 'boleto']);
    expect(provedorPara('pix_automatico', ambos)?.nome).toBe('efi');
    expect(provedorPara('cartao', ambos)?.nome).toBe('asaas');
    expect(provedorAvulso(ambos)?.nome).toBe('asaas');
    expect(provedorAvulso(gatewaysDoAmbiente(EFI))?.nome).toBe('efi');
    // a nota só com o código do serviço
    expect(provedorDeNota(ambos)).toBeNull();
    expect(provedorDeNota(gatewaysDoAmbiente({ ...ASAAS, NFSE_CODIGO_SERVICO: '01.03' }))?.nome).toBe('asaas');
    expect(configAsaas({ ...ASAAS, NFSE_CODIGO_SERVICO: '01.03', NFSE_ISS: '2,5', ASAAS_AMBIENTE: 'producao' })).toMatchObject({
      ambiente: 'producao',
      nota: { codigoServico: '01.03', iss: 2.5, nomeServico: 'Licença de uso de software (SaaS) — Revisaí Pro' }
    });
  });

  it('o gateway de teste nunca liga em produção', () => {
    expect(testeLigado({ COBRANCA_PROVEDOR: 'teste', NODE_ENV: 'development' })).toBe(true);
    expect(testeLigado({ COBRANCA_PROVEDOR: 'teste', NODE_ENV: 'production' })).toBe(false);
    expect(testeLigado({ COBRANCA_PROVEDOR: 'teste', NODE_ENV: 'development', VERCEL_ENV: 'production' })).toBe(false);
    const g = gatewaysDoAmbiente({ COBRANCA_PROVEDOR: 'teste', NODE_ENV: 'test', ...ASAAS });
    expect(provedorPara('cartao', g)?.nome).toBe('teste');
    expect(metodosDisponiveis(g)).toEqual(['pix_automatico', 'pix', 'cartao', 'boleto']);
  });
});

// ------------------------------------------------------------------ aplicar os avisos

function assinaturaDeExemplo(extra: Partial<LinhaAssinatura> = {}): LinhaAssinatura {
  return {
    id: 'as-1',
    oficina_id: 'of-1',
    provedor: 'asaas',
    metodo: 'pix',
    cliente_externo: 'cus',
    assinatura_externa: 'sub_1',
    valor: 29.9,
    situacao: 'ativa',
    documento: '52998224725',
    nome_nota: 'Zé',
    email_nota: 'z@x.dev',
    proximo_vencimento: '2026-11-17',
    autorizacao: null,
    cancelada_em: null,
    criado_em: '2026-10-17T10:00:00Z',
    ...extra
  };
}

function bancoNaMemoria(assinaturas: LinhaAssinatura[] = [assinaturaDeExemplo()]) {
  const pagamentos = new Map<string, LinhaPagamento>();
  const notas: { externo: string | null; nota: Nota }[] = [];
  const canceladas: string[] = [];
  const aprovadas: string[] = [];
  const banco: BancoCobranca = {
    async assinaturaPorExterna(provedor, externa) {
      return assinaturas.find((a) => a.provedor === provedor && a.assinatura_externa === externa) ?? null;
    },
    async pagamentoPorExterno(provedor, externo) {
      return pagamentos.get(`${provedor}:${externo}`) ?? null;
    },
    async registrarPagamento(r: RegistroPagamento) {
      const chave = `${r.provedor}:${r.externo}`;
      const antes = pagamentos.get(chave);
      const linha: LinhaPagamento = {
        id: antes?.id ?? `pg-${pagamentos.size + 1}`,
        tipo: r.tipo,
        oficina_id: r.oficinaId,
        fornecedor_id: r.fornecedorId,
        assinatura_id: r.assinaturaId,
        provedor: r.provedor,
        externo: r.externo,
        referencia: null,
        metodo: r.metodo as LinhaPagamento['metodo'],
        valor: r.valor,
        situacao: antes?.situacao ?? 'pendente',
        vencimento: r.vencimento,
        pago_em: antes?.pago_em ?? null,
        descricao: r.descricao,
        link_pagamento: r.link ?? antes?.link_pagamento ?? null,
        pix_copia_cola: r.pix ?? antes?.pix_copia_cola ?? null,
        boleto_linha: r.boleto,
        nota_externa: null,
        nota_numero: null,
        nota_url: null,
        nota_situacao: null,
        nota_erro: null,
        criado_em: '2026-10-17T10:00:00Z'
      };
      pagamentos.set(chave, linha);
      return linha.id;
    },
    async confirmarPagamento(provedor, externo, pagoEm) {
      const p = pagamentos.get(`${provedor}:${externo}`);
      if (!p) return { achou: false, aplicado: false };
      const aplicado = p.situacao !== 'pago';
      pagamentos.set(`${provedor}:${externo}`, { ...p, situacao: 'pago', pago_em: pagoEm });
      return { achou: true, aplicado };
    },
    async pagamentoAtrasado(provedor, externo) {
      const p = pagamentos.get(`${provedor}:${externo}`);
      if (!p) return false;
      pagamentos.set(`${provedor}:${externo}`, { ...p, situacao: 'atrasado' });
      return true;
    },
    async pagamentoDesfeito(provedor, externo, situacao) {
      const p = pagamentos.get(`${provedor}:${externo}`);
      if (!p) return false;
      pagamentos.set(`${provedor}:${externo}`, { ...p, situacao });
      return true;
    },
    async gravarNota(_provedor, externo, nota) {
      notas.push({ externo, nota });
      return true;
    },
    async assinaturaCancelada(_provedor, externa) {
      canceladas.push(externa);
      return true;
    },
    async autorizacaoAprovada(_provedor, externa) {
      aprovadas.push(externa);
      return true;
    }
  };
  return { banco, pagamentos, notas, canceladas, aprovadas };
}

const COB = { externo: 'pay_2', valor: 29.9, vencimento: '2026-11-17', link: 'https://pagar/2', pixCopiaECola: '000201', boletoLinha: null, situacao: 'pendente' as const, pagoEm: null, metodo: 'pix' as const };

describe('aplicar os avisos', () => {
  it('guarda a cobrança nova da assinatura e confirma o pagamento', async () => {
    const m = bancoNaMemoria();
    expect(await aplicarEvento('asaas', { id: 'e1', tipo: 'cobranca', cobranca: COB, assinatura: 'sub_1' }, m.banco)).toEqual({ ok: true, pago: null });
    expect(m.pagamentos.get('asaas:pay_2')).toMatchObject({ assinatura_id: 'as-1', oficina_id: 'of-1', tipo: 'pro', pix_copia_cola: '000201' });
    const r = await aplicarEvento('asaas', { id: 'e2', tipo: 'pago', externo: 'pay_2', pagoEm: '2026-11-17T10:00:00Z', assinatura: 'sub_1', cobranca: null }, m.banco);
    expect(r).toMatchObject({ ok: true, pago: { externo: 'pay_2', situacao: 'pago' } });
  });

  it('pago antes do aviso da cobrança: guarda pela assinatura e confirma', async () => {
    const m = bancoNaMemoria();
    const r = await aplicarEvento('asaas', { id: 'e3', tipo: 'pago', externo: 'pay_3', pagoEm: '2026-11-17T10:00:00Z', assinatura: 'sub_1', cobranca: { ...COB, externo: 'pay_3', situacao: 'pago' } }, m.banco);
    expect(r).toMatchObject({ ok: true, pago: { externo: 'pay_3', situacao: 'pago', assinatura_id: 'as-1' } });
  });

  it('pagamento desconhecido: no Asaas fica para tentar de novo; na Efí é Pix de fora', async () => {
    const m = bancoNaMemoria();
    expect(await aplicarEvento('asaas', { id: 'e4', tipo: 'pago', externo: 'pay_x', pagoEm: null, assinatura: null, cobranca: null }, m.banco)).toMatchObject({ ok: false });
    expect(await aplicarEvento('efi', { id: 'e5', tipo: 'pago', externo: 'tx', pagoEm: null, assinatura: null, cobranca: null }, m.banco)).toMatchObject({ ok: true, pago: null });
    // a assinatura ainda não guardada também fica para depois
    expect(await aplicarEvento('asaas', { id: 'e6', tipo: 'cobranca', cobranca: COB, assinatura: 'sub_nova' }, m.banco)).toMatchObject({ ok: false });
  });

  it('atraso, estorno, cancelamento, autorização e nota', async () => {
    const m = bancoNaMemoria();
    await aplicarEvento('asaas', { id: 'e1', tipo: 'cobranca', cobranca: COB, assinatura: 'sub_1' }, m.banco);
    await aplicarEvento('asaas', { id: 'e7', tipo: 'atrasado', externo: 'pay_2' }, m.banco);
    expect(m.pagamentos.get('asaas:pay_2')?.situacao).toBe('atrasado');
    await aplicarEvento('asaas', { id: 'e8', tipo: 'estornado', externo: 'pay_2' }, m.banco);
    expect(m.pagamentos.get('asaas:pay_2')?.situacao).toBe('estornado');
    await aplicarEvento('efi', { id: 'e9', tipo: 'autorizacao_recusada', assinatura: 'RR1' }, m.banco);
    await aplicarEvento('efi', { id: 'e10', tipo: 'autorizacao_ativa', assinatura: 'RR2' }, m.banco);
    expect(m.canceladas).toEqual(['RR1']);
    expect(m.aprovadas).toEqual(['RR2']);
    await aplicarEvento('asaas', { id: 'e11', tipo: 'nota', externo: 'pay_2', nota: { externa: 'inv', situacao: 'emitida', numero: '1', url: 'https://n' } }, m.banco);
    expect(m.notas[0]).toMatchObject({ externo: 'pay_2', nota: { externa: 'inv' } });
    expect(await aplicarEvento('asaas', { id: 'e12', tipo: 'ignorado', motivo: 'x' }, m.banco)).toMatchObject({ ok: true });
  });

  it('a nota sai por aqui só quando o gateway não emite sozinho', () => {
    const pago = (extra: Partial<LinhaPagamento>): LinhaPagamento => ({
      id: 'p',
      tipo: 'pro',
      oficina_id: 'of',
      fornecedor_id: null,
      assinatura_id: 'as',
      provedor: 'efi',
      externo: 'tx',
      referencia: '2026-10',
      metodo: 'pix_automatico',
      valor: 29.9,
      situacao: 'pago',
      vencimento: null,
      pago_em: null,
      descricao: null,
      link_pagamento: null,
      pix_copia_cola: null,
      boleto_linha: null,
      nota_externa: null,
      nota_numero: null,
      nota_url: null,
      nota_situacao: null,
      nota_erro: null,
      criado_em: '',
      ...extra
    });
    expect(precisaEmitirNota(pago({}), 'asaas', true)).toBe(true);
    expect(precisaEmitirNota(pago({ provedor: 'asaas' }), 'asaas', true)).toBe(false);
    expect(precisaEmitirNota(pago({ provedor: 'asaas', tipo: 'loja', assinatura_id: null }), 'asaas', true)).toBe(true);
    expect(precisaEmitirNota(pago({ nota_situacao: 'emitida' }), 'asaas', true)).toBe(false);
    expect(precisaEmitirNota(pago({ nota_situacao: 'erro' }), 'asaas', true)).toBe(true);
    expect(precisaEmitirNota(pago({ situacao: 'pendente' }), 'asaas', true)).toBe(false);
    expect(precisaEmitirNota(pago({}), null, false)).toBe(false);
  });
});
