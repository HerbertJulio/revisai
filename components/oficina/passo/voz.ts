'use client';

// A voz do passo a passo: fala a pergunta e ouve a resposta.
// Falar: a voz natural gravada da frase (rota /api/voz/[id]); se ela não vier logo, a voz do navegador.
// Ouvir: o reconhecimento de fala do navegador (Chrome, Edge, Safari); onde não existe, grava um
// trecho curto e a IA passa para texto.

import { useCallback, useEffect, useRef, useState } from 'react';
import { transcreverAudio } from '@/app/oficina/acoes-agente';
import { FRASES, versaoDaFrase, type FraseId } from '@/lib/voz-frases';

export type EstadoVoz = 'parada' | 'falando' | 'ouvindo' | 'pensando';

type Reconhecedor = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } } & ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function construtorDeReconhecimento(): (new () => Reconhecedor) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// a voz natural de cada frase, baixada uma vez por aparelho
const audios = new Map<FraseId, string | null>();
const baixando = new Map<FraseId, Promise<string | null>>();

async function audioDaFrase(id: FraseId, espera: number): Promise<string | null> {
  if (audios.has(id)) return audios.get(id) ?? null;
  let p = baixando.get(id);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`/api/voz/${id}?v=${versaoDaFrase(id)}`);
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (!blob.type.startsWith('audio/') || blob.size < 1000) throw new Error('vazio');
        const url = URL.createObjectURL(blob);
        audios.set(id, url);
        return url;
      } catch {
        audios.set(id, null);
        return null;
      } finally {
        baixando.delete(id);
      }
    })();
    baixando.set(id, p);
  }
  // não segura a conversa esperando a voz natural: se demorar, o navegador fala desta vez
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), espera))]);
}

/** Baixa as vozes das próximas perguntas, uma de cada vez, sem atrapalhar. */
export function prepararFrases(ids: FraseId[]) {
  void (async () => {
    for (const id of ids) {
      if (audios.has(id)) continue;
      await audioDaFrase(id, 15_000);
    }
  })();
}

function vozDoNavegador(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const vozes = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('pt-br'));
  return vozes.find((v) => /google/i.test(v.name)) ?? vozes.find((v) => /luciana|francisca|thalita|maria/i.test(v.name)) ?? vozes[0] ?? null;
}

const PARADO = { cancelar: () => {} };

