import type { Metadata } from 'next';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { PlanoFornecedorTela } from '@/components/fornecedor/Plano';
import { Chip } from '@/components/ui';
import { formatarMoeda } from '@/lib/formatos';
import { dataCurta } from '@/lib/loja/comum';
import { painelOuEntrada } from '@/lib/loja/painel';
import { SITUACOES_IMPULSO } from '@/lib/marketplace-dados';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plano' };

export default async function PaginaPlano() {
  const r = await painelOuEntrada('/fornecedor/plano');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel } = r;
  const { contrato, impulsos, produtos, hoje } = painel;
  const nomes = new Map(produtos.map((p) => [p.id, [p.marca, p.nome].filter(Boolean).join(' ')]));
  return (
    <MolduraFornecedor aba="plano" painel={painel} titulo="Plano e impulsos">
      <PlanoFornecedorTela atual={contrato?.plano ?? 'vitrine'} comissao={contrato?.comissaoPercentual ?? null} mensalidade={contrato?.mensalidade ?? null} dono={painel.papel === 'dono'} />
      {impulsos.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[21px]">Seus impulsos</h2>
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {impulsos.map((i) => {
              const s = SITUACOES_IMPULSO.find((x) => x.id === i.status)!;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-semibold">{nomes.get(i.produto_id) ?? `Produto ${i.produto_id}`}</p>
                    <p className="text-[13.5px] text-tinta-3">
                      {i.dias} dias {i.uf ? `em ${i.uf}` : 'no Brasil todo'}, {formatarMoeda(i.valor)}
                      {i.inicio && i.fim ? `, de ${dataCurta(i.inicio, hoje)} a ${dataCurta(i.fim, hoje)}` : ''}
                    </p>
                    {i.status === 'recusado' && i.observacao ? <p className="text-[13.5px] text-atraso">{i.observacao}</p> : null}
                  </div>
                  <Chip tom={s.tom}>{s.nome}</Chip>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </MolduraFornecedor>
  );
}
