import Link from 'next/link';
import { Logo } from '@/components/marca';
import { EtiquetaTroca } from '@/components/pecas';
import { classeBotao } from '@/components/ui';

export default function NaoEncontrada() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-3xl content-center gap-8 px-4 py-16 sm:px-6">
      <Link href="/" aria-label="Revisaí, página inicial">
        <Logo />
      </Link>
      <EtiquetaTroca data={null} km={404} situacao="atrasado" titulo="Página não encontrada" girar />
      <div>
        <h1 className="largo text-[32px]">Essa página não existe</h1>
        <p className="mt-2 text-tinta-2">O endereço pode ter mudado. Volte para o início ou abra o painel da oficina.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={classeBotao('secundario')}>
          Início
        </Link>
        <Link href="/oficina" className={classeBotao('primario')}>
          Abrir o painel
        </Link>
      </div>
    </main>
  );
}
