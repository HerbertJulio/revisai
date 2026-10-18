import type { Metadata } from 'next';
import { nomeDoMes, Periodos } from '@/components/equipe/Barras';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { Secao, Vazio } from '@/components/ui';
import { formatarDiaHora } from '@/lib/datas';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { formatarNumero } from '@/lib/formatos';
import { categoriaDaNota, lerResumoNps, porcentagem, type ContaNps } from '@/lib/nps';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'NPS' };

const PERIODOS = [
  { valor: 3, rotulo: '3 meses' },
  { valor: 6, rotulo: '6 meses' },
  { valor: 12, rotulo: '12 meses' }
];

function textoNps(n: number | null): string {
  return n == null ? '—' : `${n > 0 ? '+' : ''}${formatarNumero(n)}`;
}

function tomDoNps(n: number | null): string {
  if (n == null) return 'text-tinta-3';
  if (n >= 50) return 'text-ok';
  if (n >= 0) return 'text-oleo-tinta';
  return 'text-atraso';
}

const TOM_DA_NOTA = { promotor: 'bg-ok-claro text-ok', neutro: 'bg-oleo-claro text-oleo-tinta', detrator: 'bg-atraso-claro text-atraso' } as const;

function Distribuicao({ conta }: { conta: ContaNps }) {
  const partes = [
    { nome: 'Promotores (9 e 10)', n: conta.promotores, cor: 'bg-ok' },
    { nome: 'Neutros (7 e 8)', n: conta.neutros, cor: 'bg-oleo' },
    { nome: 'Detratores (0 a 6)', n: conta.detratores, cor: 'bg-atraso' }
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-papel-2" aria-hidden="true">
        {conta.respostas ? partes.map((p) => <span key={p.nome} className={p.cor} style={{ width: `${(100 * p.n) / conta.respostas}%` }} />) : null}
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {partes.map((p) => (
          <div key={p.nome} className="rounded-xl bg-papel-2 px-3 py-2">
            <dt className="text-[13px] text-tinta-3">{p.nome}</dt>
            <dd className="num font-bold">
              {formatarNumero(p.n)} <span className="font-normal text-tinta-3">({porcentagem(p.n, conta.respostas)})</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function PaginaNps({ searchParams }: { searchParams: Promise<{ meses?: string | string[] }> }) {
  const acesso = await exigirEquipe();
  const pedido = Number((await searchParams).meses);
  const meses = PERIODOS.some((p) => p.valor === pedido) ? pedido : 12;
  const { data, error } = await acesso.sb.rpc('nps_resumo', { p_meses: meses });
  if (error) console.error('[nps] resumo', error.code, error.message);
  const resumo = error ? null : lerResumoNps(data);
  return (
    <Moldura
      acesso={acesso}
      aba="nps"
      titulo="NPS"
      descricao="De 0 a 10, quanto as oficinas indicariam o Revisaí para outra oficina. O NPS é a porcentagem de promotores menos a de detratores (de -100 a +100)."
      acao={<Periodos opcoes={PERIODOS} atual={meses} caminho="/admin/nps" parametro="meses" />}
    >
      {error || (data && !resumo) ? <AvisoErro>Não deu para ler as respostas agora. Atualize a página.</AvisoErro> : null}
      {resumo ? (
        resumo.total.respostas ? (
          <>
            <section className="flex flex-col gap-4 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label="NPS do período">
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className={`largo num text-[44px] leading-none font-extrabold ${tomDoNps(resumo.total.nps)}`} data-testid="nps-total">
                  {textoNps(resumo.total.nps)}
                </span>
                <span className="text-tinta-2">
                  {formatarNumero(resumo.total.respostas)} {resumo.total.respostas === 1 ? 'resposta' : 'respostas'} nos últimos {meses} meses
                </span>
              </p>
              <Distribuicao conta={resumo.total} />
            </section>

            <Secao titulo="Mês a mês">
              <div className="overflow-x-auto rounded-2xl bg-papel ring-1 ring-linha">
                <table className="w-full min-w-max text-left text-[14px]">
                  <thead className="bg-papel-2 text-[13px] text-tinta-3">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Mês
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Respostas
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Promotores
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Neutros
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                        Detratores
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                        NPS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linha">
                    {[...resumo.meses].reverse().map((m) => (
                      <tr key={m.mes}>
                        <th scope="row" className="px-4 py-2.5 font-semibold">
                          {nomeDoMes(m.mes)}
                        </th>
                        <td className="num px-3 py-2.5 text-right">{formatarNumero(m.respostas)}</td>
                        <td className="num px-3 py-2.5 text-right">{formatarNumero(m.promotores)}</td>
                        <td className="num px-3 py-2.5 text-right">{formatarNumero(m.neutros)}</td>
                        <td className="num px-3 py-2.5 text-right">{formatarNumero(m.detratores)}</td>
                        <td className={`num px-4 py-2.5 text-right font-bold ${tomDoNps(m.nps)}`}>{textoNps(m.nps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>

            <Secao titulo="Comentários mais novos" descricao="Os 50 mais recentes do período, com o nome da oficina ou da loja.">
              {resumo.comentarios.length ? (
                <ul className="flex flex-col gap-2.5">
                  {resumo.comentarios.map((c, i) => (
                    <li key={`${c.criadoEm}-${i}`} className="flex items-start gap-3 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
                      <span className={`num grid h-9 w-9 shrink-0 place-items-center rounded-full font-extrabold ${TOM_DA_NOTA[categoriaDaNota(c.nota)]}`} aria-label={`Nota ${c.nota}`}>
                        {c.nota}
                      </span>
                      <div className="min-w-0">
                        <p className="whitespace-pre-line">{c.comentario}</p>
                        <p className="mt-0.5 text-[13px] text-tinta-3">
                          {[c.oficina ?? c.loja ?? 'Conta apagada', formatarDiaHora(c.criadoEm, new Date(), 'America/Sao_Paulo')].join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-tinta-2">Ninguém deixou comentário no período.</p>
              )}
            </Secao>
          </>
        ) : (
          <Vazio titulo="Nenhuma resposta no período">A pergunta aparece no início do app para quem usa a oficina há mais de 30 dias, e de novo a cada 90.</Vazio>
        )
      ) : null}
    </Moldura>
  );
}
