'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  texto: string;
  acao?: { rotulo: string; fazer: () => void };
  tom?: 'normal' | 'erro';
}

const Contexto = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function useToast() {
  return useContext(Contexto);
}

export function Toasts({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const proximo = useRef(1);

  const mostrar = useCallback((t: Omit<Toast, 'id'>) => {
    const id = proximo.current++;
    setLista((l) => [...l.slice(-2), { ...t, id }]);
  }, []);
  const remover = useCallback((id: number) => setLista((l) => l.filter((x) => x.id !== id)), []);

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
      >
        {lista.map((t) => (
          <Item key={t.id} toast={t} remover={remover} />
        ))}
      </div>
    </Contexto.Provider>
  );
}

function Item({ toast, remover }: { toast: Toast; remover: (id: number) => void }) {
  const aoSumir = () => remover(toast.id);
  useEffect(() => {
    const t = setTimeout(() => remover(toast.id), toast.acao ? 6500 : 4000);
    return () => clearTimeout(t);
  }, [remover, toast.id, toast.acao]);
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl px-4 py-3 text-[15px] shadow-etiqueta ${
        toast.tom === 'erro' ? 'bg-atraso text-white' : 'bg-tinta text-papel'
      }`}
      role="status"
    >
      <span>{toast.texto}</span>
      {toast.acao ? (
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 font-bold text-oleo hover:bg-white/10"
          onClick={() => {
            toast.acao!.fazer();
            aoSumir();
          }}
        >
          {toast.acao.rotulo}
        </button>
      ) : null}
    </div>
  );
}
