'use client';

// O gravador da ordem por voz. O microfone grande é a tela inicial: um toque começa, outro termina.
// Enquanto grava, o halo acompanha a voz, o anel serrilhado (a tampa do óleo) gira e a tela
// fica acesa. O pequeno é o Falar mais da conferência.

import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export const MAX_SEGUNDOS = 300;
// a ação do servidor aceita até 4 MB; o áudio para antes
const MAX_BYTES = 3_500_000;

export interface Clipe {
  id: string;
  blob: Blob;
  url: string;
  segundos: number;
  /** Já virou texto. */
  ouvido: boolean;
}

export function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function mimeDeGravacao(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
}

function extensao(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function arquivoDoClipe(c: Clipe, n = 1): File {
  const tipo = c.blob.type || 'audio/webm';
  return new File([c.blob], `audio-${n}.${extensao(tipo)}`, { type: tipo });
}

export function tempo(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Trava = { release: () => Promise<void> };

/** Grava um áudio por vez. `aoGravar` recebe o áudio pronto; cancelar joga fora. */
export function useGravador(aoGravar: (c: Clipe) => void) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);
  const halo = useRef<HTMLSpanElement | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const descartar = useRef(false);
  const abrindo = useRef(false);
  const limpar = useRef<(() => void) | null>(null);
  const destino = useRef(aoGravar);
  destino.current = aoGravar;

  const vivo = useRef(false);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      descartar.current = true;
      if (gravador.current?.state === 'recording') gravador.current.stop();
      limpar.current?.();
    };
  }, []);

  async function comecar() {
    // um toque duplo não abre dois microfones
    if (abrindo.current || gravador.current?.state === 'recording') return;
    abrindo.current = true;
    try {
      await abrir();
    } finally {
      abrindo.current = false;
    }
  }

  async function abrir() {
    setErro(null);
    setMudo(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro('Este navegador não grava áudio. Use Escrever, ou abra o Revisaí no Chrome ou no Safari.');
      return;
    }
    // o medidor de volume nasce ainda no toque (no Safari, só assim ele funciona)
    let contexto: AudioContext | null = null;
    try {
      contexto = new AudioContext();
      void contexto.resume().catch(() => {});
    } catch {}
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      void contexto?.close().catch(() => {});
      const nome = (e as Error)?.name;
      setErro(nome === 'NotFoundError' ? 'Não achamos um microfone neste aparelho.' : 'Libere o microfone para o Revisaí nas permissões do navegador e toque de novo.');
      return;
    }
    if (!vivo.current) {
      // a tela fechou enquanto o navegador pedia o microfone
      stream.getTracks().forEach((t) => t.stop());
      void contexto?.close().catch(() => {});
      return;
    }
    const mime = mimeDeGravacao();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      void contexto?.close().catch(() => {});
      setErro('Não deu para começar a gravar. Tente de novo.');
      return;
    }
    const partes: Blob[] = [];
    let bytes = 0;
    const inicio = Date.now();
    descartar.current = false;

    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      partes.push(e.data);
      bytes += e.data.size;
      if (bytes >= MAX_BYTES && rec.state === 'recording') rec.stop();
    };
    rec.onstop = () => {
      limpar.current?.();
      gravador.current = null;
      setGravando(false);
      if (descartar.current) return;
      const blob = new Blob(partes, { type: rec.mimeType || mime || 'audio/webm' });
      const duracao = Math.round((Date.now() - inicio) / 1000);
      if (blob.size < 1500 || duracao < 1) {
        setErro('O áudio ficou curto demais. Toque, fale e toque de novo para terminar.');
        return;
      }
      destino.current({ id: novoId(), blob, url: URL.createObjectURL(blob), segundos: duracao, ouvido: false });
    };

    // o halo acompanha a voz (e avisa se não chega som nenhum)
    let quadro = 0;
    try {
      if (!contexto) throw new Error('sem medidor');
      const medidor = contexto;
      const analisador = medidor.createAnalyser();
      analisador.fftSize = 512;
      medidor.createMediaStreamSource(stream).connect(analisador);
      const amostras = new Uint8Array(analisador.fftSize);
      const parado = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let maior = 0;
      let calado = false;
      const medir = () => {
        analisador.getByteTimeDomainData(amostras);
        let soma = 0;
        for (const v of amostras) {
          const x = (v - 128) / 128;
          soma += x * x;
        }
        const nivel = Math.sqrt(soma / amostras.length);
        maior = Math.max(maior, nivel);
        if (halo.current && !parado) halo.current.style.transform = `scale(${(1 + Math.min(0.32, nivel * 2.4)).toFixed(3)})`;
        // só avisa de silêncio quando o medidor está mesmo ouvindo
        if (medidor.state === 'running' && Date.now() - inicio > 5000 && calado !== maior < 0.008) {
          calado = maior < 0.008;
          setMudo(calado);
        }
        quadro = requestAnimationFrame(medir);
      };
      quadro = requestAnimationFrame(medir);
    } catch {}

    // a tela não apaga no meio da fala
    let trava: Trava | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Trava> } };
    void nav.wakeLock
      ?.request('screen')
      .then((t) => {
        if (gravador.current === rec) trava = t;
        else void t.release().catch(() => {});
      })
      .catch(() => {});

    const relogio = setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(s);
      if (s >= MAX_SEGUNDOS && rec.state === 'recording') rec.stop();
    }, 250);

    limpar.current = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(relogio);
      cancelAnimationFrame(quadro);
      void contexto?.close().catch(() => {});
      void trava?.release().catch(() => {});
      if (halo.current) halo.current.style.transform = '';
      limpar.current = null;
    };

    rec.onerror = () => {
      if (rec.state === 'recording') rec.stop();
    };
    rec.start(1000);
    gravador.current = rec;
    setSegundos(0);
    setGravando(true);
  }

  function parar() {
    if (gravador.current?.state === 'recording') gravador.current.stop();
  }

  function cancelar() {
    descartar.current = true;
    parar();
  }

  return { gravando, segundos, erro, mudo, halo, comecar, parar, cancelar };
}

