import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { codificarCartao, decodificarCartao, historicoDoCartao, montarCartao } from '@/lib/cartao';
import { assinaturaValida, combustivelEmTexto, dadosDoChecklist, lerChecklistDoLink, localDaMarca, novaAvaria, pendenciasDoChecklist } from '@/lib/checklist';
import { dadosDoHistorico, historicoDesatualizado, lerHistoricoDoLink, servicosDoHistorico } from '@/lib/historico';
import { dadosDoOrcamento, esquemaLinkVisto, hojeNoBrasil, lerOrcamentoDoLink, publicarLink, tokenDaUrl, tokenValido, urlDoLink } from '@/lib/links-publicos';
import type { Checklist } from '@/lib/registros-oficina';
import type { Atendimento, Documento, Oficina, Veiculo } from '@/lib/tipos';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456';
const OFICINA = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const veiculo: Veiculo = { id: 'v1', clienteId: 'c1', placa: 'RBA5G44', marca: 'Volkswagen', modelo: 'Gol', motor: '1.6', ano: 2018, criadoEm: '2026-01-01T00:00:00Z' };

describe('endereços dos links', () => {
  it('o token tem 43 caracteres e o endereço é /l/<token>', () => {
    expect(TOKEN).toHaveLength(43);
    expect(tokenValido(TOKEN)).toBe(true);
    expect(tokenValido('curto')).toBe(false);
    expect(tokenValido(`${TOKEN.slice(0, 42)}!`)).toBe(false);
    const url = urlDoLink('https://revisai.howlks.com/', TOKEN);
    expect(url).toBe(`https://revisai.howlks.com/l/${TOKEN}`);
    expect(tokenDaUrl(url)).toBe(TOKEN);
    expect(tokenDaUrl(`${url}?x=1`)).toBe(TOKEN);
    expect(tokenDaUrl('https://outro.site/x')).toBeNull();
  });

  it('a data de hoje é a do Brasil, não a do servidor', () => {
    expect(hojeNoBrasil(new Date('2026-10-18T02:30:00Z'))).toBe('2026-10-17');
  });

  it('o que o banco devolve no ver_link passa na leitura, com o CNPJ da oficina', () => {
    const v = esquemaLinkVisto.parse({
      tipo: 'historico',
      dados: { v: 1 },
      codigo: 'X7K2QM',
      resposta: null,
      respondidoEm: null,
      atualizadoEm: '2026-10-17T10:00:00Z',
      expiraEm: '2029-10-17T10:00:00Z',
      oficina: { nome: 'Auto Center', whatsapp: '5521999990000', cidade: 'Rio', uf: 'RJ', endereco: null, linkAvaliacao: null, cnpj: '11222333000181' }
    });
    expect(v.oficina.cnpj).toBe('11222333000181');
    expect(esquemaLinkVisto.safeParse({ tipo: 'outro' }).success).toBe(false);
  });
});

