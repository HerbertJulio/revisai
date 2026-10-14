import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaPedidos } from '@/components/equipe/ListaPedidos';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { buscarPedidos } from '@/lib/equipe';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pedidos' };

export default async function PaginaPedidos() {
  const portao = await portaoDaEquipe('/equipe/pedidos');
  if (portao) return portao;
  const { dados, erro } = await buscarPedidos();
  return (
    <Moldura aba="pedidos" titulo="Pedidos da loja" descricao="Ao chamar a oficina no WhatsApp, o pedido vai para em contato. Mude a situação conforme o fornecedor confirma e entrega.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ListaPedidos pedidos={dados} agora={Date.now()} />
    </Moldura>
  );
}
