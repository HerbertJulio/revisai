import { describe, expect, it } from 'vitest';
import {
  avisoPendente,
  chavePixParaMostrar,
  dadosDoPagamento,
  descricaoDaOrdem,
  idDoLancamentoDoLink,
  lancamentoDoPixDaOrdem,
  lerDadosDoPagamento,
  lerLinkDeCobranca,
  lerRespostaPaguei,
  lerValorDaCobranca,
  mensagemDeCobranca,
  novoTxid,
  podeCobrar,
  recebedorDaOficina,
  recebimentoPorPix,
  refDaCobranca,
  valorParaCobrar
} from '@/lib/cobranca-cliente';
import { cnpjValido, cpfValido, formatarCpfCnpj, lerCpfCnpj } from '@/lib/fiscal/identificacao';
import { crc16 } from '@/lib/pix';
import type { Lancamento } from '@/lib/registros-oficina';
import type { Documento, LinhaDocumento } from '@/lib/tipos';

function linha(p: Partial<LinhaDocumento>): LinhaDocumento {
  return { id: Math.random().toString(36).slice(2), tipo: 'servico', descricao: 'x', quantidade: 1, unidade: 'un', valorUnitario: 0, ...p };
}

function ordem(linhas: LinhaDocumento[], desconto: number | null = null): Documento {
  return { id: 'os-1', numero: 12, tipo: 'ordem', situacao: 'concluida', veiculoId: 'v1', km: 1000, data: '2026-10-17', linhas, desconto, criadoEm: '', atualizadoEm: '' };
}

function lancamento(p: Partial<Lancamento>): Lancamento {
  return { id: 'l', tipo: 'receber', descricao: '', valor: 0, vencimento: '2026-10-17', pagoEm: '2026-10-17', forma: 'pix', categoria: 'servico', criadoEm: '', atualizadoEm: '', ...p };
}

describe('quanto cobrar', () => {
  const doc = ordem([linha({ tipo: 'servico', valorUnitario: 200 }), linha({ tipo: 'peca', quantidade: 2, valorUnitario: 75 }), linha({ tipo: 'peca', valorUnitario: 999, recusada: true })], 20);

  it('o total menos o que já entrou no caixa da ordem (o fiado em aberto ainda é cobrado)', () => {
    const lancs = [
      lancamento({ id: 'a', valor: 100, documentoId: 'os-1' }),
      lancamento({ id: 'b', valor: 50, documentoId: 'os-1', pagoEm: null, forma: 'fiado' }),
      lancamento({ id: 'c', valor: 40, documentoId: 'outra' }),
      lancamento({ id: 'd', valor: 30, documentoId: 'os-1', tipo: 'pagar' })
    ];
    // 200 + 150 - 20 = 330; já entrou 100
    expect(valorParaCobrar(doc, lancs)).toBe(230);
    expect(valorParaCobrar(doc, [lancamento({ valor: 500, documentoId: 'os-1' })])).toBe(0);
  });

  it('só ordem aberta ou concluída', () => {
    expect(podeCobrar({ tipo: 'ordem', situacao: 'concluida' })).toBe(true);
    expect(podeCobrar({ tipo: 'ordem', situacao: 'aberta' })).toBe(true);
    expect(podeCobrar({ tipo: 'ordem', situacao: 'cancelada' })).toBe(false);
    expect(podeCobrar({ tipo: 'orcamento', situacao: 'aprovado' })).toBe(false);
  });

  it('lê o valor digitado do jeito brasileiro', () => {
    expect(lerValorDaCobranca('350')).toBe(350);
    expect(lerValorDaCobranca('350,5')).toBe(350.5);
    expect(lerValorDaCobranca('R$ 1.200,00')).toBe(1200);
    expect(lerValorDaCobranca('1.200')).toBe(1200);
    expect(lerValorDaCobranca('0')).toBeNull();
    expect(lerValorDaCobranca('abc')).toBeNull();
  });
});

