import { describe, expect, it } from 'vitest';
import type { Recall } from '../lib/registros-oficina';
import {
  anoDoCarro,
  carrosDoRecall,
  fonteValida,
  idDoLembrete,
  lembreteDoRecall,
  LINK_CONSULTA_RECALL,
  mensagemDoRecall,
  modeloCombina,
  modelosDoRecall,
  situacaoNoRecall,
  textoDosAnos,
  tituloDoRecall
} from '../lib/recall';
import type { Veiculo } from '../lib/tipos';

function carro(id: string, extra: Partial<Veiculo>): Veiculo {
  return { id, clienteId: `cli-${id}`, placa: 'ABC1D23', marca: 'Chevrolet', modelo: 'Onix', criadoEm: '', ...extra };
}

const recall: Recall = {
  id: 'r1',
  marca: 'GM',
  modelo: 'Onix, Onix Plus',
  anoDe: 2019,
  anoAte: 2020,
  descricao: 'Possível falha no cinto de segurança traseiro.',
  fonte: 'https://www.chevrolet.com.br/recall',
  criadoEm: '',
  atualizadoEm: ''
};

describe('quais carros entram na campanha', () => {
  it('os modelos da campanha', () => {
    expect(modelosDoRecall('Onix, Onix Plus e Tracker')).toEqual(['Onix', 'Onix Plus', 'Tracker']);
    expect(modelosDoRecall('Onix/Prisma; Spin')).toEqual(['Onix', 'Prisma', 'Spin']);
    expect(modelosDoRecall('Classe E')).toEqual(['Classe E']);
    expect(modelosDoRecall(' , ')).toEqual([]);
  });

  it('o modelo do carro contém todas as palavras de um dos modelos da campanha', () => {
    expect(modeloCombina('Onix', 'Onix Plus')).toBe(true);
    expect(modeloCombina('Onix Plus', 'Onix')).toBe(false);
    expect(modeloCombina('HB20', 'HB20S')).toBe(false);
    expect(modeloCombina('T-Cross', 'TCross 200 TSI')).toBe(true);
    expect(modeloCombina('Gol, Voyage', 'VOYAGE 1.6')).toBe(true);
  });

  it('marca (com apelido), modelo e ano do modelo', () => {
    expect(situacaoNoRecall(recall, carro('a', { anoModelo: 2020, ano: 2019 }))).toBe('sim');
    expect(situacaoNoRecall(recall, carro('b', { marca: 'CHEVROLET', modelo: 'ONIX PLUS', ano: 2019 }))).toBe('sim');
    expect(situacaoNoRecall(recall, carro('c', { anoModelo: 2021, ano: 2020 }))).toBe('nao');
    expect(situacaoNoRecall(recall, carro('d', { ano: 2018 }))).toBe('nao');
    expect(situacaoNoRecall(recall, carro('e', { marca: 'Fiat', anoModelo: 2020 }))).toBe('nao');
    expect(situacaoNoRecall(recall, carro('f', { modelo: 'Tracker', anoModelo: 2020 }))).toBe('nao');
    // sem o ano no cadastro: a oficina confere
    expect(situacaoNoRecall(recall, carro('g', { ano: null }))).toBe('sem_ano');
    // campanha sem anos vale para todos
    expect(situacaoNoRecall({ ...recall, anoDe: null, anoAte: null }, carro('h', {}))).toBe('sim');
    expect(situacaoNoRecall({ ...recall, anoDe: 2020, anoAte: null }, carro('i', { ano: 2025 }))).toBe('sim');
    expect(situacaoNoRecall({ ...recall, anoDe: null, anoAte: 2015 }, carro('j', { ano: 2016 }))).toBe('nao');
    expect(situacaoNoRecall({ ...recall, marca: '' }, carro('k', {}))).toBe('nao');
    expect(anoDoCarro({ ano: 2019, anoModelo: 2020 })).toBe(2020);
  });

  it('a lista dos carros, os de ano certo primeiro', () => {
    const lista = carrosDoRecall(recall, [
      carro('sem-ano', { placa: 'AAA1A11' }),
      carro('fora', { placa: 'BBB1B11', ano: 2015 }),
      carro('dentro', { placa: 'CCC1C11', anoModelo: 2019 })
    ]);
    expect(lista.map((x) => [x.veiculo.id, x.situacao])).toEqual([
      ['dentro', 'sim'],
      ['sem-ano', 'sem_ano']
    ]);
  });
});

describe('lembrete e mensagem', () => {
  it('o lembrete tem id fixo por campanha e carro, e aparece no início', () => {
    expect(lembreteDoRecall(recall, { id: 'v1', clienteId: 'c1' }, '2026-10-17')).toEqual({
      id: 'recall-r1-v1',
      veiculoId: 'v1',
      clienteId: 'c1',
      documentoId: null,
      descricao: 'Recall: Possível falha no cinto de segurança traseiro.',
      motivo: 'recall',
      data: '2026-10-17',
      valorEstimado: null,
      recallId: 'r1',
      situacao: 'aberto',
      avisadoEm: null
    });
    expect(idDoLembrete('r'.repeat(80), 'v'.repeat(80)).length).toBe(100);
  });

  it('a mensagem do WhatsApp leva a consulta oficial', () => {
    const m = mensagemDoRecall({ cliente: 'Ana Souza', oficina: 'Auto Center Serra', recall, veiculo: carro('a', { placa: 'ABC1234', anoModelo: 2020 }) });
    expect(m).toBe(
      [
        'Oi, Ana! Aqui é da Auto Center Serra.',
        'A Chevrolet chamou para recall carros como o seu Onix 2020 (placa ABC-1234): Possível falha no cinto de segurança traseiro.',
        'O reparo é de graça na concessionária. Para confirmar se o seu carro está na lista, dá para consultar pela placa no site do governo:',
        LINK_CONSULTA_RECALL,
        'Qualquer dúvida, é só chamar.'
      ].join('\n')
    );
  });

  it('títulos, anos e links', () => {
    expect(tituloDoRecall(recall)).toBe('Chevrolet Onix e Onix Plus 2019 a 2020');
    expect(textoDosAnos({ anoDe: 2019, anoAte: 2019 })).toBe('2019');
    expect(textoDosAnos({ anoDe: 2019, anoAte: null })).toBe('a partir de 2019');
    expect(textoDosAnos({ anoDe: null, anoAte: 2019 })).toBe('até 2019');
    expect(textoDosAnos({ anoDe: null, anoAte: null })).toBe('');
    expect(fonteValida('www.gov.br/recall')).toBe('https://www.gov.br/recall');
    expect(fonteValida('http://exemplo.com')).toBeNull();
    expect(fonteValida('javascript:alert(1)')).toBeNull();
    expect(fonteValida('')).toBeNull();
    expect(LINK_CONSULTA_RECALL.startsWith('https://portalservicos.senatran.serpro.gov.br/')).toBe(true);
  });
});
