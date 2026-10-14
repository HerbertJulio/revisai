import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { MolduraFornecedor, SemAcesso } from '@/components/fornecedor/Moldura';
import { PromocoesFornecedor } from '@/components/fornecedor/Promocoes';
import { painelDaSessao } from '@/lib/fornecedor-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promoções' };

export default async function PaginaPromocoes({ searchParams }: { searchParams: Promise<{ nova?: string; preco?: string; minimo?: string }> }) {
  const r = await painelDaSessao();
  if (!r.sessao) return <SemAcesso linkInvalido={false} />;
  if (!r.painel)
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <AvisoErro>{r.erro ?? 'Não deu para abrir o painel agora.'}</AvisoErro>
      </main>
    );
  const { fornecedor, produtos, promocoes, pedidos, hoje } = r.painel;
  const q = await searchParams;
  const produtoId = Number(q.nova);
  const preco = Number(q.preco);
  const minimo = Number(q.minimo);
  const sugestao = Number.isSafeInteger(produtoId) && produtoId > 0 && preco > 0 ? { produtoId, preco, minimo: Number.isSafeInteger(minimo) && minimo > 0 ? minimo : 1 } : null;
  return (
    <MolduraFornecedor
      aba="promocoes"
      loja={fornecedor.nome}
      novos={pedidos.filter((p) => p.status === 'novo').length}
      titulo="Promoções"
      descricao="A promoção aparece na loja, na soma de compras das oficinas e dentro dos avisos de troca."
    >
      <PromocoesFornecedor produtos={produtos} promocoes={promocoes} hoje={hoje} sugestao={sugestao} />
    </MolduraFornecedor>
  );
}