export function useVoz(ligada: boolean) {
  const [estado, setEstado] = useState<EstadoVoz>('parada');
  const [parcial, setParcial] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const atual = useRef<{ cancelar: () => void }>(PARADO);
  const elemento = useRef<HTMLAudioElement | null>(null);
  const ligadaRef = useRef(ligada);
  ligadaRef.current = ligada;
  const [podeOuvir, setPodeOuvir] = useState(false);

  useEffect(() => {
    setPodeOuvir(!!construtorDeReconhecimento() || (typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia));
    // as vozes do navegador chegam depois de um tempo
    try {
      speechSynthesis?.getVoices();
    } catch {}
    return () => atual.current.cancelar();
  }, []);

  const parar = useCallback(() => {
    atual.current.cancelar();
    atual.current = PARADO;
    setEstado('parada');
    setParcial('');
  }, []);

  useEffect(() => {
    if (!ligada) parar();
  }, [ligada, parar]);

  /** Chame num toque: o Safari só deixa tocar som depois de um toque na página. */
  const destravar = useCallback(() => {
    try {
      if (!elemento.current) elemento.current = new Audio();
      const a = elemento.current;
      a.muted = true;
      void a.play().catch(() => {});
      a.pause();
      a.muted = false;
      if (typeof speechSynthesis !== 'undefined' && !speechSynthesis.speaking) speechSynthesis.cancel();
    } catch {}
  }, []);

  /** Fala a frase (a voz natural se chegar logo; senão a do navegador). Termina quando acaba de falar. */
  const falar = useCallback(
    async (id: FraseId | null, texto?: string): Promise<void> => {
      if (!ligadaRef.current) return;
      atual.current.cancelar();
      const fala = texto ?? (id ? FRASES[id] : '');
      if (!fala) return;
      let cancelado = false;
      let terminar: () => void = () => {};
      const fim = new Promise<void>((r) => (terminar = r));
      atual.current = {
        cancelar: () => {
          cancelado = true;
          try {
            elemento.current?.pause();
          } catch {}
          try {
            if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
          } catch {}
          terminar();
        }
      };
      setEstado('falando');
      const url = id && (!texto || texto === FRASES[id]) ? await audioDaFrase(id, 1800) : null;
      if (cancelado) return;
      // trava de segurança: nenhuma fala segura a tela por mais do que o texto pede
      const limite = setTimeout(terminar, 2500 + fala.length * 90);
      if (url) {
        const a = (elemento.current ??= new Audio());
        a.src = url;
        a.onended = terminar;
        a.onerror = terminar;
        a.play().catch(() => falarNoNavegador(fala, terminar));
      } else falarNoNavegador(fala, terminar);
      await fim;
      clearTimeout(limite);
      if (!cancelado) {
        atual.current = PARADO;
        setEstado('parada');
      }
    },
    []
  );

  /** Ouve uma resposta. Devolve o texto, ou null se ninguém falou (ou foi cancelado). */
  const ouvir = useCallback(async (): Promise<string | null> => {
    atual.current.cancelar();
    setErro(null);
    setParcial('');
    const Construtor = construtorDeReconhecimento();
    if (Construtor) return ouvirNoNavegador(Construtor);
    return ouvirGravando();
  }, []);

  function ouvirNoNavegador(Construtor: new () => Reconhecedor): Promise<string | null> {
    return new Promise((resolver) => {
      let rec: Reconhecedor;
      try {
        rec = new Construtor();
      } catch {
        setErro('Este navegador não deixou usar o microfone.');
        resolver(null);
        return;
      }
      let final = '';
      let acabou = false;
      const terminar = (t: string | null) => {
        if (acabou) return;
        acabou = true;
        atual.current = PARADO;
        setEstado('parada');
        resolver(t && t.trim() ? t.trim() : null);
      };
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e) => {
        let provisorio = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += `${r[0].transcript} `;
          else provisorio += r[0].transcript;
        }
        setParcial((final + provisorio).trim());
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setErro('Libere o microfone para o Revisaí nas permissões do navegador.');
        else if (e.error === 'network') setErro('O reconhecimento de voz precisa de internet.');
        else if (e.error === 'audio-capture') setErro('Não achamos um microfone neste aparelho.');
      };
      rec.onend = () => terminar(final);
      atual.current = {
        cancelar: () => {
          try {
            rec.abort();
          } catch {}
          terminar(null);
        }
      };
      try {
        rec.start();
        setEstado('ouvindo');
      } catch {
        terminar(null);
      }
    });
  }

  async function ouvirGravando(): Promise<string | null> {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErro('Este navegador não ouve. Responda tocando na tela.');
      return null;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setErro('Libere o microfone para o Revisaí nas permissões do navegador.');
      return null;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
    const partes: Blob[] = [];
    let cancelado = false;
    // para sozinho depois de 1,4 s de silêncio (ou 9 s no total)
    let contexto: AudioContext | null = null;
    let quadro = 0;
    const inicio = Date.now();
    try {
      contexto = new AudioContext();
      const analisador = contexto.createAnalyser();
      analisador.fftSize = 512;
      contexto.createMediaStreamSource(stream).connect(analisador);
      const amostras = new Uint8Array(analisador.fftSize);
      let falou = false;
      let ultimoSom = Date.now();
      const medir = () => {
        analisador.getByteTimeDomainData(amostras);
        let soma = 0;
        for (const v of amostras) soma += ((v - 128) / 128) ** 2;
        const nivel = Math.sqrt(soma / amostras.length);
        if (nivel > 0.03) {
          falou = true;
          ultimoSom = Date.now();
        }
        const agora = Date.now();
        if ((falou && agora - ultimoSom > 1400) || agora - inicio > 9000 || (!falou && agora - inicio > 6000)) {
          if (rec.state === 'recording') rec.stop();
          return;
        }
        quadro = requestAnimationFrame(medir);
      };
      quadro = requestAnimationFrame(medir);
    } catch {
      setTimeout(() => rec.state === 'recording' && rec.stop(), 6000);
    }
    const pronto = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
    atual.current = {
      cancelar: () => {
        cancelado = true;
        if (rec.state === 'recording') rec.stop();
      }
    };
    rec.start(250);
    setEstado('ouvindo');
    await pronto;
    cancelAnimationFrame(quadro);
    stream.getTracks().forEach((t) => t.stop());
    void contexto?.close().catch(() => {});
    if (cancelado) {
      setEstado('parada');
      return null;
    }
    const blob = new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' });
    if (blob.size < 1500) {
      setEstado('parada');
      return null;
    }
    setEstado('pensando');
    try {
      const dados = new FormData();
      dados.append('audio', new File([blob], 'resposta.webm', { type: blob.type }));
      const r = await transcreverAudio(dados);
      if (!r.ok) {
        setErro(r.erro);
        return null;
      }
      setParcial(r.texto);
      return r.texto;
    } catch {
      setErro('Sem internet para entender o áudio. Responda tocando na tela.');
      return null;
    } finally {
      atual.current = PARADO;
      setEstado('parada');
    }
  }

  return { estado, parcial, erro, podeOuvir, falar, ouvir, parar, destravar, limparErro: () => setErro(null) };
}

function falarNoNavegador(texto: string, aoTerminar: () => void) {
  try {
    if (typeof speechSynthesis === 'undefined') return aoTerminar();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    const voz = vozDoNavegador();
    if (voz) u.voice = voz;
    u.rate = 1.05;
    u.onend = aoTerminar;
    u.onerror = aoTerminar;
    speechSynthesis.speak(u);
  } catch {
    aoTerminar();
  }
}
