import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { linkGoogleAgenda } from '@/lib/ics';
import {
  avisosNoMes,
  contarMontagem,
  formatarCodigo,
  juntarPlanos,
  montagensNoMes,
  normalizarCodigo,
  planoAtual,
  podeAvisar,
  podeDitar,
  PLANO_INICIAL,
  PRO,
  retornoDosAvisos
} from '@/lib/plano';
import { gerarCodigoPro } from '@/lib/pro';
import { lerAssinaturas, mensagemDoCodigo, vagasDeFundador, valorSugerido } from '@/lib/pro-dados';

const HOJE = '2026-10-14';

describe('plano da oficina', () => {
  it('sem nada, é grátis e pode testar', () => {
    expect(planoAtual(PLANO_INICIAL, HOJE)).toEqual({ tipo: 'gratis', ate: null, diasRestantes: null, podeTestar: true });
  });

  it('o teste dura 30 dias contando o primeiro', () => {
    const p = { ...PLANO_INICIAL, testeDesde: HOJE };
    expect(planoAtual(p, HOJE)).toMatchObject({ tipo: 'teste', ate: '2026-11-12', diasRestantes: 29 });
    expect(planoAtual(p, '2026-11-12')).toMatchObject({ tipo: 'teste', diasRestantes: 0 });
    expect(planoAtual(p, '2026-11-13')).toEqual({ tipo: 'gratis', ate: null, diasRestantes: null, podeTestar: false });
  });

  it('o Pro pago vale até a data do código e passa na frente do teste', () => {
    const p = { ...PLANO_INICIAL, testeDesde: HOJE, proAte: '2027-01-14', codigo: 'A'.repeat(16) };
    expect(planoAtual(p, HOJE)).toMatchObject({ tipo: 'pro', ate: '2027-01-14' });
    expect(planoAtual(p, '2027-01-15').tipo).toBe('gratis');
  });

  it('conta um aviso por carro e por toque, só do mês', () => {
    const quando = '2026-10-10T15:00:00.000Z';
    const contatos = [
      { veiculoId: 'a', quando, resultado: 'avisado' as const },
      { veiculoId: 'a', quando, resultado: 'avisado' as const },
      { veiculoId: 'b', quando, resultado: 'avisado' as const },
      { veiculoId: 'c', quando, resultado: 'agendado' as const },
      { veiculoId: 'd', quando: '2026-09-10T15:00:00.000Z', resultado: 'avisado' as const }
    ];
    expect(avisosNoMes(contatos, HOJE)).toBe(2);
  });

  it('o limite do grátis vale para avisos e ordens; o Pro só tem o uso justo', () => {
    const gratis = planoAtual(PLANO_INICIAL, HOJE);
    expect(podeAvisar(gratis, PRO.avisosGratis - 1)).toBe(true);
    expect(podeAvisar(gratis, PRO.avisosGratis)).toBe(false);
    expect(podeDitar(gratis, PRO.ordensGratis)).toBe(false);
    const pro = planoAtual({ ...PLANO_INICIAL, proAte: '2026-12-31' }, HOJE);
    expect(podeAvisar(pro, 1000)).toBe(true);
    expect(podeDitar(pro, PRO.ordensPro - 1)).toBe(true);
    expect(podeDitar(pro, PRO.ordensPro)).toBe(false);
  });

  it('as ordens montadas zeram no mês seguinte', () => {
    let p = contarMontagem(PLANO_INICIAL, HOJE);
    p = contarMontagem(p, '2026-10-20');
    expect(montagensNoMes(p, '2026-10-31')).toBe(2);
    expect(montagensNoMes(p, '2026-11-01')).toBe(0);
    expect(contarMontagem(p, '2026-11-01').montagens).toEqual({ mes: '2026-11', n: 1 });
  });

  it('restaurar backup não reinicia o teste nem tira o Pro mais longo', () => {
    const atual = { ...PLANO_INICIAL, testeDesde: '2026-10-01', proAte: '2026-12-01', codigo: 'B'.repeat(16) };
    expect(juntarPlanos(atual, { testeDesde: '2026-09-01', proAte: '2026-11-01', codigo: 'C'.repeat(16) })).toEqual({
      testeDesde: '2026-09-01',
      proAte: '2026-12-01',
      codigo: 'B'.repeat(16),
      montagens: null
    });
    expect(juntarPlanos(PLANO_INICIAL, { proAte: '2027-03-01', codigo: 'D'.repeat(16) })).toMatchObject({ proAte: '2027-03-01', codigo: 'D'.repeat(16) });
    expect(juntarPlanos(PLANO_INICIAL, { proAte: 'amanhã', testeDesde: 42 })).toEqual(PLANO_INICIAL);
  });

  it('normaliza e formata o código como a equipe manda', () => {
    expect(normalizarCodigo(' abcd-efgh ijkl.mnpq ')).toBe('ABCDEFGHIJKLMNPQ');
    expect(formatarCodigo('ABCDEFGHJKLMNPQR')).toBe('ABCD-EFGH-JKLM-NPQR');
  });
});

