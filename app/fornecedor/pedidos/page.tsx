import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { MolduraFornecedor, SemAcesso } from '@/components/fornecedor/Moldura';
import { PedidosFornecedor } from '@/components/fornecedor/Pedidos';
import { lerPixDaLoja } from '@/lib/entregas';
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
  const pix = await lerPixDaLoja(fornecedor.id);
  return (
    <MolduraFornecedor
      aba="pedidos"
      loja={fornecedor.nome}
      novos={pedidos.filter((p) => p.status === 'novo').length}
      alertas={r.painel.alertasNovos}
      titulo="Pedidos"
      descricao="A parte de cada pedido que é sua. Combine com a oficina, confirme o Pix e mande o link da entrega: a oficina acompanha tudo pelo app."
    >
      <PedidosFornecedor pedidos={pedidos} loja={fornecedor.nome} pix={pix} />
    </MolduraFornecedor>
  );
}
