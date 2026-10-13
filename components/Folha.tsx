'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Diálogo nativo: sobe do rodapé no celular e fica no centro no computador. Esc e toque fora fecham. */
export function Folha({
  aberta,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    else if (!aberta && d.open) d.close();
  }, [aberta]);

  return (
    <dialog
      ref={ref}
      className="folha"
      onClose={aoFechar}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
    >
      {aberta ? (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-linha px-5 pt-4 pb-3">
            <div className="min-w-0">
              <h2 className="text-[19px]">{titulo}</h2>
              {descricao ? <p className="mt-1 text-[14px] text-tinta-2">{descricao}</p> : null}
            </div>
            <button type="button" onClick={aoFechar} aria-label="Fechar" className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-tinta-2 hover:bg-papel-2">
              <X size={20} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {rodape ? <footer className="flex flex-wrap justify-end gap-2 border-t border-linha px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{rodape}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
