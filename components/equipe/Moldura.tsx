import {
  BadgeCheck,
  BadgePercent,
  BookMarked,
  Building2,
  ChartColumn,
  ChartLine,
  Fingerprint,
  Funnel,
  Grid3x3,
  History,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  ShieldAlert,
  ShoppingCart,
  Smile,
  Store,
  UserSearch,
  Users,
  Wallet,
  Wrench
} from 'lucide-react';
import type { ReactNode } from 'react';
import { sairDaEquipe } from '@/app/admin/entrar/acoes';
import { MolduraDePainel, type GrupoPainel, type ItemPainel } from '@/components/painel/MolduraDePainel';
import { contarNovos } from '@/lib/equipe/dados';
import { nomeDoPapelEquipe, pode, type Permissao } from '@/lib/equipe/papeis';
import type { AcessoEquipe } from '@/lib/equipe/sessao';

export type Aba =
  | 'resumo'
  | 'pedidos'
  | 'cadastros'
  | 'suporte'
  | 'titulares'
  | 'oficinas'
  | 'pro'
  | 'base'
  | 'fornecedores'
  | 'lojas-em-analise'
  | 'promocoes'
  | 'impulsos'
  | 'assinaturas'
  | 'cobrancas'
  | 'marketplace'
  | 'coortes'
  | 'uso'
  | 'nps'
  | 'antifraude'
  | 'equipe'
  | 'historico'
  | 'acessos';

type Item = ItemPainel & { permissao: Permissao };

/** Lateral, abas e título do painel da equipe. Só aparece o que o papel da pessoa pode usar. */
export async function Moldura({
  acesso,
  aba,
  titulo,
  descricao,
  acao,
  children
}: {
  acesso: AcessoEquipe;
  aba: Aba;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const novos = await contarNovos(acesso.sb);
  const grupos: { titulo?: string; itens: Item[] }[] = [
    { itens: [{ id: 'resumo', href: '/admin', rotulo: 'Resumo', Icone: LayoutDashboard, permissao: 'ver' }] },
    {
      titulo: 'Atendimento',
      itens: [
        { id: 'pedidos', href: '/admin/pedidos', rotulo: 'Pedidos', Icone: ShoppingCart, contador: novos.pedidos, permissao: 'ver' },
        { id: 'cadastros', href: '/admin/cadastros', rotulo: 'Cadastros', Icone: Inbox, contador: novos.cadastros, permissao: 'mudarCadastro' },
        { id: 'suporte', href: '/admin/suporte', rotulo: 'Suporte', Icone: LifeBuoy, contador: novos.chamados, permissao: 'suporte' },
        { id: 'titulares', href: '/admin/titulares', rotulo: 'Dados pessoais', Icone: UserSearch, permissao: 'titulares' }
      ]
    },
    {
      titulo: 'Oficinas',
      itens: [
        { id: 'oficinas', href: '/admin/oficinas', rotulo: 'Oficinas', Icone: Wrench, permissao: 'ver' },
        { id: 'pro', href: '/admin/pro', rotulo: 'Pro', Icone: BadgeCheck, permissao: 'verAssinaturas' },
        { id: 'base', href: '/admin/base', rotulo: 'Base de prazos', Icone: BookMarked, contador: novos.sugestoes, permissao: 'ver' }
      ]
    },
    {
      titulo: 'Lojas',
      itens: [
        { id: 'fornecedores', href: '/admin/fornecedores', rotulo: 'Lojas', Icone: Store, permissao: 'ver' },
        { id: 'lojas-em-analise', href: '/admin/lojas-em-analise', rotulo: 'Em análise', Icone: Building2, contador: novos.lojas, permissao: 'decidirLoja' },
        { id: 'promocoes', href: '/admin/promocoes', rotulo: 'Promoções', Icone: BadgePercent, permissao: 'ver' },
        { id: 'impulsos', href: '/admin/impulsos', rotulo: 'Impulsos', Icone: Megaphone, contador: novos.impulsos, permissao: 'ver' }
      ]
    },
    {
      titulo: 'Números',
      itens: [
        { id: 'assinaturas', href: '/admin/assinaturas', rotulo: 'Assinaturas', Icone: ChartLine, permissao: 'numerosDeAssinatura' },
        { id: 'cobrancas', href: '/admin/cobrancas', rotulo: 'Cobranças', Icone: Wallet, permissao: 'mudarPlano' },
        { id: 'marketplace', href: '/admin/marketplace', rotulo: 'Marketplace', Icone: ChartColumn, permissao: 'numeros' },
        { id: 'coortes', href: '/admin/coortes', rotulo: 'Coortes', Icone: Grid3x3, permissao: 'numeros' },
        { id: 'uso', href: '/admin/uso', rotulo: 'Uso e funil', Icone: Funnel, permissao: 'numeros' },
        { id: 'nps', href: '/admin/nps', rotulo: 'NPS', Icone: Smile, permissao: 'ver' },
        { id: 'antifraude', href: '/admin/antifraude', rotulo: 'Antifraude', Icone: ShieldAlert, permissao: 'numeros' }
      ]
    },
    {
      titulo: 'Equipe',
      itens: [
        { id: 'equipe', href: '/admin/equipe', rotulo: 'Pessoas', Icone: Users, permissao: 'equipe' },
        { id: 'historico', href: '/admin/historico', rotulo: 'Histórico', Icone: History, permissao: 'historico' },
        { id: 'acessos', href: '/admin/acessos', rotulo: 'Registros de acesso', Icone: Fingerprint, permissao: 'acessos' }
      ]
    }
  ];
  const visiveis: GrupoPainel[] = grupos
    .map((g) => ({ titulo: g.titulo, itens: g.itens.filter((i) => pode(acesso.papel, i.permissao)).map(({ permissao: _, ...i }) => i) }))
    .filter((g) => g.itens.length);
  return (
    <MolduraDePainel
      grupos={visiveis}
      atual={aba}
      selo={`${nomeDoPapelEquipe(acesso.papel)} da equipe`}
      inicio="/admin"
      rotuloInicio="Revisaí, painel da equipe"
      sair={sairDaEquipe}
      titulo={titulo}
      descricao={descricao}
      acao={acao}
    >
      {children}
    </MolduraDePainel>
  );
}
