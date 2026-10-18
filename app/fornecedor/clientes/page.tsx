import type { Metadata } from 'next';
import { ClientesDaLoja } from '@/components/fornecedor/Clientes';
import { AvisoErro } from '@/components/fornecedor/comum';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { formatarMoeda } from '@/lib/formatos';
import { clientesDaLoja, condicoesDaLoja } from '@/lib/loja/clientes';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Clientes' };

export default async function PaginaClientes() {
  const r = await painelOuEntrada('/fornecedor/clientes');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const [clientes, condicoes] = await Promise.all([clientesDaLoja(sb, painel.loja.id), condicoesDaLoja(sb, painel.loja.id)]);
  return (
    <MolduraFornecedor
      aba="clientes"
      painel={painel}
      titulo="Clientes"
      descricao={
        <>
          As oficinas que já compraram da loja. Combine um preço especial ou um desconto com quem compra sempre.
          {painel.loja.pedido_minimo != null ? ` Pedido mínimo da loja: ${formatarMoeda(painel.loja.pedido_minimo)} (muda em Sua loja).` : ''}
        </>
      }
    >
      {!clientes || !condicoes ? (
        <AvisoErro>Não deu para carregar os clientes agora. Atualize a página em instantes.</AvisoErro>
      ) : (
        <ClientesDaLoja clientes={clientes} condicoes={condicoes} produtos={painel.produtos} />
      )}
    </MolduraFornecedor>
  );
}
