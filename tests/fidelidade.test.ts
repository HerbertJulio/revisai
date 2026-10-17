import { describe, expect, it } from 'vitest';
import {
  configDaFidelidade,
  descontoSemResgate,
  erroDaConfig,
  FIDELIDADE_PADRAO,
  ganhoDaOrdem,
  historicoDoCliente,
  idDoGanho,
  idDoResgate,
  limiteDoResgate,
  mensagemDoSaldo,
  percentualDeVolta,
  pontosDoValor,
  ranking,
  resgateNoDocumento,
  saldoDoCliente,
  saldosPorCliente,
  textoDaRegra,
  valorDosPontos
} from '../lib/fidelidade';
import type { MovimentoFidelidade } from '../lib/registros-oficina';
import type { Cliente, Documento } from '../lib/tipos';

const ligado = configDaFidelidade({ ativo: true });
/** O real formatado tem espaço que não quebra; nos textos esperados, espaço comum. */
const esp = (t: string) => t.replace(/\s/g, ' ');

function doc(extra: Partial<Documento> = {}): Documento {
  return {
    id: 'os1',
    numero: 7,
    tipo: 'ordem',
    situacao: 'concluida',
    veiculoId: 'v1',
    km: 50000,
    data: '2026-10-17',
    linhas: [
      { id: 'l1', tipo: 'servico', descricao: 'Troca de óleo', quantidade: 1, unidade: 'un', valorUnitario: 80 },
      { id: 'l2', tipo: 'peca', descricao: 'Óleo 5W-30', quantidade: 4, unidade: 'L', valorUnitario: 45.5 }
    ],
    desconto: null,
    criadoEm: '2026-10-17T10:00:00.000Z',
    atualizadoEm: '2026-10-17T10:00:00.000Z',
    ...extra
  };
}

function mov(id: string, clienteId: string, tipo: MovimentoFidelidade['tipo'], pontos: number, extra: Partial<MovimentoFidelidade> = {}): MovimentoFidelidade {
  return { id, clienteId, tipo, pontos, data: '2026-10-01', criadoEm: '2026-10-01T10:00:00.000Z', atualizadoEm: '2026-10-01T10:00:00.000Z', ...extra };
}

describe('configuração', () => {
  it('os padrões entram no que falta e os números ruins voltam ao padrão', () => {
    expect(configDaFidelidade(undefined)).toEqual(FIDELIDADE_PADRAO);
    expect(configDaFidelidade({ ativo: true, pontosPorReal: 0, reaisPorPonto: -1, minimoResgate: 50.6 })).toEqual({ ativo: true, pontosPorReal: 1, reaisPorPonto: 0.05, minimoResgate: 51 });
    expect(percentualDeVolta(FIDELIDADE_PADRAO)).toBeCloseTo(0.05);
  });

  it('confere o que a pessoa digitou', () => {
    expect(erroDaConfig({ pontosPorReal: 1, reaisPorPonto: 0.05, minimoResgate: 100 })).toBeNull();
    expect(erroDaConfig({ pontosPorReal: null, reaisPorPonto: 0.05, minimoResgate: 100 })).toContain('pontos por real');
    expect(erroDaConfig({ pontosPorReal: 1, reaisPorPonto: 0, minimoResgate: 100 })).toContain('valor de cada ponto');
    expect(erroDaConfig({ pontosPorReal: 1, reaisPorPonto: 0.05, minimoResgate: 1.5 })).toContain('inteiro');
    expect(erroDaConfig({ pontosPorReal: 10, reaisPorPonto: 0.1, minimoResgate: 0 })).toContain('mais da metade');
  });

  it('o texto da regra', () => {
    expect(esp(textoDaRegra(ligado))).toBe('Cada R$ 1,00 gasto vale 1 ponto. 100 pontos valem R$ 5,00 de desconto. Dá para usar a partir de 100 pontos.');
    expect(esp(textoDaRegra({ ...ligado, pontosPorReal: 2, minimoResgate: 0 }))).toBe('Cada R$ 1,00 gasto vale 2 pontos. 100 pontos valem R$ 5,00 de desconto.');
  });
});

describe('pontos e reais', () => {
  it('arredonda os pontos para baixo e o valor em centavos', () => {
    expect(pontosDoValor(262, ligado)).toBe(262);
    expect(pontosDoValor(99.99, ligado)).toBe(99);
    expect(pontosDoValor(10.1, { pontosPorReal: 1.5 })).toBe(15);
    // 0,1 x 3 não vira 0,29999 pontos
    expect(pontosDoValor(0.3, { pontosPorReal: 10 })).toBe(3);
    expect(pontosDoValor(-5, ligado)).toBe(0);
    expect(valorDosPontos(150, ligado)).toBe(7.5);
    expect(valorDosPontos(-3, ligado)).toBe(0);
  });
});

describe('ganho na ordem concluída', () => {
  it('dá os pontos do total (com o desconto) para o dono do carro, com id fixo', () => {
    expect(ganhoDaOrdem(doc({ desconto: 12 }), 'c1', ligado, '2026-10-17')).toEqual({
      id: idDoGanho('os1'),
      clienteId: 'c1',
      tipo: 'ganho',
      pontos: 250,
      documentoId: 'os1',
      descricao: 'OS nº 7',
      valor: null,
      data: '2026-10-17'
    });
  });

  it('nada com o programa desligado, orçamento, ordem aberta ou sem valor', () => {
    expect(ganhoDaOrdem(doc(), 'c1', FIDELIDADE_PADRAO, '2026-10-17')).toBeNull();
    expect(ganhoDaOrdem(doc({ tipo: 'orcamento', situacao: 'aprovado' }), 'c1', ligado, '2026-10-17')).toBeNull();
    expect(ganhoDaOrdem(doc({ situacao: 'aberta' }), 'c1', ligado, '2026-10-17')).toBeNull();
    expect(ganhoDaOrdem(doc({ linhas: [] }), 'c1', ligado, '2026-10-17')).toBeNull();
  });
});

