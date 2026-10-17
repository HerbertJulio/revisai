'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { relatarErro } from '@/components/avisos/RelatorDeErros';
import { Logo } from '@/components/marca';
import { Botao, classeBotao } from '@/components/ui';

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => relatarErro(error, 'tela'), [error]);
  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl content-center gap-6 px-4 py-16 sm:px-6">
      <Logo />
      <div>
        <h1 className="largo text-[30px]">Algo deu errado nesta tela</h1>
        <p className="mt-2 text-tinta-2">
          Os seus dados continuam salvos no aparelho. Tente de novo; se o app ficou aberto por muito tempo, recarregar a página costuma resolver.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Botao variante="primario" onClick={() => reset()}>
          Tentar de novo
        </Botao>
        <Botao onClick={() => window.location.reload()}>Recarregar a página</Botao>
        <Link href="/oficina" className={classeBotao('fantasma')}>
          Ir para os avisos
        </Link>
      </div>
    </main>
  );
}
