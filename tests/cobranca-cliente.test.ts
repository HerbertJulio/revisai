import { describe, expect, it } from 'vitest';
import {
  avisoPendente,
  chavePixParaMostrar,
  chavePixUsavel,
  dadosDoPagamento,
  descricaoDaOrdem,
  idDoLancamentoDoLink,
  lancamentoRecebido,
  lerDadosDoPagamento,
  lerLinkDeCobranca,
  lerRespostaPaguei,
  lerValorDaCobranca,
  mensagemDeCobranca,
  novoTxid,
  podeCobrar,
  recebedorDaOficina,
  recebidoDoDocumento,
  tipoDaChavePix,
  urlDoPagamento,
  valorEmAberto
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

  it('o total menos o que já entrou da ordem', () => {
    const lancs = [
      lancamento({ id: 'a', valor: 100, documentoId: 'os-1' }),
      lancamento({ id: 'b', valor: 50, documentoId: 'os-1', pagoEm: null }),
      lancamento({ id: 'c', valor: 40, documentoId: 'outra' }),
      lancamento({ id: 'd', valor: 30, documentoId: 'os-1', tipo: 'pagar' })
    ];
    expect(recebidoDoDocumento(lancs, 'os-1')).toBe(100);
    expect(recebidoDoDocumento(Object.fromEntries(lancs.map((l) => [l.id, l])), 'os-1')).toBe(100);
    // 200 + 150 - 20 = 330; já entrou 100
    expect(valorEmAberto(doc, 100)).toBe(230);
    expect(valorEmAberto(doc, 500)).toBe(0);
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
  it('descobre o tipo da chave escrita de qualquer jeito', () => {
    expect(chavePixUsavel('12.345.678/0001-95')).toBe('12345678000195');
    expect(chavePixUsavel('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(chavePixUsavel('529.982.247-25')).toBe('52998224725');
    // 11 números que não são CPF: celular com DDD
    expect(chavePixUsavel('21987654321')).toBe('+5521987654321');
    expect(chavePixUsavel('(21) 3333-4444')).toBe('+552133334444');
    expect(chavePixUsavel('+55 21 98765-4321')).toBe('+5521987654321');
    expect(chavePixUsavel('Pix@Oficina.com')).toBe('pix@oficina.com');
    expect(chavePixUsavel('123E4567-E12B-12D1-A456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000');
    expect(chavePixUsavel('123')).toBeNull();
    expect(chavePixUsavel('')).toBeNull();
    // com o tipo escolhido, vale o tipo
    expect(chavePixUsavel('529.982.247-25', 'telefone')).toBe('+5552998224725');
    expect(chavePixUsavel('529.982.247-25', 'cnpj')).toBeNull();
  });

  it('o tipo da chave guardada e como ela aparece', () => {
    expect(tipoDaChavePix('+5521987654321')).toBe('telefone');
    expect(tipoDaChavePix('52998224725')).toBe('cpf');
    expect(tipoDaChavePix('12345678000195')).toBe('cnpj');
    expect(tipoDaChavePix('a@b.co')).toBe('email');
    expect(chavePixParaMostrar('12345678000195')).toBe('CNPJ 12.345.678/0001-95');
    expect(chavePixParaMostrar('+5521987654321')).toBe('Celular (21) 98765-4321');
  });

  it('o recebedor é a razão social (ou o nome) e a cidade da oficina', () => {
    expect(recebedorDaOficina({ chavePix: '', nome: 'Oficina', cidade: 'Rio' })).toBeNull();
    expect(recebedorDaOficina({ chavePix: '12.345.678/0001-95', nome: 'Auto Center', razaoSocial: 'Auto Center Ltda', cidade: 'Guapimirim' })).toEqual({
      chave: '12345678000195',
      nome: 'Auto Center Ltda',
      cidade: 'Guapimirim'
    });
    expect(recebedorDaOficina({ chavePix: 'pix@a.com', nome: 'Auto Center', cidade: '' })?.cidade).toBe('Brasil');
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

  it('o txid tem o prefixo e até 25 letras e números', () => {
    const t = novoTxid('OS 12/ç', () => 0.5);
    expect(t).toMatch(/^OS12[A-Z0-9]{8}$/);
    expect(novoTxid('X'.repeat(40)).length).toBe(25);
  });

  it('a mensagem do WhatsApp tem o link e o código numa linha só', () => {
    const texto = mensagemDeCobranca({ oficina: 'Auto Center', cliente: 'Ana Souza', valor: 230.46, descricao: 'OS nº 12', link: 'https://revisai.app/pagar/abc', pix: '000201XYZ' });
    expect(texto).toContain('Oi, Ana! Aqui é da Auto Center.');
    expect(texto).toContain('R$');
    expect(texto).toContain('230,46');
    expect(texto).toContain('https://revisai.app/pagar/abc');
    expect(texto.split('\n').at(-1)).toBe('000201XYZ');
    const semLink = mensagemDeCobranca({ oficina: '', cliente: '', valor: 10, descricao: '', link: null, pix: '000201XYZ' });
    expect(semLink).not.toContain('Já paguei');
    expect(semLink.startsWith('Oi! Aqui é da oficina.')).toBe(true);
  });

  it('a descrição da ordem e o endereço da página', () => {
    expect(descricaoDaOrdem({ numero: 7 }, { modelo: 'Gol', placa: 'abc1234' })).toBe('OS nº 7 · Gol, placa ABC-1234');
    expect(descricaoDaOrdem({ numero: 7 }, null)).toBe('OS nº 7');
    expect(urlDoPagamento('https://revisai.app/', 'tok')).toBe('https://revisai.app/pagar/tok');
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

  it('a conta recebida entra paga hoje, por Pix, com id fixo por link', () => {
    const l = lancamentoRecebido({ id: idDoLancamentoDoLink('link-1'), valor: 230.456, hoje: '2026-10-17', descricao: 'Pix da OS nº 12', categoria: 'servico', clienteId: 'c1', documentoId: 'os-1' });
    expect(l).toEqual({
      id: 'pix-link-1',
      tipo: 'receber',
      descricao: 'Pix da OS nº 12',
      valor: 230.46,
      vencimento: '2026-10-17',
      pagoEm: '2026-10-17',
      forma: 'pix',
      categoria: 'servico',
      clienteId: 'c1',
      documentoId: 'os-1'
    });
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