describe('saldo', () => {
  const movimentos = [
    mov('a', 'c1', 'ganho', 300, { data: '2026-09-01' }),
    mov('b', 'c1', 'resgate', -100, { documentoId: 'os-cancelada', data: '2026-09-10' }),
    mov('c', 'c1', 'resgate', -50, { documentoId: 'os-aberta', data: '2026-09-15' }),
    mov('d', 'c1', 'ajuste', 20, { data: '2026-10-01' }),
    mov('e', 'c2', 'ganho', 80),
    mov('f', 'c3', 'ajuste', -10)
  ];
  const documentos = { 'os-cancelada': { situacao: 'cancelada' as const }, 'os-aberta': { situacao: 'aberta' as const } };

  it('soma ganhos, resgates e ajustes; o resgate na ordem cancelada volta', () => {
    const s = saldosPorCliente(movimentos, documentos);
    expect(s.get('c1')).toEqual({ clienteId: 'c1', saldo: 270, ganhos: 300, usados: 50, ultimo: '2026-10-01' });
    expect(s.get('c2')?.saldo).toBe(80);
    // nunca negativo
    expect(s.get('c3')?.saldo).toBe(0);
    expect(saldoDoCliente(movimentos, 'c1', documentos)).toBe(270);
    expect(saldoDoCliente(movimentos, 'ninguem', documentos)).toBe(0);
  });

  it('o histórico do cliente, do mais novo para o mais velho', () => {
    expect(historicoDoCliente(movimentos, 'c1').map((m) => m.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('o ranking mostra quem tem pontos, do maior saldo para o menor', () => {
    const clientes: Record<string, Cliente> = {
      c1: { id: 'c1', nome: 'Ana', telefone: '', criadoEm: '' },
      c2: { id: 'c2', nome: 'Bruno', telefone: '', criadoEm: '' },
      c3: { id: 'c3', nome: 'Caio', telefone: '', criadoEm: '' }
    };
    expect(ranking(saldosPorCliente(movimentos, documentos), clientes).map((r) => [r.cliente.nome, r.saldo])).toEqual([
      ['Ana', 270],
      ['Bruno', 80]
    ]);
  });
});

describe('usar os pontos', () => {
  it('até o saldo, até o total do documento e só a partir do mínimo', () => {
    const d = doc({ situacao: 'aberta' });
    // total 262: no máximo 5240 pontos; o cliente tem 300
    expect(limiteDoResgate(300, d, null, ligado)).toMatchObject({ maxPontos: 300, maxValor: 15, motivo: null, totalSemResgate: 262 });
    expect(limiteDoResgate(99, d, null, ligado)).toMatchObject({ maxPontos: 0, motivo: 'Dá para usar a partir de 100 pontos.' });
    expect(limiteDoResgate(100000, d, null, ligado)).toMatchObject({ maxPontos: 5240, maxValor: 262 });
    expect(limiteDoResgate(500, doc({ linhas: [] }), null, ligado)).toMatchObject({ maxPontos: 0, motivo: 'O documento ainda não tem valor para descontar.' });
    expect(limiteDoResgate(500, d, null, FIDELIDADE_PADRAO).motivo).toBe('O programa de pontos está desligado.');
  });

  it('o desconto entra no documento e o resgate tem id fixo', () => {
    const d = doc({ situacao: 'aberta', desconto: 10 });
    const r = resgateNoDocumento(d, 'c1', 200, null, ligado, '2026-10-17');
    expect(r.desconto).toBe(20);
    expect(r.movimento).toEqual({ id: idDoResgate('os1'), clienteId: 'c1', tipo: 'resgate', pontos: -200, documentoId: 'os1', descricao: 'Desconto na OS nº 7', valor: 10, data: '2026-10-17' });
  });

  it('trocar a quantidade usa o que já estava no documento e não soma o desconto duas vezes', () => {
    const anterior = mov(idDoResgate('os1'), 'c1', 'resgate', -200, { documentoId: 'os1', valor: 10 });
    const d = doc({ situacao: 'aberta', desconto: 20 });
    // saldo 100 depois do primeiro resgate: pode usar até 300 (100 + os 200 que voltam)
    expect(limiteDoResgate(100, d, anterior, ligado)).toMatchObject({ disponivel: 300, maxPontos: 300, totalSemResgate: 252 });
    const r = resgateNoDocumento(d, 'c1', 300, anterior, ligado, '2026-10-17');
    expect(r.desconto).toBe(25);
    expect(r.movimento.pontos).toBe(-300);
    expect(descontoSemResgate(d, anterior)).toBe(10);
    expect(descontoSemResgate(doc({ desconto: 10 }), anterior)).toBeNull();
  });
});

describe('mensagem do saldo', () => {
  it('com o saldo em pontos e em reais', () => {
    expect(esp(mensagemDoSaldo({ cliente: 'Ana Souza', oficina: 'Auto Center Serra', saldo: 350, config: ligado }))).toBe(
      'Oi, Ana! Aqui é da Auto Center Serra. Você tem 350 pontos no nosso programa de fidelidade, que valem R$ 17,50 de desconto no próximo serviço. É só pedir na hora de fechar a conta.'
    );
    expect(esp(mensagemDoSaldo({ cliente: '', oficina: '', saldo: 1, config: ligado }))).toBe(
      'Oi! Aqui é da oficina. Você tem 1 ponto no nosso programa de fidelidade, que vale R$ 0,05 de desconto no próximo serviço. Juntando 100 pontos, já dá para usar.'
    );
  });
});
