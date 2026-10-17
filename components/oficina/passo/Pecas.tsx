'use client';

// A escolha da peça de um serviço, como numa loja: cartões com foto, o que tem no estoque,
// o indicado para o carro e o usado da última vez. Depois de escolher, a quantidade e o preço.

import { CarFront, Check, ChevronDown, Minus, PackageX, Plus, Search, ShoppingCart, Star, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { classeEntrada } from '@/components/ui';
import { quantidadeComUnidade } from '@/lib/catalogo';
import { textoQuantidade } from '@/lib/estoque';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import { servico as infoServico } from '@/lib/manutencao';
import type { EscolhaPeca } from '@/lib/passo';
import { useOficina } from '@/lib/store';
import type { LinhaDocumento, ServicoId, Veiculo } from '@/lib/tipos';
import { FotoProduto } from '../FotoProduto';
import { embalagensPara, quantidadePadraoDaPeca, type OpcaoPeca, type useOpcoesDePeca } from './opcoes';

/** A chave do cartão que corresponde à linha já escolhida. */
export function chaveDaLinha(l: LinhaDocumento | undefined): string | null {
  if (!l) return null;
  if (l.estoqueId) return `estoque:${l.estoqueId}`;
  if (l.produto?.id != null) return `loja:${l.produto.id}`;
  if (l.produto?.proprioId) return `meu:${l.produto.proprioId}`;
  if (l.produto?.referenciaId != null) return `ref:${l.produto.referenciaId}`;
  return 'outro';
}

export function escolhaDaOpcao(o: OpcaoPeca, quantidade: number): EscolhaPeca {
  return { descricao: o.titulo, quantidade, unidade: o.unidade, valorUnitario: o.preco, ...(o.estoqueId ? { estoqueId: o.estoqueId } : {}), produto: o.produto };
}

export function EscolhaDePeca({
  s,
  veiculo,
  tipo,
  opcoes,
  linha,
  aoEscolher,
  aoMudarLinha
}: {
  s: ServicoId;
  veiculo: Pick<Veiculo, 'oleo' | 'id'> | undefined;
  tipo: 'ordem' | 'orcamento';
  opcoes: ReturnType<typeof useOpcoesDePeca>;
  linha: LinhaDocumento | undefined;
  aoEscolher: (e: EscolhaPeca | null) => void;
  aoMudarLinha: (m: Partial<LinhaDocumento>) => void;
}) {
  const { principais, outras, exigido, carro } = opcoes;
  const [verOutras, setVerOutras] = useState(false);
  const [busca, setBusca] = useState('');
  const [outroTexto, setOutroTexto] = useState(linha && chaveDaLinha(linha) === 'outro' ? linha.descricao : '');
  const escolhida = chaveDaLinha(linha);
  const todas = useMemo(() => [...principais, ...outras], [principais, outras]);
  const opcao = todas.find((o) => o.chave === escolhida);
  const unidade = opcao?.unidade ?? (infoServico(s).categoria === 'oleo_motor' ? 'L' : 'un');
  const padrao = quantidadePadraoDaPeca(s, unidade, veiculo);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t ? outras.filter((o) => `${o.titulo} ${o.detalhe ?? ''}`.toLowerCase().includes(t)) : outras;
    return lista.slice(0, 40);
  }, [busca, outras]);

  function escolher(o: OpcaoPeca) {
    aoEscolher(escolhaDaOpcao(o, linha?.quantidade ?? padrao));
  }

  function outro() {
    const nome = outroTexto.trim();
    if (nome.length < 2) return;
    aoEscolher({ descricao: nome, quantidade: linha?.quantidade ?? padrao, unidade, valorUnitario: linha?.valorUnitario ?? null, produto: { nome, categoria: infoServico(s).categoria ?? undefined } });
  }

  return (
    <div className="flex flex-col gap-5">
      {exigido ? (
        <p className="rounded-xl bg-papel-2 px-3.5 py-2.5 text-[14px] text-tinta-2">
          O manual pede <strong className="text-tinta">{[exigido.viscosidades.join(' ou '), exigido.norma, exigido.api ? `API ${exigido.api}` : ''].filter(Boolean).join(', ')}</strong>
          {exigido.capacidadeL ? `, ${formatarNumero(exigido.capacidadeL, 2)} litros` : ''}. Os que servem estão marcados.
        </p>
      ) : null}

      {principais.length ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Peças">
          {principais.map((o) => (
            <li key={o.chave}>
              <CartaoPeca opcao={o} marcada={o.chave === escolhida} aoEscolher={() => escolher(o)} tipo={tipo} carro={carro} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-linha px-4 py-4 text-[14.5px] text-tinta-2">Nada no estoque nem na loja para este serviço. Escreva a peça abaixo ou busque outra marca.</p>
      )}

      {linha && (opcao || escolhida === 'outro') ? <Quantidade key={`${linha.id}-${escolhida}`} linha={linha} opcao={opcao} tipo={tipo} aoMudar={aoMudarLinha} /> : null}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setVerOutras((v) => !v)}
          aria-expanded={verOutras}
          className="inline-flex h-11 items-center gap-2 self-start rounded-[10px] border border-linha bg-papel px-3.5 text-[15px] font-semibold hover:border-tinta-3"
        >
          <Search size={17} aria-hidden="true" /> Outra marca ou produto
          <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${verOutras ? 'rotate-180' : ''}`} />
        </button>
        {verOutras ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-papel p-3 ring-1 ring-linha sm:p-4">
            <input className={classeEntrada} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, linha ou viscosidade" aria-label="Buscar outra marca" autoComplete="off" />
            {filtradas.length ? (
              <ul className="flex max-h-80 flex-col divide-y divide-linha overflow-y-auto">
                {filtradas.map((o) => (
                  <li key={o.chave}>
                    <button type="button" onClick={() => escolher(o)} aria-pressed={o.chave === escolhida} className="flex w-full items-center gap-3 py-2 text-left hover:bg-papel-2">
                      <FotoProduto produto={{ imagemUrl: o.imagemUrl, categoria: o.categoria, nome: o.titulo }} tamanhos="44px" className="h-11 w-11 shrink-0 rounded-lg ring-1 ring-linha" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{o.titulo}</span>
                        <span className="block truncate text-[13px] text-tinta-3">
                          {o.serve === 'sim' && carro ? <span className="font-semibold text-ok">Serve no {carro}. </span> : null}
                          {[o.detalhe, o.alerta].filter(Boolean).join(', ')}
                        </span>
                      </span>
                      {o.precoLoja ? <span className="num text-[13.5px] text-tinta-2">{formatarMoeda(o.precoLoja)}</span> : null}
                      {o.chave === escolhida ? <Check size={18} className="text-ok" aria-hidden="true" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-tinta-3">Nenhuma com esse nome.</p>
            )}
            <div className="flex flex-col gap-2 border-t border-linha pt-3">
              <label htmlFor={`outro-${s}`} className="text-[14px] font-semibold">
                Não achou? Escreva a peça
              </label>
              <div className="flex gap-2">
                <input
                  id={`outro-${s}`}
                  className={classeEntrada}
                  value={outroTexto}
                  onChange={(e) => setOutroTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && outro()}
                  placeholder={s === 'troca_oleo' ? 'Ex.: Ipiranga F1 Master 5W-30' : 'Marca e código'}
                  maxLength={120}
                  autoComplete="off"
                />
                <button type="button" onClick={outro} disabled={outroTexto.trim().length < 2} className="h-11 shrink-0 rounded-[10px] bg-tinta px-4 font-semibold text-papel disabled:opacity-45">
                  Usar
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {linha ? (
          <button type="button" onClick={() => aoEscolher(null)} className="self-start text-[14px] font-semibold text-tinta-3 hover:text-atraso">
            Não anotar a peça
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CartaoPeca({ opcao: o, marcada, aoEscolher, tipo, carro }: { opcao: OpcaoPeca; marcada: boolean; aoEscolher: () => void; tipo: 'ordem' | 'orcamento'; carro: string | null }) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={marcada}
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-papel text-left transition-[box-shadow,transform] active:scale-[0.99] ${marcada ? 'ring-3 ring-tinta' : 'ring-1 ring-linha hover:ring-tinta-3'}`}
    >
      <FotoProduto produto={{ imagemUrl: o.imagemUrl, categoria: o.categoria, nome: o.titulo }} tamanhos="(min-width: 640px) 200px, 45vw" className="aspect-[4/3] w-full" />
      <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
        {o.anterior ? <span className="rounded-md bg-tinta px-1.5 py-0.5 text-[11.5px] font-bold text-papel">Da última vez</span> : null}
        {o.indicado ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-oleo px-1.5 py-0.5 text-[11.5px] font-bold text-[#1b1f22]">
            <Star size={11} fill="currentColor" aria-hidden="true" /> Indicado
          </span>
        ) : null}
      </span>
      {marcada ? (
        <span className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-tinta text-papel">
          <Check size={17} aria-hidden="true" />
        </span>
      ) : null}
      <span className="flex flex-1 flex-col gap-1 px-3 pt-2 pb-3">
        <span className="line-clamp-2 text-[14.5px] leading-snug font-bold">{o.titulo}</span>
        {o.detalhe ? <span className="line-clamp-1 text-[12.5px] text-tinta-3">{o.detalhe}</span> : null}
        {o.serve === 'sim' && carro ? (
          <span className="inline-flex items-center gap-1 self-start rounded-full bg-ok-claro px-2 py-0.5 text-[12px] font-semibold text-ok">
            <CarFront size={12} aria-hidden="true" className="shrink-0" /> Serve no {carro}
          </span>
        ) : null}
        <span className="mt-auto flex flex-wrap gap-1 pt-1">
          {o.estoque ? <SeloEstoque e={o.estoque} /> : o.origem === 'loja' ? <span className="rounded-full bg-caneta-claro px-2 py-0.5 text-[12px] font-semibold text-caneta">Na loja</span> : null}
          {tipo === 'orcamento' && o.preco != null ? (
            <span className="num rounded-full bg-papel-2 px-2 py-0.5 text-[12px] font-semibold text-tinta-2">
              {formatarMoeda(o.preco)}
              {o.unidade === 'L' ? '/L' : ''}
            </span>
          ) : o.precoLoja != null && !o.estoque ? (
            <span className="num rounded-full bg-papel-2 px-2 py-0.5 text-[12px] font-semibold text-tinta-2">{formatarMoeda(o.precoLoja)}</span>
          ) : null}
        </span>
        {o.alerta ? (
          <span className="flex items-start gap-1 text-[12px] leading-snug font-semibold text-atraso">
            <TriangleAlert size={13} className="mt-px shrink-0" aria-hidden="true" /> {o.alerta}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function SeloEstoque({ e }: { e: NonNullable<OpcaoPeca['estoque']> }) {
  if (e.situacao === 'zerado')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-atraso-claro px-2 py-0.5 text-[12px] font-semibold text-atraso">
        <PackageX size={12} aria-hidden="true" /> Sem estoque
      </span>
    );
  const tom = e.situacao === 'baixo' ? 'bg-oleo-claro text-oleo-tinta' : 'bg-ok-claro text-ok';
  return <span className={`num rounded-full px-2 py-0.5 text-[12px] font-semibold ${tom}`}>{e.situacao === 'baixo' ? `Só ${textoQuantidade(e.quantidade, e.unidade)}` : `Tem ${textoQuantidade(e.quantidade, e.unidade)}`}</span>;
}

/** A quantidade e o preço da peça escolhida, com o aviso quando o estoque não dá. */
function Quantidade({ linha, opcao, tipo, aoMudar }: { linha: LinhaDocumento; opcao: OpcaoPeca | undefined; tipo: 'ordem' | 'orcamento'; aoMudar: (m: Partial<LinhaDocumento>) => void }) {
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const toast = useToast();
  const [preco, setPreco] = useState(linha.valorUnitario != null ? formatarNumero(linha.valorUnitario, 2) : '');
  const passo = linha.unidade === 'L' ? 0.5 : 1;
  const falta = opcao?.estoque ? Math.max(0, linha.quantidade - opcao.estoque.quantidade) : 0;
  const comprar = opcao?.produtoLoja && falta > 0 ? embalagensPara(opcao.produtoLoja, falta) : 0;

  function mudarQuantidade(q: number) {
    aoMudar({ quantidade: Math.max(passo, Math.round(q * 100) / 100) });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
      <p className="font-bold">{linha.descricao}</p>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-tinta-2">Quantidade</span>
          <div className="flex h-12 items-center rounded-xl border border-linha bg-papel">
            <button type="button" onClick={() => mudarQuantidade(linha.quantidade - passo)} className="grid h-full w-12 place-items-center text-tinta-2 hover:text-tinta" aria-label="Menos">
              <Minus size={18} />
            </button>
            <span className="largo num min-w-16 text-center text-[20px] font-extrabold" aria-live="polite">
              {formatarNumero(linha.quantidade, 2)}
              <span className="ml-1 text-[14px] font-semibold text-tinta-3">{linha.unidade === 'L' ? 'L' : 'un'}</span>
            </span>
            <button type="button" onClick={() => mudarQuantidade(linha.quantidade + passo)} className="grid h-full w-12 place-items-center text-tinta-2 hover:text-tinta" aria-label="Mais">
              <Plus size={18} />
            </button>
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-tinta-2">{tipo === 'orcamento' ? 'Preço para o cliente' : 'Preço cobrado'}{linha.unidade === 'L' ? ' (litro)' : ''}</span>
          <span className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3">R$</span>
            <input
              className={`${classeEntrada} num h-12 w-36 pl-10 text-[18px] font-bold`}
              value={preco}
              inputMode="decimal"
              placeholder="0,00"
              onChange={(e) => {
                setPreco(e.target.value);
                const v = lerNumero(e.target.value);
                aoMudar({ valorUnitario: v != null && v >= 0 ? v : null });
              }}
              aria-label="Preço"
            />
          </span>
        </label>
        {linha.valorUnitario != null ? (
          <p className="pb-3 text-[14px] text-tinta-2">
            Total <strong className="num text-tinta">{formatarMoeda(linha.valorUnitario * linha.quantidade)}</strong>
          </p>
        ) : null}
      </div>
      {falta > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-oleo-claro px-3.5 py-2.5 text-[14px] text-oleo-tinta">
          <TriangleAlert size={16} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Tem só {textoQuantidade(opcao!.estoque!.quantidade, opcao!.estoque!.unidade)} no estoque. Faltam {textoQuantidade(falta, opcao!.estoque!.unidade)}.
          </span>
          {opcao?.produtoLoja && comprar ? (
            <button
              type="button"
              onClick={() => {
                adicionar(opcao.produtoLoja!.id, comprar);
                toast({ texto: `${quantidadeComUnidade(opcao.produtoLoja!, comprar)} no pedido da loja.` });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-tinta px-3 text-[13.5px] font-semibold text-papel"
            >
              <ShoppingCart size={15} aria-hidden="true" /> Pôr {quantidadeComUnidade(opcao.produtoLoja, comprar)} no pedido
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
