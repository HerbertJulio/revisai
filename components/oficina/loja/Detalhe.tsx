'use client';

// A ficha do produto: foto, promoções por quantidade, o preço combinado com a oficina, o estoque e
// em que carros serve (pelo que a loja informou), prazo de troca e a loja (prazo de entrega, pedido
// mínimo e cashback).

import { CarFront, ShoppingCart, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { Denunciar } from '@/components/suporte/Denunciar';
import { Botao, Chip } from '@/components/ui';
import { desconto, embalagem, melhorOferta, nomeCategoria, patrocinado, precoNaQuantidade, promocoesAtivas, quantidadeComUnidade, type Produto } from '@/lib/catalogo';
import { formatarDataCurta } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import { fotoDoProduto, linkDaLicenca, paginaDaFoto } from '@/lib/fotos';
import { useHoje } from '@/lib/ganchos';
import { rotuloDaAplicacao } from '@/lib/loja/aplicacoes';
import { textoDoPrazoDeEntrega } from '@/lib/loja/dados';
import { origemDaReferencia, textoDoPrazo } from '@/lib/referencias';
import { infoDaLoja, infoDoProduto, precoDeVitrine, precoParaOficina, rotuloDoCarro, serveNoCarroDaVitrine, type CarroDoFiltro } from '@/lib/vitrine';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { useReferencias } from '../referencias';
import { BotaoEntrar, especificacoes, minuscula, nomeComMarca, Passo, SeloDestaque, SeloEstoqueDaLoja, SeloPatrocinado, SeloServeNoCarro } from './comum';
import { saldoNaLoja, useCondicoes } from './condicoes';
import { ComparaPreco } from './precos';
import { SeloDaLoja } from './reputacao';

const APLICACOES_VISIVEIS = 6;

export function DetalheProduto({
  produto: p,
  aoFechar,
  aoPor,
  aoAbrir,
  uf,
  carro,
  acaoPreco
}: {
  produto: Produto | null;
  aoFechar: () => void;
  aoPor: (p: Produto, q: number) => void;
  /** Troca a ficha por outro produto (as outras opções no fim da ficha). */
  aoAbrir: (p: Produto) => void;
  uf: string;
  /** O carro do filtro "Serve no carro" (a ficha diz se a peça serve nele). */
  carro?: CarroDoFiltro | null;
  /** O botão de pedir preço menor às lojas, embaixo da comparação. */
  acaoPreco?: (p: Produto, quantidade: number) => React.ReactNode;
}) {
  const { catalogo, comPrecos, extras } = useCatalogo();
  const condicoes = useCondicoes();
  const [todasAplicacoes, setTodasAplicacoes] = useState(false);
  const { conta } = useConta();
  const { referencias } = useReferencias();
  const hoje = useHoje();
  const [qtd, setQtd] = useState(1);
  const [aberto, setAberto] = useState<number | null>(null);
  const topo = useRef<HTMLDivElement>(null);
  // ao trocar de produto pelas outras opções, a ficha volta para o começo
  useEffect(() => {
    topo.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 });
  }, [p?.id]);
  if (p && aberto !== p.id) {
    setAberto(p.id);
    setQtd(melhorOferta(p, catalogo.promocoes, hoje)?.quantidadeMinima ?? 1);
    setTodasAplicacoes(false);
  }
  if (!p) return <Folha aberta={false} aoFechar={aoFechar} titulo="">{null}</Folha>;

  const fornecedor = catalogo.fornecedores.find((f) => f.id === p.fornecedorId);
  const foto = fotoDoProduto(p);
  const ofertas = promocoesAtivas(catalogo.promocoes, p.id, hoje)
    .filter((x) => x.precoPromocional < p.preco)
    .sort((a, b) => a.quantidadeMinima - b.quantidadeMinima);
  const { preco, promocao, especial } = precoParaOficina(p, catalogo.promocoes, hoje, qtd, condicoes.condicoes);
  const info = infoDoProduto(extras, p.id);
  const loja = infoDaLoja(extras, p.fornecedorId);
  const prazoEntrega = textoDoPrazoDeEntrega(loja?.prazoEntregaHoras);
  const saldo = saldoNaLoja(condicoes, p.fornecedorId);
  const serve = carro ? serveNoCarroDaVitrine(p.id, extras, carro) : null;
  const aplicacoes = info?.aplicacoes ?? [];
  const falta = info?.estoque != null && info.estoque > 0 && qtd > info.estoque ? info.estoque : null;
  const referencia = p.referenciaId != null ? referencias.find((r) => r.id === p.referenciaId) : undefined;
  const prazo = p.intervaloKm || p.intervaloMeses ? textoDoPrazo(p.intervaloKm, p.intervaloMeses) : referencia && !referencia.segueManual ? textoDoPrazo(referencia.intervaloKm, referencia.intervaloMeses) : null;
  const specs = especificacoes(p);
  const lojas = new Set(catalogo.fornecedores.map((f) => f.id));
  // outras opções da mesma categoria (no óleo, da mesma viscosidade), as mais baratas primeiro
  const outras = catalogo.produtos
    .filter(
      (x) =>
        x.id !== p.id &&
        lojas.has(x.fornecedorId) &&
        x.categoria === p.categoria &&
        (p.categoria !== 'oleo_motor' || !p.especificacao.viscosidade || x.especificacao.viscosidade === p.especificacao.viscosidade)
    )
    .sort((a, b) => precoDeVitrine(a, catalogo.promocoes, hoje) - precoDeVitrine(b, catalogo.promocoes, hoje))
    .slice(0, 6);

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={nomeComMarca(p)}
      descricao={`${nomeCategoria(p.categoria)}, ${minuscula(embalagem(p))}`}
      rodape={
        conta && comPrecos ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p>
              {promocao || especial ? <span className="num mr-2 text-[14px] text-tinta-3 line-through">{formatarMoeda(p.preco)}</span> : null}
              <strong className="largo num text-[21px]">{formatarMoeda(preco)}</strong>
              <span className="text-[13px] text-tinta-3"> cada</span>
              {especial ? <span className="block text-[12.5px] font-semibold text-caneta">Preço combinado com você</span> : null}
            </p>
            <div className="flex items-center gap-2">
              <Passo valor={qtd} aoMudar={setQtd} rotulo={p.nome} />
              <Botao
                variante="primario"
                onClick={() => {
                  aoPor(p, qtd);
                  aoFechar();
                }}
              >
                <ShoppingCart size={17} /> Pôr no pedido
              </Botao>
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="max-w-[38ch] text-[14px] text-tinta-2">{conta ? 'Os preços ainda não carregaram. Confira a internet.' : 'O preço e o pedido são para quem tem conta no Revisaí.'}</p>
            {conta ? null : <BotaoEntrar />}
          </div>
        )
      }
    >
      <div ref={topo} className="flex flex-col gap-5">
        <div className="-mx-1 overflow-hidden rounded-2xl ring-1 ring-linha">
          <FotoProduto produto={p} tamanhos="(min-width: 640px) 560px, 100vw" className="aspect-[3/2] w-full" prioridade />
        </div>
        {foto?.credito ? (
          <p className="-mt-3 text-[12px] text-tinta-3">
            Foto ilustrativa, recortada: {foto.credito.autor},{' '}
            <a href={linkDaLicenca(foto.credito)} target="_blank" rel="noopener noreferrer" className="underline">
              {foto.credito.licenca}
            </a>
            , via{' '}
            <a href={paginaDaFoto(foto.credito)} target="_blank" rel="noopener noreferrer" className="underline">
              Wikimedia Commons
            </a>
            .
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {patrocinado(p.id, catalogo.patrocinios, uf, hoje) ? <SeloPatrocinado /> : null}
          {serve === 'sim' && carro ? <SeloServeNoCarro carro={rotuloDoCarro(carro)} /> : null}
          <SeloEstoqueDaLoja estoque={info?.estoque} />
          {specs.map((e) => (
            <span key={e} className="rounded-md bg-papel-2 px-2 py-0.5 text-[13px] font-semibold text-tinta-2">
              {e}
            </span>
          ))}
        </div>

        {p.descricao ? <p className="text-tinta-2">{p.descricao}</p> : null}

        {serve === 'nao' && carro ? (
          <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso">Pela lista da loja, esta peça não serve no {rotuloDoCarro(carro)}. Confira a aplicação antes de comprar.</p>
        ) : null}
        {falta != null ? (
          <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">
            A loja informou {falta === 1 ? 'só 1 unidade' : `só ${falta} unidades`} no estoque. Ela confirma o que tem quando receber o pedido.
          </p>
        ) : info?.estoque != null && info.estoque <= 0 ? (
          <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso">A loja marcou sem estoque. Dá para pedir: ela confirma se consegue.</p>
        ) : null}

        {aplicacoes.length ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 font-bold">
              <CarFront size={17} aria-hidden="true" /> Serve em
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {(todasAplicacoes ? aplicacoes : aplicacoes.slice(0, APLICACOES_VISIVEIS)).map((a, i) => (
                <li key={`${a.texto}-${i}`} className="rounded-md bg-papel-2 px-2 py-0.5 text-[13px] text-tinta-2">
                  {rotuloDaAplicacao(a)}
                </li>
              ))}
            </ul>
            {aplicacoes.length > APLICACOES_VISIVEIS ? (
              <button type="button" onClick={() => setTodasAplicacoes(!todasAplicacoes)} className="self-start text-[13.5px] font-semibold text-caneta hover:underline">
                {todasAplicacoes ? 'Ver menos' : `Ver mais ${aplicacoes.length - APLICACOES_VISIVEIS}`}
              </button>
            ) : null}
            <p className="text-[12.5px] text-tinta-3">Lista informada pela loja. Na dúvida, confira pelo código da peça.</p>
          </div>
        ) : null}

        {ofertas.length ? (
          <div className="flex flex-col gap-2">
            <p className="font-bold">Promoções</p>
            <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
              {ofertas.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[14px]">
                  <span>
                    <span className="font-semibold">{o.titulo}</span>
                    <span className="text-tinta-3">
                      , {o.quantidadeMinima > 1 ? `a partir de ${quantidadeComUnidade(p, o.quantidadeMinima)}` : 'qualquer quantidade'}, até {formatarDataCurta(o.fim)}
                    </span>
                  </span>
                  <span className="num font-bold">
                    {formatarMoeda(o.precoPromocional)} <Chip tom="oleo">-{desconto(p.preco, o.precoPromocional)}%</Chip>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {comPrecos ? <ComparaPreco produto={p} quantidade={qtd} hoje={hoje} aoAbrir={aoAbrir} acao={acaoPreco?.(p, qtd)} /> : null}

        {prazo ? (
          <div className="rounded-xl bg-papel-2 px-4 py-3 text-[14px]">
            <p className="font-bold">Troca a cada {prazo}</p>
            <p className="mt-0.5 text-tinta-2">
              {referencia ? `${origemDaReferencia(referencia)}.` : 'Prazo indicado pelo fornecedor.'} Ao registrar o serviço com este produto, o próximo aviso já sai com esse prazo, sem passar do que o manual do carro pede.
            </p>
          </div>
        ) : null}

        {fornecedor ? (
          <div className="flex items-start gap-3 rounded-xl px-1">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tinta text-[15px] font-bold text-papel">{fornecedor.nome.slice(0, 1)}</span>
            <div className="min-w-0">
              <p className="font-semibold">
                {fornecedor.nome} {fornecedor.destaque ? <SeloDestaque /> : null}
              </p>
              <p className="text-[13.5px] text-tinta-3">{[fornecedor.cidade, fornecedor.uf].filter(Boolean).join(', ')}</p>
              <SeloDaLoja fornecedorId={fornecedor.id} />
              {fornecedor.descricao ? <p className="mt-1 text-[14px] text-tinta-2">{fornecedor.descricao}</p> : null}
              {prazoEntrega || loja?.pedidoMinimo || loja?.cashbackPercentual ? (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-[13.5px] text-tinta-2">
                  {prazoEntrega ? <li>{prazoEntrega}</li> : null}
                  {comPrecos && loja?.pedidoMinimo ? <li>Pedido mínimo de {formatarMoeda(loja.pedidoMinimo)} nesta loja</li> : null}
                  {loja?.cashbackPercentual ? <li>{String(loja.cashbackPercentual).replace('.', ',')}% de cashback nos pedidos entregues e pagos</li> : null}
                </ul>
              ) : null}
              {comPrecos && saldo !== 0 ? (
                <p className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${saldo > 0 ? 'bg-ok-claro text-ok' : 'bg-atraso-claro text-atraso'}`}>
                  <Wallet size={14} aria-hidden="true" /> Seu cashback aqui: <span className="num">{formatarMoeda(saldo)}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {conta ? <Denunciar key={p.id} produtoId={p.id} alvo="este produto" /> : null}

        {outras.length ? (
          <div className="flex flex-col gap-2">
            <p className="font-bold">Outras opções</p>
            <ul className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1">
              {outras.map((x) => {
                const v = precoDeVitrine(x, catalogo.promocoes, hoje);
                return (
                  <li key={x.id} className="w-[152px] shrink-0 snap-start">
                    <button type="button" onClick={() => aoAbrir(x)} className="flex w-full flex-col overflow-hidden rounded-xl text-left ring-1 ring-linha hover:ring-tinta-3">
                      <FotoProduto produto={x} tamanhos="152px" className="aspect-[4/3] w-full" />
                      <span className="flex flex-col gap-1 p-2.5">
                        <span className="line-clamp-2 text-[13px] leading-snug font-semibold">{nomeComMarca(x)}</span>
                        {comPrecos ? <span className="largo num text-[15px] font-extrabold">{formatarMoeda(v)}</span> : null}
                        {patrocinado(x.id, catalogo.patrocinios, uf, hoje) ? (
                          <span className="self-start">
                            <SeloPatrocinado />
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </Folha>
  );
}
