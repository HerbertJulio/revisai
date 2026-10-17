import { describe, expect, it } from 'vitest';
import {
  anoDoClube,
  beneficiosDoMembro,
  competenciaDe,
  dadosDoCartao,
  descontoDoClube,
  idDaMensalidade,
  lerDadosDoCartao,
  membroDoCarro,
  mensagemDaMensalidade,
  mensagemDeLembrete,
  mensalidadeEmAberto,
  mensalidadePaga,
  mensalidadesAtrasadas,
  mensalidadesParaGerar,
  nomeDaCompetencia,
  pagoAte,
  servicosIncluidosNaOrdem,
  somarCompetencia,
  txidDaMensalidade,
  urlDoCartao,
  usosDaOrdem,
  vencimentoDaMensalidade
} from '@/lib/clube';
import type { ClubeCobranca, ClubeMembro, ClubePlano } from '@/lib/registros-oficina';
import type { Documento, LinhaDocumento } from '@/lib/tipos';

const PLANO: ClubePlano = {
  id: 'p1',
  nome: 'Ouro',
  preco: 89.9,
  descricao: 'Duas trocas de óleo por ano',
  beneficios: [
    { servico: 'troca_oleo', quantidadePorAno: 2 },
    { servico: 'alinhamento', quantidadePorAno: 1 }
  ],
  descontoPecas: 10,
  descontoServicos: 5,
  ativo: true,
  criadoEm: '',
  atualizadoEm: ''
};

function membro(p: Partial<ClubeMembro> = {}): ClubeMembro {
  return { id: 'm1', planoId: 'p1', clienteId: 'c1', veiculoId: 'v1', inicio: '2026-03-20', diaVencimento: 10, situacao: 'ativo', usos: [], criadoEm: '', atualizadoEm: '', ...p };
}

function cobranca(p: Partial<ClubeCobranca> = {}): ClubeCobranca {
  return { id: 'k', membroId: 'm1', competencia: '2026-10', valor: 89.9, vencimento: '2026-10-10', pagoEm: null, criadoEm: '', atualizadoEm: '', ...p };
}

function linha(p: Partial<LinhaDocumento>): LinhaDocumento {
  return { id: Math.random().toString(36).slice(2), tipo: 'servico', descricao: 'x', quantidade: 1, unidade: 'un', valorUnitario: 0, ...p };
}

function ordem(linhas: LinhaDocumento[], id = 'os-1'): Documento {
  return { id, numero: 3, tipo: 'ordem', situacao: 'aberta', veiculoId: 'v1', km: 1, data: '2026-10-17', linhas, desconto: null, criadoEm: '', atualizadoEm: '' };
}

describe('meses e vencimentos', () => {
  it('conta os meses e mostra o nome', () => {
    expect(competenciaDe('2026-10-17')).toBe('2026-10');
    expect(somarCompetencia('2026-12', 1)).toBe('2027-01');
    expect(somarCompetencia('2026-01', -1)).toBe('2025-12');
    expect(nomeDaCompetencia('2026-03')).toBe('março de 2026');
  });

  it('o vencimento é o dia escolhido; no mês de entrada, nunca antes de entrar', () => {
    expect(vencimentoDaMensalidade(membro(), '2026-10')).toBe('2026-10-10');
    expect(vencimentoDaMensalidade(membro(), '2026-03')).toBe('2026-03-20');
    expect(vencimentoDaMensalidade(membro({ diaVencimento: 31 }), '2027-02')).toBe('2027-02-28');
    expect(vencimentoDaMensalidade(membro({ diaVencimento: 0 }), '2027-02')).toBe('2027-02-01');
  });
});

