// Leitura grátis da placa: tipo (antiga/Mercosul) e estado de emplacamento pelas faixas de letras.

import { describe, expect, it } from 'vitest';
import { lerPlacaGratis, tipoDaPlaca, ufDaPlaca } from '@/lib/placa-uf';

describe('tipo da placa', () => {
  it('reconhece a antiga e a Mercosul', () => {
    expect(tipoDaPlaca('ABC-1234')).toBe('antiga');
    expect(tipoDaPlaca('ABC1D23')).toBe('mercosul');
    expect(tipoDaPlaca('AB1234')).toBeNull();
    expect(tipoDaPlaca('ABCD123')).toBeNull();
  });
});

describe('estado de emplacamento', () => {
  it('acerta faixas conhecidas', () => {
    expect(ufDaPlaca('AAA0000')).toBe('PR');
    expect(ufDaPlaca('BIP0000')).toBe('SP');
    expect(ufDaPlaca('KNA1234')).toBe('RJ');
    expect(ufDaPlaca('HPA1234')).toBe('MA');
  });

  it('serve de melhor esforço para a Mercosul (mesmas faixas de letras)', () => {
    expect(ufDaPlaca('BIP1D23')).toBe('SP');
  });

  it('volta null quando não dá para afirmar', () => {
    expect(ufDaPlaca('ZZZ9999')).toBeNull();
    expect(ufDaPlaca('invalida')).toBeNull();
  });
});

describe('leitura completa', () => {
  it('junta tudo numa vez', () => {
    expect(lerPlacaGratis('kna-1234')).toEqual({ placa: 'KNA1234', formatada: 'KNA-1234', tipo: 'antiga', valida: true, uf: 'RJ' });
  });
});
