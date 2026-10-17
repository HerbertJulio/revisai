import { describe, expect, it } from 'vitest';
import { acharPorCodigo, campoDoCodigo, eanDaNota, gtin14, gtinValido, limparCodigo, mesmoCodigo } from '../lib/codigo-barras';
import type { ItemEstoque } from '../lib/tipos';

function item(id: string, extra: Partial<ItemEstoque> = {}): ItemEstoque {
  return { id, nome: id, categoria: 'outros', unidade: 'un', quantidade: 0, minimo: 0, custo: null, preco: null, criadoEm: '', atualizadoEm: '', ...extra };
}

describe('código de barras (GTIN)', () => {
  it('confere o dígito do EAN-13, EAN-8, UPC-A e GTIN-14', () => {
    expect(gtinValido('4006381333931')).toBe(true);
    expect(gtinValido('7891000315507')).toBe(true);
    expect(gtinValido('73513537')).toBe(true);
    expect(gtinValido('036000291452')).toBe(true);
    expect(gtinValido('17891000315504')).toBe(true);
    expect(gtinValido('7891000315508')).toBe(false);
    expect(gtinValido('0000000000000')).toBe(false);
    expect(gtinValido('12345')).toBe(false);
    expect(gtinValido('SEM GTIN')).toBe(false);
    expect(gtinValido(null)).toBe(false);
  });

  it('o "SEM GTIN" da nota não é código de barras', () => {
    expect(eanDaNota('SEM GTIN')).toBeNull();
    expect(eanDaNota('')).toBeNull();
    expect(eanDaNota(' 7891000315507 ')).toBe('7891000315507');
    expect(eanDaNota('7891000315508')).toBeNull();
  });

  it('o mesmo produto em tamanhos diferentes do GTIN', () => {
    expect(gtin14('036000291452')).toBe('00036000291452');
    expect(mesmoCodigo('036000291452', '0036000291452')).toBe(true);
    expect(mesmoCodigo('psl-55', 'PSL55')).toBe(true);
    expect(mesmoCodigo('', '')).toBe(false);
    expect(mesmoCodigo('7891000315507', '7891234567895')).toBe(false);
    expect(limparCodigo(' ab-12.3/4 ')).toBe('AB1234');
  });

  it('acha o item pelo código de barras, pelo código do fabricante ou pelo do fornecedor', () => {
    const estoque = [
      item('oleo', { ean: '7891000315507' }),
      item('filtro', { codigo: 'PSL-55' }),
      item('vela', { codigoFornecedor: 'BKR6E' }),
      item('upc', { ean: '036000291452' })
    ];
    expect(acharPorCodigo(estoque, '7891000315507')?.id).toBe('oleo');
    expect(acharPorCodigo(estoque, 'psl55')?.id).toBe('filtro');
    expect(acharPorCodigo(estoque, 'bkr6e')?.id).toBe('vela');
    expect(acharPorCodigo(estoque, '0036000291452')?.id).toBe('upc');
    expect(acharPorCodigo(estoque, '7891234567895')).toBeNull();
    expect(acharPorCodigo(estoque, '12')).toBeNull();
  });

  it('guarda o GTIN no código de barras e o resto no código do fabricante', () => {
    expect(campoDoCodigo('7891000315507')).toEqual({ ean: '7891000315507' });
    expect(campoDoCodigo('psl 55')).toEqual({ codigo: 'PSL55' });
  });
});
