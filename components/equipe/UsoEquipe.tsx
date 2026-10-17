'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Vazio } from '@/components/ui';
import { quandoFoi } from '@/lib/equipe-dados';
import type { UsoDaOficina } from '@/lib/equipe/tipos';
import { formatarNumero } from '@/lib/formatos';
import { CampoBusca, combina, Filtro, LinhaDeFiltros, MostrarMais, paraBusca, POR_PAGINA } from './comum';
import { ChipPlano } from './OficinasEquipe';

type Ordem = 'ultimo' | 'clientes' | 'servicos' | 'ia' | 'parados';

const ORDENS: { id: Ordem; nome: string }[] = [
  { id: 'ultimo', nome: 'Usaram por último' },
  { id: 'clientes', nome: 'Mais clientes' },
  { id: 'servicos', nome: 'Mais serviços' },
  { id: 'ia', nome: 'Mais IA no mês' },
  { id: 'parados', nome: 'Parados há mais tempo' }
];

function ordenar(lista: UsoDaOficina[], ordem: Ordem): UsoDaOficina[] {
  const copia = [...lista];
  const tempo = (o: UsoDaOficina) => (o.ultimoUso ? Date.parse(o.ultimoUso) : 0);
  switch (ordem) {
    case 'clientes':
      return copia.sort((a, b) => b.clientes - a.clientes);
    case 'servicos':
      return copia.sort((a, b) => b.servicos - a.servicos);
    case 'ia':
      return copia.sort((a, b) => b.montagens + b.transcricoes - (a.montagens + a.transcricoes));
    case 'parados':
      return copia.sort((a, b) => tempo(a) - tempo(b));
    default:
      return copia.sort((a, b) => tempo(b) - tempo(a));
  }
}

/** O uso do app em cada oficina (só contagens), para achar quem está travado ou parado. */
export function UsoEquipe({ oficinas, agora }: { oficinas: UsoDaOficina[]; agora: number }) {
  const [ordem, setOrdem] = useState<Ordem>('ultimo');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const textos = useMemo(() => new Map(oficinas.map((o) => [o.id, paraBusca(o.nome, o.cidade, o.uf)])), [oficinas]);
  const lista = ordenar(
    oficinas.filter((o) => !busca.trim() || combina(textos.get(o.id) ?? '', busca)),
    ordem
  );
  const visiveis = lista.slice(0, limite);
  return (
    <div className="flex flex-col gap-4">
      <CampoBusca valor={busca} aoMudar={(v) => (setBusca(v), setLimite(POR_PAGINA))} rotulo="Buscar oficina" dica="Buscar por nome ou cidade" />
      <LinhaDeFiltros rotulo="Ordenar oficinas">
        {ORDENS.map((o) => (
          <Filtro key={o.id} ativo={ordem === o.id} aoClicar={() => (setOrdem(o.id), setLimite(POR_PAGINA))}>
            {o.nome}
          </Filtro>
        ))}
      </LinhaDeFiltros>
      {visiveis.length ? (
        <div className="overflow-x-auto rounded-2xl bg-papel ring-1 ring-linha">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead className="bg-papel-2 text-[13px] text-tinta-3">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Oficina
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Clientes
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Carros
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Serviços
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Documentos
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Avisos
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  IA no mês
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Último uso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {visiveis.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/oficinas/${o.id}`} className="font-semibold text-caneta hover:underline">
                      {o.nome}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-tinta-3">
                      <ChipPlano plano={o.plano} proAte={null} testeAte={null} />
                      {[o.cidade, o.uf].filter(Boolean).join(', ')}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{formatarNumero(o.clientes)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatarNumero(o.carros)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatarNumero(o.servicos)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatarNumero(o.documentos)}</td>
                  <td className="num px-3 py-2.5 text-right">{formatarNumero(o.avisos)}</td>
                  <td className="num px-3 py-2.5 text-right" title={`${o.montagens} ordens montadas, ${o.transcricoes} transcrições`}>
                    {formatarNumero(o.montagens + o.transcricoes)}
                  </td>
                  <td className="px-4 py-2.5 text-tinta-3">{o.ultimoUso ? quandoFoi(o.ultimoUso, agora) : 'nunca'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Vazio titulo="Nenhuma oficina encontrada" />
      )}
      <MostrarMais total={lista.length} mostrando={visiveis.length} aoMostrar={() => setLimite((l) => l + POR_PAGINA)} />
    </div>
  );
}
