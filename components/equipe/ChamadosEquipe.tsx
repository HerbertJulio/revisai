'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Chip, Vazio } from '@/components/ui';
import { contarPor, quandoFoi } from '@/lib/equipe-dados';
import { SITUACOES_CHAMADO, type Chamado, type SituacaoChamado } from '@/lib/equipe/tipos';
import { CampoBusca, combina, Filtro, LinhaDeFiltros, MostrarMais, paraBusca, POR_PAGINA } from './comum';

/** Atualiza a página de tempos em tempos enquanto ela está aberta e visível. */
export function AtualizarSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);
  return null;
}

export function ChamadosEquipe({ chamados, agora }: { chamados: Chamado[]; agora: number }) {
  const contagem = useMemo(() => contarPor(chamados, (c) => c.situacao), [chamados]);
  const [filtro, setFiltro] = useState<SituacaoChamado | 'todos'>(() => ((contarPor(chamados, (c) => c.situacao).novo ?? 0) > 0 ? 'novo' : 'todos'));
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const textos = useMemo(() => new Map(chamados.map((c) => [c.id, paraBusca(c.assunto, c.email, c.origem)])), [chamados]);
  const lista = (filtro === 'todos' ? chamados : chamados.filter((c) => c.situacao === filtro)).filter((c) => !busca.trim() || combina(textos.get(c.id) ?? '', busca));
  const visiveis = lista.slice(0, limite);

  return (
    <div className="flex flex-col gap-4">
      <AtualizarSozinho />
      {chamados.length > 5 ? (
        <CampoBusca valor={busca} aoMudar={(v) => (setBusca(v), setLimite(POR_PAGINA))} rotulo="Buscar pedidos de ajuda" dica="Buscar por assunto, e-mail, oficina ou loja" />
      ) : null}
      <LinhaDeFiltros rotulo="Filtrar por situação">
        {SITUACOES_CHAMADO.map((s) => (
          <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => (setFiltro(s.id), setLimite(POR_PAGINA))} n={contagem[s.id] ?? 0}>
            {s.plural}
          </Filtro>
        ))}
        <Filtro ativo={filtro === 'todos'} aoClicar={() => (setFiltro('todos'), setLimite(POR_PAGINA))} n={chamados.length}>
          Todos
        </Filtro>
      </LinhaDeFiltros>
      {visiveis.length ? (
        <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {visiveis.map((c) => {
            const s = SITUACOES_CHAMADO.find((x) => x.id === c.situacao) ?? SITUACOES_CHAMADO[0];
            return (
              <li key={c.id}>
                <Link href={`/admin/suporte/${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-papel-2 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.assunto}</span>
                    <span className="block truncate text-[13.5px] text-tinta-3">{[c.origem, c.email].filter(Boolean).join(', ')}</span>
                  </span>
                  <Chip tom={s.tom}>{s.nome}</Chip>
                  <span className="text-[13px] text-tinta-3">{quandoFoi(c.atualizado_em, agora)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo={chamados.length ? 'Nada com esse filtro' : 'Nenhum pedido de ajuda ainda'}>
          {chamados.length ? 'Escolha outra situação acima.' : 'Quando uma oficina ou loja tocar em Ajuda no app, o pedido aparece aqui.'}
        </Vazio>
      )}
      <MostrarMais total={lista.length} mostrando={visiveis.length} aoMostrar={() => setLimite((l) => l + POR_PAGINA)} />
    </div>
  );
}
