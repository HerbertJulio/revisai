import Link from 'next/link';
import type { ReactNode } from 'react';

/** Um número em destaque no topo dos painéis (vendas do mês, pedidos esperando). */
export function Numero({ rotulo, valor, detalhe, href }: { rotulo: string; valor: string; detalhe?: ReactNode; href?: string }) {
  const corpo = (
    <>
      <p className="text-[13px] font-semibold text-tinta-3">{rotulo}</p>
      <p className="largo num mt-0.5 text-[22px] font-extrabold">{valor}</p>
      {detalhe ? <p className="text-[12.5px] text-tinta-3">{detalhe}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha transition-shadow hover:ring-tinta-3">
      {corpo}
    </Link>
  ) : (
    <div className="rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">{corpo}</div>
  );
}

export function Numeros({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}
