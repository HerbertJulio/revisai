import { describe, expect, it } from 'vitest';
import {
  codigoFipeValido,
  escolherPreco,
  esquemaPrecoFipe,
  filtrarModelos,
  fipeDesatualizada,
  fipeDoPreco,
  lerCodigoFipe,
  lerMesReferencia,
  lerOpcoesBrasilApi,
  lerPrecoBrasilApi,
  lerPrecosBrasilApi,
  lerValorFipe,
  marcaFipeDoCarro,
  mesDeBrasilia,
  nomeDaReferencia,
  nomeDoAnoFipe,
  type PrecoFipe
} from '../lib/fipe';

// Como a BrasilAPI responde em /api/fipe/preco/v1/{codigoFipe}
const PRECOS = [
  { valor: 'R$ 61.512,00', marca: 'GM - Chevrolet', modelo: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', anoModelo: 2020, combustivel: 'Gasolina', codigoFipe: '004478-1', mesReferencia: 'outubro de 2026 ', tipoVeiculo: 1, siglaCombustivel: 'G', dataConsulta: 'sexta-feira, 17 de outubro de 2026 10:00' },
  { valor: 'R$ 58.123,00', marca: 'GM - Chevrolet', modelo: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', anoModelo: 2019, combustivel: 'Gasolina', codigoFipe: '004478-1', mesReferencia: 'outubro de 2026 ', tipoVeiculo: 1, siglaCombustivel: 'G', dataConsulta: '' },
  { valor: 'R$ 58.900,00', marca: 'GM - Chevrolet', modelo: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', anoModelo: 2019, combustivel: 'Flex', codigoFipe: '004478-1', mesReferencia: 'outubro de 2026 ', tipoVeiculo: 1, siglaCombustivel: 'F', dataConsulta: '' },
  { valor: 'R$ 89.990,00', marca: 'GM - Chevrolet', modelo: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', anoModelo: 32000, combustivel: 'Flex', codigoFipe: '004478-1', mesReferencia: 'outubro de 2026 ', tipoVeiculo: 1, siglaCombustivel: 'F', dataConsulta: '' }
];

describe('respostas da FIPE', () => {
  it('lê valor, mês de referência e zero km', () => {
    expect(lerValorFipe('R$ 61.512,00')).toBe(61512);
    expect(lerValorFipe('R$ 6.022,50')).toBe(6022.5);
    expect(lerValorFipe('58123.00')).toBe(58123);
    expect(lerValorFipe(1234.567)).toBe(1234.57);
    expect(lerValorFipe('')).toBeNull();
    expect(lerValorFipe('R$ 0,00')).toBeNull();
    expect(lerMesReferencia('outubro de 2026 ')).toBe('2026-10');
    expect(lerMesReferencia('março de 2027')).toBe('2027-03');
    expect(lerMesReferencia('marco de 2027')).toBe('2027-03');
    expect(lerMesReferencia('2026-09')).toBe('2026-09');
    expect(lerMesReferencia('tabela antiga')).toBe('tabela antiga');
    expect(nomeDaReferencia('2026-10')).toBe('outubro de 2026');
    expect(nomeDaReferencia('qualquer')).toBe('qualquer');
  });

  it('a lista de preços de um código', () => {
    const p = lerPrecosBrasilApi(PRECOS);
    expect(p).toHaveLength(4);
    expect(p[0]).toEqual({ codigo: '004478-1', marca: 'GM - Chevrolet', modelo: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.', anoModelo: 2020, zeroKm: false, combustivel: 'Gasolina', valor: 61512, referencia: '2026-10' });
    expect(p[3]).toMatchObject({ anoModelo: null, zeroKm: true });
    expect(p.every((x) => esquemaPrecoFipe.safeParse(x).success)).toBe(true);
    // o detalhe (um objeto só) e o que não é preço
    expect(lerPrecosBrasilApi(PRECOS[0])).toHaveLength(1);
    expect(lerPrecosBrasilApi({ message: 'Código fipe inválido' })).toEqual([]);
    expect(lerPrecosBrasilApi(null)).toEqual([]);
    expect(lerPrecoBrasilApi({ ...PRECOS[0], codigoFipe: '123' })).toBeNull();
  });

  it('marcas, modelos e anos', () => {
    expect(lerOpcoesBrasilApi([{ nome: 'GM - Chevrolet', valor: '23' }, { nome: 'Fiat', valor: 21 }, { nome: '', valor: '1' }])).toEqual([
      { codigo: '23', nome: 'GM - Chevrolet' },
      { codigo: '21', nome: 'Fiat' }
    ]);
    expect(lerOpcoesBrasilApi([{ modelo: 'ONIX HATCH LT 1.0', valor: '4478' }])).toEqual([{ codigo: '4478', nome: 'ONIX HATCH LT 1.0' }]);
    expect(lerOpcoesBrasilApi([{ nome: '2019 Gasolina', valor: '2019-1' }])).toEqual([{ codigo: '2019-1', nome: '2019 Gasolina' }]);
    expect(lerOpcoesBrasilApi({})).toEqual([]);
  });

  it('código FIPE', () => {
    expect(codigoFipeValido('004478-1')).toBe(true);
    expect(codigoFipeValido('0044781')).toBe(false);
    expect(lerCodigoFipe('004478 1')).toBe('004478-1');
    expect(lerCodigoFipe('0044781')).toBe('004478-1');
    expect(lerCodigoFipe('12')).toBeNull();
  });
});

describe('o preço que vale para o carro', () => {
  const precos = lerPrecosBrasilApi(PRECOS);

  it('pelo ano do modelo; empatando, pelo combustível', () => {
    expect(escolherPreco(precos, { anoModelo: 2020 }).escolhido?.valor).toBe(61512);
    expect(escolherPreco(precos, { anoModelo: 2019, combustivel: 'flex' }).escolhido?.valor).toBe(58900);
    expect(escolherPreco(precos, { anoModelo: 2019, combustivel: 'gasolina' }).escolhido?.valor).toBe(58123);
    // com GNV a FIPE é a do carro a gasolina
    expect(escolherPreco(precos, { anoModelo: 2019, combustivel: 'gnv' }).escolhido?.valor).toBe(58123);
  });

  it('sem o combustível certo, a pessoa escolhe entre os do ano', () => {
    const r = escolherPreco(precos, { anoModelo: 2019, combustivel: 'diesel' });
    expect(r.escolhido).toBeNull();
    expect(r.opcoes.map((p) => p.valor)).toEqual([58900, 58123]);
  });

  it('sem o ano do modelo, tenta o de fabricação e o seguinte', () => {
    expect(escolherPreco(precos, { ano: 2019, combustivel: 'flex' }).escolhido?.valor).toBe(58900);
    expect(escolherPreco(precos, { ano: 2019 }).escolhido).toBeNull();
    // fabricado em 2019, modelo 2020
    expect(escolherPreco(precos.filter((p) => p.anoModelo !== 2019), { ano: 2019 }).escolhido?.valor).toBe(61512);
  });

  it('sem ano nenhum, mostra todas as opções (as mais novas primeiro)', () => {
    const r = escolherPreco(precos, {});
    expect(r.escolhido).toBeNull();
    expect(r.opcoes.map((p) => nomeDoAnoFipe(p))).toEqual(['Zero km Flex', '2020 Gasolina', '2019 Flex', '2019 Gasolina']);
    expect(escolherPreco([precos[0]], {}).escolhido?.valor).toBe(61512);
    expect(escolherPreco([], { anoModelo: 2019 })).toEqual({ escolhido: null, opcoes: [] });
  });
});

describe('o que fica no carro', () => {
  it('código, valor, referência e quando consultou', () => {
    const p = lerPrecosBrasilApi(PRECOS)[0] as PrecoFipe;
    const agora = new Date('2026-10-17T13:00:00.000Z');
    expect(fipeDoPreco(p, agora)).toEqual({ codigo: '004478-1', valor: 61512, referencia: '2026-10', consultadoEm: '2026-10-17T13:00:00.000Z' });
    expect(fipeDesatualizada({ referencia: '2026-09' }, agora)).toBe(true);
    expect(fipeDesatualizada({ referencia: '2026-10' }, agora)).toBe(false);
    expect(fipeDesatualizada({ referencia: 'texto' }, agora)).toBe(false);
    expect(fipeDesatualizada(null, agora)).toBe(false);
  });

  it('o mês vira à meia-noite de Brasília, não à do servidor', () => {
    expect(mesDeBrasilia(new Date('2026-11-01T02:00:00.000Z'))).toBe('2026-10');
    expect(mesDeBrasilia(new Date('2026-11-01T03:00:00.000Z'))).toBe('2026-11');
  });
});

describe('achar a marca e o modelo na FIPE', () => {
  const marcas = [
    { codigo: '21', nome: 'Fiat' },
    { codigo: '23', nome: 'GM - Chevrolet' },
    { codigo: '59', nome: 'VW - VolksWagen' }
  ];

  it('a marca do carro', () => {
    expect(marcaFipeDoCarro(marcas, 'Chevrolet')?.codigo).toBe('23');
    expect(marcaFipeDoCarro(marcas, 'VW')?.codigo).toBe('59');
    expect(marcaFipeDoCarro(marcas, 'Ford')).toBeNull();
    expect(marcaFipeDoCarro(marcas, '')).toBeNull();
  });

  it('os modelos mais parecidos primeiro', () => {
    const modelos = [
      { codigo: '1', nome: 'ONIX HATCH LT 1.0 12V Flex 5p Mec.' },
      { codigo: '2', nome: 'ONIX PLUS 1.0 Turbo Flex Aut.' },
      { codigo: '3', nome: 'TRACKER 1.0 Turbo Flex Aut.' },
      { codigo: '4', nome: 'CRUZE LT 1.4 Turbo' }
    ];
    expect(filtrarModelos(modelos, 'Onix Plus').map((m) => m.codigo)).toEqual(['2', '1']);
    expect(filtrarModelos(modelos, 'onix').map((m) => m.codigo)).toEqual(['1', '2']);
    expect(filtrarModelos(modelos, '')).toHaveLength(4);
    expect(filtrarModelos(modelos, 'gol')).toEqual([]);
  });
});
