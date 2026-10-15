import { describe, expect, it } from 'vitest';
import { calcularVencimento, estimarRodagem, kmEstimado, pontosDoVeiculo } from '@/lib/agenda';
import { diasEntre, formatarData, formatarDiaHora, formatarHora, lerDataBr, relativo, somarMeses } from '@/lib/datas';

describe('datas', () => {
  it('soma meses sem estourar o fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-10-13', 12)).toBe('2027-10-13');
    expect(somarMeses('2026-10-13', 6)).toBe('2027-04-13');
  });

  it('conta dias e escreve datas', () => {
    expect(diasEntre('2026-10-13', '2026-10-22')).toBe(9);
    expect(formatarData('2026-10-22')).toBe('22/10/2026');
    expect(lerDataBr('5/3/2027')).toBe('2027-03-05');
    expect(lerDataBr('31/02/2027')).toBeNull();
    expect(relativo(0)).toBe('hoje');
    expect(relativo(9)).toBe('em 9 dias');
    expect(relativo(-3)).toBe('há 3 dias');
  });
});

describe('hora num fuso fixo (o que é montado no servidor)', () => {
  const fuso = 'America/Sao_Paulo';
  it('a mesma hora no servidor (UTC) e no navegador', () => {
    expect(formatarHora('2026-10-15T05:55:00Z', fuso)).toBe('02:55');
    expect(formatarHora('2026-10-15T03:00:00Z', fuso)).toBe('00:00');
    const agora = new Date('2026-10-15T12:00:00Z');
    expect(formatarDiaHora('2026-10-17T05:55:00Z', agora, fuso)).toBe('17/10 às 02:55');
    expect(formatarDiaHora('2026-10-16T02:30:00Z', agora, fuso)).toBe('hoje às 23:30');
    expect(formatarDiaHora('2026-10-16T03:30:00Z', agora, fuso)).toBe('amanhã às 00:30');
  });
});

describe('rodagem', () => {
  it('usa a rodagem informada antes do histórico', () => {
    const r = estimarRodagem([{ data: '2026-01-01', km: 10000 }, { data: '2026-07-01', km: 16000 }], { kmMes: 2000 }, 1000, '2026-10-13');
    expect(r.origem).toBe('informada');
    expect(r.kmMes).toBe(2000);
  });

  it('calcula pelo histórico quando há pelo menos 30 dias entre as leituras', () => {
    const r = estimarRodagem([{ data: '2026-01-01', km: 10000 }, { data: '2026-07-01', km: 16000 }], {}, 1000, '2026-10-13');
    expect(r.origem).toBe('historico');
    expect(r.kmDia).toBeCloseTo(6000 / 181, 3);
  });

  it('cai no padrão da oficina sem histórico', () => {
    const r = estimarRodagem([{ data: '2026-10-01', km: 40000 }], {}, 1200, '2026-10-13');
    expect(r.origem).toBe('padrao');
    expect(r.kmMes).toBe(1200);
  });

  it('ordena as leituras e estima o km de hoje', () => {
    const pontos = pontosDoVeiculo(
      'v1',
      [{ id: 'a', veiculoId: 'v1', data: '2026-06-01', km: 30000, itens: [], criadoEm: '' }],
      [{ id: 'l', veiculoId: 'v1', data: '2026-01-01', km: 25000 }]
    );
    expect(pontos.map((p) => p.km)).toEqual([25000, 30000]);
    expect(kmEstimado(pontos, 30, '2026-06-11')).toBe(30300);
  });
});

describe('vencimento', () => {
  it('vence pela data quando o carro roda pouco', () => {
    const v = calcularVencimento({ data: '2026-01-10', km: 40000 }, { km: 10000, meses: 6 }, [], 10, '2026-06-01');
    expect(v.dataLimite).toBe('2026-07-10');
    expect(v.motivo).toBe('tempo');
    expect(v.dataPrevista).toBe('2026-07-10');
    expect(v.diasRestantes).toBe(39);
  });

  it('vence pelo km quando o carro roda muito', () => {
    // 100 km por dia: 10.000 km em 100 dias, antes dos 12 meses
    const v = calcularVencimento({ data: '2026-01-01', km: 40000 }, { km: 10000, meses: 12 }, [], 100, '2026-03-01');
    expect(v.motivo).toBe('km');
    expect(v.dataPrevista).toBe('2026-04-11');
    expect(v.kmLimite).toBe(50000);
    expect(v.kmHoje).toBe(45900);
    expect(v.kmRestante).toBe(4100);
  });

  it('usa a leitura mais recente para prever o km', () => {
    const pontos = [
      { data: '2026-01-01', km: 40000 },
      { data: '2026-02-01', km: 48000 }
    ];
    const v = calcularVencimento({ data: '2026-01-01', km: 40000 }, { km: 10000, meses: 12 }, pontos, 50, '2026-02-10');
    expect(v.dataPorKm).toBe('2026-03-13');
    expect(v.kmHoje).toBe(48450);
  });

  it('serviço só por tempo (fluido de freio)', () => {
    const v = calcularVencimento({ data: '2024-10-01', km: 30000 }, { km: null, meses: 24 }, [], 30, '2026-10-13');
    expect(v.kmLimite).toBeNull();
    expect(v.dataPrevista).toBe('2026-10-01');
    expect(v.diasRestantes).toBe(-12);
  });

  it('sem prazo nenhum não vence', () => {
    const v = calcularVencimento({ data: '2026-01-01', km: 1 }, { km: null, meses: null }, [], 30, '2026-10-13');
    expect(v.dataPrevista).toBeNull();
  });
});
