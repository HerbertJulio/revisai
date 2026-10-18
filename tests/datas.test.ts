// O dia em Brasília dos instantes que vêm do banco e do aparelho (em UTC): à noite no Brasil, o dia
// em UTC já é o seguinte, e a tela não pode mostrar a compra das 21h47 como de amanhã.

import { describe, expect, it } from 'vitest';
import { diaEmBrasilia, formatarData, formatarDataCurta, formatarDataExtensa } from '@/lib/datas';
import { dataCurta } from '@/lib/equipe-dados';
import { dataCurta as dataCurtaDaLoja } from '@/lib/loja/comum';

describe('dia em Brasília', () => {
  it('instantes com fuso viram o dia de Brasília', () => {
    expect(diaEmBrasilia('2026-10-18T00:47:12.345Z')).toBe('2026-10-17');
    expect(diaEmBrasilia('2026-10-18T00:47:12.345678+00:00')).toBe('2026-10-17');
    expect(diaEmBrasilia('2026-10-18 00:47:12+00')).toBe('2026-10-17');
    expect(diaEmBrasilia('2026-10-18T03:00:00Z')).toBe('2026-10-18');
    expect(diaEmBrasilia(Date.UTC(2026, 9, 18, 2, 59))).toBe('2026-10-17');
    expect(diaEmBrasilia(new Date('2026-10-18T12:00:00Z'))).toBe('2026-10-18');
  });

  it('data de calendário e hora sem fuso ficam como estão', () => {
    expect(diaEmBrasilia('2026-10-17')).toBe('2026-10-17');
    expect(diaEmBrasilia('2026-10-20T01:00')).toBe('2026-10-20');
    expect(diaEmBrasilia('2026-10-20T01:00:00')).toBe('2026-10-20');
  });

  it('os formatos de data usam o dia de Brasília', () => {
    expect(formatarData('2026-10-18T00:47:00Z')).toBe('17/10/2026');
    expect(formatarData('2026-10-17')).toBe('17/10/2026');
    expect(formatarDataCurta('2026-10-18T00:47:00Z')).toBe('17/10');
    expect(formatarDataExtensa('2026-10-18T00:47:00Z', '2026-10-17')).toBe('17 out');
    expect(dataCurta('2026-10-18T00:47:00+00:00', '2026-10-17')).toBe('17/10');
    expect(dataCurtaDaLoja('2026-10-18T00:47:00+00:00', '2026-10-17')).toBe('17/10');
    expect(formatarData('')).toBe('');
  });
});
