import type { Metadata } from 'next';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { PedidosDaLoja } from '@/components/fornecedor/Pedidos';
import { painelOuEntrada } from '@/lib/loja/painel';
import { pixDaLoja } from '@/lib/loja/pix';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pedidos' };

export default async function PaginaPedidos() {
  const r = await painelOuEntrada('/fornecedor/pedidos');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const pix = await pixDaLoja(sb, painel.loja.id);
  return (
    <MolduraFornecedor
      aba="pedidos"
      painel={painel}
      titulo="Pedidos"
      descricao="A parte de cada pedido que é sua. Combine com a oficina, confirme o Pix e mande o link da entrega: a oficina acompanha tudo pelo app."
    >
      <PedidosDaLoja pedidos={painel.pedidos} loja={painel.loja.nome} pix={pix} />
    </MolduraFornecedor>
  );
}
