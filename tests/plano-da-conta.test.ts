import { describe, expect, it } from 'vitest';
import { lerUsoDoMes, mensagemDaCota, planoDaConta, PRO } from '@/lib/plano';

const HOJE = '2026-10-14';

describe('plano pela conta da oficina', () => {
  it('Pro pago vale até a data; depois volta ao grátis sem novo teste', () => {
    expect(planoDaConta({ plano: 'pro', proAte: '2026-11-30', testeAte: '2026-09-01' }, HOJE)).toMatchObject({ tipo: 'pro', ate: '2026-11-30', podeTestar: false });
    expect(planoDaConta({ plano: 'pro', proAte: '2026-10-14', testeAte: null }, HOJE).tipo).toBe('pro');
    expect(planoDaConta({ plano: 'gratis', proAte: '2026-10-13', testeAte: '2026-09-01' }, HOJE)).toEqual({ tipo: 'gratis', ate: null, diasRestantes: null, podeTestar: false });
  });

  it('teste em andamento conta os dias; quem nunca testou pode testar', () => {
    expect(planoDaConta({ plano: 'teste', proAte: null, testeAte: '2026-10-20' }, HOJE)).toMatchObject({ tipo: 'teste', ate: '2026-10-20', diasRestantes: 6 });
    expect(planoDaConta({ plano: 'gratis', proAte: null, testeAte: null }, HOJE)).toEqual({ tipo: 'gratis', ate: null, diasRestantes: null, podeTestar: true });
  });

  it('lê o uso do mês que o banco devolve e recusa o que não tem forma', () => {
    expect(lerUsoDoMes({ plano: 'teste', mes: '2026-10', montagem: { usado: 3, limite: 300 }, transcricao: { usado: 9, limite: 1500 } })).toEqual({
      plano: 'teste',
      mes: '2026-10',
      montagem: { usado: 3, limite: 300 },
      transcricao: { usado: 9, limite: 1500 }
    });
    expect(lerUsoDoMes({ plano: 'outro', montagem: { usado: 'x' }, transcricao: {} })).toMatchObject({ plano: 'gratis', montagem: { usado: 0, limite: 0 } });
    expect(lerUsoDoMes(null)).toBeNull();
    expect(lerUsoDoMes({ plano: 'pro' })).toBeNull();
  });

  it('a mensagem da cota diz o limite e o caminho', () => {
    expect(mensagemDaCota('montagem', { plano: 'gratis', limite: 5 })).toBe(`As 5 ordens por voz do plano grátis acabaram neste mês. Com o Pro, são ${PRO.ordensPro} por mês.`);
    expect(mensagemDaCota('montagem', { plano: 'pro', limite: 300 })).toContain('uso justo do Pro');
    expect(mensagemDaCota('transcricao', null)).toContain(`Os ${PRO.transcricoesGratis} áudios do plano grátis acabaram`);
    expect(mensagemDaCota('transcricao', { plano: 'teste' })).toContain(`${PRO.transcricoesPro} áudios transcritos`);
  });
});
