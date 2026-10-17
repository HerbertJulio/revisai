import type { Metadata } from 'next';
import { nomeDoMes, Periodos } from '@/components/equipe/Barras';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { Vazio } from '@/components/ui';
import { coortesDeGmv } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { porcento } from '@/lib/equipe/tipos';
import { formatarMoeda } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Coortes' };

const PERIODOS = [
  { valor: 6, rotulo: '6 meses' },
  { valor: 12, rotulo: '12 meses' }
];

/** Fundo da célula conforme a parte da turma que comprou no mês (mais forte, mais oficinas). */
function fundo(parte: number): string {
  if (parte >= 60) return 'bg-ok-claro';
  if (parte >= 30) return 'bg-oleo-claro';
  if (parte > 0) return 'bg-papel-2';
  return '';
}

export default async function PaginaCoortes({ searchParams }: { searchParams: Promise<{ meses?: string | string[] }> }) {
  const acesso = await exigirEquipe(PODE.numeros);
  const pedido = Number((await searchParams).meses);
  const meses = PERIODOS.some((p) => p.valor === pedido) ? pedido : 6;
  const { dados, erro } = await coortesDeGmv(acesso.sb, meses);
  const colunas = Math.max(1, ...dados.map((c) => Math.max(0, ...c.meses.map((m) => m.idade)) + 1));
  return (
    <Moldura
      acesso={acesso}
      aba="coortes"
      titulo="Coortes de compras"
      descricao="Cada linha é a turma de oficinas que fez a primeira compra na loja naquele mês. As colunas mostram quanto a turma comprou nos meses seguintes e quantas oficinas dela compraram."
      acao={<Periodos opcoes={PERIODOS} atual={meses} caminho="/admin/coortes" parametro="meses" />}
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {dados.length ? (
        <div className="overflow-x-auto rounded-2xl bg-papel ring-1 ring-linha">
          <table className="w-full min-w-max text-left text-[14px]">
            <thead className="bg-papel-2 text-[13px] text-tinta-3">
              <tr>
                <th scope="col" className="sticky left-0 bg-papel-2 px-4 py-2.5 font-semibold">
                  Turma
                </th>
                {Array.from({ length: colunas }, (_, i) => (
                  <th key={i} scope="col" className="px-3 py-2.5 text-right font-semibold">
                    {i === 0 ? 'Mês 1' : `Mês ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {dados.map((c) => (
                <tr key={c.coorte}>
                  <th scope="row" className="sticky left-0 bg-papel px-4 py-2.5 text-left font-semibold">
                    {nomeDoMes(c.coorte)}
                    <span className="block text-[12.5px] font-normal text-tinta-3">{c.oficinas === 1 ? '1 oficina' : `${c.oficinas} oficinas`}</span>
                  </th>
                  {Array.from({ length: colunas }, (_, i) => {
                    const m = c.meses.find((x) => x.idade === i);
                    const parte = m ? porcento(m.ativas, c.oficinas) : 0;
                    return (
                      <td key={i} className={`num px-3 py-2.5 text-right ${fundo(parte)}`}>
                        {m ? (
                          <>
                            {formatarMoeda(m.gmv)}
                            <span className="block text-[12.5px] text-tinta-3">
                              {m.ativas} de {c.oficinas} ({String(parte).replace('.', ',')}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-tinta-3">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !erro ? (
        <Vazio titulo="Nenhuma compra no período">As turmas aparecem quando as oficinas começam a comprar na loja.</Vazio>
      ) : null}
    </Moldura>
  );
}
