import { describe, expect, it } from 'vitest';
import {
  aprovacaoDosOrcamentos,
  csv,
  diaDaConclusao,
  faturamentoPorMes,
  intervaloDoPeriodo,
  margemDasPecas,
  nomeDoMes,
  ordensConcluidas,
  periodoValido,
  recebidoEAReceber,
  resumoDoPeriodo,
  retornoDosAvisos,
  servicosMaisFeitos,
  textoDasHoras
} from '@/lib/relatorios';
import type { Lancamento } from '@/lib/registros-oficina';
import type { Atendimento, Contato, Documento, ItemEstoque, LinhaDocumento } from '@/lib/tipos';

const agora = '2026-10-17T12:00:00.000Z';
const hoje = '2026-10-17';

let seq = 0;
function linha(p: Partial<LinhaDocumento>): LinhaDocumento {
  return { id: `l${++seq}`, tipo: 'servico', descricao: 'Item', quantidade: 1, unidade: 'un', valorUnitario: 0, ...p };
}

function os(p: Partial<Documento>): Documento {
  return { id: `d${++seq}`, numero: seq, tipo: 'ordem', situacao: 'concluida', veiculoId: 'v1', km: 1000, data: hoje, linhas: [], desconto: null, criadoEm: agora, atualizadoEm: agora, ...p };
}

function item(p: Partial<ItemEstoque>): ItemEstoque {
  return { id: 'e1', nome: 'Óleo 5W30', categoria: 'oleo_motor', unidade: 'L', quantidade: 10, minimo: 0, custo: 30, preco: 50, criadoEm: agora, atualizadoEm: agora, ...p };
}

