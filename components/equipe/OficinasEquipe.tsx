'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Chip, Vazio } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import { contarPor, quandoFoi } from '@/lib/equipe-dados';
import { PLANOS_DA_OFICINA, type OficinaEquipe, type PlanoDaOficina } from '@/lib/equipe/tipos';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';
import { CampoBusca, combina, Filtro, LinhaDeFiltros, MostrarMais, paraBusca, POR_PAGINA } from './comum';

type FiltroOficina = 'todas' | PlanoDaOficina | 'fundadoras' | 'desativadas';

export function ChipPlano({ plano, proAte, testeAte }: { plano: PlanoDaOficina; proAte: string | null; testeAte: string | null }) {
  const p = PLANOS_DA_OFICINA.find((x) => x.id === plano) ?? PLANOS_DA_OFICINA[2];
  const ate = plano === 'pro' ? proAte : plano === 'teste' ? testeAte : null;
  return <Chip tom={p.tom}>{ate ? `${p.nome} até ${formatarData(ate)}` : p.nome}</Chip>;
}

export function OficinasEquipe({ oficinas, agora }: { oficinas: OficinaEquipe[]; agora: number }) {
  const [filtro, setFiltro] = useState<FiltroOficina>('todas');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const porPlano = useMemo(() => contarPor(oficinas.filter((o) => o.ativa), (o) => o.plano), [oficinas]);
  const textos = useMemo(() => new Map(oficinas.map((o) => [o.id, paraBusca(o.nome, o.cidade, o.uf, o.dono, o.whatsapp, o.cnpj)])), [oficinas]);
  const filtradas = oficinas
    .filter((o) =>
      filtro === 'todas' ? true : filtro === 'desativadas' ? !o.ativa : filtro === 'fundadoras' ? o.fundador : o.ativa && o.plano === filtro
    )
    .filter((o) => !busca.trim() || combina(textos.get(o.id) ?? '', busca));
  const visiveis = filtradas.slice(0, limite);

  function filtrar(f: FiltroOficina) {
    setFiltro(f);
    setLimite(POR_PAGINA);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <CampoBusca
          valor={busca}
          aoMudar={(v) => {
            setBusca(v);
            setLimite(POR_PAGINA);
          }}
          rotulo="Buscar oficinas"
          dica="Buscar por nome, cidade, e-mail do dono ou WhatsApp"
        />
        <LinhaDeFiltros rotulo="Filtrar oficinas">
          <Filtro ativo={filtro === 'todas'} aoClicar={() => filtrar('todas')} n={oficinas.length}>
            Todas
          </Filtro>
          {PLANOS_DA_OFICINA.map((p) => (
            <Filtro key={p.id} ativo={filtro === p.id} aoClicar={() => filtrar(p.id)} n={porPlano[p.id] ?? 0}>
              {p.plural}
            </Filtro>
          ))}
          <Filtro ativo={filtro === 'fundadoras'} aoClicar={() => filtrar('fundadoras')} n={oficinas.filter((o) => o.fundador).length}>
            Fundadoras
          </Filtro>
          <Filtro ativo={filtro === 'desativadas'} aoClicar={() => filtrar('desativadas')} n={oficinas.filter((o) => !o.ativa).length}>
            Desativadas
          </Filtro>
        </LinhaDeFiltros>
      </div>

      {visiveis.length ? (
        <div className="overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          <table className="w-full text-left text-[14.5px]">
            <thead className="hidden bg-papel-2 text-[13px] text-tinta-3 md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Oficina
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Plano
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Pessoas
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Clientes
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Compras na loja
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Último uso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {visiveis.map((o) => (
                <tr key={o.id} className="flex flex-col gap-1 px-4 py-3.5 md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/admin/oficinas/${o.id}`} className="font-bold text-caneta hover:underline">
                      {o.nome}
                    </Link>
                    <p className="text-[13px] text-tinta-3">
                      {[[o.cidade, o.uf].filter(Boolean).join(', '), o.dono, `criada ${quandoFoi(o.criado_em, agora)}`].filter(Boolean).join(', ')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5 md:hidden">
                      <ChipPlano plano={o.plano} proAte={o.proAte} testeAte={o.testeAte} />
                      {o.fundador ? <Chip tom="caneta">Fundadora</Chip> : null}
                      {!o.ativa ? <Chip tom="atraso">Desativada</Chip> : null}
                      {o.excluirEm ? <Chip tom="atraso">Pediu para apagar</Chip> : null}
                    </div>
                  </td>
                  <td className="hidden md:table-cell md:px-4 md:py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <ChipPlano plano={o.plano} proAte={o.proAte} testeAte={o.testeAte} />
                      {o.fundador ? <Chip tom="caneta">Fundadora</Chip> : null}
                      {!o.ativa ? <Chip tom="atraso">Desativada</Chip> : null}
                      {o.excluirEm ? <Chip tom="atraso">Pediu para apagar</Chip> : null}
                    </div>
                  </td>
                  <td className="num text-[13.5px] text-tinta-2 md:px-4 md:py-3 md:text-right md:text-[14.5px] md:text-tinta">
                    <span className="md:hidden">Pessoas: </span>
                    {o.membros}
                  </td>
                  <td className="num text-[13.5px] text-tinta-2 md:px-4 md:py-3 md:text-right md:text-[14.5px] md:text-tinta">
                    <span className="md:hidden">Clientes: </span>
                    {formatarNumero(o.clientes)}
                    <span className="block text-[12.5px] text-tinta-3">{o.documentos ? `${formatarNumero(o.documentos)} documentos` : 'sem documentos'}</span>
                  </td>
                  <td className="num text-[13.5px] text-tinta-2 md:px-4 md:py-3 md:text-right md:text-[14.5px] md:text-tinta">
                    <span className="md:hidden">Compras: </span>
                    {formatarMoeda(o.compras)}
                  </td>
                  <td className="text-[13.5px] text-tinta-3 md:px-4 md:py-3">{o.ultimoUso ? quandoFoi(o.ultimoUso, agora) : 'ainda não usou'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Vazio titulo={oficinas.length ? 'Nenhuma oficina com esse filtro' : 'Nenhuma oficina ainda'}>
          {oficinas.length ? 'Tente outra busca ou outro filtro.' : 'As oficinas aparecem aqui quando alguém cria a conta e a oficina no app.'}
        </Vazio>
      )}
      <MostrarMais total={filtradas.length} mostrando={visiveis.length} aoMostrar={() => setLimite((l) => l + POR_PAGINA)} />
    </div>
  );
}
