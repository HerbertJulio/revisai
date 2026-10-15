import { describe, expect, it } from 'vitest';
import { codigoPix, crc16, normalizarChavePix, txidPix } from '@/lib/pix';

describe('Pix copia e cola', () => {
  it('bate com o exemplo do manual do BR Code', () => {
    const codigo = codigoPix({ chave: '123e4567-e12b-12d1-a456-426655440000', nome: 'Fulano de Tal', cidade: 'BRASILIA' });
    expect(codigo).toBe('00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
    expect(crc16('123456789')).toBe('29B1');
  });

  it('com valor, identificador e nome com acento', () => {
    const codigo = codigoPix({ chave: '+5521987654321', nome: 'Distribuidora São João Ltda', cidade: 'Niterói', valor: 239.6, txid: 'RVS-ABC123-12' });
    expect(codigo).toContain('5406239.60');
    expect(codigo).toContain('5925Distribuidora Sao Joao Lt');
    expect(codigo).toContain('6007Niteroi');
    expect(codigo).toContain('62150511RVSABC12312');
    const semCrc = codigo.slice(0, -4);
    expect(codigo.slice(-4)).toBe(crc16(semCrc));
  });

  it('normaliza a chave pelo tipo', () => {
    expect(normalizarChavePix('cnpj', '12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizarChavePix('cnpj', '12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
    expect(normalizarChavePix('cnpj', '12.ABC.345/01DE-3X')).toBeNull();
    expect(normalizarChavePix('cpf', '123.456.789-09')).toBe('12345678909');
    expect(normalizarChavePix('telefone', '(21) 98765-4321')).toBe('+5521987654321');
    expect(normalizarChavePix('telefone', '+55 21 98765-4321')).toBe('+5521987654321');
    expect(normalizarChavePix('email', 'Vendas@Loja.com.br')).toBe('vendas@loja.com.br');
    expect(normalizarChavePix('aleatoria', '123E4567-E12B-12D1-A456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000');
    expect(normalizarChavePix('cpf', '123')).toBeNull();
    expect(txidPix('')).toBe('***');
  });
});

describe('chave Pix na tela', () => {
  it('formata CNPJ, CPF e celular', async () => {
    const { formatarChavePix } = await import('@/lib/pix');
    expect(formatarChavePix('cnpj', '12345678000190')).toBe('12.345.678/0001-90');
    expect(formatarChavePix('cnpj', '12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
    expect(formatarChavePix('cpf', '12345678909')).toBe('123.456.789-09');
    expect(formatarChavePix('telefone', '+5521987654321')).toBe('(21) 98765-4321');
    expect(formatarChavePix('email', 'vendas@loja.com.br')).toBe('vendas@loja.com.br');
  });
});
