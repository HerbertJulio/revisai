import Link from 'next/link';
import type { ReactNode } from 'react';
import { sair } from '@/app/admin/acoes';
import { Logo } from '@/components/marca';
import { Toasts } from '@/components/Toasts';
import { classeBotao } from '@/components/ui';
import { contarNovos } from '@/lib/equipe';

export type Aba = 'resumo' | 'pedidos' | 'cadastros' | 'fornecedores' | 'promocoes' | 'impulsos' | 'base' | 'pro';

const ABAS: { id: Aba; href: string; rotulo: string }[] = [
  { id: 'resumo', href: '/admin', rotulo: 'Resumo' },
  { id: 'pedidos', href: '/admin/pedidos', rotulo: 'Pedidos' },
  { id: 'cadastros', href: '/admin/cadastros', rotulo: 'Cadastros' },
  { id: 'fornecedores', href: '/admin/fornecedores', rotulo: 'Fornecedores' },
  { id: 'promocoes', href: '/admin/promocoes', rotulo: 'Promoções' },
  { id: 'impulsos', href: '/admin/impulsos', rotulo: 'Impulsos' },
  { id: 'base', href: '/admin/base', rotulo: 'Base de prazos' },
  { id: 'pro', href: '/admin/pro', rotulo: 'Pro' }
];

/** Cabeçalho, abas e área de avisos do painel administrativo (só para quem já entrou). */
export async function Moldura({ aba, titulo, descricao, children }: { aba: Aba; titulo: string; descricao?: ReactNode; children: ReactNode }) {
  const novos = await contarNovos();
  const contador: Partial<Record<Aba, number>> = { pedidos: novos.pedidos, cadastros: novos.cadastros, impulsos: novos.impulsos, base: novos.sugestoes };

  return (
    <Toasts>
      <div className="min-h-dvh">
        <header className="border-b border-linha bg-papel">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/admin" aria-label="Revisaí, painel administrativo">
                <Logo />
              </Link>
              <span className="rounded-full border border-linha px-2.5 py-0.5 text-[13px] font-semibold text-tinta-2">Admin</span>
            </div>
            <form action={sair}>
              <button type="submit" className={classeBotao('fantasma', 'pequeno')}>
                Sair
              </button>
            </form>
          </div>
          <nav className="mx-auto mt-3 max-w-5xl overflow-x-auto px-4 sm:px-6" aria-label="Seções do painel">
            <ul className="flex w-max gap-1">
              {ABAS.map((a) => {
                const atual = a.id === aba;
                const n = contador[a.id] ?? 0;
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      aria-current={atual ? 'page' : undefined}
                      className={`relative flex h-11 items-center gap-2 px-3 text-[15px] font-semibold ${atual ? 'text-tinta' : 'text-tinta-3 hover:text-tinta'}`}
                    >
                      {a.rotulo}
                      {n > 0 ? (
                        <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-oleo px-1.5 text-[12px] font-bold text-[#1b1f22]" aria-label={`${n} novos`}>
                          {n}
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
            {descricao ? <p className="mt-1.5 max-w-prose text-[15px] text-tinta-2">{descricao}</p> : null}
          </div>
          {children}
        </main>
      </div>
    </Toasts>
  );
}
