import { BadgePercent, BellRing, LayoutDashboard, Megaphone, Package, ReceiptText, ShoppingCart, Store, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { sair } from '@/app/conta/acoes';
import { TelaDeConta } from '@/components/conta/TelaDeConta';
import { MolduraDePainel, type GrupoPainel } from '@/components/painel/MolduraDePainel';
import { classeBotao } from '@/components/ui';
import type { PainelDaLoja } from '@/lib/loja/painel';
import { configSupabase } from '@/lib/supabase-servidor';
import { AoVivo } from './AoVivo';
import { AvisoErro } from './comum';
import { TrocarLoja } from './TrocarLoja';

export type AbaFornecedor = 'inicio' | 'produtos' | 'promocoes' | 'pedidos' | 'alertas' | 'clientes' | 'extrato' | 'plano' | 'conta';

/** Lateral, abas e título do painel da loja, com o aviso da análise e os avisos ao vivo. */
export function MolduraFornecedor({
  aba,
  painel,
  titulo,
  descricao,
  acao,
  children
}: {
  aba: AbaFornecedor;
  painel: PainelDaLoja;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const novos = painel.pedidos.filter((p) => p.status === 'novo').length;
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
        { id: 'alertas', href: '/fornecedor/alertas', rotulo: 'Alertas de preço', Icone: BellRing, contador: painel.alertasNovos },
        { id: 'clientes', href: '/fornecedor/clientes', rotulo: 'Clientes', Icone: Users },
        { id: 'extrato', href: '/fornecedor/extrato', rotulo: 'Extrato', Icone: ReceiptText },
        { id: 'plano', href: '/fornecedor/plano', rotulo: 'Plano e impulsos', Icone: Megaphone }
      ]
    },
    { titulo: 'Loja', itens: [{ id: 'conta', href: '/fornecedor/conta', rotulo: 'Sua loja', Icone: Store }] }
  ];
  const config = configSupabase();
  return (
    <MolduraDePainel
      grupos={grupos}
      atual={aba}
      selo={painel.papel === 'vendedor' ? `${painel.loja.nome} (vendedor)` : painel.loja.nome}
      inicio="/fornecedor"
      rotuloInicio="Revisaí, painel da loja"
      sair={sair}
      titulo={titulo}
      descricao={descricao}
      acao={acao}
    >
      <AvisoDaLoja painel={painel} />
      {painel.lojas.length > 1 ? <TrocarLoja lojas={painel.lojas.map((l) => ({ id: l.id, nome: l.nome }))} atual={painel.loja.id} /> : null}
      <AoVivo
        config={config}
        fornecedorId={painel.loja.id}
        uf={painel.loja.ativo ? painel.loja.uf : null}
        pedidos={painel.pedidos.map((p) => ({ id: p.id, status: p.status, pagamento: p.pagamento }))}
      />
      {children}
    </MolduraDePainel>
  );
}

/** A loja em análise, recusada ou fora do ar: o que falta, em uma linha. */
function AvisoDaLoja({ painel }: { painel: PainelDaLoja }) {
  const { loja, papel } = painel;
  if (loja.verificacao === 'pendente')
    return (
      <div className="rounded-2xl bg-oleo-claro px-4 py-3.5 text-[15px] text-oleo-tinta sm:px-5" role="status">
        <p className="font-bold">Sua loja está em análise.</p>
        <p className="mt-0.5">
          A equipe do Revisaí confere o CNPJ e libera a loja para as oficinas, normalmente em até 1 dia útil. Enquanto isso, cadastre os produtos
          {papel === 'dono' ? ' e a chave Pix' : ''}: tudo aparece assim que a loja for aprovada.
        </p>
      </div>
    );
  if (loja.verificacao === 'recusada')
    return (
      <div className="rounded-2xl bg-atraso-claro px-4 py-3.5 text-[15px] text-atraso sm:px-5" role="alert">
        <p className="font-bold">A loja não foi aprovada.</p>
        <p className="mt-0.5">{loja.verificacao_obs ? `Motivo: ${loja.verificacao_obs}` : 'A equipe não conseguiu confirmar os dados da loja.'}</p>
        <p className="mt-1">
          {papel === 'dono' ? (
            <>
              Confira o cadastro em{' '}
              <Link href="/fornecedor/conta" className="font-semibold underline">
                Sua loja
              </Link>{' '}
              e responda o e-mail da equipe do Revisaí para pedir uma nova análise.
            </>
          ) : (
            'Avise o dono da loja.'
          )}
        </p>
      </div>
    );
  if (!loja.ativo)
    return (
      <p className="rounded-2xl bg-atraso-claro px-4 py-3.5 text-[15px] text-atraso sm:px-5" role="status">
        Sua loja está fora do ar: as oficinas não veem os produtos. Fale com a equipe do Revisaí.
      </p>
    );
  return null;
}

/** Sem loja na conta: criar uma, ou pedir ao dono um convite. */
export function SemLoja() {
  return (
    <TelaDeConta titulo="Painel da loja" subtitulo="Venda para as oficinas da sua região." rodape={false}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-tinta-2">
          Esta conta ainda não tem loja. Para vender pelo Revisaí, faça o pedido na sua conta. Trabalha numa loja que já vende? Peça para o dono chamar o seu e-mail em Sua loja, na parte Equipe.
        </p>
        <Link href="/conta?ver=1" className={classeBotao('escuro', 'grande')}>
          Ir para a sua conta
        </Link>
      </div>
    </TelaDeConta>
  );
}

export function ErroDoPainel({ erro }: { erro: string }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
      <AvisoErro>{erro}</AvisoErro>
      <Link href="/conta?ver=1" className={classeBotao('secundario', 'normal', 'self-start')}>
        Ir para a sua conta
      </Link>
    </main>
  );
}
