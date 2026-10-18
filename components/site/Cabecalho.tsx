import Link from 'next/link';
import { Logo } from '@/components/marca';
import { classeBotao } from '@/components/ui';
import { dadosDaEmpresa } from '@/lib/avisos/empresa';

const LINKS = [
  { href: '/#como-funciona', rotulo: 'Como funciona' },
  { href: '/fornecedores', rotulo: 'Para fornecedores' },
  { href: '/motorista', rotulo: 'Para quem tem carro' },
  { href: '/planos', rotulo: 'Planos' }
];

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-30 border-b border-linha/70 bg-fundo/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Revisaí, página inicial">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-[15px] font-semibold text-tinta-2 md:flex" aria-label="Site">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-tinta">
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <Link href="/oficina" className={classeBotao('escuro', 'pequeno')}>
          Abrir o painel
        </Link>
      </div>
    </header>
  );
}

const DOCUMENTOS_LEGAIS = [
  { href: '/termos', rotulo: 'Termos de uso' },
  { href: '/privacidade', rotulo: 'Privacidade' },
  { href: '/contrato-lojas', rotulo: 'Contrato das lojas' },
  { href: '/tratamento-de-dados', rotulo: 'Tratamento de dados' },
  { href: '/seguranca', rotulo: 'Segurança' }
];

export function Rodape() {
  const empresa = dadosDaEmpresa();
  return (
    <footer className="mt-24 border-t border-linha bg-papel">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-sm text-[15px] text-tinta-2">Lembrete de troca de óleo e revisão para oficinas, com a loja de peças junto.</p>
        </div>
        <nav className="flex flex-col gap-2 text-[15px]" aria-label="Revisaí">
          <p className="font-bold">Revisaí</p>
          <Link href="/oficina" className="text-tinta-2 hover:text-tinta">
            Painel da oficina
          </Link>
          <Link href="/#como-funciona" className="text-tinta-2 hover:text-tinta">
            Como funciona
          </Link>
          <Link href="/planos" className="text-tinta-2 hover:text-tinta">
            Planos
          </Link>
        </nav>
        <nav className="flex flex-col gap-2 text-[15px]" aria-label="Para você">
          <p className="font-bold">Para você</p>
          <Link href="/fornecedores" className="text-tinta-2 hover:text-tinta">
            Fornecedores
          </Link>
          <Link href="/motorista" className="text-tinta-2 hover:text-tinta">
            Quem tem carro
          </Link>
          <Link href="/creditos" className="text-tinta-2 hover:text-tinta">
            Créditos das fotos
          </Link>
        </nav>
        <nav className="flex flex-col gap-2 text-[15px]" aria-label="Documentos">
          <p className="font-bold">Documentos</p>
          {DOCUMENTOS_LEGAIS.map((d) => (
            <Link key={d.href} href={d.href} className="text-tinta-2 hover:text-tinta">
              {d.rotulo}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 pb-10 text-[13px] text-tinta-3 sm:px-6">
        <p>
          {empresa.razaoSocial} · CNPJ {empresa.cnpj} · {empresa.endereco}
        </p>
        <p>
          Contato: {empresa.emailContato} · © {new Date().getFullYear()} Revisaí
        </p>
      </div>
    </footer>
  );
}
