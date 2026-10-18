import type { Metadata } from 'next';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { ProdutosFornecedor } from '@/components/fornecedor/Produtos';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Produtos' };

export default async function PaginaProdutos({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const r = await painelOuEntrada('/fornecedor/produtos');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel } = r;
  return (
    <MolduraFornecedor aba="produtos" painel={painel} titulo="Produtos">
      <ProdutosFornecedor
        produtos={painel.produtos}
        promocoes={painel.promocoes}
        impulsos={painel.impulsos}
        uf={painel.loja.uf}
        hoje={painel.hoje}
        abrirNovo={(await searchParams).novo === '1'}
        podeImpulsionar={painel.papel === 'dono'}
      />
    </MolduraFornecedor>
  );
}
