// Marca do Revisaí: a gota de óleo com o visto, sobre o âmbar da etiqueta de troca.

export function Marca({ tamanho = 28, className = '' }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" fill="#F2A900" />
      <path d="M16 5.5c0 0-7.5 8.6-7.5 13.4a7.5 7.5 0 0 0 15 0C23.5 14.1 16 5.5 16 5.5z" fill="#1B1F22" />
      <path d="M12.6 19.2l2.4 2.4 4.6-4.9" fill="none" stroke="#F2A900" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = '', tamanho = 28 }: { className?: string; tamanho?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Marca tamanho={tamanho} />
      <span className="largo text-[19px] leading-none font-[850] tracking-[-0.025em]">Revisaí</span>
    </span>
  );
}
