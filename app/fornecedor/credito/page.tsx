import type { Metadata } from 'next';
import { AvisoErro } from '@/components/fornecedor/comum';
import { CreditoDosClientes } from '@/components/fornecedor/Credito';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { clientesComCredito } from '@/lib/loja/credito';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Crédito' };

export default async function PaginaCredito() {
  const r = await painelOuEntrada('/fornecedor/credito');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const clientes = await clientesComCredito(sb, painel.loja.id);
  return (
    <MolduraFornecedor
      aba="credito"
      painel={painel}
      titulo="Crédito"
      descricao="Venda faturada para as oficinas em quem a loja confia: um limite em aberto e um prazo para pagar depois da entrega."
    >
      {!clientes ? <AvisoErro>Não deu para carregar os clientes agora. Atualize a página em instantes.</AvisoErro> : <CreditoDosClientes clientes={clientes} dono={painel.papel === 'dono'} />}
    </MolduraFornecedor>
  );
}
