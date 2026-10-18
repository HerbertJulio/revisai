import type { Metadata } from 'next';
import { AvisoErro } from '@/components/fornecedor/comum';
import { DevolucoesDaLoja } from '@/components/fornecedor/Devolucoes';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { devolucoesDaLoja } from '@/lib/loja/devolucoes';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Devoluções' };

export default async function PaginaDevolucoes() {
  const r = await painelOuEntrada('/fornecedor/devolucoes');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const devolucoes = await devolucoesDaLoja(sb, painel.loja.id);
  return (
    <MolduraFornecedor
      aba="devolucoes"
      painel={painel}
      titulo="Devoluções e garantia"
      descricao="Pedidos das oficinas depois da entrega: peça errada, com defeito ou que não serviu. A oficina pede em até 90 dias da entrega e vê a resposta da loja na hora."
    >
      {devolucoes ? (
        <DevolucoesDaLoja devolucoes={devolucoes} loja={painel.loja.nome} hoje={painel.hoje} />
      ) : (
        <AvisoErro>Não deu para carregar as devoluções agora. Atualize a página em instantes.</AvisoErro>
      )}
    </MolduraFornecedor>
  );
}
