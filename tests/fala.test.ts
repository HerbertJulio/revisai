import { describe, expect, it } from 'vitest';
import {
  comandoFalado,
  disseNaoSei,
  escolherPorFala,
  kmFalado,
  telefoneFalado,
  modalidadeFalada,
  modeloFalado,
  nomeFalado,
  numeroFalado,
  placaFalada,
  servicosFalados,
  tipoFalado,
  valorFalado
} from '@/lib/fala';

describe('números falados', () => {
  it('lê por extenso e com algarismos', () => {
    expect(numeroFalado('quarenta e cinco mil duzentos e dez')).toBe(45210);
    expect(numeroFalado('45 mil')).toBe(45000);
    expect(numeroFalado('45.210 km')).toBe(45210);
    expect(numeroFalado('45 210')).toBe(45210);
    expect(numeroFalado('cento e vinte mil')).toBe(120000);
    expect(numeroFalado('mil e quinhentos')).toBe(1500);
    expect(numeroFalado('dois mil e dezenove')).toBe(2019);
    expect(numeroFalado('três vírgula cinco')).toBe(3);
    expect(numeroFalado('3,5')).toBe(3.5);
    expect(numeroFalado('sei lá')).toBeNull();
  });

  it('quilometragem e valor', () => {
    expect(kmFalado('tá com 87 mil e 300 quilômetros')).toBe(87300);
    expect(kmFalado('não sei')).toBe('nao_sei');
    expect(kmFalado('nenhuma')).toBe('nao_sei');
    expect(kmFalado('bom dia')).toBeNull();
    expect(valorFalado('cento e cinquenta reais')).toBe(150);
    expect(valorFalado('R$ 89,90')).toBe(89.9);
    expect(disseNaoSei('não lembro')).toBe(true);
  });

  it('telefone falado', () => {
    expect(telefoneFalado('21 98765 4321')).toBe('21987654321');
    expect(telefoneFalado('vinte e um nove oito sete seis cinco quatro três dois um')).toBe('21987654321');
    expect(telefoneFalado('dois um nove nove zero zero zero um zero zero um')).toBe('21990001001');
    expect(telefoneFalado('não sei')).toBeNull();
  });
});

describe('placa falada', () => {
  it('entende a placa junta, soletrada ou com palavras em volta', () => {
    expect(placaFalada('ABC 1D23')).toBe('ABC1D23');
    expect(placaFalada('a placa é abc1d23')).toBe('ABC1D23');
    expect(placaFalada('ABC-1234')).toBe('ABC1234');
    expect(placaFalada('a bê cê um dê dois três')).toBe('ABC1D23');
    expect(placaFalada('placa a b c 1 d 2 3')).toBe('ABC1D23');
    expect(placaFalada('quê erre esse quatro cinco seis sete')).toBe('QRS4567');
    expect(placaFalada('a b e c um dois três quatro')).toBe('ABC1234');
  });

  it('o "e" de ligação e o "ó" de zero', () => {
    expect(placaFalada('efe gê agá um ó dois três')).toBe('FGH1O23');
    expect(placaFalada('a bê cê ó um dois três')).toBe('ABC0123');
    expect(placaFalada('e erre te nove a oito sete')).toBe('ERT9A87');
    expect(placaFalada('não sei a placa')).toBeNull();
  });
});

describe('nome, modelo e serviços', () => {
  it('nome do dono', () => {
    expect(nomeFalado('o dono é o seu Marcos da Silva')).toBe('Marcos da Silva');
    expect(nomeFalado('Fernanda')).toBe('Fernanda');
    expect(nomeFalado('não sei o nome')).toBeNull();
    expect(nomeFalado('sem nome')).toBeNull();
  });

  it('modelo com a marca e o ano', () => {
    expect(modeloFalado('um Onix 2019', 2027)).toEqual({ marca: 'Chevrolet', modelo: 'Onix', ano: 2019 });
    expect(modeloFalado('HB20 dois mil e vinte e dois', 2027)).toEqual({ marca: 'Hyundai', modelo: 'HB20', ano: 2022 });
    expect(modeloFalado('corolla cross', 2027)).toEqual({ marca: 'Toyota', modelo: 'Corolla Cross', ano: null });
    expect(modeloFalado('Fiat Uno Mille 2010', 2027)).toEqual({ marca: 'Fiat', modelo: 'Uno', ano: 2010 });
    expect(modeloFalado('Lifan X60 2015', 2027)).toEqual({ marca: '', modelo: 'Lifan X60', ano: 2015 });
  });

  it('serviços citados', () => {
    expect(servicosFalados('troquei o óleo, o filtro de óleo e o filtro de ar, e alinhei')).toEqual(['troca_oleo', 'filtro_oleo', 'filtro_ar', 'alinhamento']);
    expect(servicosFalados('pastilhas e fluido de freio')).toEqual(['pastilhas', 'fluido_freio']);
    expect(servicosFalados('só o filtro de óleo')).toEqual(['filtro_oleo']);
    expect(servicosFalados('troquei o fluido de freio e as pastilhas')).toEqual(['fluido_freio', 'pastilhas']);
    expect(servicosFalados('filtro do ar condicionado e higienização')).toEqual(['filtro_cabine', 'higienizacao']);
    expect(servicosFalados('nada')).toEqual([]);
  });

  it('comandos, tipo e modalidade', () => {
    expect(comandoFalado('Voltar')).toBe('voltar');
    expect(comandoFalado('pode seguir')).toBe('continuar');
    expect(comandoFalado('sim')).toBe('sim');
    expect(comandoFalado('Onix')).toBeNull();
    expect(tipoFalado('é um orçamento')).toBe('orcamento');
    expect(tipoFalado('ordem de serviço')).toBe('ordem');
    expect(modalidadeFalada('pago, vou cobrar a vistoria')).toBe('pago');
    expect(modalidadeFalada('frio')).toBe('frio');
    expect(modalidadeFalada('não sei')).toBeNull();
  });

  it('escolhe a opção pelo que foi falado, só com folga', () => {
    const opcoes = [
      { id: 'a', texto: 'Lubrax Supera 5W-30 sintético' },
      { id: 'b', texto: 'Mobil Super 5W-30' },
      { id: 'c', texto: 'Ipiranga 20W-50 mineral' }
    ];
    expect(escolherPorFala('usei o lubrax cinco w trinta', opcoes)?.id).toBe('a');
    expect(escolherPorFala('vinte w cinquenta', opcoes)?.id).toBe('c');
    expect(escolherPorFala('5W30', opcoes)).toBeNull();
    expect(escolherPorFala('sei lá', opcoes)).toBeNull();
  });
});
