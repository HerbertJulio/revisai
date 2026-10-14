'use client';

// Fotos da ordem: reduzidas no próprio aparelho antes de ir para a IA e guardadas junto com o áudio.

import { X } from 'lucide-react';
import { useState } from 'react';
import { reduzirFoto } from '@/lib/imagem-cliente';
import { guardarMidia } from '@/lib/midia';
import { novoId } from './gravador';
import type { FotoLocal } from './sessao';

export const MAX_FOTOS = 6;

/** Prepara as fotos escolhidas (até completar o máximo) e já guarda no aparelho. */
export async function prepararFotos(lista: FileList | null, jaTem: number): Promise<{ novas: FotoLocal[]; erro: string | null }> {
  if (!lista?.length) return { novas: [], erro: null };
  const espaco = MAX_FOTOS - jaTem;
  if (espaco <= 0) return { novas: [], erro: `No máximo ${MAX_FOTOS} fotos por ordem.` };
  const novas: FotoLocal[] = [];
  let erro: string | null = lista.length > espaco ? `Entraram só ${espaco} ${espaco === 1 ? 'foto' : 'fotos'}: o máximo é ${MAX_FOTOS} por ordem.` : null;
  for (const f of Array.from(lista).slice(0, espaco)) {
    try {
      const reduzida = await reduzirFoto(f, 1280, 0.8);
      const id = novoId();
      await guardarMidia(id, reduzida);
      novas.push({ id, arquivo: reduzida, url: URL.createObjectURL(reduzida) });
    } catch (e) {
      erro = e instanceof Error ? e.message : 'Não deu para abrir uma das fotos.';
    }
  }
  return { novas, erro };
}

/** O botão que abre a câmera ou a galeria (o celular oferece as duas). */
export function BotaoDeFotos({
  quantas,
  aoIncluir,
  className,
  children
}: {
  quantas: number;
  aoIncluir: (novas: FotoLocal[]) => void;
  className: string;
  children: React.ReactNode;
}) {
  const [preparando, setPreparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cheio = quantas >= MAX_FOTOS;
  return (
    <>
      <label className={`${className} ${cheio || preparando ? 'pointer-events-none opacity-45' : 'cursor-pointer'}`} aria-disabled={cheio || preparando}>
        {preparando ? 'Preparando…' : children}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={cheio || preparando}
          onChange={(e) => {
            const alvo = e.target;
            setPreparando(true);
            setErro(null);
            void prepararFotos(alvo.files, quantas).then(({ novas, erro }) => {
              setPreparando(false);
              setErro(erro);
              if (novas.length) aoIncluir(novas);
              alvo.value = '';
            });
          }}
        />
      </label>
      {erro ? (
        <p className="basis-full text-[13.5px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
    </>
  );
}

/** As fotos escolhidas, pequenas, com o X para tirar. */
export function Miniaturas({ fotos, aoTirar }: { fotos: FotoLocal[]; aoTirar: (f: FotoLocal) => void }) {
  if (!fotos.length) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {fotos.map((f, i) => (
        <li key={f.id} className="relative">
          <img src={f.url} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-xl object-cover ring-1 ring-linha" />
          <button type="button" onClick={() => aoTirar(f)} className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-tinta text-papel ring-2 ring-fundo" aria-label={`Tirar a foto ${i + 1}`}>
            <X size={13} strokeWidth={3} />
          </button>
        </li>
      ))}
    </ul>
  );
}

