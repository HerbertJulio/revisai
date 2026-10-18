'use client';

import { Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { salvarPromocao } from '@/app/fornecedor/acoes';
import { AvisoErro, Filtro, LinhaDeFiltros } from './comum';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Alternar, Botao, Campo, Chip, Vazio, classeEntrada } from '@/components/ui';
import { contarPor, dataCurta, descontoPercentual, situacaoPromocao, SITUACOES_PROMOCAO, type SituacaoPromocao } from '@/lib/loja/comum';
import { formatarMoeda, lerNumero } from '@/lib/formatos';
import type { LinhaProduto, LinhaPromocao } from '@/lib/marketplace-dados';

interface Rascunho {
  id?: number;
  produtoId: string;
  titulo: string;
  preco: string;
  minimo: string;
  inicio: string;
  fim: string;
  ativo: boolean;
}

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function PromocoesFornecedor({
  produtos,
  promocoes,
  hoje,
  sugestao
}: {
  produtos: LinhaProduto[];
  promocoes: LinhaPromocao[];
  hoje: string;
  /** Vem do Início ("Criar essa promoção"). */
  sugestao: { produtoId: number; preco: number; minimo: number } | null;
}) {
  const toast = useToast();
  const nomes = new Map(produtos.map((p) => [p.id, [p.marca, p.nome].filter(Boolean).join(' ')]));
  const precos = new Map(produtos.map((p) => [p.id, p.preco]));
  const [rascunho, setRascunho] = useState<Rascunho | null>(() =>
    sugestao && precos.has(sugestao.produtoId)
      ? {
          produtoId: String(sugestao.produtoId),
          titulo: 'Oferta da região',
          preco: String(sugestao.preco).replace('.', ','),
          minimo: String(sugestao.minimo),
          inicio: hoje,
          fim: somarDias(hoje, 14),
          ativo: true
        }
      : null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const lista = promocoes.map((p) => ({ ...p, situacao: situacaoPromocao(p, hoje) }));
  const contagem = contarPor(lista, (p) => p.situacao);
  const [filtro, setFiltro] = useState<SituacaoPromocao>('em_vigor');
  const visiveis = lista.filter((p) => p.situacao === filtro);

  function abrir(p?: LinhaPromocao) {
    setErro(null);
    setRascunho(
      p
        ? { id: p.id, produtoId: String(p.produto_id), titulo: p.titulo, preco: String(p.preco_promocional).replace('.', ','), minimo: String(p.quantidade_minima), inicio: p.inicio, fim: p.fim, ativo: p.ativo }
        : { produtoId: produtos[0] ? String(produtos[0].id) : '', titulo: '', preco: '', minimo: '1', inicio: hoje, fim: somarDias(hoje, 14), ativo: true }
    );
  }

  function salvar() {
    if (!rascunho) return;
    setErro(null);
    const preco = lerNumero(rascunho.preco);
    const minimo = lerNumero(rascunho.minimo);
    if (!rascunho.produtoId) return setErro('Escolha o produto.');
    if (!preco || preco <= 0) return setErro('Informe o preço da promoção.');
    if (!minimo || minimo < 1) return setErro('A quantidade mínima é de pelo menos 1.');
    iniciar(async () => {
      try {
        const r = await salvarPromocao({
          id: rascunho.id,
          produtoId: Number(rascunho.produtoId),
          titulo: rascunho.titulo,
          precoPromocional: preco,
          quantidadeMinima: Math.round(minimo),
          inicio: rascunho.inicio,
          fim: rascunho.fim,
          ativo: rascunho.ativo
        });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: rascunho.id ? 'Promoção salva.' : 'Promoção criada. Ela aparece na loja e nos avisos das oficinas.' });
        setRascunho(null);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  const precoNormal = rascunho ? precos.get(Number(rascunho.produtoId)) : undefined;
  const precoPromo = rascunho ? lerNumero(rascunho.preco) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LinhaDeFiltros rotulo="Filtrar promoções">
          {SITUACOES_PROMOCAO.map((s) => (
            <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => setFiltro(s.id)} n={contagem[s.id] ?? 0}>
              {s.plural}
            </Filtro>
          ))}
        </LinhaDeFiltros>
        <Botao variante="escuro" onClick={() => abrir()} disabled={!produtos.length}>
          <Plus size={17} /> Promoção
        </Botao>
      </div>
      {visiveis.length ? (
        <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {visiveis.map((p) => {
            const normal = precos.get(p.produto_id);
            const desc = normal ? descontoPercentual(normal, p.preco_promocional) : 0;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-bold">{p.titulo}</p>
                  <p className="text-[14px] text-tinta-2">{nomes.get(p.produto_id) ?? `Produto ${p.produto_id}`}</p>
                  <p className="text-[13px] text-tinta-3">
                    {p.quantidade_minima > 1 ? `A partir de ${p.quantidade_minima}, ` : ''}de {dataCurta(p.inicio, hoje)} a {dataCurta(p.fim, hoje)}
                  </p>
                </div>
                <p className="flex items-baseline gap-2">
                  {normal ? <span className="num text-[13px] text-tinta-3 line-through">{formatarMoeda(normal)}</span> : null}
                  <span className="num text-[17px] font-extrabold">{formatarMoeda(p.preco_promocional)}</span>
                  {desc > 0 ? <Chip tom="ok">-{desc}%</Chip> : null}
                </p>
                <Botao tamanho="pequeno" onClick={() => abrir(p)} aria-label={`Editar ${p.titulo}`}>
                  <Pencil size={15} />
                </Botao>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo={produtos.length ? 'Nenhuma promoção aqui' : 'Cadastre um produto primeiro'}>
          {produtos.length ? 'Promoções com quantidade mínima entram na soma de compras das oficinas e aparecem dentro dos avisos de troca.' : 'A promoção é sempre de um produto seu.'}
        </Vazio>
      )}

      <Folha
        aberta={rascunho != null}
        aoFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? 'Promoção' : 'Nova promoção'}
        rodape={
          <div className="flex w-full justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setRascunho(null)}>
              Cancelar
            </Botao>
            <Botao variante="primario" onClick={salvar} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        }
      >
        {rascunho ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Campo rotulo="Produto" htmlFor="pr-prod" className="sm:col-span-6">
              <select id="pr-prod" className={classeEntrada} value={rascunho.produtoId} onChange={(e) => setRascunho({ ...rascunho, produtoId: e.target.value })}>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomes.get(p.id)} ({formatarMoeda(p.preco)})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Nome da promoção" htmlFor="pr-tit" className="sm:col-span-6" dica="Curto. Ex.: Semana do óleo, Leve 4 pneus">
              <input id="pr-tit" className={classeEntrada} value={rascunho.titulo} onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })} maxLength={80} />
            </Campo>
            <Campo
              rotulo="Preço na promoção (R$)"
              htmlFor="pr-preco"
              className="sm:col-span-3"
              dica={precoNormal && precoPromo ? `Normal ${formatarMoeda(precoNormal)}, ${descontoPercentual(precoNormal, precoPromo)}% de desconto.` : undefined}
            >
              <input id="pr-preco" className={`${classeEntrada} num font-bold`} value={rascunho.preco} onChange={(e) => setRascunho({ ...rascunho, preco: e.target.value })} inputMode="decimal" />
            </Campo>
            <Campo rotulo="A partir de (unidades)" htmlFor="pr-min" className="sm:col-span-3">
              <input id="pr-min" className={classeEntrada} value={rascunho.minimo} onChange={(e) => setRascunho({ ...rascunho, minimo: e.target.value })} inputMode="numeric" />
            </Campo>
            <Campo rotulo="Começa em" htmlFor="pr-ini" className="sm:col-span-3">
              <input id="pr-ini" type="date" className={classeEntrada} value={rascunho.inicio} onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })} />
            </Campo>
            <Campo rotulo="Acaba em" htmlFor="pr-fim" className="sm:col-span-3">
              <input id="pr-fim" type="date" className={classeEntrada} value={rascunho.fim} min={rascunho.inicio} onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })} />
            </Campo>
            <div className="rounded-xl border border-linha px-4 py-1 sm:col-span-6">
              <Alternar id="pr-ativo" ligado={rascunho.ativo} aoMudar={(v) => setRascunho({ ...rascunho, ativo: v })} rotulo="Valendo" descricao="Desligue para pausar sem apagar." />
            </div>
            {erro ? (
              <div className="sm:col-span-6">
                <AvisoErro>{erro}</AvisoErro>
              </div>
            ) : null}
          </div>
        ) : null}
      </Folha>
    </div>
  );
}
