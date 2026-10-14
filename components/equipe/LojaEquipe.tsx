'use client';

import { MessageCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip, classeBotao, Vazio } from '@/components/ui';
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
import { formatarMoeda, plural } from '@/lib/formatos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Filtro, LinhaDeFiltros } from './comum';

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
  const [filtro, setFiltro] = useState<SituacaoPromocao>('em_vigor');
  const visiveis = promocoes.filter((p) => p.situacao === filtro);

  const ativos = loja.fornecedores.filter((f) => f.ativo).length;
  const aVenda = loja.produtos.filter((p) => p.ativo && fornecedores.get(p.fornecedor_id)?.ativo).length;

  return (
    <div className="flex flex-col gap-10">
      <p className="text-[15px] text-tinta-2">
        {plural(ativos, 'fornecedor ativo', 'fornecedores ativos')}, {plural(aVenda, 'produto à venda', 'produtos à venda')} e{' '}
        {plural(contagem.em_vigor ?? 0, 'promoção em vigor', 'promoções em vigor')}.
      </p>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-promocoes">
        <h2 id="titulo-promocoes" className="text-[21px]">
          Promoções
        </h2>
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
          <Vazio titulo="Nenhuma promoção aqui">Escolha outra situação acima.</Vazio>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-fornecedores">
        <h2 id="titulo-fornecedores" className="text-[21px]">
          Fornecedores
        </h2>
        {loja.fornecedores.length ? (
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {loja.fornecedores.map((f) => {
              const seus = loja.produtos.filter((p) => p.fornecedor_id === f.id);
              const ativosDele = seus.filter((p) => p.ativo).length;
              const idsDele = new Set(seus.map((p) => p.id));
              const promosDele = promocoes.filter((p) => idsDele.has(p.produto_id) && p.situacao === 'em_vigor').length;
              const whatsapp = f.whatsapp ? linkWhatsApp(f.whatsapp, 'Olá! Aqui é da equipe do Revisaí.') : null;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{f.nome}</p>
                      {f.demonstracao ? <Chip>Exemplo</Chip> : null}
                      {!f.ativo ? <Chip tom="atraso">Fora da loja</Chip> : null}
                    </div>
                    <p className="text-[14px] text-tinta-3">
                      {[[f.cidade, f.uf].filter(Boolean).join(', '), plural(ativosDele, 'produto ativo', 'produtos ativos'), plural(promosDele, 'promoção em vigor', 'promoções em vigor')]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                  {whatsapp ? (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                      <MessageCircle size={16} aria-hidden="true" /> WhatsApp
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Vazio titulo="Nenhum fornecedor cadastrado" />
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
