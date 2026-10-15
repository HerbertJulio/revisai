import { BadgePercent, BellRing, LayoutDashboard, Megaphone, Package, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { sairDoPainel } from '@/app/fornecedor/acoes';
import { Logo } from '@/components/marca';
import { MolduraDePainel, type GrupoPainel } from '@/components/painel/MolduraDePainel';
import { classeBotao } from '@/components/ui';

export type AbaFornecedor = 'inicio' | 'produtos' | 'promocoes' | 'pedidos' | 'alertas' | 'plano';

/** Lateral, abas e título do painel do fornecedor. */
export function MolduraFornecedor({
  aba,
  loja,
  titulo,
  descricao,
  acao,
  novos = 0,
  alertas = 0,
  children
}: {
  aba: AbaFornecedor;
  loja: string;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  novos?: number;
  /** Alertas de preço esperando resposta. */
  alertas?: number;
  children: ReactNode;
}) {
  const grupos: GrupoPainel[] = [
    { itens: [{ id: 'inicio', href: '/fornecedor', rotulo: 'Início', Icone: LayoutDashboard }] },
    {
      titulo: 'Vitrine',
      itens: [
        { id: 'produtos', href: '/fornecedor/produtos', rotulo: 'Produtos', Icone: Package },
        { id: 'promocoes', href: '/fornecedor/promocoes', rotulo: 'Promoções', Icone: BadgePercent }
      ]
    },
    {
      titulo: 'Vendas',
      itens: [
        { id: 'pedidos', href: '/fornecedor/pedidos', rotulo: 'Pedidos', Icone: ShoppingCart, contador: novos },
        { id: 'alertas', href: '/fornecedor/alertas', rotulo: 'Alertas de preço', Icone: BellRing, contador: alertas },
        { id: 'plano', href: '/fornecedor/plano', rotulo: 'Plano e impulsos', Icone: Megaphone }
      ]
    }
  ];
  return (
    <MolduraDePainel grupos={grupos} atual={aba} selo={loja} inicio="/fornecedor" rotuloInicio="Revisaí, painel do fornecedor" sair={sairDoPainel} titulo={titulo} descricao={descricao} acao={acao}>
      {children}
    </MolduraDePainel>
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
