import { describe, expect, it } from 'vitest';
import { criarEfi, eventosEfi, situacaoEfi, type ConfigEfi, type PedidoEfi } from '@/lib/cobranca/efi';
import type { Pagador } from '@/lib/cobranca/tipos';

// A Efí de mentira responde no formato do Pix Automático do Banco Central (locrec, rec, cobr).

const CONFIG: ConfigEfi = {
  clienteId: 'Client_Id_teste',
  segredo: 'Client_Secret_teste',
  certificado: Buffer.from('certificado').toString('base64'),
  senhaCertificado: '',
  ambiente: 'homologacao',
  chavePix: 'pix@revisai.app',
  segredoWebhook: 'segredo-efi-1'
};
const PAGADOR: Pagador = { nome: 'Oficina do Zé', documento: '52998224725', email: 'ze@oficina.dev', referencia: '0b8f6a52-6c1d-4a3e-9d0f-111111111111' };

function efiDeMentira(rotas: Record<string, (p: PedidoEfi) => { status?: number; json: unknown }>) {
  const pedidos: PedidoEfi[] = [];
  const transporte = async (p: PedidoEfi) => {
    pedidos.push(p);
    const chave = `${p.metodo} ${p.caminho.split('?')[0].replace(/\/(cob|cobr|cobv)\/[A-Za-z0-9]+$/, '/$1/:txid')}`;
    if (chave === 'POST /oauth/token') return { status: 200, json: { access_token: 'tok_1', token_type: 'Bearer', expires_in: 3600, scope: 'cob.write rec.write' } };
    const rota = rotas[chave];
    if (!rota) return { status: 404, json: { nome: 'nao_encontrado', mensagem: `sem rota ${chave}` } };
    const r = rota(p);
    return { status: r.status ?? 200, json: r.json };
  };
  return { transporte, pedidos };
}

