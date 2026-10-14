import { BadgeCheck, BadgePercent, BookMarked, Inbox, LayoutDashboard, Megaphone, ShoppingCart, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { sair } from '@/app/admin/acoes';
import { MolduraDePainel, type GrupoPainel } from '@/components/painel/MolduraDePainel';
import { contarNovos } from '@/lib/equipe';

export type Aba = 'resumo' | 'pedidos' | 'cadastros' | 'fornecedores' | 'promocoes' | 'impulsos' | 'base' | 'pro';

/** Lateral, abas e título do painel administrativo (só para quem já entrou). */
export async function Moldura({ aba, titulo, descricao, acao, children }: { aba: Aba; titulo: string; descricao?: ReactNode; acao?: ReactNode; children: ReactNode }) {
  const novos = await contarNovos();
  const grupos: GrupoPainel[] = [
    { itens: [{ id: 'resumo', href: '/admin', rotulo: 'Resumo', Icone: LayoutDashboard }] },
    {
      titulo: 'Vendas',
      itens: [
        { id: 'pedidos', href: '/admin/pedidos', rotulo: 'Pedidos', Icone: ShoppingCart, contador: novos.pedidos },
        { id: 'cadastros', href: '/admin/cadastros', rotulo: 'Cadastros', Icone: Inbox, contador: novos.cadastros }
      ]
    },
    {
      titulo: 'Marketplace',
      itens: [
        { id: 'fornecedores', href: '/admin/fornecedores', rotulo: 'Fornecedores', Icone: Store },
        { id: 'promocoes', href: '/admin/promocoes', rotulo: 'Promoções', Icone: BadgePercent },
        { id: 'impulsos', href: '/admin/impulsos', rotulo: 'Impulsos', Icone: Megaphone, contador: novos.impulsos }
      ]
    },
    {
      titulo: 'Oficinas',
      itens: [
        { id: 'pro', href: '/admin/pro', rotulo: 'Pro', Icone: BadgeCheck },
        { id: 'base', href: '/admin/base', rotulo: 'Base de prazos', Icone: BookMarked, contador: novos.sugestoes }
      ]
    }
  ];
  return (
    <MolduraDePainel grupos={grupos} atual={aba} selo="Painel administrativo" inicio="/admin" rotuloInicio="Revisaí, painel administrativo" sair={sair} titulo={titulo} descricao={descricao} acao={acao}>
      {children}
    </MolduraDePainel>
  );
}
