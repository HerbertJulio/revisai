import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { Chip, Vazio, classeBotao } from '@/components/ui';
import { quandoFoi } from '@/lib/equipe-dados';
import { historico } from '@/lib/equipe/dados';
import { descricaoDoEvento, mudancas } from '@/lib/equipe/historico';
import { nomeDoPapelEquipe, PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Histórico' };

const POR_PAGINA = 50;

export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<{ antes?: string | string[] }> }) {
  const acesso = await exigirEquipe(PODE.historico);
  const pedido = Number((await searchParams).antes);
  const antes = Number.isSafeInteger(pedido) && pedido > 0 ? pedido : null;
  const { dados, erro } = await historico(acesso.sb, antes, POR_PAGINA);
  const agora = Date.now();
  const ultimo = dados.at(-1)?.id;
  return (
    <Moldura
      acesso={acesso}
      aba="historico"
      titulo="Histórico"
      descricao="Tudo o que a equipe e o sistema fizeram: entradas no painel, aparelhos novos, mudanças em oficinas, lojas, planos e pedidos, consultas de acesso e pedidos de dados pessoais."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {dados.length ? (
        <ol className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {dados.map((e) => {
            const lista = mudancas(e);
            return (
              <li key={e.id} className="flex flex-col gap-1.5 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{descricaoDoEvento(e)}</span>
                  {e.registro && ['insert', 'update', 'delete'].includes(e.acao) ? <span className="num text-[13px] text-tinta-3">{e.registro}</span> : null}
                  <span className="ml-auto text-[13px] text-tinta-3">{quandoFoi(e.quando, agora)}</span>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-tinta-2">
                  <span>{e.email ?? 'Sistema'}</span>
                  {e.papel ? <Chip>{nomeDoPapelEquipe(e.papel)}</Chip> : null}
                  {e.ip ? <span className="num text-tinta-3">IP {e.ip}</span> : null}
                </p>
                {lista.length ? (
                  <dl className="grid gap-x-4 gap-y-0.5 rounded-xl bg-papel-2 px-3 py-2 text-[13.5px] sm:grid-cols-[minmax(140px,auto)_1fr]">
                    {lista.map((m) => (
                      <div key={m.campo} className="contents">
                        <dt className="text-tinta-3">{m.rotulo}</dt>
                        <dd className="break-words">
                          {e.antes && e.depois ? (
                            <>
                              <span className="text-tinta-3 line-through">{m.de ?? 'vazio'}</span> <span aria-hidden="true">→</span>
                              <span className="sr-only">para</span> <span className="font-semibold">{m.para ?? 'vazio'}</span>
                            </>
                          ) : (
                            <span className="font-semibold">{m.para ?? m.de}</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : !erro ? (
        <Vazio titulo={antes ? 'Não há registros mais antigos' : 'Nada no histórico ainda'} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {antes ? (
          <Link href="/admin/historico" className={classeBotao('secundario', 'pequeno')}>
            Voltar para os mais novos
          </Link>
        ) : null}
        {ultimo && dados.length === POR_PAGINA ? (
          <Link href={`/admin/historico?antes=${ultimo}`} className={classeBotao('secundario', 'pequeno')}>
            Ver os mais antigos
          </Link>
        ) : null}
      </div>
    </Moldura>
  );
}
