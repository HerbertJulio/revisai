import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { audioDaResposta, paraWav, wavDePcm } = await import('@/lib/voz-servidor');
const { FRASES, versaoDaFrase } = await import('@/lib/voz-frases');

describe('voz natural', () => {
  it('embrulha o PCM em WAV', () => {
    const pcm = new Uint8Array(4800);
    const wav = wavDePcm(pcm, 24_000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(24_000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(4800);
    expect(wav.length).toBe(4844);
  });

  it('acha o áudio nas duas respostas da API', () => {
    const b64 = Buffer.alloc(3000, 1).toString('base64');
    expect(audioDaResposta({ steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'audio', data: b64, mime_type: 'audio/wav' }] }] })).toEqual({ dados: b64, tipo: 'audio/wav' });
    expect(audioDaResposta({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: b64 } }] } }] })).toEqual({ dados: b64, tipo: 'audio/L16;codec=pcm;rate=24000' });
    expect(audioDaResposta({ candidates: [{ content: { parts: [{ text: 'oi' }] } }] })).toBeNull();
  });

  it('PCM vira WAV, WAV passa direto, curto demais não serve', () => {
    const pcm = Buffer.alloc(3000, 2).toString('base64');
    const wav = paraWav(pcm, 'audio/L16;codec=pcm;rate=24000')!;
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(paraWav(Buffer.from(wav).toString('base64'), 'audio/wav')).toEqual(wav);
    expect(paraWav(Buffer.alloc(100).toString('base64'), null)).toBeNull();
    expect(paraWav(Buffer.alloc(3000).toString('base64'), 'audio/mpeg')).toBeNull();
  });

  it('a versão da frase muda com o texto', () => {
    expect(versaoDaFrase('placa')).toBe(versaoDaFrase('placa'));
    expect(versaoDaFrase('placa')).not.toBe(versaoDaFrase('km'));
    expect(Object.keys(FRASES).every((id) => /^[0-9a-z]+$/.test(versaoDaFrase(id as keyof typeof FRASES)))).toBe(true);
  });
});
