import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { MolduraFornecedor, SemAcesso } from '@/components/fornecedor/Moldura';
import { ProdutosFornecedor } from '@/components/fornecedor/Produtos';
import { painelDaSessao } from '@/lib/fornecedor-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Produtos' };

export default async function PaginaProdutos({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const r = await painelDaSessao();
  if (!r.sessao) return <SemAcesso linkInvalido={false} />;
  if (!r.painel)
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <AvisoErro>{r.erro ?? 'Não deu para abrir o painel agora.'}</AvisoErro>
      </main>
    );
  const { fornecedor, produtos, promocoes, impulsos, pedidos, hoje } = r.painel;
  return (
    <MolduraFornecedor aba="produtos" loja={fornecedor.nome} novos={pedidos.filter((p) => p.status === 'novo').length} titulo="Produtos">
      <ProdutosFornecedor produtos={produtos} promocoes={promocoes} impulsos={impulsos} uf={fornecedor.uf} hoje={hoje} abrirNovo={(await searchParams).novo === '1'} />
    </MolduraFornecedor>
  );
}
