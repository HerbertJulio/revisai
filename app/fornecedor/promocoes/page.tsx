import type { Metadata } from 'next';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { PromocoesFornecedor } from '@/components/fornecedor/Promocoes';
import { painelOuEntrada } from '@/lib/loja/painel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promoções' };

export default async function PaginaPromocoes({ searchParams }: { searchParams: Promise<{ nova?: string; preco?: string; minimo?: string }> }) {
  const r = await painelOuEntrada('/fornecedor/promocoes');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel } = r;
  const q = await searchParams;
  const produtoId = Number(q.nova);
  const preco = Number(q.preco);
  const minimo = Number(q.minimo);
  const sugestao = Number.isSafeInteger(produtoId) && produtoId > 0 && preco > 0 ? { produtoId, preco, minimo: Number.isSafeInteger(minimo) && minimo > 0 ? minimo : 1 } : null;
  return (
    <MolduraFornecedor aba="promocoes" painel={painel} titulo="Promoções" descricao="A promoção aparece na loja, na soma de compras das oficinas e dentro dos avisos de troca.">
      <PromocoesFornecedor produtos={painel.produtos} promocoes={painel.promocoes} hoje={painel.hoje} sugestao={sugestao} />
    </MolduraFornecedor>
  );
}
