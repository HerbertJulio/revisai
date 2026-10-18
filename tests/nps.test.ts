import { describe, expect, it } from 'vitest';
import { categoriaDaNota, contarNps, devePerguntar, lerResumoNps, npsDe, porcentagem } from '../lib/nps';

describe('conta do NPS', () => {
  it('promotores 9 e 10, neutros 7 e 8, detratores de 0 a 6', () => {
    expect([0, 6, 7, 8, 9, 10].map(categoriaDaNota)).toEqual(['detrator', 'detrator', 'neutro', 'neutro', 'promotor', 'promotor']);
  });

  it('porcentagem de promotores menos a de detratores', () => {
    expect(contarNps([10, 9, 9, 8, 7, 6, 3, 10])).toEqual({ respostas: 8, promotores: 4, neutros: 2, detratores: 2, nps: 25 });
    expect(contarNps([10, 10])).toMatchObject({ nps: 100 });
    expect(contarNps([0, 1, 2])).toMatchObject({ nps: -100 });
    expect(contarNps([])).toEqual({ respostas: 0, promotores: 0, neutros: 0, detratores: 0, nps: null });
    // nota fora de 0 a 10 não conta
    expect(contarNps([11, -1, 9.5, 9])).toMatchObject({ respostas: 1, nps: 100 });
  });

  it('arredonda como o banco (o meio vai para longe do zero)', () => {
    expect(npsDe(1, 0, 8)).toBe(13);
    expect(npsDe(0, 1, 8)).toBe(-13);
    expect(npsDe(1, 0, 3)).toBe(33);
    expect(npsDe(0, 0, 0)).toBeNull();
    expect(porcentagem(1, 3)).toBe('33%');
    expect(porcentagem(1, 0)).toBe('0%');
  });
});

describe('quando perguntar', () => {
  const agora = new Date('2026-10-17T12:00:00.000Z');
  const ha = (dias: number) => new Date(agora.getTime() - dias * 86_400_000).toISOString();

  it('só depois de 30 dias na oficina', () => {
    expect(devePerguntar({ membroDesde: ha(29), ultimaResposta: null, ultimaDispensa: null, agora })).toBe(false);
    expect(devePerguntar({ membroDesde: ha(30), ultimaResposta: null, ultimaDispensa: null, agora })).toBe(true);
    expect(devePerguntar({ membroDesde: null, ultimaResposta: null, ultimaDispensa: null, agora })).toBe(false);
  });

  it('de novo 90 dias depois de responder ou dispensar', () => {
    expect(devePerguntar({ membroDesde: ha(400), ultimaResposta: ha(89), ultimaDispensa: null, agora })).toBe(false);
    expect(devePerguntar({ membroDesde: ha(400), ultimaResposta: ha(90), ultimaDispensa: null, agora })).toBe(true);
    expect(devePerguntar({ membroDesde: ha(400), ultimaResposta: ha(200), ultimaDispensa: ha(10), agora })).toBe(false);
  });
});

describe('resumo que vem do banco', () => {
  it('lê o formato do nps_resumo', () => {
    const r = lerResumoNps({
      total: { respostas: 3, promotores: 2, neutros: 0, detratores: 1, nps: 33 },
      meses: [{ mes: '2026-10', respostas: 3, promotores: 2, neutros: 0, detratores: 1, nps: 33 }],
      notas: [{ nota: 10, respostas: 2 }],
      comentarios: [{ nota: 3, comentario: 'Falta boleto', criadoEm: '2026-10-17T12:00:00Z', oficina: 'Oficina X', loja: null }]
    });
    expect(r?.total.nps).toBe(33);
    expect(r?.comentarios[0].oficina).toBe('Oficina X');
    expect(lerResumoNps({ total: {}, meses: [], comentarios: [] })).toBeNull();
    expect(lerResumoNps(null)).toBeNull();
  });
});
