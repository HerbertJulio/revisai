import { describe, expect, it } from 'vitest';
import {
  aparelhoDoAgente,
  aprovacaoDoLink,
  codigoDeConferencia,
  conteudoDaAprovacao,
  conteudoDoOrcamento,
  jsonCanonico,
  sha256,
  versaoDoConteudo
} from '@/lib/aprovacao';
import { dadosDoOrcamento, lerResposta } from '@/lib/links-publicos';
import type { Cliente, Documento, Veiculo } from '@/lib/tipos';

const cliente: Cliente = { id: 'c1', nome: 'Ana Souza', telefone: '21990001007', criadoEm: '2026-10-01T10:00:00Z' };
const veiculo: Veiculo = { id: 'v1', clienteId: 'c1', placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol', ano: 2018, criadoEm: '2026-10-01T10:00:00Z' };

function orcamento(extra: Partial<Documento> = {}): Documento {
  return {
    id: 'o1',
    numero: 12,
    tipo: 'orcamento',
    situacao: 'enviado',
    veiculoId: 'v1',
    km: 84500,
    data: '2026-10-15',
    enviadoEm: '2026-10-15T13:00:00.000Z',
    validadeDias: 10,
    desconto: 20,
    linhas: [
      { id: 'a', tipo: 'peca', servico: 'troca_oleo', descricao: 'Óleo 5W30', quantidade: 4, unidade: 'L', valorUnitario: 45.9 },
      { id: 'b', tipo: 'servico', servico: 'troca_oleo', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: 60 },
      { id: 'c', tipo: 'peca', servico: 'palhetas', descricao: 'Palhetas', quantidade: 1, unidade: 'un', valorUnitario: 90 }
    ],
    criadoEm: '2026-10-15T12:00:00.000Z',
    atualizadoEm: '2026-10-15T13:00:00.000Z',
    ...extra
  };
}

describe('texto canônico e resumo', () => {
  it('ordena as chaves, tira o que é undefined e mantém a ordem das listas', () => {
    expect(jsonCanonico({ b: 1, a: [3, 1, { z: null, y: undefined, x: 'é' }] })).toBe('{"a":[3,1,{"x":"é","z":null}],"b":1}');
    expect(jsonCanonico({ a: Number.NaN })).toBe('{"a":null}');
  });

  it('SHA-256 de um texto conhecido', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('o código de conferência são os 16 primeiros caracteres, em grupos de 4', () => {
    expect(codigoDeConferencia('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBe('BA78 16BF 8F01 CFEA');
    expect(codigoDeConferencia(null)).toBe('');
  });
});

describe('o que o cliente aprovou', () => {
  it('itens aprovados, recusados, desconto e total', () => {
    const c = conteudoDaAprovacao(dadosDoOrcamento(orcamento(), cliente, veiculo), ['c']);
    expect(c.itens.map((i) => i.descricao)).toEqual(['Óleo 5W30', 'Mão de obra']);
    expect(c.recusados).toEqual(['Palhetas']);
    // 4 x 45,90 + 60 - 20 de desconto
    expect(c.total).toBe(223.6);
    expect(c.desconto).toBe(20);
    expect(c.validade).toBe('2026-10-25');
    expect(c.orcamento).toBe(12);
  });

  it('a página do cliente (dados do link) e o app (orçamento guardado) chegam ao mesmo resumo', async () => {
    const doc = orcamento();
    const doLink = await versaoDoConteudo(conteudoDaAprovacao(dadosDoOrcamento(doc, cliente, veiculo), ['c']));
    const doApp = await versaoDoConteudo(conteudoDoOrcamento(doc, ['c']));
    expect(doLink).toMatch(/^[0-9a-f]{64}$/);
    expect(doApp).toBe(doLink);
    // depois de aprovado, as linhas marcadas como recusadas dão o mesmo resumo
    const aprovado = { ...doc, linhas: doc.linhas.map((l) => ({ ...l, recusada: l.id === 'c' })) };
    expect(await versaoDoConteudo(conteudoDoOrcamento(aprovado))).toBe(doLink);
  });

  it('mudar preço, quantidade, desconto ou validade muda o resumo; o nome do cliente não', async () => {
    const base = await versaoDoConteudo(conteudoDoOrcamento(orcamento(), []));
    const preco = orcamento();
    preco.linhas[0].valorUnitario = 46.9;
    expect(await versaoDoConteudo(conteudoDoOrcamento(preco, []))).not.toBe(base);
    expect(await versaoDoConteudo(conteudoDoOrcamento(orcamento({ desconto: 10 }), []))).not.toBe(base);
    expect(await versaoDoConteudo(conteudoDoOrcamento(orcamento({ validadeDias: 15 }), []))).not.toBe(base);
    const outroNome = await versaoDoConteudo(conteudoDaAprovacao(dadosDoOrcamento(orcamento(), { ...cliente, nome: 'Beatriz' }, veiculo), []));
    expect(outroNome).toBe(base);
  });

  it('a aprovação pelo link usa o que o banco guardou (data, IP, aparelho) e o resumo que o cliente viu', () => {
    const r = lerResposta({ acao: 'aprovar', recusadas: ['c'], nome: ' Ana ', hashAprovado: 'f'.repeat(64), quando: '2026-10-16T12:00:00Z', ip: '200.1.2.3', agente: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36', versao: '2026-10-15T13:00:00Z' })!;
    expect(r.nome).toBe('Ana');
    expect(aprovacaoDoLink(r)).toEqual({ canal: 'link', quando: '2026-10-16T12:00:00Z', nome: 'Ana', ip: '200.1.2.3', agente: r.agente, versao: 'f'.repeat(64) });
    expect(lerResposta({ acao: 'outra', quando: 'x' })).toBeNull();
  });

  it('o aparelho em poucas palavras', () => {
    expect(aparelhoDoAgente('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari no iPhone');
    expect(aparelhoDoAgente('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome no Android');
    expect(aparelhoDoAgente('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36 Edg/130')).toBe('Edge no Windows');
    expect(aparelhoDoAgente(null)).toBe('');
  });
});
