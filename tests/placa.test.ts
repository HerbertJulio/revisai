import { describe, expect, it } from 'vitest';
import {
  camposDaPlaca,
  combustivelDoTexto,
  esquemaDadosPlaca,
  lerConsultaDePlaca,
  mascararChassi,
  mensagemDaCota,
  montarDados,
  motorDaVersao,
  nomeDaMarca,
  placaCanonica,
  placaParaConsulta,
  resumoDaPlaca,
  separarModelo,
  textoDoUso,
  tituloDeNome
} from '../lib/placa';

describe('placa', () => {
  it('aceita os dois padrões, com traço, espaço e minúsculas', () => {
    expect(placaParaConsulta('abc-1234')).toBe('ABC1234');
    expect(placaParaConsulta(' rio 2a19 ')).toBe('RIO2A19');
    expect(placaParaConsulta('AB1234')).toBeNull();
    expect(placaParaConsulta('ABCD123')).toBeNull();
    expect(placaParaConsulta('')).toBeNull();
  });

  it('a placa antiga e a Mercosul do mesmo carro dão a mesma chave', () => {
    expect(placaCanonica('ABC-1234')).toBe('ABC1C34');
    expect(placaCanonica('ABC1C34')).toBe('ABC1C34');
    expect(placaCanonica('KXY0987')).toBe('KXY0J87');
    expect(placaCanonica('xx')).toBeNull();
  });
});

describe('textos do documento do carro', () => {
  it('marca com o nome que a oficina usa', () => {
    expect(nomeDaMarca('CHEVROLET')).toBe('Chevrolet');
    expect(nomeDaMarca('GM - Chevrolet')).toBe('Chevrolet');
    expect(nomeDaMarca('chev')).toBe('Chevrolet');
    expect(nomeDaMarca('VW - VolksWagen')).toBe('Volkswagen');
    expect(nomeDaMarca('CITROEN')).toBe('Citroën');
    expect(nomeDaMarca('M.BENZ')).toBe('Mercedes-Benz');
    expect(nomeDaMarca('CAOA CHERY')).toBe('Caoa Chery');
    expect(nomeDaMarca('Great Wall')).toBe('GWM');
    expect(nomeDaMarca('ALFA ROMEO')).toBe('Alfa Romeo');
    expect(nomeDaMarca('')).toBe('');
  });

  it('separa o nome do modelo da versão e tira a marca do começo', () => {
    expect(separarModelo('ONIX 1.0MT LT')).toEqual({ modelo: 'Onix', versao: '1.0MT LT' });
    expect(separarModelo('CHEV/ONIX PLUS 1.0 TURBO PREMIER')).toEqual({ modelo: 'Onix Plus', versao: '1.0 Turbo Premier' });
    expect(separarModelo('VW/GOL 1.6 MSI')).toEqual({ modelo: 'Gol', versao: '1.6 MSI' });
    expect(separarModelo('I/HYUNDAI HB20S 1.0M COMFORT', 'Hyundai')).toEqual({ modelo: 'HB20S', versao: '1.0M Comfort' });
    expect(separarModelo('T-CROSS 200 TSI', 'VW')).toEqual({ modelo: 'T-Cross', versao: '200 TSI' });
    expect(separarModelo('ONIX PLUS PREMIER')).toEqual({ modelo: 'Onix Plus', versao: 'Premier' });
    expect(separarModelo('Kwid')).toEqual({ modelo: 'Kwid', versao: null });
    expect(separarModelo('FIAT ARGO DRIVE 1.0', 'Fiat')).toEqual({ modelo: 'Argo Drive', versao: '1.0' });
  });

  it('o motor sai da versão', () => {
    expect(motorDaVersao('1.0MT LT')).toBe('1.0');
    expect(motorDaVersao('ONIX PLUS 1.0 TURBO')).toBe('1.0 turbo');
    expect(motorDaVersao('2.0 TSI')).toBe('2.0 turbo');
    expect(motorDaVersao('T-CROSS 200 TSI')).toBe('1.0 turbo');
    expect(motorDaVersao('1,6 16V')).toBe('1.6');
    expect(motorDaVersao('COMFORT')).toBeNull();
    expect(motorDaVersao(null)).toBeNull();
  });

  it('combustível do documento no tipo do app', () => {
    expect(combustivelDoTexto('ALCOOL/GASOLINA')).toBe('flex');
    expect(combustivelDoTexto('Flex')).toBe('flex');
    expect(combustivelDoTexto('GASOLINA')).toBe('gasolina');
    expect(combustivelDoTexto('ÁLCOOL')).toBe('etanol');
    expect(combustivelDoTexto('DIESEL')).toBe('diesel');
    expect(combustivelDoTexto('GASOLINA/GAS NATURAL VEICULAR')).toBe('gnv');
    expect(combustivelDoTexto('GASOLINA/ELETRICO')).toBe('hibrido');
    expect(combustivelDoTexto('ELETRICO/FONTE EXTERNA')).toBe('eletrico');
    expect(combustivelDoTexto('')).toBeNull();
    expect(combustivelDoTexto('QUEROSENE')).toBeNull();
  });

  it('o chassi só fica mascarado', () => {
    expect(mascararChassi('9BGKS48U0LB123456')).toBe('***********123456');
    expect(mascararChassi('*****************3456')).toBe('*************3456');
    expect(mascararChassi('curto')).toBeNull();
    expect(mascararChassi(null)).toBeNull();
  });

  it('nomes de cidade e cor', () => {
    expect(tituloDeNome('RIO DE JANEIRO')).toBe('Rio de Janeiro');
    expect(tituloDeNome('prata')).toBe('Prata');
    expect(tituloDeNome('')).toBe('');
  });
});

