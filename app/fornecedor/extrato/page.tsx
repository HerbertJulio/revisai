import type { Metadata } from 'next';
import { AvisoErro, ChipSituacao } from '@/components/fornecedor/comum';
import { BaixarExtrato, EscolherMes } from '@/components/fornecedor/Extrato';
import { ErroDoPainel, MolduraFornecedor, SemLoja } from '@/components/fornecedor/Moldura';
import { Numero } from '@/components/painel/Numero';
import { Vazio } from '@/components/ui';
import { formatarMoeda } from '@/lib/formatos';
import { dataCurta, quandoFoi } from '@/lib/loja/comum';
import { mesValido, nomeDoMes, ultimosMeses } from '@/lib/loja/dados';
import { extratoDaLoja } from '@/lib/loja/extrato';
import { painelOuEntrada } from '@/lib/loja/painel';
import { SITUACOES_PARTE } from '@/lib/marketplace-dados';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Extrato' };

export default async function PaginaExtrato({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const r = await painelOuEntrada('/fornecedor/extrato');
  if (r.estado === 'sem-loja') return <SemLoja />;
  if (r.estado === 'erro') return <ErroDoPainel erro={r.erro} />;
  const { painel, sb } = r;
  const meses = ultimosMeses(painel.hoje, 12);
  const pedido = (await searchParams).mes;
  const mes = mesValido(pedido) && pedido <= meses[0] ? pedido : meses[0];
  const extrato = await extratoDaLoja(sb, painel.loja.id, mes);
  const agora = Date.now();

  return (
    <MolduraFornecedor
      aba="extrato"
      painel={painel}
      titulo="Extrato"
      descricao="Os pedidos que a loja confirmou no mês, a comissão de cada um e a mensalidade do plano. É a mesma conta que a equipe do Revisaí usa para a cobrança."
      acao={<EscolherMes meses={mesValido(pedido) && !meses.includes(mes) ? [mes, ...meses] : meses} atual={mes} />}
    >
      {!extrato ? (
        <AvisoErro>Não deu para carregar o extrato agora. Atualize a página em instantes.</AvisoErro>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero rotulo={`Vendas em ${nomeDoMes(mes)}`} valor={formatarMoeda(extrato.totalVendas)} detalhe={`${extrato.partes.length} ${extrato.partes.length === 1 ? 'pedido' : 'pedidos'}`} />
            <Numero rotulo="Comissão" valor={formatarMoeda(extrato.totalComissao)} />
            <Numero
              rotulo="Mensalidade do Destaque"
              valor={formatarMoeda(extrato.mensalidade)}
              detalhe={extrato.destaqueAte ? `Destaque até ${dataCurta(extrato.destaqueAte, painel.hoje)}` : extrato.mensalidade ? undefined : 'Plano Vitrine'}
            />
            <Numero rotulo="Total do mês" valor={formatarMoeda(extrato.total)} />
          </div>

          {extrato.partes.length ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[21px]">Pedidos do mês</h2>
                  <p className="text-[14px] text-tinta-3">Entram os pedidos confirmados, a caminho e entregues. Pedido cancelado não paga comissão.</p>
                </div>
                <BaixarExtrato extrato={extrato} />
              </div>
              <div className="overflow-x-auto rounded-2xl bg-papel ring-1 ring-linha">
                <table className="w-full min-w-[560px] text-[14.5px]">
                  <thead className="text-left text-[13px] text-tinta-3">
                    <tr className="border-b border-linha">
                      <th className="px-4 py-2.5 font-semibold">Pedido</th>
                      <th className="px-4 py-2.5 font-semibold">Quando</th>
                      <th className="px-4 py-2.5 font-semibold">Situação</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Valor</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Comissão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linha">
                    {extrato.partes.map((p) => {
                      const s = SITUACOES_PARTE.find((x) => x.id === p.situacao);
                      return (
                        <tr key={p.parteId}>
                          <td className="num px-4 py-2.5 font-bold tracking-wider">{p.codigo}</td>
                          <td className="px-4 py-2.5 text-tinta-2">{quandoFoi(p.data, agora)}</td>
                          <td className="px-4 py-2.5">{s ? <ChipSituacao nome={s.nome} tom={s.tom} /> : p.situacao}</td>
                          <td className="num px-4 py-2.5 text-right">{formatarMoeda(p.subtotal)}</td>
                          <td className="num px-4 py-2.5 text-right">
                            {formatarMoeda(p.comissao)} <span className="text-[12.5px] text-tinta-3">({String(p.comissaoPercentual).replace('.', ',')}%)</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <Vazio titulo={`Nenhum pedido confirmado em ${nomeDoMes(mes)}`}>Quando a loja confirmar pedidos das oficinas, eles aparecem aqui com a comissão de cada um.</Vazio>
          )}
        </>
      )}
    </MolduraFornecedor>
  );
}
