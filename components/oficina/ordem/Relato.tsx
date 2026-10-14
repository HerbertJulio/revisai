'use client';

// O que o mecânico falou, já em texto, no topo da conferência. Dá para ouvir o áudio, corrigir o
// texto e preencher de novo, ou falar mais um trecho (que entra no texto e preenche a ordem de novo).

import { Pencil, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { classeArea, classeBotao } from '@/components/ui';
import { MAX_RELATO } from '@/lib/agente/relato';
import { MicrofonePequeno, tempo, type Clipe } from './gravador';

export function CartaoDoRelato({
  clipes,
  pendentes,
  relato,
  aoMudar,
  mudou,
  aoPreencher,
  aoFalarMais
}: {
  clipes: Clipe[];
  /** Áudios que ainda não viraram texto (a internet caiu, ou ele fechou o erro). */
  pendentes: number;
  relato: string;
  aoMudar: (texto: string) => void;
  /** O texto ou as fotos mudaram desde que a ordem foi preenchida. */
  mudou: boolean;
  aoPreencher: () => void;
  aoFalarMais: (c: Clipe) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const longo = relato.length > 360 || relato.split('\n').length > 5;

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-papel p-4 ring-1 ring-linha sm:p-5" aria-labelledby="titulo-relato">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-relato" className="text-[19px]">
          {clipes.length ? 'O que você falou' : 'O que você escreveu'}
        </h2>
        {editando ? null : (
          <button type="button" onClick={() => setEditando(true)} className="-mr-1 inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[14px] font-semibold text-caneta hover:bg-caneta-claro">
            <Pencil size={15} aria-hidden="true" /> Corrigir o texto
          </button>
        )}
      </div>

      {clipes.length ? (
        <ul className="flex flex-col gap-1.5">
          {clipes.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <audio src={c.url} controls preload="metadata" className="h-10 min-w-0 flex-1" aria-label={`Áudio ${i + 1}`} />
              {c.segundos ? <span className="num w-10 shrink-0 text-right text-[13px] text-tinta-3">{tempo(c.segundos)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {editando ? (
        <textarea
          rows={Math.min(12, Math.max(4, Math.ceil(relato.length / 55)))}
          className={classeArea}
          value={relato}
          onChange={(e) => aoMudar(e.target.value)}
          maxLength={MAX_RELATO}
          aria-label="Texto da ordem"
          autoFocus
        />
      ) : (
        <div>
          <blockquote className={`rounded-r-xl border-l-4 border-oleo bg-papel-2 px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-line ${longo && !aberto ? 'line-clamp-5' : ''}`}>
            {relato.trim() || 'Sem texto.'}
          </blockquote>
          {longo ? (
            <button type="button" onClick={() => setAberto(!aberto)} className="mt-1 text-[13.5px] font-semibold text-caneta hover:underline">
              {aberto ? 'Ver menos' : 'Ver o texto todo'}
            </button>
          ) : null}
        </div>
      )}

      {pendentes ? (
        <p className="rounded-xl bg-oleo-claro px-3.5 py-2 text-[14px] text-oleo-tinta">
          {pendentes === 1 ? 'Um áudio ainda não virou texto.' : `${pendentes} áudios ainda não viraram texto.`} Toque em Preencher de novo para passar para texto e preencher a ordem.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <MicrofonePequeno aoGravar={aoFalarMais} />
        {mudou ? (
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              aoPreencher();
            }}
            disabled={!relato.trim() && !pendentes}
            className={classeBotao('escuro')}
          >
            <RefreshCw size={16} aria-hidden="true" /> Preencher de novo
          </button>
        ) : null}
        {editando ? (
          <button type="button" onClick={() => setEditando(false)} className={classeBotao('fantasma')}>
            Pronto
          </button>
        ) : null}
      </div>
      <p className="text-[13px] text-tinta-3">Esqueceu alguma coisa? Toque em Falar mais. O que você falar entra no texto e a IA preenche a ordem de novo.</p>
    </section>
  );
}
