'use client';

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface ItemMenu {
  rotulo: string;
  fazer: () => void;
  perigo?: boolean;
  icone?: ReactNode;
}

/** Botão "mais opções" com uma lista que abre para cima perto do fim da tela. */
export function Menu({ itens, rotulo = 'Mais opções' }: { itens: ItemMenu[]; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const [paraCima, setParaCima] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setParaCima(window.innerHeight - r.bottom < 300);
          setAberto((a) => !a);
        }}
        className="grid h-11 w-11 place-items-center rounded-[10px] border border-linha bg-papel text-tinta-2 hover:border-tinta-3 hover:text-tinta"
      >
        <MoreHorizontal size={20} />
      </button>
      {aberto ? (
        <ul
          id={id}
          role="menu"
          className={`absolute right-0 z-30 min-w-[230px] overflow-hidden rounded-xl border border-linha bg-papel py-1 shadow-etiqueta ${paraCima ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {itens.map((item) => (
            <li key={item.rotulo} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAberto(false);
                  item.fazer();
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] hover:bg-papel-2 ${item.perigo ? 'text-atraso' : ''}`}
              >
                {item.icone}
                {item.rotulo}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
