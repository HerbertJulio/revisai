import { describe, expect, it } from 'vitest';
import { montarGrupos, resumir, situacaoDe, type DadosOficina } from '@/lib/avisos';
import type { Atendimento, Contato, Preferencias } from '@/lib/tipos';

const prefs: Preferencias = {
  antecedenciaDias: 15,
  antecedenciaKm: 500,
  usoSeveroPadrao: false,
  kmMesPadrao: 1000,
  mensagem: '',
  intervalos: {},
  tema: 'auto',
  compartilharDemanda: false
};

function dados(atendimentos: Atendimento[], contatos: Contato[] = []): DadosOficina {
  return {
    preferencias: prefs,
    clientes: { c1: { id: 'c1', nome: 'Fernanda Lima', telefone: '21987654321', criadoEm: '' } },
    veiculos: {
      v1: { id: 'v1', clienteId: 'c1', placa: 'RIO2A26', marca: 'Chevrolet', modelo: 'Onix', criadoEm: '', kmMes: 700 }
    },
    atendimentos: Object.fromEntries(atendimentos.map((a) => [a.id, a])),
    leituras: {},
    contatos: Object.fromEntries(contatos.map((c) => [c.id, c]))
  };
}

const oleo = (id: string, data: string, km: number): Atendimento => ({
  id,
  veiculoId: 'v1',
  data,
  km,
  criadoEm: `${data}T10:00:00.000Z`,
  itens: [
    { servico: 'troca_oleo', intervaloKm: 10000, intervaloMeses: 12 },
    { servico: 'filtro_ar', intervaloKm: 20000, intervaloMeses: 24 }
  ]
});

describe('situação', () => {
  it('avisa dentro da antecedência em dias ou em km', () => {
    const base = { dataLimite: null, kmLimite: null, dataPorKm: null, motivo: 'tempo' as const, kmHoje: 0 };
    expect(situacaoDe({ ...base, dataPrevista: '2026-10-20', diasRestantes: 7, kmRestante: null }, prefs)).toBe('avisar');
    expect(situacaoDe({ ...base, dataPrevista: '2026-12-20', diasRestantes: 68, kmRestante: 400 }, prefs)).toBe('avisar');
    expect(situacaoDe({ ...base, dataPrevista: '2026-12-20', diasRestantes: 68, kmRestante: 4000 }, prefs)).toBe('futuro');
    expect(situacaoDe({ ...base, dataPrevista: '2026-10-01', diasRestantes: -12, kmRestante: 100 }, prefs)).toBe('atrasado');
  });
});

describe('grupos de aviso', () => {
  // troca feita há quase 12 meses rodando 700 km/mês: vence pela data, antes dos 10.000 km
  const atendimento = oleo('a1', '2025-10-25', 30000);

  it('junta os itens vencendo do mesmo carro', () => {
    const grupos = montarGrupos(dados([atendimento]), '2026-10-13');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].etapa).toBe('avisar');
    expect(grupos[0].itens.map((i) => i.servico)).toEqual(['troca_oleo']);
    expect(grupos[0].dataPrevista).toBe('2026-10-25');
    expect(resumir(grupos, '2026-10-13').avisar).toBe(1);
  });

  it('um novo atendimento fecha o ciclo', () => {
    const grupos = montarGrupos(dados([atendimento, oleo('a2', '2026-10-10', 41500)]), '2026-10-13');
    expect(grupos).toHaveLength(0);
  });

  it('o contato move o carro de etapa e volta a avisar sem resposta', () => {
    const contato: Contato = { id: 'k1', veiculoId: 'v1', servico: 'troca_oleo', atendimentoId: 'a1', quando: '2026-10-12T12:00:00.000Z', resultado: 'avisado' };
    expect(montarGrupos(dados([atendimento], [contato]), '2026-10-13')[0].etapa).toBe('aguardando');
    const depois = montarGrupos(dados([atendimento], [contato]), '2026-10-21')[0];
    expect(depois.etapa).toBe('avisar');
    expect(depois.reavisar).toBe(true);
  });

  it('agendado e adiado', () => {
    const agendado: Contato = { id: 'k2', veiculoId: 'v1', servico: 'troca_oleo', atendimentoId: 'a1', quando: '2026-10-12T12:00:00.000Z', resultado: 'agendado', data: '2026-10-20' };
    expect(montarGrupos(dados([atendimento], [agendado]), '2026-10-13')[0].etapa).toBe('agendado');
    const adiado: Contato = { ...agendado, id: 'k3', resultado: 'adiado', data: '2026-10-18' };
    expect(montarGrupos(dados([atendimento], [adiado]), '2026-10-13')[0].etapa).toBe('adiado');
    expect(montarGrupos(dados([atendimento], [adiado]), '2026-10-18')[0].etapa).toBe('avisar');
  });

  it('agendar um carro que ainda não venceu leva para Agendados', () => {
    const a = oleo('a1', '2026-01-20', 30000);
    const agendado: Contato = { id: 'k9', veiculoId: 'v1', servico: 'troca_oleo', atendimentoId: 'a1', quando: '2026-10-12T12:00:00.000Z', resultado: 'agendado', data: '2026-10-20' };
    const g = montarGrupos(dados([a], [agendado]), '2026-10-13', 120)[0];
    expect(g.etapa).toBe('agendado');
    expect(resumir([g], '2026-10-20').agendadosHoje).toBe(1);
  });

  it('a recusa vale por um tempo e não esconde outro serviço vencendo', () => {
    const recusa: Contato = { id: 'k8', veiculoId: 'v1', servico: 'troca_oleo', atendimentoId: 'a1', quando: '2026-10-12T12:00:00.000Z', resultado: 'recusou' };
    expect(montarGrupos(dados([atendimento], [recusa]), '2026-10-13')[0].etapa).toBe('recusou');
    // passados os 60 dias, volta para a lista
    expect(montarGrupos(dados([atendimento], [recusa]), '2026-12-20')[0].etapa).toBe('avisar');
    // outro item vencendo (fluido de freio) aparece sozinho em Avisar
    const fluido: Atendimento = { id: 'a7', veiculoId: 'v1', data: '2024-10-20', km: 20000, criadoEm: '2024-10-20T10:00:00.000Z', itens: [{ servico: 'fluido_freio', intervaloKm: null, intervaloMeses: 24 }] };
    const g = montarGrupos(dados([atendimento, fluido], [recusa]), '2026-10-13')[0];
    expect(g.etapa).toBe('avisar');
    expect(g.itens.map((i) => i.servico)).toEqual(['fluido_freio']);
  });

  it('mostra os próximos dentro do horizonte', () => {
    const grupos = montarGrupos(dados([oleo('a1', '2026-01-20', 30000)]), '2026-10-13', 120);
    expect(grupos[0].etapa).toBe('futuro');
  });
});
