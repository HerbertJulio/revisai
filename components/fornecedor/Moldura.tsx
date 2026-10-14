import Link from 'next/link';
import type { ReactNode } from 'react';
import { sairDoPainel } from '@/app/fornecedor/acoes';
import { Logo } from '@/components/marca';
import { Toasts } from '@/components/Toasts';
import { classeBotao } from '@/components/ui';

export type AbaFornecedor = 'inicio' | 'produtos' | 'promocoes' | 'pedidos' | 'plano';

const ABAS: { id: AbaFornecedor; href: string; rotulo: string }[] = [
  { id: 'inicio', href: '/fornecedor', rotulo: 'Início' },
  { id: 'produtos', href: '/fornecedor/produtos', rotulo: 'Produtos' },
  { id: 'promocoes', href: '/fornecedor/promocoes', rotulo: 'Promoções' },
  { id: 'pedidos', href: '/fornecedor/pedidos', rotulo: 'Pedidos' },
  { id: 'plano', href: '/fornecedor/plano', rotulo: 'Plano' }
];

/** Cabeçalho e abas do painel do fornecedor. */
export function MolduraFornecedor({
  aba,
  loja,
  titulo,
  descricao,
  novos = 0,
  children
}: {
  aba: AbaFornecedor;
  loja: string;
  titulo: string;
  descricao?: ReactNode;
  novos?: number;
  children: ReactNode;
}) {
  return (
    <Toasts>
      <div className="min-h-dvh">
        <header className="border-b border-linha bg-papel">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/fornecedor" aria-label="Revisaí, painel do fornecedor">
                <Logo />
              </Link>
              <span className="truncate rounded-full border border-linha px-2.5 py-0.5 text-[13px] font-semibold text-tinta-2">{loja}</span>
            </div>
            <form action={sairDoPainel}>
              <button type="submit" className={classeBotao('fantasma', 'pequeno')}>
                Sair
              </button>
            </form>
          </div>
          <nav className="mx-auto mt-3 max-w-5xl overflow-x-auto px-4 sm:px-6" aria-label="Seções do painel">
            <ul className="flex w-max gap-1">
              {ABAS.map((a) => {
                const atual = a.id === aba;
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      aria-current={atual ? 'page' : undefined}
                      className={`relative flex h-11 items-center gap-2 px-3 text-[15px] font-semibold ${atual ? 'text-tinta' : 'text-tinta-3 hover:text-tinta'}`}
                    >
                      {a.rotulo}
                      {a.id === 'pedidos' && novos > 0 ? (
                        <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-oleo px-1.5 text-[12px] font-bold text-[#1b1f22]" aria-label={`${novos} novos`}>
                          {novos}
                        </span>
                      ) : null}
                      {atual ? <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-oleo" aria-hidden="true" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>
        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:pt-8">
          <div>
            <h1 className="largo text-[30px] leading-tight sm:text-[34px]">{titulo}</h1>
            {descricao ? <div className="mt-1.5 max-w-prose text-[15px] text-tinta-2">{descricao}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </Toasts>
  );
}

/** Para quem chegou sem sessão (ou com um link que não vale mais). */
export function SemAcesso({ linkInvalido }: { linkInvalido: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
        <Logo />
        <h1 className="largo mt-6 text-[26px] leading-tight">Painel do fornecedor</h1>
        {linkInvalido ? (
          <p className="mt-3 rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
            Este link não vale mais. Peça um novo para a equipe do Revisaí.
          </p>
        ) : null}
        <p className="mt-3 text-[15px] text-tinta-2">
          Para entrar, abra o link de acesso que a equipe do Revisaí mandou para a sua loja. Ainda não vende no Revisaí?
        </p>
        <Link href="/fornecedores" className={`${classeBotao('escuro')} mt-5 w-full`}>
          Quero vender para as oficinas
        </Link>
      </div>
    </main>
  );
}