describe('Efí (Pix Automático)', () => {
  it('autentica uma vez e cria a cobrança do 1º mês, a recorrência e o QR da autorização', async () => {
    const m = efiDeMentira({
      'PUT /v2/cob/:txid': (p) => ({ status: 201, json: { txid: p.caminho.split('/').pop(), status: 'ATIVA', valor: { original: '29.90' }, calendario: { criacao: '2026-10-17T10:00:00Z', expiracao: 86400 }, pixCopiaECola: '00020101cob' } }),
      'POST /v2/locrec': () => ({ status: 201, json: { id: 123, location: 'pix.example/rec/123', criacao: '2026-10-17T10:00:00Z' } }),
      'POST /v2/rec': () => ({ status: 201, json: { idRec: 'RR1234567820261017abcdefghijk', status: 'CRIADA' } }),
      'GET /v2/rec/RR1234567820261017abcdefghijk': () => ({ json: { idRec: 'RR1234567820261017abcdefghijk', status: 'CRIADA', dadosQR: { jornada: 'JORNADA_3', pixCopiaECola: '00020101jornada3' } } })
    });
    const efi = criarEfi(CONFIG, m.transporte);
    const r = await efi.criarAssinatura({ cliente: PAGADOR.documento, pagador: PAGADOR, metodo: 'pix_automatico', valor: 29.9, descricao: 'Revisaí Pro: assinatura mensal', primeiroVencimento: '2026-10-17' });
    expect(m.pedidos.filter((p) => p.caminho === '/oauth/token')).toHaveLength(1);
    expect(m.pedidos[0].cabecalhos?.authorization).toBe(`Basic ${Buffer.from('Client_Id_teste:Client_Secret_teste').toString('base64')}`);
    expect(m.pedidos[1].cabecalhos?.authorization).toBe('Bearer tok_1');
    const cob = m.pedidos.find((p) => p.caminho.startsWith('/v2/cob/'));
    expect(cob?.corpo).toMatchObject({ devedor: { cpf: '52998224725', nome: 'Oficina do Zé' }, valor: { original: '29.90' }, chave: 'pix@revisai.app' });
    const txid = cob!.caminho.split('/').pop()!;
    expect(txid).toMatch(/^[A-Za-z0-9]{26,35}$/);
    const rec = m.pedidos.find((p) => p.caminho === '/v2/rec');
    expect(rec?.corpo).toMatchObject({
      calendario: { dataInicial: '2026-11-17', periodicidade: 'MENSAL' },
      valor: { valorRec: '29.90' },
      loc: 123,
      ativacao: { dadosJornada: { txid } },
      vinculo: { devedor: { cpf: '52998224725' } }
    });
    expect(m.pedidos.at(-1)?.caminho).toBe(`/v2/rec/RR1234567820261017abcdefghijk?txid=${txid}`);
    expect(r).toMatchObject({ assinaturaExterna: 'RR1234567820261017abcdefghijk', proximoVencimento: '2026-11-17', autorizacao: '00020101jornada3' });
    expect(r.primeira).toMatchObject({ externo: txid, valor: 29.9, metodo: 'pix_automatico', pixCopiaECola: '00020101jornada3' });
    await expect(efi.criarAssinatura({ cliente: 'x', pagador: PAGADOR, metodo: 'pix', valor: 1, descricao: 'x', primeiroVencimento: '2026-10-17' })).rejects.toThrow();
  });

  it('cancela a recorrência, agenda a cobrança do mês e gera o Pix com vencimento da loja', async () => {
    const m = efiDeMentira({
      'PATCH /v2/rec/RR1': () => ({ json: { idRec: 'RR1', status: 'CANCELADA' } }),
      'PUT /v2/cobr/:txid': (p) => ({ status: 201, json: { idRec: 'RR1', txid: p.caminho.split('/').pop(), status: 'CRIADA', valor: { original: '29.90' }, calendario: { dataDeVencimento: '2026-11-17' } } }),
      'PUT /v2/cobv/:txid': (p) => ({ status: 201, json: { txid: p.caminho.split('/').pop(), status: 'ATIVA', valor: { original: '150.50' }, calendario: { dataDeVencimento: '2026-11-10' }, pixCopiaECola: '000201cobv' } })
    });
    const efi = criarEfi(CONFIG, m.transporte);
    await efi.cancelarAssinatura('RR1');
    expect(m.pedidos.find((p) => p.metodo === 'PATCH')?.corpo).toEqual({ status: 'CANCELADA' });
    const c = await efi.agendarCobrancaRecorrente!('RR1', 29.9, '2026-11-17', 'Revisaí Pro');
    expect(c).toMatchObject({ valor: 29.9, vencimento: '2026-11-17', metodo: 'pix_automatico', situacao: 'pendente' });
    expect(m.pedidos.find((p) => p.caminho.startsWith('/v2/cobr/'))?.corpo).toMatchObject({ idRec: 'RR1', calendario: { dataDeVencimento: '2026-11-17' }, valor: { original: '29.90' }, ajusteDiaUtil: true });
    const loja = await efi.gerarCobrancaAvulsa({ cliente: '11444777000161', pagador: { ...PAGADOR, documento: '11444777000161', nome: 'Loja' }, valor: 150.5, vencimento: '2026-11-10', descricao: 'Comissão', referencia: 'loja-1' });
    expect(loja).toMatchObject({ valor: 150.5, pixCopiaECola: '000201cobv', vencimento: '2026-11-10' });
    expect(m.pedidos.find((p) => p.caminho.startsWith('/v2/cobv/'))?.corpo).toMatchObject({ devedor: { cnpj: '11444777000161' } });
    await expect(efi.emitirNota({ pagamentoExterno: null, cliente: null, valor: 1, descricao: 'x' })).rejects.toThrow();
  });

  it('consulta a cobrança procurando em cob, cobr e cobv', async () => {
    const m = efiDeMentira({
      'GET /v2/cobr/:txid': () => ({ json: { txid: 'abc', status: 'CONCLUIDA', valor: { original: '29.90' }, calendario: { dataDeVencimento: '2026-11-17' }, pix: [{ horario: '2026-11-17T08:00:00Z' }] } })
    });
    const c = await criarEfi(CONFIG, m.transporte).consultarPagamento('abc');
    expect(c).toMatchObject({ situacao: 'pago', pagoEm: '2026-11-17T08:00:00Z', vencimento: '2026-11-17' });
    expect(await criarEfi(CONFIG, efiDeMentira({}).transporte).consultarPagamento('nada')).toBeNull();
  });

  it('confere o segredo do webhook, com ou sem o /pix que a Efí acrescenta', () => {
    const efi = criarEfi(CONFIG, efiDeMentira({}).transporte);
    const pedido = (url: string) => ({ cabecalhos: new Headers(), url: new URL(url), corpo: '{}' });
    expect(efi.validarWebhook(pedido('https://revisai.app/api/pagamentos/efi?s=segredo-efi-1'))).toBe(true);
    expect(efi.validarWebhook(pedido('https://revisai.app/api/pagamentos/efi/pix?s=segredo-efi-1'))).toBe(true);
    expect(efi.validarWebhook(pedido('https://revisai.app/api/pagamentos/efi?s=segredo-efi-1/pix'))).toBe(true);
    expect(efi.validarWebhook(pedido('https://revisai.app/api/pagamentos/efi?s=segredo-efi-1&ignorar=/pix'))).toBe(true);
    expect(efi.validarWebhook(pedido('https://revisai.app/api/pagamentos/efi?s=outro'))).toBe(false);
    expect(efi.validarWebhook(pedido('https://revisai.app/api/pagamentos/efi'))).toBe(false);
    expect(criarEfi({ ...CONFIG, segredoWebhook: null }, efiDeMentira({}).transporte).validarWebhook(pedido('https://x.dev/?s='))).toBe(false);
  });

  it('traduz os avisos de Pix, recorrência e cobrança da recorrência', () => {
    const pix = eventosEfi({
      pix: [
        { endToEndId: 'E1234', txid: 'rvpABC', valor: '29.90', horario: '2026-10-17T10:01:00.000Z', infoPagador: 'x' },
        { endToEndId: 'E5678', txid: 'rvlDEF', valor: '150.50', horario: '2026-10-18T10:01:00.000Z', devolucoes: [{ id: 'D1', rtrId: 'D1', valor: '150.50', status: 'DEVOLVIDO' }] },
        { endToEndId: 'E9999', valor: '10.00', horario: '2026-10-18T10:01:00.000Z' }
      ]
    });
    expect(pix).toEqual([
      { id: 'E1234:pago', tipo: 'pago', externo: 'rvpABC', pagoEm: '2026-10-17T10:01:00.000Z', assinatura: null, cobranca: null },
      { id: 'E5678:devolvido:D1', tipo: 'estornado', externo: 'rvlDEF' }
    ]);
    expect(eventosEfi({ recs: [{ idRec: 'RR1', status: 'APROVADA' }, { idRec: 'RR2', status: 'REJEITADA' }, { idRec: 'RR3', status: 'CANCELADA' }, { idRec: 'RR4', status: 'CRIADA' }] }).map((e) => e.tipo)).toEqual([
      'autorizacao_ativa',
      'autorizacao_recusada',
      'assinatura_cancelada',
      'ignorado'
    ]);
    const cobr = eventosEfi({ cobsr: [{ txid: 'rvrX', idRec: 'RR1', status: 'CONCLUIDA', pix: [{ horario: '2026-11-17T09:00:00Z' }] }, { txid: 'rvrY', idRec: 'RR1', status: 'EXPIRADA' }] });
    expect(cobr[0]).toEqual({ id: 'rvrX:CONCLUIDA', tipo: 'pago', externo: 'rvrX', pagoEm: '2026-11-17T09:00:00Z', assinatura: 'RR1', cobranca: null });
    expect(cobr[1]).toMatchObject({ id: 'rvrY:EXPIRADA', tipo: 'atrasado' });
    expect(eventosEfi({ evento: 'teste_webhook' })).toEqual([]);
    expect(eventosEfi(null)).toEqual([]);
    expect(situacaoEfi('REMOVIDA_PELO_USUARIO_RECEBEDOR')).toBe('cancelado');
  });
});