describe('o orçamento no link do servidor', () => {
  const doc: Documento = {
    id: 'o1',
    numero: 3,
    tipo: 'orcamento',
    situacao: 'enviado',
    veiculoId: 'v1',
    km: 84500,
    data: '2026-10-15',
    enviadoEm: '2026-10-15T13:00:00.000Z',
    validadeDias: 10,
    desconto: 0,
    modalidade: 'pago',
    vistoria: { valor: 80, abater: true },
    diagnostico: 'Pastilha no fim.',
    recomendacoes: [{ texto: 'Pneu traseiro gasto', urgencia: 'proxima_revisao' }],
    linhas: [
      { id: 'a', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140 },
      { id: 'b', tipo: 'servico', descricao: '   ', quantidade: 1, unidade: 'un', valorUnitario: 10 }
    ],
    criadoEm: '2026-10-15T12:00:00.000Z',
    atualizadoEm: '2026-10-15T13:00:00.000Z'
  };

  it('leva as linhas com o id e o grupo, sem os dados da oficina (o banco põe os dela)', () => {
    const d = dadosDoOrcamento(doc, { id: 'c1', nome: 'Ana Souza', telefone: '', criadoEm: '' }, veiculo);
    expect(d.linhas).toEqual([{ id: 'a', tipo: 'peca', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140, grupo: 'Pastilhas de freio' }]);
    expect(d).toMatchObject({ numero: 3, validade: '2026-10-25', modalidade: 'pago', vistoria: { valor: 80, abater: true }, cliente: 'Ana', carro: { nome: 'Volkswagen Gol', placa: 'RBA5G44', ano: 2018, km: 84500 }, desconto: null });
    expect('oficina' in d).toBe(false);
    // o que vai para o banco volta igual na leitura da página
    expect(lerOrcamentoDoLink(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(lerOrcamentoDoLink({ ...d, linhas: [] })).toBeNull();
  });
});

describe('publicar pelo navegador', () => {
  function bancoFalso(respostas: { token: string | null; codigo: string }[]) {
    const rpc = vi.fn(async () => ({ data: respostas.shift() ?? null, error: null }));
    return { sb: { rpc } as unknown as SupabaseClient, rpc };
  }
  const pedido = { oficinaId: OFICINA, tipo: 'orcamento' as const, ref: 'o1', dados: { v: 1 } };

  it('na criação o token volta e vira o endereço guardado', async () => {
    const { sb, rpc } = bancoFalso([{ token: TOKEN, codigo: 'ABC234' }]);
    const r = await publicarLink(sb, 'https://revisai.howlks.com', pedido);
    expect(r).toMatchObject({ ok: true, criado: true, link: { codigo: 'ABC234', url: `https://revisai.howlks.com/l/${TOKEN}` } });
    expect(rpc).toHaveBeenCalledWith('publicar_link', { p_oficina: OFICINA, p_tipo: 'orcamento', p_ref: 'o1', p_dados: { v: 1 }, p_dias: 30, p_placa: null, p_novo: false });
  });

  it('republicando, o endereço guardado continua; sem ele, gera um novo', async () => {
    const um = bancoFalso([{ token: null, codigo: 'ABC234' }]);
    const r1 = await publicarLink(um.sb, 'https://x', pedido, { codigo: 'ABC234', url: `https://x/l/${TOKEN}` });
    expect(r1).toMatchObject({ ok: true, criado: false, link: { url: `https://x/l/${TOKEN}` } });
    expect(um.rpc).toHaveBeenCalledTimes(1);

    const outro = 'Z'.repeat(43);
    const dois = bancoFalso([
      { token: null, codigo: 'ABC234' },
      { token: outro, codigo: 'QWE789' }
    ]);
    const r2 = await publicarLink(dois.sb, 'https://x', pedido, null);
    expect(r2).toMatchObject({ ok: true, criado: true, link: { codigo: 'QWE789', url: `https://x/l/${outro}` } });
    expect((dois.rpc.mock.calls[1] as unknown[])[1]).toMatchObject({ p_novo: true });
  });

  it('erro do banco vira mensagem', async () => {
    const sb = { rpc: vi.fn(async () => ({ data: null, error: { code: 'P0001', message: 'Muitos links seguidos' } })) } as unknown as SupabaseClient;
    expect(await publicarLink(sb, 'https://x', pedido)).toEqual({ ok: false, erro: 'Muitos links seguidos.' });
  });
});

describe('o checklist no link', () => {
  const checklist: Checklist = {
    id: 'k1',
    documentoId: 'os1',
    veiculoId: 'v1',
    km: 90000,
    combustivel: 3,
    itens: { estepe: 'ok', macaco: 'falta', som: 'avaria' },
    avarias: [{ ...novaAvaria('a1', 0.1, 0.45), tipo: 'amassado', observacao: 'porta', fotoIds: ['f1'] }],
    fotos: [
      { id: 'f1', caminho: `${OFICINA}/checklist/0123456789abcdef.jpg` },
      { id: 'f2', caminho: `${OFICINA}/checklist/fedcba9876543210.jpg` },
      { id: 'f3', dataUrl: 'data:image/jpeg;base64,AAAA' }
    ],
    observacao: 'Riscos antigos',
    assinatura: { nome: 'Ana', imagem: 'data:image/png;base64,iVBORw0KGgo=', quando: '2026-10-17T10:00:00Z' },
    criadoEm: '2026-10-17T09:00:00Z',
    atualizadoEm: '2026-10-17T10:00:00Z'
  };

  it('separa as fotos das avarias, deixa de fora as do aparelho e leva a assinatura', () => {
    const d = dadosDoChecklist(checklist, { veiculo, numero: 7 });
    expect(d.itens).toEqual([
      { nome: 'Estepe', estado: 'ok' },
      { nome: 'Macaco', estado: 'falta' },
      { nome: 'Som ou multimídia', estado: 'avaria' }
    ]);
    expect(d.avarias[0]).toMatchObject({ local: 'lateral esquerda, dianteira', tipo: 'amassado', fotos: [`${OFICINA}/checklist/0123456789abcdef.jpg`] });
    expect(d.fotos).toEqual([`${OFICINA}/checklist/fedcba9876543210.jpg`]);
    expect(d.assinatura?.nome).toBe('Ana');
    expect(lerChecklistDoLink(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(pendenciasDoChecklist(checklist)).toEqual({ faltam: ['Macaco'], comAvaria: ['Som ou multimídia'], avarias: 1 });
  });

  it('a parte do carro pela marca no desenho, o combustível em oitavos e a assinatura aceita', () => {
    expect(localDaMarca(0.5, 0.05)).toBe('frente');
    expect(localDaMarca(0.5, 0.95)).toBe('traseira');
    expect(localDaMarca(0.9, 0.7)).toBe('lateral direita, traseira');
    expect(localDaMarca(0.5, 0.5)).toBe('teto');
    expect(combustivelEmTexto(0)).toBe('Reserva');
    expect(combustivelEmTexto(4)).toBe('1/2 do tanque');
    expect(combustivelEmTexto(8)).toBe('Cheio');
    expect(combustivelEmTexto(null)).toBe('Não anotado');
    expect(assinaturaValida('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(assinaturaValida('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(assinaturaValida(`data:image/png;base64,${'A'.repeat(100_000)}`)).toBe(false);
  });
});

describe('o histórico verificado', () => {
  const atendimentos: Record<string, Atendimento> = {
    a1: { id: 'a1', veiculoId: 'v1', data: '2026-03-10', km: 70000, itens: [{ servico: 'troca_oleo', produto: { nome: 'Lubrax 5W30' }, intervaloKm: 10000, intervaloMeses: 12 }], valor: 300, criadoEm: '2026-03-10T10:00:00Z' },
    a2: { id: 'a2', veiculoId: 'v1', data: '2026-10-17', km: 90000, itens: [{ servico: 'pastilhas', intervaloKm: 30000, intervaloMeses: 24 }], valor: 220, criadoEm: '2026-10-17T18:00:00Z' },
    a3: { id: 'a3', veiculoId: 'outro', data: '2026-10-01', km: 1000, itens: [], criadoEm: '2026-10-01T10:00:00Z' }
  };
  const documentos: Record<string, Documento> = {
    os1: {
      id: 'os1',
      numero: 9,
      tipo: 'ordem',
      situacao: 'concluida',
      veiculoId: 'v1',
      km: 90000,
      data: '2026-10-17',
      desconto: null,
      atendimentoId: 'a2',
      linhas: [
        { id: 'x', tipo: 'peca', servico: 'pastilhas', descricao: 'Pastilha dianteira', quantidade: 1, unidade: 'un', valorUnitario: 140, estoqueId: 'e1' },
        { id: 'y', tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: 80 }
      ],
      criadoEm: '',
      atualizadoEm: ''
    }
  };

  it('do mais novo para o mais antigo, com as peças e as marcas, sem valores', () => {
    const s = servicosDoHistorico('v1', { atendimentos, documentos, estoque: { e1: { id: 'e1', nome: 'Pastilha', marca: 'Cobreq', categoria: 'pastilha_freio', unidade: 'un', quantidade: 1, minimo: 0, custo: null, preco: null, criadoEm: '', atualizadoEm: '' } } });
    expect(s).toEqual([
      { data: '2026-10-17', km: 90000, os: 9, itens: [{ servico: 'Pastilhas de freio', produto: null }], pecas: [{ descricao: 'Pastilha dianteira', marca: 'Cobreq' }] },
      { data: '2026-03-10', km: 70000, os: null, itens: [{ servico: 'Troca de óleo', produto: 'Lubrax 5W30' }], pecas: [] }
    ]);
    const d = dadosDoHistorico(veiculo, s, '2026-10-17');
    expect(JSON.stringify(d)).not.toContain('300');
    expect(d.carro).toEqual({ nome: 'Volkswagen Gol', placa: 'RBA5G44', ano: 2018, motor: '1.6' });
    expect(lerHistoricoDoLink(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('a peça que já é o produto do serviço não se repete, a não ser com a marca', () => {
    const comProduto = { ...atendimentos, a2: { ...atendimentos.a2, itens: [{ servico: 'pastilhas' as const, produto: { nome: 'Pastilha dianteira' }, intervaloKm: 30000, intervaloMeses: 24 }] } };
    expect(servicosDoHistorico('v1', { atendimentos: comProduto, documentos })[0].pecas).toEqual([]);
    expect(servicosDoHistorico('v1', { atendimentos: comProduto, documentos, estoque: { e1: { id: 'e1', nome: 'P', marca: 'Cobreq', categoria: 'pastilha_freio', unidade: 'un', quantidade: 1, minimo: 0, custo: null, preco: null, criadoEm: '', atualizadoEm: '' } } })[0].pecas).toEqual([
      { descricao: 'Pastilha dianteira', marca: 'Cobreq' }
    ]);
  });

  it('precisa publicar de novo quando não tem link ou tem serviço mais novo que ele', () => {
    expect(historicoDesatualizado(veiculo, atendimentos)).toBe(true);
    const publicado = { ...veiculo, links: { historico: { codigo: 'ABC234', url: `https://x/l/${TOKEN}`, publicadoEm: '2026-10-17T19:00:00Z' } } };
    expect(historicoDesatualizado(publicado, atendimentos)).toBe(false);
    expect(historicoDesatualizado({ ...publicado, links: { historico: { ...publicado.links.historico, publicadoEm: '2026-10-17T17:00:00Z' } } }, atendimentos)).toBe(true);
  });
});

describe('o cartão de manutenção com o histórico', () => {
  const oficina: Oficina = { nome: 'Auto Center', whatsapp: '21999990000', cidade: 'Rio', uf: 'RJ', endereco: '' };

  it('com o link do histórico guardado no carro, o cartão leva o token; sem ele, continua igual', () => {
    const comLink = { ...veiculo, links: { historico: { codigo: 'ABC234', url: `https://revisai.howlks.com/l/${TOKEN}` } } };
    const c = montarCartao(oficina, undefined, comLink, [], '2026-10-17');
    expect(c.h).toBe(TOKEN);
    const lido = decodificarCartao(codificarCartao(c))!;
    expect(historicoDoCartao('https://revisai.howlks.com', lido)).toBe(`https://revisai.howlks.com/l/${TOKEN}`);
    const sem = montarCartao(oficina, undefined, veiculo, [], '2026-10-17');
    expect('h' in sem).toBe(false);
    expect(historicoDoCartao('https://x', decodificarCartao(codificarCartao(sem))!)).toBeNull();
  });
});
