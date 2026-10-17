import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaPedidos } from '@/components/equipe/ListaPedidos';
import { Moldura } from '@/components/equipe/Moldura';
import { buscarPedidos } from '@/lib/equipe/dados';
import { pode } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pedidos' };

export default async function PaginaPedidos() {
  const acesso = await exigirEquipe();
  const { dados, erro } = await buscarPedidos(acesso.sb);
  const podeMudar = pode(acesso.papel, 'mudarPedido');
  return (
    <Moldura
      acesso={acesso}
      aba="pedidos"
      titulo="Pedidos da loja"
      descricao={
        podeMudar
          ? 'Cada loja cuida da parte dela do pedido. Ao chamar a oficina no WhatsApp, o pedido vai para em contato.'
          : 'Cada loja cuida da parte dela do pedido. Só o suporte muda a situação aqui.'
      }
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ListaPedidos pedidos={dados} agora={Date.now()} podeMudar={podeMudar} />
    </Moldura>
  );
}