describe('chave Pix da oficina', () => {
  it('o recebedor usa a chave do financeiro (guardada normalizada ou não), a razão social e a cidade', () => {
    expect(recebedorDaOficina({ chavePix: '', nome: 'Oficina', cidade: 'Rio' })).toBeNull();
    expect(recebedorDaOficina({ chavePix: '12.345.678/0001-95', nome: 'Auto Center', razaoSocial: 'Auto Center Ltda', cidade: 'Guapimirim' })).toEqual({
      chave: '12345678000195',
      nome: 'Auto Center Ltda',
      cidade: 'Guapimirim'
    });
    expect(recebedorDaOficina({ chavePix: '+5521987654321', nome: 'Auto Center', cidade: '' })).toEqual({ chave: '+5521987654321', nome: 'Auto Center', cidade: 'Brasil' });
  });

  it('a chave como a pessoa lê', () => {
    expect(chavePixParaMostrar('12345678000195')).toBe('CNPJ 12.345.678/0001-95');
    expect(chavePixParaMostrar('+5521987654321')).toBe('Celular (21) 98765-4321');
    expect(chavePixParaMostrar('')).toBe('');
  });
});

describe('o link de pagamento', () => {
  const recebedor = { chave: '12345678000195', nome: 'Auto Center Ltda', cidade: 'Guapimirim' };

  it('os dados levam o Pix do valor e a validade', () => {
    const d = dadosDoPagamento({
      recebedor,
      valor: 230.456,
      descricao: 'OS nº 12 · Gol, placa ABC1D23',
      titulo: 'OS nº 12',
      cliente: 'Ana Maria Souza',
      oficina: 'Auto Center',
      hoje: '2026-10-17',
      txid: 'OS12ABCDEFGH',
      documentoId: 'os-1'
    });
    expect(d).toMatchObject({ valor: 230.46, cliente: 'Ana', oficina: 'Auto Center', recebedor: 'Auto Center Ltda', chave: 'CNPJ 12.345.678/0001-95', validade: '2026-11-01', documentoId: 'os-1', pago: false });
    expect(d.pix).toContain('0114' + '12345678000195');
    expect(d.pix).toContain('5406230.46');
    expect(d.pix).toContain('0512OS12ABCDEFGH');
    expect(d.pix.slice(-4)).toBe(crc16(d.pix.slice(0, -4)));
    // a página lê de volta o que a oficina gravou
    expect(lerDadosDoPagamento(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(lerDadosDoPagamento({ valor: -1, pix: d.pix })).toBeNull();
    expect(lerDadosDoPagamento({ valor: 10 })).toBeNull();
  });

  it('o txid tem o prefixo e até 25 letras e números; cada cobrança tem a sua referência', () => {
    const t = novoTxid('OS 12/ç', () => 0.5);
    expect(t).toMatch(/^OS12[A-Z0-9]{8}$/);
    expect(novoTxid('X'.repeat(40)).length).toBe(25);
    expect(refDaCobranca('os-1', 1_700_000_000_000)).toBe(`pix-os-1-${(1_700_000_000_000).toString(36)}`);
    expect(refDaCobranca('x'.repeat(120)).length).toBeLessThanOrEqual(100);
  });

  it('a mensagem do WhatsApp tem o link e o código numa linha só', () => {
    const texto = mensagemDeCobranca({ oficina: 'Auto Center', cliente: 'Ana Souza', valor: 230.46, descricao: 'OS nº 12', link: 'https://revisai.app/l/abc', pix: '000201XYZ' });
    expect(texto).toContain('Oi, Ana! Aqui é da Auto Center.');
    expect(texto).toContain('230,46');
    expect(texto).toContain('https://revisai.app/l/abc');
    expect(texto.split('\n').at(-1)).toBe('000201XYZ');
    const semLink = mensagemDeCobranca({ oficina: '', cliente: '', valor: 10, descricao: '', link: null, pix: '000201XYZ' });
    expect(semLink).not.toContain('Já paguei');
    expect(semLink.startsWith('Oi! Aqui é da oficina.')).toBe(true);
  });

  it('a descrição da ordem', () => {
    expect(descricaoDaOrdem({ numero: 7 }, { modelo: 'Gol', placa: 'abc1234' })).toBe('OS nº 7 · Gol, placa ABC-1234');
    expect(descricaoDaOrdem({ numero: 7 }, null)).toBe('OS nº 7');
  });
});

describe('o aviso do cliente e a confirmação', () => {
  const base = { id: 'link-1', tipo: 'pagamento', ref: 'pix-1', codigo: 'ABC234', dados: { valor: 10 }, criado_em: '2026-10-17T10:00:00Z', expira_em: '2026-11-01T10:00:00Z' };

  it('só o "Já paguei" ainda não tratado é aviso pendente', () => {
    const resposta = { acao: 'paguei', quando: '2026-10-17T12:00:00Z', nome: ' Ana ', ip: '1.2.3.4' };
    const l = lerLinkDeCobranca({ ...base, resposta, respondido_em: '2026-10-17T12:00:00Z', processado_em: null });
    expect(l).not.toBeNull();
    expect(avisoPendente(l!)).toEqual({ quando: '2026-10-17T12:00:00Z', nome: 'Ana', competencia: null });
    expect(avisoPendente({ ...l!, processadoEm: '2026-10-17T13:00:00Z' })).toBeNull();
    expect(lerRespostaPaguei({ acao: 'aprovar' })).toBeNull();
    expect(lerRespostaPaguei({ acao: 'paguei', competencia: '2026-10' })?.competencia).toBe('2026-10');
    expect(lerLinkDeCobranca({ ...base, tipo: 'orcamento' })).toBeNull();
  });

  it('o recebimento por Pix sai do financeiro, pago hoje, com o id fixo', () => {
    expect(recebimentoPorPix({ id: 'clube-k1', valor: 89.9, hoje: '2026-10-17', descricao: 'Clube Ouro', categoria: 'clube', clienteId: 'c1' })).toEqual({
      id: 'clube-k1',
      tipo: 'receber',
      descricao: 'Clube Ouro',
      valor: 89.9,
      vencimento: '2026-10-17',
      pagoEm: '2026-10-17',
      forma: 'pix',
      categoria: 'clube',
      parcela: null,
      clienteId: 'c1',
      documentoId: null
    });
  });

  it('o Pix da ordem quita a conta em aberto do mesmo valor, ou entra como recebimento novo, uma vez só', () => {
    const ctx = { linkId: 'link-1', valor: 50, hoje: '2026-10-18', descricao: 'Pix da OS nº 12', clienteId: 'c1', documentoId: 'os-1' };
    const fiado = lancamento({ id: 'f1', valor: 50, documentoId: 'os-1', pagoEm: null, forma: 'fiado', vencimento: '2026-11-01' });
    const r1 = lancamentoDoPixDaOrdem(ctx, [fiado, lancamento({ id: 'f2', valor: 50, documentoId: 'outra', pagoEm: null })]);
    expect(r1.novo).toBeNull();
    expect(r1.quitar).toMatchObject({ id: 'f1', pagoEm: '2026-10-18', forma: 'pix' });
    const r2 = lancamentoDoPixDaOrdem({ ...ctx, valor: 80 }, [fiado]);
    expect(r2.quitar).toBeNull();
    expect(r2.novo).toMatchObject({ id: idDoLancamentoDoLink('link-1'), valor: 80, pagoEm: '2026-10-18', forma: 'pix', categoria: 'servico', documentoId: 'os-1', clienteId: 'c1' });
    // já lançado (outro aparelho confirmou): nada de novo
    expect(lancamentoDoPixDaOrdem({ ...ctx, valor: 80 }, [lancamento({ id: 'pix-link-1', valor: 80, documentoId: 'os-1' })])).toEqual({ quitar: null, novo: null });
  });
});

describe('CPF e CNPJ', () => {
  it('confere os dígitos, inclusive do CNPJ com letras', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('12.345.678/0001-95')).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(cnpjValido('12.ABC.345/01DE-36')).toBe(false);
    expect(lerCpfCnpj('529.982.247-25')).toEqual({ tipo: 'cpf', numero: '52998224725' });
    expect(lerCpfCnpj('12ABC34501DE35')).toEqual({ tipo: 'cnpj', numero: '12ABC34501DE35' });
    expect(lerCpfCnpj('123')).toBeNull();
    expect(formatarCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(formatarCpfCnpj('12345678000195')).toBe('12.345.678/0001-95');
  });
});
