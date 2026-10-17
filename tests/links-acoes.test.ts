import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conteudoDaAprovacao, versaoDoConteudo } from '@/lib/aprovacao';
import type { DadosOrcamentoLink } from '@/lib/links-publicos';

// a resposta do cliente pelo link, sem banco: o servidor confere o que foi aprovado contra o publicado

vi.mock('server-only', () => ({}));

const estado = vi.hoisted(() => ({ link: null as unknown, respostas: [] as unknown[], permitido: true }));

vi.mock('@/lib/links-servidor', () => ({
  verLink: vi.fn(async () => estado.link),
  responderLink: vi.fn(async (_token: string, resposta: unknown) => {
    estado.respostas.push(resposta);
    return { ok: true, quando: '2026-10-17T12:00:00Z' };
  }),
  consultarGarantia: vi.fn(async () => null)
}));
vi.mock('@/lib/supabase-servidor', () => ({ ipDoPedido: async () => '200.1.2.3', agenteDoPedido: async () => 'Celular de teste' }));
vi.mock('@/lib/limite', () => ({ permitido: async () => estado.permitido }));

const { responderOrcamento, assinarChecklist, consultarGarantiaPublica } = await import('@/lib/links-acoes');
const { responderLink } = await import('@/lib/links-servidor');

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456';
const dados: DadosOrcamentoLink = {
  v: 1,
  numero: 5,
  data: '2026-10-16',
  validade: '2099-12-31',
  modalidade: 'frio',
  cliente: 'Ana',
  carro: { nome: 'VW Gol', placa: 'RBA5G44' },
  linhas: [
    { id: 'a', tipo: 'peca', descricao: 'Pastilha', quantidade: 1, unidade: 'un', valorUnitario: 140 },
    { id: 'b', tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: 80 },
    { id: 'c', tipo: 'peca', descricao: 'Palhetas', quantidade: 1, unidade: 'un', valorUnitario: 90 }
  ],
  desconto: null
};

function linkDoOrcamento(extra: object = {}) {
  return { tipo: 'orcamento', dados, codigo: 'ABC234', resposta: null, respondidoEm: null, atualizadoEm: '2026-10-16T10:00:00Z', expiraEm: '2099-01-01T00:00:00Z', oficina: { nome: 'Oficina' }, ...extra };
}

beforeEach(() => {
  estado.link = linkDoOrcamento();
  estado.respostas = [];
  estado.permitido = true;
  vi.mocked(responderLink).mockClear();
});

describe('aprovar pelo link', () => {
  it('aprova só alguns itens: guarda as recusadas, o nome, o resumo e o total, com IP e aparelho', async () => {
    const versao = await versaoDoConteudo(conteudoDaAprovacao(dados, ['c']));
    expect(await responderOrcamento(TOKEN, { acao: 'aprovar', recusadas: ['c', 'c', 'nao-existe'], nome: ' Ana Souza ', versao })).toEqual({ ok: true });
    expect(estado.respostas).toEqual([{ acao: 'aprovar', recusadas: ['c'], nome: 'Ana Souza', hashAprovado: versao, total: 220 }]);
    expect(vi.mocked(responderLink).mock.calls[0].slice(2)).toEqual(['200.1.2.3', 'Celular de teste']);
  });

  it('se a oficina mudou o orçamento enquanto o cliente via, o resumo não bate e nada é guardado', async () => {
    const versao = await versaoDoConteudo(conteudoDaAprovacao({ ...dados, linhas: dados.linhas.map((l) => (l.id === 'a' ? { ...l, valorUnitario: 120 } : l)) }, []));
    expect(await responderOrcamento(TOKEN, { acao: 'aprovar', recusadas: [], nome: 'Ana', versao })).toMatchObject({ ok: false, mudou: true });
    expect(estado.respostas).toEqual([]);
  });

  it('recusar tudo vale sem nome; aprovar pede o nome e pelo menos um item', async () => {
    const tudo = await versaoDoConteudo(conteudoDaAprovacao(dados, ['a', 'b', 'c']));
    expect(await responderOrcamento(TOKEN, { acao: 'aprovar', recusadas: [], nome: 'A', versao: tudo })).toEqual({ ok: false, erro: 'Escreva o seu nome para aprovar.' });
    expect(await responderOrcamento(TOKEN, { acao: 'aprovar', recusadas: ['a', 'b', 'c'], nome: 'Ana', versao: tudo })).toMatchObject({ ok: false });
    expect(await responderOrcamento(TOKEN, { acao: 'recusar', recusadas: [], nome: '', versao: tudo })).toEqual({ ok: true });
    expect(estado.respostas).toEqual([{ acao: 'recusar', recusadas: ['a', 'b', 'c'], nome: '', hashAprovado: tudo, total: 0 }]);
  });

  it('link vencido, já respondido, de outro tipo ou com muitas tentativas não guarda nada', async () => {
    const versao = await versaoDoConteudo(conteudoDaAprovacao(dados, []));
    const entrada = { acao: 'aprovar', recusadas: [], nome: 'Ana', versao };
    estado.link = linkDoOrcamento({ dados: { ...dados, validade: '2020-01-01' } });
    expect(await responderOrcamento(TOKEN, entrada)).toMatchObject({ ok: false, erro: expect.stringContaining('venceu') });
    estado.link = linkDoOrcamento({ resposta: { acao: 'aprovar' } });
    expect(await responderOrcamento(TOKEN, entrada)).toMatchObject({ ok: false, erro: 'Este orçamento já foi respondido.' });
    estado.link = linkDoOrcamento({ tipo: 'garantia' });
    expect((await responderOrcamento(TOKEN, entrada)).ok).toBe(false);
    estado.link = linkDoOrcamento();
    estado.permitido = false;
    expect((await responderOrcamento(TOKEN, entrada)).ok).toBe(false);
    expect(await responderOrcamento('curto', entrada)).toEqual({ ok: false, erro: 'Link inválido.' });
    expect(estado.respostas).toEqual([]);
  });
});

describe('assinar o checklist pelo link', () => {
  it('aceita só a assinatura em PNG pequeno e o nome', async () => {
    estado.link = { ...linkDoOrcamento(), tipo: 'checklist', dados: {} };
    expect(await assinarChecklist(TOKEN, { nome: 'Ana', imagem: 'data:image/svg+xml;base64,PHN2Zz4=' })).toMatchObject({ ok: false });
    expect(await assinarChecklist(TOKEN, { nome: 'A', imagem: 'data:image/png;base64,iVBORw0KGgo=' })).toMatchObject({ ok: false });
    expect(await assinarChecklist(TOKEN, { nome: 'Ana Souza', imagem: 'data:image/png;base64,iVBORw0KGgo=' })).toEqual({ ok: true });
    expect(estado.respostas).toEqual([{ acao: 'assinar', nome: 'Ana Souza', imagem: 'data:image/png;base64,iVBORw0KGgo=' }]);
  });
});

describe('consultar a garantia', () => {
  it('confere a placa e o código antes de ir ao banco', async () => {
    expect(await consultarGarantiaPublica('abc', 'X7K2QM')).toEqual({ ok: false, erro: 'Confira a placa.' });
    expect(await consultarGarantiaPublica('RBA-5G44', 'X7K')).toMatchObject({ ok: false });
    expect(await consultarGarantiaPublica('RBA-5G44', 'x7k2qm')).toEqual({ ok: false, erro: 'Não achamos uma garantia com esta placa e este código.' });
  });
});