describe('mensalidades', () => {
  const planos = { p1: PLANO, p2: { ...PLANO, id: 'p2', preco: 0 } };

  it('gera uma por membro ativo que já tinha entrado, sem repetir o mês', () => {
    const membros = [
      membro(),
      membro({ id: 'm2', inicio: '2026-11-02' }),
      membro({ id: 'm3', situacao: 'pausado' }),
      membro({ id: 'm4', planoId: 'p2' }),
      membro({ id: 'm5', planoId: 'sumiu' }),
      membro({ id: 'm6', diaVencimento: 25 })
    ];
    const existentes = [cobranca({ membroId: 'm6', competencia: '2026-10' })];
    const novas = mensalidadesParaGerar(membros, planos, existentes, '2026-10');
    expect(novas).toEqual([{ id: idDaMensalidade('m1', '2026-10'), membroId: 'm1', competencia: '2026-10', valor: 89.9, vencimento: '2026-10-10', pagoEm: null, forma: null, lancamentoId: null }]);
    // em novembro entra quem começou em novembro
    expect(mensalidadesParaGerar(membros, planos, existentes, '2026-11').map((c) => c.membroId)).toEqual(['m1', 'm2', 'm6']);
    expect(mensalidadesParaGerar(membros, planos, existentes, '2026-11')[1].vencimento).toBe('2026-11-10');
  });

  it('atrasadas, em aberto, pagas e em dia até', () => {
    const lista = [
      cobranca({ id: 'a', competencia: '2026-08', vencimento: '2026-08-10', pagoEm: '2026-08-09' }),
      cobranca({ id: 'b', competencia: '2026-10', vencimento: '2026-10-10' }),
      cobranca({ id: 'c', competencia: '2026-09', vencimento: '2026-09-10' }),
      cobranca({ id: 'd', competencia: '2026-11', vencimento: '2026-11-10' })
    ];
    expect(mensalidadesAtrasadas(lista, '2026-10-17').map((c) => c.id)).toEqual(['c', 'b']);
    expect(mensalidadeEmAberto('m1', lista)?.id).toBe('c');
    expect(pagoAte(membro(), lista)).toBe('2026-09-10');
    expect(pagoAte(membro(), [])).toBeNull();
    const paga = mensalidadePaga(lista[1], '2026-10-17', 'clube-b');
    expect(paga).toMatchObject({ pagoEm: '2026-10-17', forma: 'pix', lancamentoId: 'clube-b' });
    expect(mensalidadePaga({ ...paga, pagoEm: '2026-10-12' }, '2026-10-17', 'x').pagoEm).toBe('2026-10-12');
  });
});

describe('benefícios', () => {
  it('o ano de clube conta da entrada', () => {
    expect(anoDoClube(membro(), '2026-10-17')).toEqual({ inicio: '2026-03-20', fim: '2027-03-20' });
    expect(anoDoClube(membro(), '2027-03-20')).toEqual({ inicio: '2027-03-20', fim: '2028-03-20' });
    expect(anoDoClube(membro(), '2029-01-01')).toEqual({ inicio: '2028-03-20', fim: '2029-03-20' });
  });

  it('conta os usos do ano e o que resta', () => {
    const m = membro({ usos: [
      { data: '2026-05-01', servico: 'troca_oleo', documentoId: 'os-a' },
      { data: '2025-12-01', servico: 'troca_oleo', documentoId: 'antes' },
      { data: '2026-06-01', servico: 'alinhamento', documentoId: 'os-b' }
    ] });
    expect(beneficiosDoMembro(m, PLANO, '2026-10-17')).toEqual([
      { servico: 'troca_oleo', nome: 'Troca de óleo', quantidadePorAno: 2, usados: 1, restantes: 1 },
      { servico: 'alinhamento', nome: 'Alinhamento e balanceamento', quantidadePorAno: 1, usados: 1, restantes: 0 }
    ]);
    // o uso desta mesma ordem não tira o benefício dela
    expect(beneficiosDoMembro(m, PLANO, '2026-10-17', 'os-b')[1].restantes).toBe(1);
  });

  it('acha o membro do carro ou do dono', () => {
    const lista = [membro({ id: 'x', veiculoId: 'v9', situacao: 'cancelado' }), membro({ id: 'y', veiculoId: null, clienteId: 'c7' }), membro({ id: 'z', veiculoId: 'v9' })];
    expect(membroDoCarro(lista, { id: 'v9', clienteId: 'c7' })?.id).toBe('z');
    expect(membroDoCarro(lista, { id: 'v8', clienteId: 'c7' })?.id).toBe('y');
    expect(membroDoCarro(lista, { id: 'v8', clienteId: 'c8' })).toBeNull();
    expect(membroDoCarro(lista, null)).toBeNull();
  });

  it('a ordem registra um uso por serviço incluído que ainda cabe, uma vez só', () => {
    const doc = ordem([
      linha({ servico: 'troca_oleo', tipo: 'servico', valorUnitario: 60 }),
      linha({ servico: 'troca_oleo', tipo: 'peca', valorUnitario: 180 }),
      linha({ servico: 'alinhamento', tipo: 'servico', valorUnitario: 80 }),
      linha({ servico: 'pastilhas', tipo: 'servico', valorUnitario: 100 })
    ]);
    const m = membro({ usos: [{ data: '2026-06-01', servico: 'alinhamento', documentoId: 'os-b' }] });
    expect(servicosIncluidosNaOrdem(doc, m, PLANO, '2026-10-17')).toEqual(['troca_oleo']);
    const usos = usosDaOrdem(doc, m, PLANO, '2026-10-17');
    expect(usos).toEqual([{ data: '2026-10-17', servico: 'troca_oleo', documentoId: 'os-1' }]);
    expect(usosDaOrdem(doc, { ...m, usos: [...m.usos, ...usos] }, PLANO, '2026-10-17')).toEqual([]);
  });

  it('o desconto: mão de obra incluída de graça, e o percentual do plano no resto', () => {
    const doc = ordem([
      linha({ servico: 'troca_oleo', tipo: 'servico', valorUnitario: 60 }),
      linha({ servico: 'troca_oleo', tipo: 'peca', valorUnitario: 180 }),
      linha({ servico: 'pastilhas', tipo: 'servico', valorUnitario: 100 }),
      linha({ tipo: 'peca', quantidade: 2, valorUnitario: 50 }),
      linha({ tipo: 'outro', valorUnitario: -30 }),
      linha({ tipo: 'peca', valorUnitario: 500, recusada: true })
    ]);
    // incluída 60; peças (180 + 100) * 10% = 28; mão de obra 100 * 5% = 5
    expect(descontoDoClube(doc, membro(), PLANO, '2026-10-17')).toEqual({ incluidos: 60, pecas: 28, servicos: 5, total: 93 });
    // sem troca de óleo sobrando no ano, a mão de obra dela leva só os 5%
    const usado = membro({ usos: [
      { data: '2026-04-01', servico: 'troca_oleo' },
      { data: '2026-05-01', servico: 'troca_oleo' }
    ] });
    expect(descontoDoClube(doc, usado, PLANO, '2026-10-17')).toEqual({ incluidos: 0, pecas: 28, servicos: 8, total: 36 });
  });
});

