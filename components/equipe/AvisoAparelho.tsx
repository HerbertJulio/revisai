'use client';

import { Smartphone, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { dispensarAvisoDeAparelho } from '@/app/admin/entrar/acoes';

/** Aviso no resumo depois de entrar de um aparelho que a conta nunca tinha usado. */
export function AvisoAparelho({ descricao }: { descricao: string }) {
  const [aberto, setAberto] = useState(true);
  const [, iniciar] = useTransition();
  if (!aberto) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-caneta-claro px-4 py-3 text-[15px] text-caneta sm:px-5" role="status">
      <Smartphone size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Primeira entrada neste aparelho ({descricao}).</span> Ela ficou anotada no histórico da equipe. Se não foi você, saia agora e avise um admin.
      </p>
      <button
        type="button"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/50"
        aria-label="Fechar o aviso"
        onClick={() => {
          setAberto(false);
          iniciar(() => dispensarAvisoDeAparelho());
        }}
      >
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