describe('resposta da consultadeplaca.net', () => {
  const achou = {
    object: 'lookup',
    id: 'lkp_123',
    status: 'completed',
    plate: 'TST0001',
    result: 'found',
    price: { amount: '0.00', currency: 'BRL' },
    free: true,
    vehicle: {
      plate: 'TST0001',
      brand: 'CHEVROLET',
      model: 'ONIX',
      version: '1.0MT LT',
      manufacture_year: 2019,
      model_year: 2020,
      color: 'PRATA',
      fuel: 'ALCOOL/GASOLINA',
      type: 'AUTOMOVEL',
      city: 'GUAPIMIRIM',
      state: 'rj',
      theft: false,
      fipe: { code: '004478-1', amount: '58123.00' }
    },
    created_at: '2026-10-17T10:00:00-03:00'
  };

  it('o carro achado vira os dados do app', () => {
    const r = lerConsultaDePlaca(achou, 'TST0001');
    expect(r).toEqual({
      tipo: 'achou',
      dados: {
        placa: 'TST0001',
        marca: 'Chevrolet',
        modelo: 'Onix',
        versao: '1.0MT LT',
        motor: '1.0',
        ano: 2019,
        anoModelo: 2020,
        cor: 'Prata',
        combustivel: 'flex',
        municipio: 'Guapimirim',
        uf: 'RJ',
        chassi: null,
        fipe: { codigo: '004478-1', valor: 58123 }
      }
    });
    expect(esquemaDadosPlaca.safeParse(r && r.tipo === 'achou' ? r.dados : null).success).toBe(true);
  });

  it('não achou, resposta estranha e campos faltando', () => {
    expect(lerConsultaDePlaca({ result: 'not_found', vehicle: null }, 'TST0002')).toEqual({ tipo: 'nao_achou' });
    expect(lerConsultaDePlaca({ result: 'found', vehicle: null }, 'X')).toBeNull();
    expect(lerConsultaDePlaca('erro', 'X')).toBeNull();
    expect(lerConsultaDePlaca({ result: 'found', vehicle: { brand: '', model: '' } }, 'ABC1234')).toEqual({ tipo: 'nao_achou' });
    const pouco = lerConsultaDePlaca({ result: 'found', vehicle: { brand: 'FIAT', model: 'UNO', model_year: 'x', fipe: { code: 'errado', amount: null } } }, 'abc1234');
    expect(pouco).toMatchObject({ tipo: 'achou', dados: { placa: 'ABC1234', marca: 'Fiat', modelo: 'Uno', ano: null, anoModelo: null, fipe: null, cor: null, uf: null } });
  });

  it('o que preenche no cadastro e o resumo para a pessoa confirmar', () => {
    const d = montarDados('ABC1D23', { marca: 'VW', modelo: 'GOL 1.6 MSI', ano: 2018, anoModelo: 2018, cor: 'BRANCA', combustivel: 'FLEX', municipio: 'TERESOPOLIS', uf: 'RJ' });
    expect(camposDaPlaca(d)).toEqual({ marca: 'Volkswagen', modelo: 'Gol', motor: '1.6', ano: '2018', anoModelo: '2018', cor: 'Branca', combustivel: 'flex' });
    expect(resumoDaPlaca(d)).toEqual({ titulo: 'Volkswagen Gol 1.6 MSI', detalhe: '2018, branca, flex. Emplacado em Teresopolis/RJ.' });
    const doisAnos = montarDados('ABC1D23', { marca: 'FIAT', modelo: 'ARGO', ano: 2021, anoModelo: 2022 });
    expect(resumoDaPlaca(doisAnos).detalhe).toBe('2021/2022.');
    expect(camposDaPlaca({ ...doisAnos, ano: null })).toMatchObject({ ano: '2022', anoModelo: '2022' });
  });
});

describe('cota do mês', () => {
  it('mensagens', () => {
    expect(mensagemDaCota({ plano: 'gratis', limite: 20 })).toContain('No Pro são 200');
    expect(mensagemDaCota({ plano: 'pro', limite: 200 })).toContain('voltam no dia 1º');
    expect(textoDoUso({ plano: 'gratis', usado: 5, limite: 20 })).toBe('Restam 15 consultas de placa este mês.');
    expect(textoDoUso({ plano: 'gratis', usado: 19, limite: 20 })).toBe('Resta 1 consulta de placa este mês.');
    expect(textoDoUso({ plano: 'pro', usado: 210, limite: 200 })).toBe('Acabaram as consultas de placa deste mês.');
  });
});
