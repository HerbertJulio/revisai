import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/marca';

/** A moldura das telas de entrada e de conta: logo, título e um cartão no meio. */
export function TelaDeConta({ titulo, subtitulo, children, largura = 'max-w-sm', rodape = true }: { titulo: string; subtitulo?: ReactNode; children: ReactNode; largura?: string; rodape?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className={`w-full ${largura}`}>
        <div className="rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
          <Link href="/" aria-label="Revisaí, página inicial">
            <Logo />
          </Link>
          <h1 className="largo mt-6 text-[26px] leading-tight">{titulo}</h1>
          {subtitulo ? <p className="mt-1.5 mb-6 text-[15px] text-tinta-2">{subtitulo}</p> : <div className="mb-6" />}
          {children}
        </div>
        {rodape ? (
          <p className="mt-4 text-center text-[13px] text-tinta-3">
            Ao entrar, você aceita os{' '}
            <Link href="/termos" className="underline">
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="underline">
              política de privacidade
            </Link>
            .
          </p>
        ) : null}
      </div>
    </main>
  );
}