describe('cartão do membro', () => {
  const recebedor = { chave: '12345678000195', nome: 'Auto Center Ltda', cidade: 'Rio' };

  it('leva o plano, os benefícios, a validade e a mensalidade em aberto com o Pix', () => {
    const cobrancas = [cobranca({ id: 'a', competencia: '2026-09', vencimento: '2026-09-10', pagoEm: '2026-09-09' }), cobranca({ id: 'b' })];
    const d = dadosDoCartao({ membro: membro(), plano: PLANO, cliente: 'Ana Souza', oficina: 'Auto Center', veiculo: { modelo: 'Gol', placa: 'abc1d23' }, cobrancas, recebedor, hoje: '2026-10-17' });
    expect(d).toMatchObject({
      cliente: 'Ana',
      oficina: 'Auto Center',
      carro: { modelo: 'Gol', placa: 'ABC1D23' },
      plano: { nome: 'Ouro', preco: 89.9, descontoPecas: 10, descontoServicos: 5 },
      beneficios: [
        { nome: 'Troca de óleo', quantidadePorAno: 2, restantes: 2 },
        { nome: 'Alinhamento e balanceamento', quantidadePorAno: 1, restantes: 1 }
      ],
      desde: '2026-03-20',
      anoAte: '2027-03-20',
      situacao: 'ativo',
      pagoAte: '2026-10-10',
      aberta: { competencia: '2026-10', valor: 89.9, vencimento: '2026-10-10' }
    });
    expect(d.aberta?.pix).toContain('5405' + '89.90');
    expect(d.aberta?.pix).toContain(txidDaMensalidade({ membroId: 'm1', competencia: '2026-10' }));
    expect(lerDadosDoCartao(JSON.parse(JSON.stringify(d)))).toEqual(d);
    // sem chave Pix, o cartão não mostra o código; pausado também não
    expect(dadosDoCartao({ membro: membro(), plano: PLANO, cliente: 'Ana', oficina: 'X', cobrancas, recebedor: null, hoje: '2026-10-17' }).aberta).toBeNull();
    expect(dadosDoCartao({ membro: membro({ situacao: 'pausado' }), plano: PLANO, cliente: 'Ana', oficina: 'X', cobrancas, recebedor, hoje: '2026-10-17' }).aberta).toBeNull();
    expect(urlDoCartao('https://revisai.app', 'tok')).toBe('https://revisai.app/clube/tok');
  });

  it('as mensagens da mensalidade e do lembrete', () => {
    const m = mensagemDaMensalidade({ oficina: 'Auto Center', cliente: 'Ana', plano: 'Ouro', competencia: '2026-10', valor: 89.9, vencimento: '2026-10-10', link: 'https://x/pagar/t', pix: 'PIX' });
    expect(m).toContain('outubro de 2026');
    expect(m).toContain('10/10/2026');
    expect(m).toContain('https://x/pagar/t');
    expect(m.split('\n').at(-1)).toBe('PIX');
    const l = mensagemDeLembrete({ oficina: 'Auto Center', cliente: 'Ana', plano: 'Ouro', competencia: '2026-09', valor: 89.9, link: null, pix: 'PIX' });
    expect(l).toContain('setembro de 2026');
    expect(l).toContain('Se já pagou, desconsidere.');
  });
});