describe('retorno dos avisos', () => {
  it('conta quem voltou em até 60 dias depois do primeiro aviso e soma os valores', () => {
    const contatos = [
      { veiculoId: 'a', quando: '2026-08-01T12:00:00.000Z', resultado: 'avisado' as const },
      { veiculoId: 'a', quando: '2026-08-20T12:00:00.000Z', resultado: 'avisado' as const },
      { veiculoId: 'b', quando: '2026-09-01T12:00:00.000Z', resultado: 'avisado' as const },
      { veiculoId: 'c', quando: '2026-09-05T12:00:00.000Z', resultado: 'avisado' as const },
      { veiculoId: 'velho', quando: '2026-01-01T12:00:00.000Z', resultado: 'avisado' as const }
    ];
    const atendimentos = [
      { veiculoId: 'a', data: '2026-08-10', valor: 300 },
      { veiculoId: 'b', data: '2026-12-01', valor: 500 },
      { veiculoId: 'c', data: '2026-09-06', valor: null },
      { veiculoId: 'velho', data: '2026-01-05', valor: 999 }
    ];
    expect(retornoDosAvisos(contatos, atendimentos, HOJE)).toEqual({ avisados: 3, voltaram: 2, valor: 300 });
  });
});

describe('códigos do Pro', () => {
  it('gera 16 letras e números sem os que confundem', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigoPro();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
      vistos.add(c);
    }
    expect(vistos.size).toBe(200);
  });

  it('sugere o preço de fundador enquanto houver vaga', () => {
    expect(valorSugerido(1, true)).toBe(PRO.precoFundador);
    expect(valorSugerido(12, false)).toBe(478.8);
    expect(vagasDeFundador([{ oficina_nome: 'Auto Center' }, { oficina_nome: ' auto center ' }, { oficina_nome: 'Outra' }])).toBe(PRO.vagasFundador - 2);
  });

  it('lê as linhas do banco e monta a mensagem para a oficina', () => {
    const { itens, descartadas } = lerAssinaturas([
      { id: 1, oficina_nome: 'Auto Center Serra', oficina_whatsapp: '5521999990000', meses: 3, valor: '89.70', ate: '2027-01-14', codigo: 'ABCDEFGHJKLMNPQR', observacao: null, ativacoes: 1, criado_em: '2026-10-14T12:00:00Z' },
      { id: 'x' }
    ]);
    expect(descartadas).toBe(1);
    expect(itens[0].valor).toBe(89.7);
    const m = mensagemDoCodigo(itens[0]);
    expect(m).toContain('ABCD-EFGH-JKLM-NPQR');
    expect(m).toContain('14/01/2027');
  });
});

describe('Google Agenda', () => {
  it('monta o lembrete do dia inteiro', () => {
    const url = new URL(linkGoogleAgenda({ uid: 'x', titulo: 'Troca de óleo do Onix', data: '2026-12-31', descricao: 'Até 31/12' }));
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('dates')).toBe('20261231/20270101');
    expect(url.searchParams.get('text')).toBe('Troca de óleo do Onix');
    expect(url.searchParams.get('details')).toBe('Até 31/12');
  });
});