describe('período', () => {
  it('este mês, mês passado e os últimos meses', () => {
    expect(intervaloDoPeriodo('este_mes', hoje)).toEqual({ inicio: '2026-10-01', fim: hoje, meses: ['2026-10'] });
    expect(intervaloDoPeriodo('mes_passado', hoje)).toEqual({ inicio: '2026-09-01', fim: '2026-09-30', meses: ['2026-09'] });
    expect(intervaloDoPeriodo('mes_passado', '2026-03-31')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28', meses: ['2026-02'] });
    expect(intervaloDoPeriodo('3m', hoje)).toEqual({ inicio: '2026-08-01', fim: hoje, meses: ['2026-08', '2026-09', '2026-10'] });
    expect(intervaloDoPeriodo('12m', '2026-02-10').meses).toEqual(['2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(intervaloDoPeriodo('6m', hoje).inicio).toBe('2026-05-01');
    expect(periodoValido('3m')).toBe('3m');
    expect(periodoValido('xx')).toBe('este_mes');
    expect(nomeDoMes('2026-10')).toBe('out/26');
  });
});

describe('faturamento, ticket e carros', () => {
  const ordens = [
    os({ veiculoId: 'v1', data: '2026-09-29', concluidoEm: '2026-10-02T15:00:00.000Z', linhas: [linha({ valorUnitario: 200 }), linha({ tipo: 'peca', quantidade: 2, valorUnitario: 50 })], desconto: 30 }),
    os({ veiculoId: 'v2', data: '2026-10-05', linhas: [linha({ valorUnitario: 150 }), linha({ tipo: 'outro', valorUnitario: 20 }), linha({ tipo: 'peca', valorUnitario: 999, recusada: true })] }),
    os({ veiculoId: 'v1', data: '2026-10-10', linhas: [linha({ tipo: 'peca', valorUnitario: 80 })] }),
    os({ veiculoId: 'v3', data: '2026-09-10', linhas: [linha({ valorUnitario: 100 })] }),
    os({ veiculoId: 'v4', situacao: 'aberta', data: '2026-10-10', linhas: [linha({ valorUnitario: 500 })] }),
    os({ veiculoId: 'v5', tipo: 'orcamento', situacao: 'aprovado', data: '2026-10-10', linhas: [linha({ valorUnitario: 500 })] })
  ];

  it('conta pela data da conclusão', () => {
    expect(diaDaConclusao(ordens[0])).toBe('2026-10-02');
    expect(diaDaConclusao(ordens[1])).toBe('2026-10-05');
    const doMes = ordensConcluidas(ordens, intervaloDoPeriodo('este_mes', hoje));
    expect(doMes.map((d) => d.veiculoId)).toEqual(['v1', 'v2', 'v1']);
  });

  it('por mês: faturamento, ordens, carros diferentes e ticket', () => {
    const i = intervaloDoPeriodo('3m', hoje);
    const meses = faturamentoPorMes(ordensConcluidas(ordens, i), i);
    expect(meses).toEqual([
      { mes: '2026-08', faturamento: 0, ordens: 0, carros: 0, ticket: null },
      { mes: '2026-09', faturamento: 100, ordens: 1, carros: 1, ticket: 100 },
      { mes: '2026-10', faturamento: 520, ordens: 3, carros: 2, ticket: 173.33 }
    ]);
  });

  it('mão de obra e peças do período', () => {
    const r = resumoDoPeriodo(ordensConcluidas(ordens, intervaloDoPeriodo('este_mes', hoje)));
    expect(r).toEqual({ faturamento: 520, ordens: 3, ticketMedio: 173.33, carros: 2, maoDeObra: 350, pecas: 180, outros: 20, descontos: 30 });
    expect(resumoDoPeriodo([]).ticketMedio).toBeNull();
  });
});

describe('margem das peças', () => {
  it('preço contra o custo do estoque, e diz quando o custo não é conhecido', () => {
    const estoque = { e1: item({ id: 'e1', custo: 30 }), e2: item({ id: 'e2', nome: 'Filtro PSL 55', marca: 'Tecfil', unidade: 'un', custo: null }) };
    const ordens = [
      os({ linhas: [linha({ tipo: 'peca', estoqueId: 'e1', quantidade: 4, unidade: 'L', valorUnitario: 50 }), linha({ tipo: 'peca', estoqueId: 'e2', valorUnitario: 40 }), linha({ tipo: 'servico', valorUnitario: 100 })] }),
      os({ linhas: [linha({ tipo: 'peca', estoqueId: 'e1', quantidade: 3.5, unidade: 'L', valorUnitario: 50 }), linha({ tipo: 'peca', descricao: 'Palheta da loja', valorUnitario: 60 }), linha({ tipo: 'peca', estoqueId: 'e1', quantidade: 9, valorUnitario: 50, recusada: true })] })
    ];
    const m = margemDasPecas(ordens, estoque);
    expect(m.linhas).toEqual([
      { chave: 'e:e1', nome: 'Óleo 5W30', quantidade: 7.5, venda: 375, custo: 225, margem: 150 },
      { chave: 'd:palheta da loja', nome: 'Palheta da loja', quantidade: 1, venda: 60, custo: null, margem: null },
      { chave: 'e:e2', nome: 'Tecfil Filtro PSL 55', quantidade: 1, venda: 40, custo: null, margem: null }
    ]);
    expect([m.venda, m.custo, m.margem, m.percentual, m.vendaSemCusto, m.linhasSemCusto]).toEqual([375, 225, 150, 40, 100, 2]);
    expect(margemDasPecas([], {}).percentual).toBeNull();
  });
});

describe('aprovação dos orçamentos', () => {
  it('mandados contra aprovados, em quantidade e em valor, e o tempo para responder', () => {
    const orc = (p: Partial<Documento>) => os({ tipo: 'orcamento', ...p });
    const docs = [
      orc({ situacao: 'aprovado', enviadoEm: '2026-10-02T10:00:00Z', respondidoEm: '2026-10-02T14:00:00Z', linhas: [linha({ valorUnitario: 300 }), linha({ valorUnitario: 100, recusada: true })] }),
      orc({ situacao: 'recusado', enviadoEm: '2026-10-03T10:00:00Z', respondidoEm: '2026-10-04T10:00:00Z', linhas: [linha({ valorUnitario: 200 })] }),
      orc({ situacao: 'enviado', enviadoEm: '2026-10-10T10:00:00Z', linhas: [linha({ valorUnitario: 400 })] }),
      // aprovado na hora, sem mandar
      orc({ situacao: 'aprovado', data: '2026-10-11', respondidoEm: '2026-10-11T10:00:00Z', linhas: [linha({ valorUnitario: 100 })] }),
      orc({ situacao: 'rascunho', linhas: [linha({ valorUnitario: 1000 })] }),
      orc({ situacao: 'aprovado', enviadoEm: '2026-09-02T10:00:00Z', linhas: [linha({ valorUnitario: 1000 })] })
    ];
    const a = aprovacaoDosOrcamentos(docs, intervaloDoPeriodo('este_mes', hoje));
    expect(a).toEqual({ enviados: 4, aprovados: 2, recusados: 1, esperando: 1, valorEnviado: 1100, valorAprovado: 400, taxa: 50, taxaDoValor: 36, horasParaResponder: 14 });
    expect(aprovacaoDosOrcamentos([], intervaloDoPeriodo('este_mes', hoje)).taxa).toBeNull();
    expect(textoDasHoras(0.4)).toBe('menos de 1 hora');
    expect(textoDasHoras(1)).toBe('1 hora');
    expect(textoDasHoras(14)).toBe('14 horas');
    expect(textoDasHoras(50)).toBe('2 dias');
  });
});

describe('serviços mais feitos', () => {
  it('pelo serviço da linha, uma vez por ordem, e a mão de obra sem serviço pela descrição', () => {
    const ordens = [
      os({ linhas: [linha({ servico: 'troca_oleo', tipo: 'peca', valorUnitario: 150 }), linha({ servico: 'troca_oleo', valorUnitario: 40 }), linha({ servico: 'filtro_oleo', tipo: 'peca', valorUnitario: 35 })] }),
      os({ linhas: [linha({ servico: 'troca_oleo', tipo: 'peca', valorUnitario: 160 }), linha({ descricao: 'Regulagem  do  freio de mão', valorUnitario: 50 })] }),
      os({ linhas: [linha({ descricao: 'regulagem do freio de mão', valorUnitario: 60 }), linha({ servico: 'pastilhas', valorUnitario: 90, recusada: true }), linha({ tipo: 'peca', descricao: 'Parafuso', valorUnitario: 2 })] })
    ];
    expect(servicosMaisFeitos(ordens)).toEqual([
      { chave: 's:troca_oleo', nome: 'Troca de óleo', vezes: 2, valor: 350 },
      { chave: 'd:regulagem do freio de mão', nome: 'Regulagem do freio de mão', vezes: 2, valor: 110 },
      { chave: 's:filtro_oleo', nome: 'Filtro de óleo', vezes: 1, valor: 35 }
    ]);
    expect(servicosMaisFeitos(ordens, 1)).toHaveLength(1);
  });
});

describe('retorno dos avisos', () => {
  const contato = (p: Partial<Contato>): Contato => ({ id: `k${++seq}`, veiculoId: 'v1', servico: 'troca_oleo', atendimentoId: 'a0', quando: '2026-10-01T12:00:00Z', resultado: 'avisado', ...p });
  const atendimento = (p: Partial<Atendimento>): Atendimento => ({ id: `a${++seq}`, veiculoId: 'v1', data: '2026-10-05', km: 1, itens: [], valor: 100, criadoEm: agora, ...p });

  it('um aviso por carro e ciclo; voltou em até 60 dias; cada serviço conta uma vez', () => {
    const contatos = [
      contato({ veiculoId: 'v1', atendimentoId: 'a0', quando: '2026-10-01T12:00:00Z' }),
      contato({ veiculoId: 'v1', atendimentoId: 'a0', servico: 'filtro_oleo', quando: '2026-10-01T12:00:00Z' }),
      contato({ veiculoId: 'v1', atendimentoId: 'a0', resultado: 'agendado', quando: '2026-10-03T12:00:00Z' }),
      contato({ veiculoId: 'v2', atendimentoId: 'b0', resultado: 'agendado', quando: '2026-10-02T12:00:00Z' }),
      contato({ veiculoId: 'v3', atendimentoId: 'c0', quando: '2026-10-04T12:00:00Z' }),
      contato({ veiculoId: 'v4', atendimentoId: 'd0', resultado: 'recusou', quando: '2026-10-04T12:00:00Z' }),
      contato({ veiculoId: 'v5', atendimentoId: 'e0', quando: '2026-08-01T12:00:00Z' })
    ];
    const atendimentos = [
      atendimento({ id: 'a0', veiculoId: 'v1', data: '2026-04-01' }),
      atendimento({ veiculoId: 'v1', data: '2026-10-05', valor: 250 }),
      atendimento({ veiculoId: 'v1', data: '2026-10-20', valor: 80 }),
      atendimento({ veiculoId: 'v2', data: '2026-12-15', valor: 999 }),
      atendimento({ veiculoId: 'v3', data: '2026-09-30', valor: 999 }),
      atendimento({ veiculoId: 'v5', data: '2026-08-10', valor: 999 })
    ];
    const r = retornoDosAvisos(contatos, atendimentos, intervaloDoPeriodo('este_mes', hoje));
    expect(r).toEqual({ avisados: 3, voltaram: 1, taxa: 33, valor: 330 });
    expect(retornoDosAvisos([], atendimentos, intervaloDoPeriodo('este_mes', hoje)).taxa).toBeNull();
  });
});

describe('recebido e a receber', () => {
  it('pelo financeiro, mês a mês', () => {
    const l = (p: Partial<Lancamento>): Lancamento => ({ id: `x${++seq}`, tipo: 'receber', descricao: 'x', valor: 100, vencimento: hoje, pagoEm: null, forma: 'pix', categoria: 'servico', criadoEm: agora, atualizadoEm: agora, ...p });
    const lista = [
      l({ valor: 300, pagoEm: '2026-10-02' }),
      l({ valor: 100, pagoEm: '2026-09-15' }),
      l({ valor: 50, vencimento: '2026-10-10', forma: 'fiado' }),
      l({ valor: 70, vencimento: '2026-10-30', forma: 'fiado' }),
      l({ valor: 40, vencimento: '2026-11-30', forma: 'fiado' }),
      l({ tipo: 'pagar', valor: 120, pagoEm: '2026-10-03' }),
      l({ tipo: 'pagar', valor: 80, vencimento: '2026-10-25' })
    ];
    const r = recebidoEAReceber(lista, intervaloDoPeriodo('3m', hoje), hoje);
    expect(r.meses).toEqual([
      { mes: '2026-08', recebido: 0, aReceber: 0, pago: 0, aPagar: 0 },
      { mes: '2026-09', recebido: 100, aReceber: 0, pago: 0, aPagar: 0 },
      { mes: '2026-10', recebido: 300, aReceber: 120, pago: 120, aPagar: 80 }
    ]);
    expect([r.recebido, r.aReceber, r.vencido, r.pago, r.aPagar]).toEqual([400, 120, 50, 120, 80]);
  });
});

describe('CSV', () => {
  it('ponto e vírgula, vírgula nos decimais, aspas quando precisa e sem fórmula', () => {
    const t = csv(['Mês', 'Faturamento', 'Obs'], [
      ['out/26', 1234.5, 'Pix; dinheiro'],
      ['set/26', 0, 'disse "ok"'],
      ['ago/26', null, '=HYPERLINK("x")'],
      ['jul/26', -10.25, 'linha\nquebrada']
    ]);
    expect(t).toBe(['Mês;Faturamento;Obs', 'out/26;1234,5;"Pix; dinheiro"', 'set/26;0;"disse ""ok"""', `ago/26;;"'=HYPERLINK(""x"")"`, 'jul/26;-10,25;"linha\nquebrada"'].join('\r\n'));
  });
});
