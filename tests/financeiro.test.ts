import { describe, expect, it } from 'vitest';
import {
  adivinharTipoDaChave,
  caixaDoDia,
  chavePixDaOficina,
  contaDoPedido,
  desfazerPagamento,
  dividirEmParcelas,
  errosDaConta,
  fiadosPorCliente,
  filtrarLancamentos,
  FILTRO_INICIAL,
  marcarPago,
  mensagemDoFiado,
  montarLancamentos,
  montarRecebimento,
  nomeDaCategoria,
  pagamentoDaOrdem,
  pedidosSemConta,
  pixDaOficina,
  resumoFinanceiro,
  rotuloDoVencimento,
  situacaoDoLancamento,
  somarLancamentos,
  tipoDaChavePix,
  txidDoFiado,
  vencimentosDasParcelas
} from '@/lib/financeiro';
import { crc16 } from '@/lib/pix';
import type { Lancamento } from '@/lib/registros-oficina';
import type { Documento, PedidoEnviado } from '@/lib/tipos';

const agora = '2026-10-17T12:00:00.000Z';
const hoje = '2026-10-17';

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function lanc(p: Partial<Lancamento>): Lancamento {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    tipo: 'receber',
    descricao: 'Conta',
    valor: 100,
    vencimento: hoje,
    pagoEm: null,
    forma: null,
    categoria: 'servico',
    criadoEm: agora,
    atualizadoEm: agora,
    ...p
  };
}

function gravados(itens: ReturnType<typeof montarLancamentos>): Lancamento[] {
  return itens.map((i) => ({ ...i, id: i.id!, criadoEm: agora, atualizadoEm: agora }));
}

