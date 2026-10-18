import type { Metadata } from 'next';
import { AReceber } from '@/components/fornecedor/AReceber';
import { AvisoErro } from '@/components/fornecedor/comum';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { clientesComCredito, faturasDaLoja } from '@/lib/loja/credito';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'A receber' };

export default async function PaginaAReceber() {
  const r = await painelOuEntrada('/fornecedor/receber');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const [faturas, clientes] = await Promise.all([faturasDaLoja(sb, painel.loja.id), clientesComCredito(sb, painel.loja.id)]);
  return (
    <MolduraFornecedor
      aba="receber"
      painel={painel}
      titulo="A receber"
      descricao="As vendas faturadas: o que vence, o que venceu e o que já entrou. O vencimento conta da entrega do pedido."
    >
      {!faturas ? (
        <AvisoErro>Não deu para carregar as faturas agora. Atualize a página em instantes.</AvisoErro>
      ) : (
        <AReceber faturas={faturas} loja={painel.loja.nome} hoje={painel.hoje} temCredito={(clientes ?? []).some((c) => c.credito?.ativo)} />
      )}
    </MolduraFornecedor>
  );
}