/** O microfone no meio da tela. `podeComecar` confere o plano antes de abrir o microfone. */
export function MicrofoneGrande({
  aoGravar,
  podeComecar,
  aoMudar,
  desabilitado = false
}: {
  aoGravar: (c: Clipe) => void;
  podeComecar: () => boolean;
  aoMudar?: (gravando: boolean) => void;
  desabilitado?: boolean;
}) {
  const g = useGravador(aoGravar);
  const avisar = useRef(aoMudar);
  avisar.current = aoMudar;
  useEffect(() => avisar.current?.(g.gravando), [g.gravando]);
  const restantes = MAX_SEGUNDOS - g.segundos;

  return (
    <div className="flex flex-col items-center text-center">
      <p className={`largo num flex h-11 items-center gap-2.5 text-[34px] leading-none font-extrabold ${g.gravando ? 'text-atraso' : 'invisible'}`} aria-hidden={!g.gravando}>
        <span className="h-3 w-3 animate-pulse rounded-full bg-atraso motion-reduce:animate-none" aria-hidden="true" />
        {tempo(g.segundos)}
      </p>
      <div className="relative mt-3 grid h-[204px] w-[204px] place-items-center sm:h-[228px] sm:w-[228px]">
        <span ref={g.halo} aria-hidden="true" className={`absolute inset-5 rounded-full transition-[background-color,transform] duration-100 ${g.gravando ? 'bg-atraso/15' : 'bg-transparent'}`} />
        <span aria-hidden="true" className={`anel-serrilhado absolute inset-0 ${g.gravando ? 'anel-girando text-atraso/55' : 'text-tinta-3/30'}`} />
        <button
          type="button"
          onClick={() => {
            if (g.gravando) g.parar();
            else if (podeComecar()) void g.comecar();
          }}
          aria-label={g.gravando ? 'Parar a gravação' : 'Gravar áudio'}
          disabled={desabilitado && !g.gravando}
          className={`relative grid h-[148px] w-[148px] place-items-center rounded-full shadow-etiqueta transition-[background-color,transform] outline-none focus-visible:ring-4 focus-visible:ring-caneta/50 active:scale-[0.97] disabled:opacity-60 sm:h-[164px] sm:w-[164px] ${
            g.gravando ? 'bg-atraso text-white' : 'bg-oleo text-[#1b1f22]'
          }`}
        >
          {g.gravando ? <Square size={44} fill="currentColor" strokeWidth={0} /> : <Mic size={60} strokeWidth={2.2} />}
        </button>
      </div>
      <div className="mt-5 min-h-[76px]" aria-live="polite">
        {g.gravando ? (
          <>
            <p className="text-[18px] font-bold">Toque para terminar</p>
            <p className="mt-1 text-[14.5px] text-tinta-2">
              {g.mudo ? 'Não está chegando som. Confira se o microfone não está tampado.' : restantes <= 30 ? `Faltam ${restantes} segundos.` : 'Pode falar à vontade, até 5 minutos.'}
            </p>
          </>
        ) : (
          <>
            <p className="text-[18px] font-bold">Toque para falar</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[14.5px] text-tinta-2">Conte a placa, a quilometragem, o que trocou (com a marca) e o que encontrou no carro.</p>
          </>
        )}
      </div>
      {g.gravando ? (
        <button type="button" onClick={g.cancelar} className="mt-1 h-10 rounded-[10px] px-4 text-[14.5px] font-semibold text-tinta-2 hover:bg-papel-2 hover:text-tinta">
          Cancelar e jogar fora
        </button>
      ) : null}
      {g.erro ? (
        <p className="mt-2 max-w-[40ch] rounded-xl bg-atraso-claro px-4 py-2.5 text-[14px] text-atraso" role="alert">
          {g.erro}
        </p>
      ) : null}
    </div>
  );
}

/** O Falar mais da conferência: grava mais um trecho, que entra no texto e preenche a ordem de novo. */
export function MicrofonePequeno({ aoGravar, desabilitado = false }: { aoGravar: (c: Clipe) => void; desabilitado?: boolean }) {
  const g = useGravador(aoGravar);
  if (g.gravando) {
    return (
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="relative grid h-11 w-11 place-items-center">
          <span ref={g.halo} aria-hidden="true" className="absolute inset-0 rounded-full bg-atraso/20" />
          <button type="button" onClick={g.parar} aria-label="Parar a gravação" className="relative grid h-9 w-9 place-items-center rounded-full bg-atraso text-white">
            <Square size={15} fill="currentColor" strokeWidth={0} />
          </button>
        </span>
        <p className="text-[14.5px] font-semibold text-atraso">
          Gravando <span className="num">{tempo(g.segundos)}</span>
        </p>
        <button type="button" onClick={g.cancelar} className="h-9 rounded-[10px] px-3 text-[14px] font-semibold text-tinta-2 hover:bg-papel-2">
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void g.comecar()}
        disabled={desabilitado}
        className="inline-flex h-11 items-center gap-2 self-start rounded-[10px] border border-linha bg-papel px-4 text-[15px] font-semibold text-tinta hover:border-tinta-3 disabled:opacity-45"
      >
        <Mic size={18} className="text-oleo-tinta" aria-hidden="true" /> Falar mais
      </button>
      {g.erro ? (
        <p className="text-[13.5px] text-atraso" role="alert">
          {g.erro}
        </p>
      ) : null}
    </div>
  );
}
