'use client';

import { useMemo, useState } from 'react';
import { Chip, Vazio } from '@/components/ui';
import {
  contarPor,
  dataCurta,
  descontoPercentual,
  diasParaAcabar,
  situacaoPromocao,
  SITUACOES_PROMOCAO,
  type LojaEquipe as Loja,
  type SituacaoPromocao
} from '@/lib/equipe-dados';
import { Numero } from '@/components/painel/Numero';
import { formatarMoeda } from '@/lib/formatos';
import { CampoBusca, combina, Filtro, LinhaDeFiltros, paraBusca } from './comum';

export function LojaEquipe({ loja, hoje }: { loja: Loja; hoje: string }) {
  const produtos = useMemo(() => new Map(loja.produtos.map((p) => [p.id, p])), [loja.produtos]);
  const fornecedores = useMemo(() => new Map(loja.fornecedores.map((f) => [f.id, f])), [loja.fornecedores]);
  const promocoes = useMemo(
    () =>
      loja.promocoes
        .map((p) => ({ ...p, situacao: situacaoPromocao(p, hoje) }))
        .sort((a, b) => (a.situacao === 'em_vigor' && b.situacao === 'em_vigor' ? a.fim.localeCompare(b.fim) : b.inicio.localeCompare(a.inicio))),
    [loja.promocoes, hoje]
  );
  const contagem = useMemo(() => contarPor(promocoes, (p) => p.situacao), [promocoes]);
  // abre na primeira situação que tem promoção, começando pelas em vigor
  const [filtro, setFiltro] = useState<SituacaoPromocao>(() => SITUACOES_PROMOCAO.find((s) => (contagem[s.id] ?? 0) > 0)?.id ?? 'em_vigor');
  const [busca, setBusca] = useState('');
  const visiveis = promocoes
    .filter((p) => p.situacao === filtro)
    .filter((p) => {
      if (!busca.trim()) return true;
      const produto = produtos.get(p.produto_id);
      return combina(paraBusca(p.titulo, produto?.marca, produto?.nome, produto ? fornecedores.get(produto.fornecedor_id)?.nome : ''), busca);
    });

  const ativos = loja.fornecedores.filter((f) => f.ativo).length;
  const aVenda = loja.produtos.filter((p) => p.ativo && fornecedores.get(p.fornecedor_id)?.ativo).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Promoções em vigor" valor={String(contagem.em_vigor ?? 0)} />
        <Numero rotulo="Programadas" valor={String(contagem.programada ?? 0)} />
        <Numero rotulo="Fornecedores ativos" valor={String(ativos)} />
        <Numero rotulo="Produtos à venda" valor={String(aVenda)} />
      </div>

      <section className="flex flex-col gap-3" aria-label="Lista de promoções">
        {promocoes.length > 5 ? <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar promoções" dica="Buscar por produto, marca ou fornecedor" /> : null}
        <LinhaDeFiltros rotulo="Filtrar promoções">
          {SITUACOES_PROMOCAO.map((s) => (
            <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => setFiltro(s.id)} n={contagem[s.id] ?? 0}>
              {s.plural}
            </Filtro>
          ))}
        </LinhaDeFiltros>
        {visiveis.length ? (
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {visiveis.map((pr) => {
              const produto = produtos.get(pr.produto_id);
              const fornecedor = produto ? fornecedores.get(produto.fornecedor_id) : undefined;
              const desconto = produto ? descontoPercentual(produto.preco, pr.preco_promocional) : 0;
              const s = SITUACOES_PROMOCAO.find((x) => x.id === pr.situacao)!;
              return (
                <li key={pr.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{pr.titulo}</p>
                      {pr.situacao !== 'em_vigor' ? <Chip tom={s.tom}>{s.nome}</Chip> : null}
                    </div>
                    <p className="text-[15px] text-tinta-2">{produto ? [produto.marca, produto.nome].filter(Boolean).join(' ') : `Produto ${pr.produto_id}`}</p>
                    <p className="text-[13px] text-tinta-3">{fornecedor?.nome ?? 'Fornecedor removido'}</p>
                  </div>
                  <div className="flex flex-col items-end text-right">
                    <p className="flex items-baseline gap-2">
                      {produto && desconto > 0 ? <span className="num text-[13px] text-tinta-3 line-through">{formatarMoeda(produto.preco)}</span> : null}
                      <span className="num text-[17px] font-extrabold">{formatarMoeda(pr.preco_promocional)}</span>
                      {desconto > 0 ? <Chip tom="ok">-{desconto}%</Chip> : null}
                    </p>
                    <p className="text-[13px] text-tinta-3">
                      {pr.quantidade_minima > 1 ? `A partir de ${pr.quantidade_minima} un, ` : ''}
                      {periodo(pr.inicio, pr.fim, pr.situacao, hoje)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio titulo={busca.trim() ? 'Nenhuma promoção encontrada' : 'Nenhuma promoção aqui'}>
            {promocoes.length ? 'Escolha outra situação acima.' : 'Os fornecedores criam as promoções no painel deles. Quando criarem, elas aparecem aqui.'}
          </Vazio>
        )}
      </section>

    </div>
  );
}

function periodo(inicio: string, fim: string, situacao: SituacaoPromocao, hoje: string): string {
  if (situacao === 'programada') return `de ${dataCurta(inicio, hoje)} a ${dataCurta(fim, hoje)}`;
  if (situacao === 'encerrada') return `acabou em ${dataCurta(fim, hoje)}`;
  const dias = diasParaAcabar(fim, hoje);
  if (dias === 0) return 'acaba hoje';
  if (dias === 1) return 'acaba amanhã';
  return `até ${dataCurta(fim, hoje)}`;
}
