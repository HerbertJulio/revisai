import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { MolduraFornecedor, SemAcesso } from '@/components/fornecedor/Moldura';
import { PedidosFornecedor } from '@/components/fornecedor/Pedidos';
import { painelDaSessao } from '@/lib/fornecedor-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pedidos' };

export default async function PaginaPedidos() {
  const r = await painelDaSessao();
  if (!r.sessao) return <SemAcesso linkInvalido={false} />;
  if (!r.painel)
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <AvisoErro>{r.erro ?? 'Não deu para abrir o painel agora.'}</AvisoErro>
      </main>
    );
  const { fornecedor, pedidos } = r.painel;
  return (
    <MolduraFornecedor
      aba="pedidos"
      loja={fornecedor.nome}
      novos={pedidos.filter((p) => p.status === 'novo').length}
      titulo="Pedidos"
      descricao="A parte de cada pedido que é sua. Chame a oficina no WhatsApp para combinar entrega e pagamento."
    >
      <PedidosFornecedor pedidos={pedidos} loja={fornecedor.nome} />
    </MolduraFornecedor>
  );
}
