import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const chamadas: { system?: string; partes: { type: string; text?: string; mediaType?: string }[]; estruturado: boolean; reasoning?: string }[] = [];
let respostaDoTexto = 'Onix placa ABC1D23 com 45.210 km. Troquei o óleo Lubrax 5W-30 e o filtro.';
let fimDoTexto = 'stop';

vi.mock('ai', async (original) => {
  const ai = await original<typeof import('ai')>();
  return {
    ...ai,
    generateText: vi.fn(async (o: { system?: string; messages: { content: { type: string; text?: string; mediaType?: string }[] }[]; output?: unknown; reasoning?: string }) => {
      chamadas.push({ system: o.system, partes: o.messages[0].content, estruturado: !!o.output, reasoning: o.reasoning });
      if (!o.output) return { text: respostaDoTexto, finishReason: fimDoTexto };
      return {
        output: {
          placa: 'abc-1d23',
          km: 45210,
          veiculo: null,
          cliente: null,
          servicos: [{ servico: 'troca_oleo', produto: 'Lubrax 5W-30', observacao: null }],
          diagnostico: 'Óleo trocado.',
          recomendacoes: [],
          fotos: [],
          mensagemCliente: 'Olá! Trocamos o óleo.',
          duvidas: []
        }
      };
    })
  };
});

const { juntarRelato, limparTranscricao, SEM_FALA } = await import('@/lib/agente/relato');
const { interpretarComIA, preencherComIA, transcreverComIA } = await import('@/lib/agente/ia');
const { INSTRUCOES_AGENTE, INSTRUCOES_TRANSCRICAO } = await import('@/lib/agente/prompt');

const audio = { bytes: new Uint8Array([1, 2, 3]), mime: 'audio/webm;codecs=opus' };

describe('relato do mecânico', () => {
  it('apara a resposta da transcrição', () => {
    expect(limparTranscricao('  Troquei o óleo.  ')).toBe('Troquei o óleo.');
    expect(limparTranscricao('Transcrição: troquei o filtro')).toBe('troquei o filtro');
    expect(limparTranscricao('"Pastilha no talo."')).toBe('Pastilha no talo.');
    expect(limparTranscricao('```\nTroquei a correia\n```')).toBe('Troquei a correia');
    expect(limparTranscricao('Linha 1\n\n\n\nLinha 2')).toBe('Linha 1\n\nLinha 2');
  });

  it('volta vazio quando não houve fala que desse para entender', () => {
    expect(limparTranscricao('[sem fala]')).toBe('');
    expect(limparTranscricao('[inaudível] [inaudível].')).toBe('');
    expect(limparTranscricao('   ')).toBe('');
    expect(limparTranscricao('Troquei [inaudível] do Gol')).toBe('Troquei [inaudível] do Gol');
  });

  it('junta um trecho novo ao que já foi falado', () => {
    expect(juntarRelato('', 'Troquei o óleo.')).toBe('Troquei o óleo.');
    expect(juntarRelato('Troquei o óleo.', '')).toBe('Troquei o óleo.');
    expect(juntarRelato('Troquei o óleo.', ' E o filtro de ar. ')).toBe('Troquei o óleo.\n\nE o filtro de ar.');
  });
});

describe('IA em dois passos', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'chave-de-teste');
    chamadas.length = 0;
    respostaDoTexto = 'Onix placa ABC1D23 com 45.210 km. Troquei o óleo Lubrax 5W-30 e o filtro.';
    fimDoTexto = 'stop';
  });
  afterEach(() => vi.unstubAllEnvs());

  it('o áudio vira texto sem raciocínio e com as regras de transcrição', async () => {
    const r = await transcreverComIA([audio]);
    expect(r).toEqual({ ok: true, texto: respostaDoTexto, modelo: 'gemini-2.5-flash' });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].system).toBe(INSTRUCOES_TRANSCRICAO);
    expect(chamadas[0].estruturado).toBe(false);
    expect(chamadas[0].reasoning).toBe('none');
    expect(chamadas[0].partes.find((p) => p.type === 'file')?.mediaType).toBe('audio/webm');
  });

  it('áudio sem fala volta como erro claro', async () => {
    respostaDoTexto = '[sem fala]';
    expect(await transcreverComIA([audio])).toEqual({ ok: false, erro: SEM_FALA });
  });

  it('resposta cortada pelo modelo não vira sem fala: dá para tentar de novo', async () => {
    respostaDoTexto = '';
    fimDoTexto = 'content-filter';
    const r = await transcreverComIA([audio]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).not.toBe(SEM_FALA);
      expect(r.erro).toMatch(/tente de novo/);
    }
  });

  it('o texto vira a ordem, sem mandar áudio, e o relato fica guardado na ordem', async () => {
    const r = await preencherComIA({ oficina: 'Auto Center', hoje: '2026-10-14', transcricao: 'Troquei o óleo do Onix.', quantidadeFotos: 0 }, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ordem.placa).toBe('ABC1D23');
    expect(r.ordem.transcricao).toBe('Troquei o óleo do Onix.');
    expect(chamadas[0].system).toBe(INSTRUCOES_AGENTE);
    expect(chamadas[0].estruturado).toBe(true);
    expect(chamadas[0].partes.some((p) => p.type === 'file')).toBe(false);
    expect(chamadas[0].partes[0].text).toContain('Troquei o óleo do Onix.');
  });

  it('no WhatsApp faz os dois passos em sequência', async () => {
    const r = await interpretarComIA({ oficina: 'Auto Center', hoje: '2026-10-14', anotacao: 'carro do Marcos', quantidadeFotos: 0 }, [audio], []);
    expect(r.ok).toBe(true);
    expect(chamadas.map((c) => c.estruturado)).toEqual([false, true]);
    expect(chamadas[1].partes[0].text).toContain(respostaDoTexto);
    expect(chamadas[1].partes[0].text).toContain('carro do Marcos');
    // o que ele escreveu fica no relato da ordem junto com o que falou
    if (r.ok) expect(r.ordem.transcricao).toBe(`${respostaDoTexto}\n\ncarro do Marcos`);
  });

  it('no WhatsApp, um áudio sem fala não estraga a ordem que tem texto', async () => {
    respostaDoTexto = '[sem fala]';
    const r = await interpretarComIA({ oficina: '', hoje: '2026-10-14', anotacao: 'troquei o óleo do Gol', quantidadeFotos: 0 }, [audio], []);
    expect(r.ok).toBe(true);
    const sem = await interpretarComIA({ oficina: '', hoje: '2026-10-14', quantidadeFotos: 0 }, [audio], []);
    expect(sem).toEqual({ ok: false, erro: SEM_FALA });
  });

  it('sem chave e fora da Vercel, avisa que a IA está desligada', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    expect((await transcreverComIA([audio])).ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});
