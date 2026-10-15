import Link from 'next/link';
import { Logo } from '@/components/marca';

// Páginas que a oficina manda para o cliente dela (o orçamento): sem o menu do site do Revisaí.
export default function LayoutCliente({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-dvh pb-10">{children}</main>
      <footer className="nao-imprimir border-t border-linha px-4 py-6 text-center text-[13px] text-tinta-3">
        <Link href="/" className="inline-flex items-center gap-2 hover:text-tinta">
          Feito com <Logo tamanho={18} />
        </Link>
      </footer>
    </>
  );
}