describe('parcelas', () => {
  it('divide em centavos, com a sobra na primeira', () => {
    expect(dividirEmParcelas(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(dividirEmParcelas(0.1 + 0.2, 1)).toEqual([0.3]);
    expect(dividirEmParcelas(1000, 4)).toEqual([250, 250, 250, 250]);
    expect(dividirEmParcelas(0.05, 3)).toEqual([0.03, 0.01, 0.01]);
    expect(dividirEmParcelas(0, 3)).toEqual([]);
    expect(dividirEmParcelas(-10, 2)).toEqual([]);
    expect(dividirEmParcelas(50, 0)).toEqual([50]);
    const soma = dividirEmParcelas(999.99, 7).reduce((s, v) => s + Math.round(v * 100), 0);
    expect(soma).toBe(99999);
  });

  it('vence todo mês no mesmo dia, sem escorregar depois de fevereiro', () => {
    expect(vencimentosDasParcelas('2026-01-31', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(vencimentosDasParcelas('2027-12-15', 3)).toEqual(['2027-12-15', '2028-01-15', '2028-02-15']);
    expect(vencimentosDasParcelas('2026-10-17', 3, '30dias')).toEqual(['2026-10-17', '2026-11-16', '2026-12-16']);
  });

  it('a conta em vezes vira um lançamento por parcela, com o mesmo grupo', () => {
    const l = montarLancamentos({ tipo: 'receber', descricao: '  Fiado do João ', valor: 250, parcelas: 3, vencimento: '2026-11-10', forma: 'fiado', categoria: 'servico', clienteId: 'c1', pagoEm: hoje }, ids());
    expect(l).toHaveLength(3);
    expect(l.map((x) => x.valor)).toEqual([83.34, 83.33, 83.33]);
    expect(l.map((x) => x.vencimento)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
    expect(l.map((x) => x.parcela)).toEqual([
      { numero: 1, total: 3, grupo: 'id-1' },
      { numero: 2, total: 3, grupo: 'id-1' },
      { numero: 3, total: 3, grupo: 'id-1' }
    ]);
    expect(new Set(l.map((x) => x.id)).size).toBe(3);
    // em vezes, nada entra pago
    expect(l.every((x) => x.pagoEm === null && x.descricao === 'Fiado do João' && x.clienteId === 'c1')).toBe(true);

    const uma = montarLancamentos({ tipo: 'pagar', descricao: 'Aluguel', valor: 1500, vencimento: '2026-11-05', forma: 'pix', categoria: 'aluguel', favorecido: ' Seu Zé ', pagoEm: hoje }, ids());
    expect(uma).toEqual([
      { id: 'id-1', tipo: 'pagar', descricao: 'Aluguel', valor: 1500, vencimento: '2026-11-05', pagoEm: hoje, forma: 'pix', categoria: 'aluguel', parcela: null, clienteId: null, documentoId: null, favorecido: 'Seu Zé' }
    ]);
  });

  it('confere a conta antes de gravar', () => {
    expect(errosDaConta({ descricao: 'x', valor: 0, vencimento: '', parcelas: 30 })).toEqual({
      descricao: 'Escreva do que é a conta.',
      valor: 'Escreva o valor.',
      vencimento: 'Escolha a data.',
      parcelas: 'De 1 a 24 vezes.'
    });
    expect(errosDaConta({ descricao: 'Peças', valor: 0.02, vencimento: hoje, parcelas: 3 }).parcelas).toBeTruthy();
    expect(errosDaConta({ descricao: 'Peças', valor: 120, vencimento: hoje, parcelas: 2 })).toEqual({});
  });
});

describe('recebimento', () => {
  const base = { hoje, descricao: 'OS nº 7', documentoId: 'os7', clienteId: 'c1' };

  it('Pix, dinheiro e débito entram hoje', () => {
    for (const forma of ['pix', 'dinheiro', 'debito'] as const) {
      const [l, ...resto] = montarRecebimento({ ...base, valor: 300, forma, parcelas: 5 }, ids());
      expect(resto).toEqual([]);
      expect(l).toMatchObject({ tipo: 'receber', valor: 300, forma, pagoEm: hoje, vencimento: hoje, documentoId: 'os7', clienteId: 'c1', categoria: 'servico' });
    }
  });

  it('crédito parcelado vira as parcelas da maquininha, de 30 em 30 dias', () => {
    const l = montarRecebimento({ ...base, valor: 300, forma: 'credito', parcelas: 3 }, ids());
    expect(l.map((x) => [x.valor, x.vencimento, x.pagoEm])).toEqual([
      [100, '2026-11-16', null],
      [100, '2026-12-16', null],
      [100, '2027-01-15', null]
    ]);
    expect(l[0].observacao).toBe('Crédito em 3x, a maquininha paga');
    // à vista no crédito: cai em 30 dias
    const avista = montarRecebimento({ ...base, valor: 80, forma: 'credito', parcelas: 1 }, ids());
    expect(avista).toHaveLength(1);
    expect(avista[0]).toMatchObject({ vencimento: '2026-11-16', pagoEm: null, observacao: 'A maquininha paga' });
    // antecipado: tudo hoje
    const antecipado = montarRecebimento({ ...base, valor: 300, forma: 'credito', parcelas: 3, antecipado: true }, ids());
    expect(antecipado).toHaveLength(1);
    expect(antecipado[0]).toMatchObject({ valor: 300, pagoEm: hoje, observacao: 'Crédito em 3x, antecipado' });
  });

  it('fiado e boleto ficam em aberto, todo mês a partir do vencimento escolhido', () => {
    const f = montarRecebimento({ ...base, valor: 200, forma: 'fiado', parcelas: 2, vencimento: '2026-11-05' }, ids());
    expect(f.map((x) => [x.forma, x.valor, x.vencimento, x.pagoEm])).toEqual([
      ['fiado', 100, '2026-11-05', null],
      ['fiado', 100, '2026-12-05', null]
    ]);
    const b = montarRecebimento({ ...base, valor: 90, forma: 'boleto', parcelas: 1, vencimento: 'xx' }, ids());
    expect(b[0]).toMatchObject({ forma: 'boleto', vencimento: '2026-11-16', pagoEm: null });
  });

  it('o que a OS já recebeu, o que está em aberto e o que falta lançar', () => {
    const doc: Pick<Documento, 'id' | 'linhas' | 'desconto'> = {
      id: 'os7',
      desconto: 20,
      linhas: [
        { id: 'a', tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: 120 },
        { id: 'b', tipo: 'peca', descricao: 'Óleo', quantidade: 4, unidade: 'L', valorUnitario: 50 },
        { id: 'c', tipo: 'peca', descricao: 'Filtro recusado', quantidade: 1, unidade: 'un', valorUnitario: 40, recusada: true }
      ]
    };
    const lancamentos = [
      lanc({ documentoId: 'os7', valor: 100, pagoEm: hoje, forma: 'pix' }),
      lanc({ documentoId: 'os7', valor: 50, forma: 'fiado', vencimento: '2026-11-17' }),
      lanc({ documentoId: 'os7', tipo: 'pagar', valor: 999 }),
      lanc({ documentoId: 'outra', valor: 70, pagoEm: hoje })
    ];
    const p = pagamentoDaOrdem(doc, lancamentos);
    expect(p).toMatchObject({ total: 300, recebido: 100, aReceber: 50, falta: 150 });
    expect(p.lancamentos.map((l) => l.valor)).toEqual([50, 100]);
    expect(pagamentoDaOrdem(doc, [...lancamentos, lanc({ documentoId: 'os7', valor: 200, pagoEm: hoje })]).falta).toBe(-50);
  });
});

describe('contas: situação, filtros e totais', () => {
  const lista = [
    lanc({ id: 'v', descricao: 'Fiado do Carlos', valor: 150, vencimento: '2026-10-10', forma: 'fiado', clienteId: 'c1' }),
    lanc({ id: 'h', descricao: 'Boleto da frota', valor: 400, vencimento: hoje, forma: 'boleto' }),
    lanc({ id: 'a', descricao: 'Parcela da maquininha', valor: 99.9, vencimento: '2026-11-16', forma: 'credito' }),
    lanc({ id: 'p', descricao: 'OS nº 3', valor: 250, vencimento: '2026-10-02', pagoEm: '2026-10-02', forma: 'pix', atualizadoEm: '2026-10-02T10:00:00Z' }),
    lanc({ id: 'p2', descricao: 'OS nº 4', valor: 80, vencimento: '2026-09-28', pagoEm: '2026-10-05', forma: 'dinheiro', atualizadoEm: '2026-10-05T10:00:00Z' }),
    lanc({ id: 'g', tipo: 'pagar', descricao: 'Aluguel', valor: 1200, vencimento: '2026-10-05', categoria: 'aluguel', favorecido: 'Imobiliária Serra' }),
    lanc({ id: 'g2', tipo: 'pagar', descricao: 'Pedido ABC123 da loja', valor: 310.5, vencimento: '2026-10-15', pagoEm: '2026-10-15', forma: 'pix', categoria: 'pecas' })
  ];
  const nomes: Record<string, string> = { c1: 'Carlos Ândrade' };

  it('situação e rótulo do vencimento', () => {
    expect(situacaoDoLancamento(lista[0], hoje)).toBe('vencido');
    expect(situacaoDoLancamento(lista[1], hoje)).toBe('hoje');
    expect(situacaoDoLancamento(lista[2], hoje)).toBe('aberto');
    expect(situacaoDoLancamento(lista[3], hoje)).toBe('pago');
    expect(rotuloDoVencimento(lista[0], hoje)).toBe('Venceu há 7 dias');
    expect(rotuloDoVencimento(lista[1], hoje)).toBe('Vence hoje');
    expect(rotuloDoVencimento(lista[2], hoje)).toBe('Vence em 30 dias');
    expect(rotuloDoVencimento(lista[3], hoje)).toBe('Recebido em 02/10/2026');
    expect(rotuloDoVencimento(lista[6], hoje)).toBe('Pago em 15/10/2026');
    expect(rotuloDoVencimento(lanc({ vencimento: '2027-03-01' }), hoje)).toBe('Vence em 01/03/2027');
  });

  it('filtra por situação, tipo, mês e busca (sem acento e pelo valor)', () => {
    const f = (x: Partial<typeof FILTRO_INICIAL>) => filtrarLancamentos(lista, { ...FILTRO_INICIAL, ...x }, hoje, (id) => nomes[id] ?? '').map((l) => l.id);
    // em aberto, o que vence antes em cima
    expect(f({})).toEqual(['g', 'v', 'h', 'a']);
    expect(f({ situacao: 'vencidos' })).toEqual(['g', 'v']);
    expect(f({ situacao: 'pagos' })).toEqual(['g2', 'p2', 'p']);
    expect(f({ situacao: 'todos', tipo: 'pagar' })).toEqual(['g', 'g2']);
    // o pago conta no mês em que foi pago
    expect(f({ situacao: 'todos', mes: '2026-09' })).toEqual([]);
    expect(f({ situacao: 'todos', mes: '2026-11' })).toEqual(['a']);
    expect(f({ situacao: 'todos', busca: 'andrade' })).toEqual(['v']);
    expect(f({ situacao: 'todos', busca: 'imobiliaria' })).toEqual(['g']);
    expect(f({ situacao: 'todos', busca: '99,90' })).toEqual(['a']);
    expect(f({ situacao: 'todos', busca: 'R$ 1.200' })).toEqual(['g']);
    expect(f({ situacao: 'todos', busca: 'fiado' })).toEqual(['v']);
  });

  it('soma em centavos e resume o mês', () => {
    expect(somarLancamentos(lista)).toEqual({ receber: 979.9, pagar: 1510.5, saldo: -530.6, quantidade: 7 });
    expect(somarLancamentos([lanc({ valor: 0.1 }), lanc({ valor: 0.2 })]).receber).toBe(0.3);
    expect(resumoFinanceiro(lista, hoje)).toEqual({ aReceber: 649.9, receberVencido: 150, aPagar: 1200, pagarVencido: 1200, recebidoNoMes: 330, pagoNoMes: 310.5 });
  });

  it('receber e desfazer', () => {
    const l = lanc({ forma: 'fiado' });
    const pago = marcarPago(l, hoje, 'pix');
    expect(pago).toMatchObject({ pagoEm: hoje, forma: 'pix' });
    expect(marcarPago(l, hoje, null).forma).toBe('fiado');
    expect(desfazerPagamento(pago)).toMatchObject({ pagoEm: null, forma: 'pix' });
  });

  it('nomes das categorias', () => {
    expect(nomeDaCategoria('pecas', 'pagar')).toBe('Compra de peças');
    expect(nomeDaCategoria('pecas', 'receber')).toBe('Venda de peças');
    expect(nomeDaCategoria('aluguel')).toBe('Aluguel');
    expect(nomeDaCategoria('marketing')).toBe('Marketing');
  });
});

describe('caixa do dia', () => {
  it('o que entrou e saiu no dia, por forma de pagamento', () => {
    const lista = [
      lanc({ valor: 100, pagoEm: hoje, forma: 'pix', atualizadoEm: '2026-10-17T09:00:00Z' }),
      lanc({ valor: 50.5, pagoEm: hoje, forma: 'dinheiro' }),
      lanc({ valor: 25.25, pagoEm: hoje, forma: 'pix', atualizadoEm: '2026-10-17T11:00:00Z' }),
      lanc({ valor: 300, pagoEm: hoje, forma: 'credito' }),
      lanc({ valor: 999, pagoEm: '2026-10-16', forma: 'pix' }),
      lanc({ valor: 70, forma: 'fiado' }),
      lanc({ tipo: 'pagar', valor: 40, pagoEm: hoje, forma: 'dinheiro' }),
      lanc({ tipo: 'pagar', valor: 10, pagoEm: hoje, forma: null })
    ];
    const c = caixaDoDia(lista, hoje);
    expect(c.entradas).toEqual([
      { forma: 'pix', nome: 'Pix', total: 125.25, quantidade: 2 },
      { forma: 'dinheiro', nome: 'Dinheiro', total: 50.5, quantidade: 1 },
      { forma: 'credito', nome: 'Crédito', total: 300, quantidade: 1 }
    ]);
    expect(c.saidas).toEqual([
      { forma: 'dinheiro', nome: 'Dinheiro', total: 40, quantidade: 1 },
      { forma: null, nome: 'Sem forma', total: 10, quantidade: 1 }
    ]);
    expect([c.totalEntradas, c.totalSaidas, c.saldo]).toEqual([475.75, 50, 425.75]);
    expect(c.lancamentos).toHaveLength(6);
    expect(c.lancamentos[0].tipo).toBe('receber');
    expect(caixaDoDia(lista, '2026-10-16').saldo).toBe(999);
    expect(caixaDoDia([], hoje)).toMatchObject({ entradas: [], saidas: [], saldo: 0 });
  });
});

describe('fiado', () => {
  const lista = [
    lanc({ id: 'f1', clienteId: 'c1', forma: 'fiado', valor: 100, vencimento: '2026-10-01', parcela: { numero: 1, total: 2, grupo: 'g' }, lembradoEm: '2026-10-05T10:00:00Z' }),
    lanc({ id: 'f2', clienteId: 'c1', forma: 'fiado', valor: 100, vencimento: '2026-11-01', parcela: { numero: 2, total: 2, grupo: 'g' } }),
    lanc({ id: 'f3', clienteId: 'c2', forma: 'fiado', valor: 60, vencimento: '2026-10-20' }),
    lanc({ id: 'f4', forma: 'fiado', valor: 30, vencimento: '2026-10-12' }),
    lanc({ id: 'f5', clienteId: 'c2', forma: 'fiado', valor: 60, vencimento: '2026-09-20', pagoEm: '2026-09-21' }),
    lanc({ id: 'f6', clienteId: 'c3', forma: 'boleto', valor: 60, vencimento: '2026-09-20' })
  ];

  it('junta por cliente, quem tem vencido primeiro', () => {
    const g = fiadosPorCliente(lista, hoje);
    expect(g.map((x) => [x.chave, x.total, x.vencido, x.primeiroVencimento, x.lembradoEm])).toEqual([
      ['c:c1', 200, 100, '2026-10-01', '2026-10-05T10:00:00Z'],
      ['l:f4', 30, 30, '2026-10-12', null],
      ['c:c2', 60, 0, '2026-10-20', null]
    ]);
    expect(g[0].lancamentos.map((l) => l.id)).toEqual(['f1', 'f2']);
    const vencidos = fiadosPorCliente(lista, hoje, true);
    expect(vencidos.map((x) => [x.chave, x.total])).toEqual([
      ['c:c1', 100],
      ['l:f4', 30]
    ]);
  });

  it('a mensagem do lembrete tem valor, vencimento e o Pix', () => {
    const uma = mensagemDoFiado({ oficina: 'Auto Center Serra', cliente: 'Carlos Andrade', itens: [lista[0]], hoje, pix: '000201PIX' }).replace(/\u00a0/g, ' ');
    expect(uma).toBe(
      'Oi, Carlos! Aqui é da Auto Center Serra. Passando para lembrar do valor de R$ 100,00 (parcela 1 de 2) que venceu em 01/10/2026.' +
        '\n\nPara pagar pelo Pix, copie o código abaixo e cole no app do banco, em Pix Copia e Cola:\n000201PIX' +
        '\n\nQualquer dúvida, é só responder esta mensagem. Obrigado!'
    );
    const duas = mensagemDoFiado({ oficina: '', cliente: '', itens: [lista[1], lanc({ valor: 50, vencimento: hoje })], hoje }).replace(/\u00a0/g, ' ');
    expect(duas).toContain('Oi! Aqui é da oficina.');
    expect(duas).toContain('dos valores em aberto: R$ 50,00 que vence hoje e R$ 100,00 (parcela 2 de 2) com vencimento em 01/11/2026. Ao todo, R$ 150,00.');
    expect(duas).not.toContain('Pix');
  });
});

describe('Pix da oficina', () => {
  it('reconhece o tipo da chave guardada', () => {
    expect(tipoDaChavePix('+5521987654321')).toBe('telefone');
    expect(tipoDaChavePix('vendas@oficina.com.br')).toBe('email');
    expect(tipoDaChavePix('Vendas@oficina.com.br')).toBeNull();
    expect(tipoDaChavePix('123e4567-e12b-12d1-a456-426655440000')).toBe('aleatoria');
    expect(tipoDaChavePix('12345678909')).toBe('cpf');
    expect(tipoDaChavePix('12345678000190')).toBe('cnpj');
    expect(tipoDaChavePix('12ABC34501DE35')).toBe('cnpj');
    expect(tipoDaChavePix('(21) 98765-4321')).toBeNull();
    expect(tipoDaChavePix('')).toBeNull();
    expect(chavePixDaOficina({ chavePix: ' 12345678909 ' })).toBe('12345678909');
    expect(chavePixDaOficina({ chavePix: 'qualquer coisa' })).toBeNull();
    expect(chavePixDaOficina({ chavePix: '' })).toBeNull();
    // guardada do jeito que foi digitada (por outra tela): normaliza na hora de usar
    expect(chavePixDaOficina({ chavePix: '(21) 98765-4321' })).toBe('+5521987654321');
    expect(chavePixDaOficina({ chavePix: '12.345.678/0001-90' })).toBe('12345678000190');
    expect(chavePixDaOficina({ chavePix: 'Vendas@Oficina.com.br' })).toBe('vendas@oficina.com.br');
  });

  it('adivinha o tipo do que a pessoa digitou', () => {
    expect(adivinharTipoDaChave('vendas@x.com')).toBe('email');
    expect(adivinharTipoDaChave('123E4567-E12B-12D1-A456-426655440000')).toBe('aleatoria');
    expect(adivinharTipoDaChave('(21) 98765-4321')).toBe('telefone');
    expect(adivinharTipoDaChave('+55 21 98765-4321')).toBe('telefone');
    expect(adivinharTipoDaChave('21 98765-4321')).toBe('telefone');
    expect(adivinharTipoDaChave('123.456.789-09')).toBe('cpf');
    expect(adivinharTipoDaChave('12345678909')).toBe('cpf');
    expect(adivinharTipoDaChave('12.345.678/0001-90')).toBe('cnpj');
    expect(adivinharTipoDaChave('12.ABC.345/01DE-35')).toBe('cnpj');
  });

  it('monta o copia e cola com o valor e confere o CRC', () => {
    const oficina = { chavePix: '+5521987654321', nome: 'Auto Center São José', razaoSocial: '', cidade: 'Guapimirim' };
    const codigo = pixDaOficina(oficina, 150, txidDoFiado('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'))!;
    expect(codigo).toContain('0114+5521987654321');
    expect(codigo).toContain('5406150.00');
    expect(codigo).toContain('5920Auto Center Sao Jose');
    expect(codigo).toContain('6010Guapimirim');
    expect(codigo).toContain('0515FIADOA1B2C3D4E5');
    expect(codigo.slice(-4)).toBe(crc16(codigo.slice(0, -4)));
    expect(pixDaOficina({ ...oficina, razaoSocial: 'Serra Reparos Ltda' }, null)).toContain('5918Serra Reparos Ltda');
    expect(pixDaOficina({ ...oficina, razaoSocial: 'X' }, null)).not.toContain('5406');
    expect(pixDaOficina({ ...oficina, chavePix: '' }, 10)).toBeNull();
  });
});

describe('pedidos da loja no contas a pagar', () => {
  const pedido = (codigo: string, quando: string, fornecedores: (string | undefined)[], total = 200): PedidoEnviado => ({
    codigo,
    quando,
    total,
    itens: fornecedores.map((f, i) => ({ produtoId: i + 1, nome: `Produto ${i}`, quantidade: 1, precoUnitario: total / fornecedores.length, fornecedor: f }))
  });

  it('mostra os pedidos recentes que ainda não viraram conta', () => {
    const pedidos = [pedido('AAA111', '2026-10-15T10:00:00Z', ['Loja Sul']), pedido('BBB222', '2026-10-16T10:00:00Z', ['Loja Sul']), pedido('CCC333', '2026-07-01T10:00:00Z', ['Loja Sul']), pedido('DDD444', '2026-10-10T10:00:00Z', ['Loja Sul'], 0)];
    expect(pedidosSemConta(pedidos, [lanc({ pedidoCodigo: 'AAA111' })], hoje).map((p) => p.codigo)).toEqual(['BBB222']);
  });

  it('a conta leva o código, as lojas e o total', () => {
    const c = contaDoPedido(pedido('EEE555', '2026-10-16T10:00:00Z', ['Loja Sul', 'Lubrificantes Norte', 'Loja Sul', undefined], 300), hoje);
    expect(c).toEqual({ tipo: 'pagar', descricao: 'Pedido EEE555 da loja', valor: 300, vencimento: hoje, forma: null, categoria: 'pecas', favorecido: 'Loja Sul e Lubrificantes Norte', pedidoCodigo: 'EEE555', observacao: '4 itens' });
    expect(contaDoPedido(pedido('F', '2026-10-16T10:00:00Z', [undefined]), hoje).favorecido).toBe('Loja do Revisaí');
    const [l] = gravados(montarLancamentos(c, ids()));
    expect(l).toMatchObject({ pedidoCodigo: 'EEE555', favorecido: 'Loja Sul e Lubrificantes Norte', tipo: 'pagar', valor: 300 });
  });
});
