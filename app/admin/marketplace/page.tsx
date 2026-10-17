import type { Metadata } from 'next';
import { Barras, Periodos } from '@/components/equipe/Barras';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { Numero } from '@/components/painel/Numero';
import { Secao, Vazio } from '@/components/ui';
import { painelDoMarketplace } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { porcento, variacao } from '@/lib/equipe/tipos';
import { formatarMoeda, formatarNumero, plural } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Marketplace' };

const PERIODOS = [
  { valor: 7, rotulo: '7 dias' },
  { valor: 30, rotulo: '30 dias' },
  { valor: 90, rotulo: '90 dias' }
];

function pct(n: number): string {
  return `${String(n).replace('.', ',')}%`;
}

export default async function PaginaMarketplace({ searchParams }: { searchParams: Promise<{ dias?: string | string[] }> }) {
  const acesso = await exigirEquipe(PODE.numeros);
  const pedido = Number((await searchParams).dias);
  const dias = PERIODOS.some((p) => p.valor === pedido) ? pedido : 30;
  const { dados: p, erro } = await painelDoMarketplace(acesso.sb, dias);
  const mudou = p ? variacao(p.gmv, p.gmvAnterior) : null;
  return (
    <Moldura
      acesso={acesso}
      aba="marketplace"
      titulo="Marketplace"
      descricao="Vendas das lojas para as oficinas no período (sem os pedidos cancelados), comissão do Revisaí e como as oficinas voltam a comprar."
      acao={<Periodos opcoes={PERIODOS} atual={dias} caminho="/admin/marketplace" parametro="dias" />}
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {p ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero
              rotulo={`Vendas em ${dias} dias (GMV)`}
              valor={formatarMoeda(p.gmv)}
              detalhe={mudou == null ? 'sem vendas no período anterior' : `${mudou >= 0 ? '+' : ''}${pct(mudou)} sobre os ${dias} dias anteriores`}
            />
            <Numero rotulo="Comissão" valor={formatarMoeda(p.comissao)} detalhe={`take rate de ${pct(p.takeRate)}`} />
            <Numero rotulo="Pedidos" valor={formatarNumero(p.pedidos)} detalhe={`${plural(p.compradoras, 'oficina comprou', 'oficinas compraram')}`} />
            <Numero rotulo="Ticket médio" valor={formatarMoeda(p.ticket)} />
            <Numero
              rotulo="Cancelamento"
              valor={pct(porcento(p.cancelamento.canceladas, p.cancelamento.partes))}
              detalhe={`${plural(p.cancelamento.canceladas, 'parte cancelada', 'partes canceladas')}, ${formatarNumero(p.cancelamento.pelaLoja)} pela loja`}
            />
            <Numero
              rotulo="Dias até a 1ª compra"
              valor={p.diasAtePrimeiraCompra != null ? formatarNumero(p.diasAtePrimeiraCompra, 1) : 'sem dados'}
              detalhe="mediana, do cadastro da oficina"
            />
            <Numero
              rotulo="Da confirmação à entrega"
              valor={p.horasConfirmacaoEntrega != null ? `${formatarNumero(p.horasConfirmacaoEntrega, 1)} h` : 'sem dados'}
              detalhe="média das entregas do período"
            />
            <Numero rotulo="Lojas que venderam" valor={formatarNumero(p.lojas.filter((l) => l.gmv > 0).length)} />
          </div>

          <Secao titulo="Recompra" descricao="Das oficinas que fizeram a primeira compra há pelo menos 30, 60 ou 90 dias, quantas compraram de novo nesse prazo.">
            <Barras
              rotulo="Recompra"
              itens={['30', '60', '90'].map((n) => {
                const r = p.recompra[n] ?? { base: 0, voltaram: 0 };
                const v = porcento(r.voltaram, r.base);
                return { rotulo: `${n} dias`, valor: v, texto: pct(v), detalhe: `${r.voltaram} de ${r.base}` };
              })}
            />
          </Secao>

          <Secao titulo="Lojas que mais venderam">
            {p.lojas.length ? (
              <div className="overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
                <table className="w-full text-left text-[14.5px]">
                  <thead className="bg-papel-2 text-[13px] text-tinta-3">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Loja
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                        Vendas
                      </th>
                      <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">
                        Partes de pedido
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                        Canceladas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linha">
                    {p.lojas.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5 font-semibold">{l.nome}</td>
                        <td className="num px-4 py-2.5 text-right">{formatarMoeda(l.gmv)}</td>
                        <td className="num hidden px-4 py-2.5 text-right sm:table-cell">{formatarNumero(l.partes)}</td>
                        <td className={`num px-4 py-2.5 text-right ${l.canceladas ? 'text-atraso' : ''}`}>{formatarNumero(l.canceladas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Vazio titulo="Nenhuma venda no período" />
            )}
          </Secao>
        </>
      ) : !erro ? (
        <Vazio titulo="Sem dados ainda" />
      ) : null}
    </Moldura>
  );
}
