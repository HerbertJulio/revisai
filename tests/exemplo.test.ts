import { describe, expect, it } from 'vitest';
import { itensParaComprar, montarGrupos, resumir } from '@/lib/avisos';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { gerarExemplo } from '@/lib/exemplo';
import { PREFERENCIAS_PADRAO } from '@/lib/padroes';
import { calcularDemanda, recomendarParaItem } from '@/lib/recomendacao';

describe('dados de exemplo', () => {
  const hoje = '2026-10-13';
  const dados = { ...gerarExemplo(hoje, new Date('2026-10-13T12:00:00Z')), preferencias: PREFERENCIAS_PADRAO };
  const grupos = montarGrupos(dados, hoje);
  const etapa = (placa: string) => grupos.find((g) => g.veiculo.placa === placa);

  it('cai em todas as etapas', () => {
    expect(etapa('FLM2C24')?.etapa).toBe('avisar');
    expect(etapa('JBT7A11')?.etapa).toBe('avisar');
    expect(etapa('JBT7A11')?.itens[0].venc.motivo).toBe('km');
    expect(etapa('MPR4D56')?.situacao).toBe('atrasado');
    expect(etapa('ANS1B90')?.etapa).toBe('aguardando');
    expect(etapa('CHQ8E37')?.etapa).toBe('agendado');
    expect(etapa('PTG3F12')?.itens.map((i) => i.servico).sort()).toEqual(['arrefecimento', 'filtro_ar', 'fluido_freio']);
    expect(etapa('RBA5G44')?.etapa).toBe('futuro');
    expect(etapa('LCM6H08')?.etapa).toBe('futuro');
    expect(etapa('DGR9J71')?.itens.map((i) => i.servico)).toEqual(['gnv']);
    const r = resumir(grupos, hoje);
    expect(r.avisar).toBe(5);
    expect(r.atrasados).toBe(2);
  });

  it('recomenda óleo para os carros do exemplo', () => {
    for (const placa of ['FLM2C24', 'JBT7A11', 'MPR4D56', 'CHQ8E37']) {
      const g = etapa(placa)!;
      const oleo = g.itens.find((i) => i.servico === 'troca_oleo')!;
      expect(recomendarParaItem('troca_oleo', g.veiculo, oleo.produto, CATALOGO_EXEMPLO, hoje).length, placa).toBeGreaterThan(0);
    }
    const demanda = calcularDemanda(itensParaComprar(dados, hoje, 30), CATALOGO_EXEMPLO, hoje, 30);
    expect(demanda.length).toBeGreaterThan(2);
  });
});
