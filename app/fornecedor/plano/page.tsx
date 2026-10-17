import type { Metadata } from 'next';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { PlanoFornecedorTela } from '@/components/fornecedor/Plano';
import { CobrancasDaLoja } from '@/components/cobranca/CobrancasDaLoja';
import { Chip } from '@/components/ui';
import { cobrancasDaLoja } from '@/lib/cobranca/loja';
import { formatarMoeda } from '@/lib/formatos';
import { metricasDosAnuncios } from '@/lib/loja/anuncios';
import { dataCurta } from '@/lib/loja/comum';
import { painelOuEntrada } from '@/lib/loja/painel';
import { SITUACOES_IMPULSO } from '@/lib/marketplace-dados';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plano' };

export default async function PaginaPlano() {
  const r = await painelOuEntrada('/fornecedor/plano');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const { contrato, impulsos, produtos, hoje } = painel;
  const [metricas, cobrancas] = await Promise.all([
    impulsos.length ? metricasDosAnuncios(sb, painel.loja.id, 30) : Promise.resolve(new Map()),
    cobrancasDaLoja(sb, painel.loja.id)
  ]);
  const nomes = new Map(produtos.map((p) => [p.id, [p.marca, p.nome].filter(Boolean).join(' ')]));
  return (
    <MolduraFornecedor aba="plano" painel={painel} titulo="Plano e impulsos">
      <PlanoFornecedorTela atual={contrato?.plano ?? 'vitrine'} comissao={contrato?.comissaoPercentual ?? null} mensalidade={contrato?.mensalidade ?? null} dono={painel.papel === 'dono'} />
      <CobrancasDaLoja pagamentos={cobrancas} />
      {impulsos.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[21px]">Seus impulsos</h2>
          <p className="-mt-2 text-[14px] text-tinta-3">Números dos últimos 30 dias. Cada oficina conta uma vez por dia: quem viu o anúncio e quem clicou.</p>
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {impulsos.map((i) => {
              const s = SITUACOES_IMPULSO.find((x) => x.id === i.status)!;
              const m = metricas.get(i.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-semibold">{nomes.get(i.produto_id) ?? `Produto ${i.produto_id}`}</p>
                    <p className="text-[13.5px] text-tinta-3">
                      {i.dias} dias {i.uf ? `em ${i.uf}` : 'no Brasil todo'},{' '}
                      {i.cpc != null ? `${formatarMoeda(i.cpc)} por clique, até ${formatarMoeda(i.orcamentoDiario)} por dia` : formatarMoeda(i.valor)}
                      {i.inicio && i.fim ? `, de ${dataCurta(i.inicio, hoje)} a ${dataCurta(i.fim, hoje)}` : ''}
                    </p>
                    {m && (m.impressoes || m.cliques) ? (
                      <p className="mt-0.5 text-[13.5px] text-tinta-2">
                        <span className="num font-semibold">{m.impressoes}</span> {m.impressoes === 1 ? 'visualização' : 'visualizações'} ·{' '}
                        <span className="num font-semibold">{m.cliques}</span> {m.cliques === 1 ? 'clique' : 'cliques'}
                        {i.cpc != null ? (
                          <>
                            {' '}
                            · <span className="num font-semibold">{formatarMoeda(m.custo)}</span> em cliques (hoje {formatarMoeda(m.custoHoje)})
                          </>
                        ) : null}
                        {m.impressoes ? ` · ${Math.round((m.cliques / m.impressoes) * 1000) / 10}% clicaram`.replace('.', ',') : ''}
                      </p>
                    ) : i.status === 'ativo' ? (
                      <p className="mt-0.5 text-[13.5px] text-tinta-3">Ainda sem visitas.</p>
                    ) : null}
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
