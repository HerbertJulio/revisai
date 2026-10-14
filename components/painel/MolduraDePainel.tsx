import { LogOut, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/marca';
import { Toasts } from '@/components/Toasts';
import { RolarAteAtual } from './RolarAteAtual';

// Casca dos painéis de trabalho (administrativo e do fornecedor): lateral com as seções em grupos
// no computador e abas que rolam no celular.

export interface ItemPainel {
  id: string;
  href: string;
  rotulo: string;
  Icone: LucideIcon;
  /** Quantos itens esperam resposta nesta seção. */
  contador?: number;
}

export interface GrupoPainel {
  titulo?: string;
  itens: ItemPainel[];
}

export function MolduraDePainel({
  grupos,
  atual,
  selo,
  inicio,
  rotuloInicio,
  sair,
  titulo,
  descricao,
  acao,
  children
}: {
  grupos: GrupoPainel[];
  atual: string;
  /** Quem está no painel: "Admin" ou o nome da loja. */
  selo: string;
  inicio: string;
  rotuloInicio: string;
  sair: () => Promise<void>;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const todos = grupos.flatMap((g) => g.itens);
  return (
    <Toasts>
      <div className="min-h-dvh lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-linha bg-papel lg:flex">
          <div className="flex flex-col gap-2 border-b border-linha px-5 pt-5 pb-4">
            <Link href={inicio} aria-label={rotuloInicio} className="self-start">
              <Logo />
            </Link>
            <p className="truncate px-0.5 text-[13.5px] font-semibold text-tinta-3" title={selo}>
              {selo}
            </p>
          </div>
          <nav className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Seções do painel">
            {grupos.map((g, i) => (
              <div key={g.titulo ?? i} className={i ? 'mt-5' : ''}>
                {g.titulo ? <p className="px-3 pb-1.5 text-[12.5px] font-semibold text-tinta-3">{g.titulo}</p> : null}
                <ul className="flex flex-col gap-0.5">
                  {g.itens.map((item) => (
                    <li key={item.id}>
                      <ItemLateral item={item} ativo={item.id === atual} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <form action={sair} className="border-t border-linha px-3 py-3">
            <button type="submit" className="flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold text-tinta-2 hover:bg-papel-2 hover:text-tinta">
              <LogOut size={18} aria-hidden="true" /> Sair
            </button>
          </form>
        </aside>

        <header className="sticky top-0 z-30 border-b border-linha bg-papel/95 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link href={inicio} aria-label={rotuloInicio}>
                <Logo tamanho={26} />
              </Link>
              <span className="truncate rounded-full border border-linha px-2.5 py-0.5 text-[13px] font-semibold text-tinta-2">{selo}</span>
            </div>
            <form action={sair}>
              <button type="submit" className="h-9 rounded-[10px] px-3 text-sm font-semibold text-tinta-2 hover:bg-papel-2">
                Sair
              </button>
            </form>
          </div>
          <nav className="overflow-x-auto" aria-label="Seções do painel" data-abas>
            <ul className="flex w-max gap-1 px-2">
              {todos.map((item) => {
                const ativo = item.id === atual;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      aria-current={ativo ? 'page' : undefined}
                      className={`relative flex h-11 items-center gap-2 px-3 text-[15px] font-semibold ${ativo ? 'text-tinta' : 'text-tinta-3 hover:text-tinta'}`}
                    >
                      {item.rotulo}
                      {item.contador ? <Contador n={item.contador} /> : null}
                      {ativo ? <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-oleo" aria-hidden="true" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <RolarAteAtual />
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="largo text-[30px] leading-tight sm:text-[34px]">{titulo}</h1>
              {descricao ? <div className="mt-1.5 max-w-prose text-[15px] text-tinta-2">{descricao}</div> : null}
            </div>
            {acao}
          </div>
          {children}
        </main>
      </div>
    </Toasts>
  );
}

function ItemLateral({ item, ativo }: { item: ItemPainel; ativo: boolean }) {
  const { Icone } = item;
  return (
    <Link
      href={item.href}
      aria-current={ativo ? 'page' : undefined}
      className={`flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold transition-colors ${ativo ? 'bg-tinta text-papel' : 'text-tinta-2 hover:bg-papel-2 hover:text-tinta'}`}
    >
      <Icone size={18} aria-hidden="true" />
      <span className="flex-1 truncate">{item.rotulo}</span>
      {item.contador ? <Contador n={item.contador} /> : null}
    </Link>
  );
}

function Contador({ n }: { n: number }) {
  return (
    <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-oleo px-1.5 text-[12px] font-bold text-[#1b1f22]" aria-label={`${n} esperando`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
