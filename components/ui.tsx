// Peças básicas da interface. Sem estado: servem tanto para páginas do servidor quanto do navegador.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'primario' | 'escuro' | 'secundario' | 'fantasma' | 'perigo' | 'whatsapp' | 'claro';
type Tamanho = 'pequeno' | 'normal' | 'grande';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-oleo text-[#1b1f22] hover:brightness-[0.96] active:brightness-90',
  escuro: 'bg-tinta text-papel hover:opacity-90',
  secundario: 'bg-papel text-tinta border border-linha hover:border-tinta-3',
  fantasma: 'text-tinta-2 hover:bg-papel-2 hover:text-tinta',
  perigo: 'bg-papel text-atraso border border-linha hover:border-atraso',
  whatsapp: 'bg-ok text-sobre-ok hover:brightness-110',
  /** Para superfícies escuras (o resumo do dia). */
  claro: 'border border-white/30 text-white hover:border-white/70 hover:bg-white/5'
};

const TAMANHOS: Record<Tamanho, string> = {
  pequeno: 'h-9 px-3 text-sm gap-1.5',
  normal: 'h-11 px-4 text-[15px] gap-2',
  grande: 'h-12 px-5 text-base gap-2'
};

export function classeBotao(variante: Variante = 'secundario', tamanho: Tamanho = 'normal', extra = ''): string {
  return [
    'inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold whitespace-nowrap transition-[filter,background-color,border-color,opacity] select-none',
    'disabled:pointer-events-none disabled:opacity-45',
    VARIANTES[variante],
    TAMANHOS[tamanho],
    extra
  ].join(' ');
}

export function Botao({
  variante = 'secundario',
  tamanho = 'normal',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: Tamanho }) {
  return <button type={type} className={classeBotao(variante, tamanho, className)} {...props} />;
}

export const classeEntrada =
  'h-11 w-full min-w-0 rounded-[10px] border border-linha bg-papel px-3 text-[16px] outline-none transition-[border-color,box-shadow] placeholder:text-tinta-3 focus:border-caneta focus:ring-3 focus:ring-caneta/20 disabled:opacity-60';

export const classeArea =
  'w-full min-w-0 rounded-[10px] border border-linha bg-papel px-3 py-2.5 text-[16px] leading-relaxed outline-none transition-[border-color,box-shadow] placeholder:text-tinta-3 focus:border-caneta focus:ring-3 focus:ring-caneta/20';

export function Campo({
  rotulo,
  dica,
  erro,
  children,
  className = '',
  htmlFor
}: {
  rotulo: ReactNode;
  dica?: ReactNode;
  erro?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-tinta">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p className="text-sm text-atraso" role="alert">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-[13px] leading-snug text-tinta-3">{dica}</p>
      ) : null}
    </div>
  );
}

export function Alternar({
  ligado,
  aoMudar,
  rotulo,
  descricao,
  id
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: ReactNode;
  descricao?: ReactNode;
  id?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1" htmlFor={id}>
      <span className="flex flex-col">
        <span className="font-semibold">{rotulo}</span>
        {descricao ? <span className="text-[13px] leading-snug text-tinta-3">{descricao}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoMudar(!ligado)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors ${ligado ? 'border-tinta bg-tinta' : 'border-linha bg-papel-2'}`}
      >
        <span
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left,background-color] ${ligado ? 'left-[22px] bg-oleo' : 'left-[3px] bg-tinta-3'}`}
        />
      </button>
    </label>
  );
}

export function Chip({ children, tom = 'neutro', className = '' }: { children: ReactNode; tom?: 'neutro' | 'oleo' | 'atraso' | 'ok' | 'caneta'; className?: string }) {
  const tons = {
    neutro: 'bg-papel-2 text-tinta-2',
    oleo: 'bg-oleo-claro text-oleo-tinta',
    atraso: 'bg-atraso-claro text-atraso',
    ok: 'bg-ok-claro text-ok',
    caneta: 'bg-caneta-claro text-caneta'
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ${tons[tom]} ${className}`}>{children}</span>;
}

export function Vazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linha px-5 py-8">
      <p className="meio-largo text-lg font-bold">{titulo}</p>
      {children ? <div className="max-w-prose text-tinta-2">{children}</div> : null}
      {acao}
    </div>
  );
}

export function Secao({ titulo, descricao, acao, children, className = '' }: { titulo: ReactNode; descricao?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px]">{titulo}</h2>
          {descricao ? <p className="mt-1 text-[15px] text-tinta-2">{descricao}</p> : null}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
