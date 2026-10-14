'use client';

import { BadgeCheck, BadgePercent, Check, Minus, Plus, Search, ShoppingCart, Truck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { enviarPedido } from '@/app/acoes';
import { Folha } from '@/components/Folha';
import { IconeServico } from '@/components/icones';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, Vazio, classeArea, classeEntrada } from '@/components/ui';
import {
  CATEGORIAS,
  desconto,
  embalagem,
  melhorOferta,
  nomeCategoria,
  ordenarVitrine,
  patrocinado,
  precoNaQuantidade,
  promocoesAtivas,
  quantidadeComUnidade,
  type Fornecedor,
  type Produto
} from '@/lib/catalogo';
import { fotoDoProduto, linkDaLicenca, paginaDaFoto } from '@/lib/fotos';
import { dataLocal, formatarData, formatarDataCurta } from '@/lib/datas';
import { formatarMoeda, formatarNumero, formatarTelefone, normalizarTelefone } from '@/lib/formatos';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { itensParaComprar } from '@/lib/avisos';
import { nomeBase } from '@/lib/oleos';
import { calcularDemanda, type LinhaDemanda } from '@/lib/recomendacao';
import { origemDaReferencia, textoDoPrazo } from '@/lib/referencias';
import { useOficina } from '@/lib/store';
import type { Categoria } from '@/lib/tipos';
import { useCatalogo } from './catalogo';
import { CartaoDemanda } from './demanda';
import { FotoProduto } from './FotoProduto';
import { useReferencias } from './referencias';

export function Loja() {
  const { catalogo, carregando, semConexao } = useCatalogo();
  const hoje = useHoje();
  const dados = useDadosAvisos();
  const uf = useOficina((s) => s.oficina.uf);
  const carrinho = useOficina((s) => s.carrinho);
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const pedidos = useOficina((s) => s.pedidos);
  const toast = useToast();
  const [categoria, setCategoria] = useState<Categoria | 'promocoes' | null>(null);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<Produto | null>(null);

  const fornecedores = useMemo(() => new Map(catalogo.fornecedores.map((f) => [f.id, f])), [catalogo]);
  const produtos = useMemo(
    () => ordenarVitrine(catalogo.produtos.filter((p) => fornecedores.has(p.fornecedorId)), catalogo, uf, hoje),
    [catalogo, fornecedores, uf, hoje]
  );
  const demonstracao = catalogo.origem === 'exemplo' || catalogo.fornecedores.some((f) => f.demonstracao);
  const demanda = useMemo(() => calcularDemanda(itensParaComprar(dados, hoje, 30), catalogo, hoje, 30), [dados, catalogo, hoje]);
  const emPromocao = produtos.filter((p) => melhorOferta(p, catalogo.promocoes, hoje));
  const categoriasComProduto = CATEGORIAS.filter((c) => produtos.some((p) => p.categoria === c.id));

  const filtrados = produtos.filter((p) => {
    if (categoria === 'promocoes' && !melhorOferta(p, catalogo.promocoes, hoje)) return false;
    if (categoria && categoria !== 'promocoes' && p.categoria !== categoria) return false;
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    const espec = Object.values(p.especificacao).flat().join(' ').toLowerCase();
    const loja = fornecedores.get(p.fornecedorId)?.nome.toLowerCase() ?? '';
    return p.nome.toLowerCase().includes(t) || espec.includes(t) || nomeCategoria(p.categoria).toLowerCase().includes(t) || (p.marca ?? '').toLowerCase().includes(t) || loja.includes(t);
  });

  const itensCarrinho = carrinho.reduce((n, c) => n + c.quantidade, 0);
  const totalCarrinho = carrinho.reduce((soma, c) => {
    const p = produtos.find((x) => x.id === c.produtoId);
    return p ? soma + precoNaQuantidade(p, catalogo.promocoes, hoje, c.quantidade).preco * c.quantidade : soma;
  }, 0);

  function por(p: Produto, quantidade: number) {
    adicionar(p.id, quantidade);
    toast({ texto: `${quantidadeComUnidade(p, quantidade)} de ${p.nome} no pedido.`, acao: { rotulo: 'Ver pedido', fazer: () => setAberto(true) } });
  }

  /** Um produto patrocinado da mesma categoria, para mostrar ao lado da sugestão mais barata. */
  function patrocinadoParecido(r: NonNullable<LinhaDemanda['recomendacao']>): Produto | undefined {
    const viscosidade = r.produto.especificacao.viscosidade;
    return produtos.find(
      (p) =>
        p.id !== r.produto.id &&
        p.categoria === r.produto.categoria &&
        patrocinado(p.id, catalogo.patrocinios, uf, hoje) &&
        (p.categoria !== 'oleo_motor' || (!!viscosidade && p.especificacao.viscosidade === viscosidade))
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Loja</h1>
          <p className="mt-1 max-w-[60ch] text-tinta-2">Peças e óleo para os serviços que estão vencendo, com o preço das promoções dos fornecedores.</p>
        </div>
        <Botao variante={itensCarrinho ? 'escuro' : 'secundario'} onClick={() => setAberto(true)}>
          <ShoppingCart size={18} />
          {itensCarrinho ? `Pedido de ${formatarMoeda(totalCarrinho)}` : 'Pedido vazio'}
        </Botao>
      </header>

      {demonstracao ? (
        <p className="rounded-xl border border-dashed border-linha bg-papel px-4 py-3 text-[14px] text-tinta-2">
          Vitrine de demonstração, com fornecedores e preços de exemplo. Dá para testar o pedido; a equipe do Revisaí recebe e entra em contato.
        </p>
      ) : null}
      {semConexao ? <p className="text-[14px] text-oleo-tinta">Sem conexão. Mostrando a última versão da loja que ficou salva.</p> : null}

      <Secao
        titulo="Para os próximos 30 dias"
        descricao="O que os carros dos seus clientes vão precisar, somado. Comprando junto, entra na promoção por quantidade."
      >
        {demanda.length === 0 ? (
          <Vazio titulo="Nenhuma troca prevista para os próximos 30 dias">Quando os avisos chegarem perto, a soma do que comprar aparece aqui.</Vazio>
        ) : (
          <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
            {demanda.map((l) => {
              const r = l.recomendacao;
              const alternativa = r ? patrocinadoParecido(r) : undefined;
              return (
                <li key={l.chave} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                  <div className="flex items-start gap-x-4 sm:items-center">
                    {r ? (
                      <button type="button" onClick={() => setDetalhe(r.produto)} className="shrink-0 overflow-hidden rounded-xl ring-1 ring-linha" aria-label={`Ver ${r.produto.nome}`}>
                        <FotoProduto produto={r.produto} tamanhos="56px" className="h-14 w-14" />
                      </button>
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-papel-2 text-tinta-2">
                        <IconeServico servico={l.servico} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{l.titulo}</p>
                      <p className="text-[14px] text-tinta-2">
                        {l.carros} {l.carros === 1 ? 'carro' : 'carros'}
                        {l.unidadeVolume === 'L' ? `, uns ${formatarNumero(l.volume, 2)} litros` : ''}
                      </p>
                      {r ? (
                        <p className="mt-1 text-[14px]">
                          {quantidadeComUnidade(r.produto, r.quantidade)} de <span className="font-semibold">{r.produto.nome}</span> por{' '}
                          <strong className="num">{formatarMoeda(r.total)}</strong>
                          {r.promocao ? <Chip tom="oleo" className="ml-2 align-middle">-{desconto(r.produto.preco, r.promocao.precoPromocional)}%</Chip> : null}
                        </p>
                      ) : l.semEspecificacao ? (
                        <p className="mt-1 text-[14px] text-tinta-3">Cadastre o óleo do manual desses carros para o app escolher o produto.</p>
                      ) : (
                        <p className="mt-1 text-[14px] text-tinta-3">Nenhum produto desta categoria na loja ainda.</p>
                      )}
                      {r ? (
                        <Botao tamanho="pequeno" variante="escuro" className="mt-2.5 sm:hidden" onClick={() => por(r.produto, r.quantidade)}>
                          Pôr no pedido
                        </Botao>
                      ) : null}
                    </div>
                    {r ? (
                      <div className="hidden sm:block">
                        <Botao tamanho="pequeno" variante="escuro" onClick={() => por(r.produto, r.quantidade)}>
                          Pôr no pedido
                        </Botao>
                      </div>
                    ) : null}
                  </div>
                  {alternativa ? (
                    <button
                      type="button"
                      onClick={() => setDetalhe(alternativa)}
                      className="flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2 text-left text-[13.5px] hover:bg-linha/50 sm:ml-[72px]"
                    >
                      <SeloPatrocinado />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{alternativa.nome}</span>
                        <span className="text-tinta-3">, {fornecedores.get(alternativa.fornecedorId)?.nome}</span>
                      </span>
                      <span className="num font-semibold">{formatarMoeda(precoNaQuantidade(alternativa, catalogo.promocoes, hoje, 1).preco)}</span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <CartaoDemanda />
      </Secao>

      {emPromocao.length ? (
        <Secao titulo="Promoções" descricao="Ofertas em vigor dos fornecedores. Algumas valem a partir de uma quantidade.">
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {emPromocao.map((p) => (
              <div key={p.id} className="w-[256px] shrink-0 snap-start">
                <CartaoProduto produto={p} hoje={hoje} uf={uf} aoPor={por} aoAbrir={setDetalhe} fornecedor={fornecedores.get(p.fornecedorId)} />
              </div>
            ))}
          </div>
        </Secao>
      ) : null}

      <Secao titulo="Catálogo" descricao={carregando ? 'Atualizando…' : `${produtos.length} produtos de ${catalogo.fornecedores.length} fornecedores`}>
        <div className="flex flex-col gap-3">
          <div className="relative max-w-md">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
            <input className={`${classeEntrada} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="5W-30, dexos, filtro, 185/65, loja…" aria-label="Buscar produto" />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Filtro ativo={categoria === null} aoClicar={() => setCategoria(null)}>
              Tudo
            </Filtro>
            <Filtro ativo={categoria === 'promocoes'} aoClicar={() => setCategoria('promocoes')}>
              Em promoção
            </Filtro>
            {categoriasComProduto.map((c) => (
              <Filtro key={c.id} ativo={categoria === c.id} aoClicar={() => setCategoria(c.id)}>
                {c.nome}
              </Filtro>
            ))}
          </div>
        </div>
        {filtrados.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((p) => (
              <CartaoProduto key={p.id} produto={p} hoje={hoje} uf={uf} aoPor={por} aoAbrir={setDetalhe} fornecedor={fornecedores.get(p.fornecedorId)} />
            ))}
          </div>
        ) : (
          <Vazio titulo="Nenhum produto encontrado">Tente outra palavra ou escolha outra categoria.</Vazio>
        )}
        <p className="text-[13px] text-tinta-3">
          Os produtos com o selo Patrocinado pagaram para aparecer primeiro. As lojas Destaque têm plano mensal. Fotos sem marca são ilustrativas;{' '}
          <Link href="/creditos" className="font-semibold text-caneta hover:underline">
            veja os créditos
          </Link>
          .
        </p>
      </Secao>

      {pedidos.length ? (
        <Secao titulo="Pedidos enviados">
          <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {pedidos.map((p) => (
              <li key={p.codigo} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Truck size={18} className="text-tinta-3" aria-hidden="true" />
                <span className="largo num font-extrabold tracking-wider">{p.codigo}</span>
                <span className="text-[14px] text-tinta-2">{formatarData(dataLocal(p.quando))}</span>
                <span className="text-[14px] text-tinta-2">
                  {p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'}
                </span>
                <span className="num ml-auto font-semibold">{formatarMoeda(p.total)}</span>
              </li>
            ))}
          </ul>
        </Secao>
      ) : null}

      <DetalheProduto produto={detalhe} aoFechar={() => setDetalhe(null)} aoPor={por} uf={uf} />
      <Carrinho aberto={aberto} aoFechar={() => setAberto(false)} />
    </div>
  );
}

function Filtro({ ativo, aoClicar, children }: { ativo: boolean; aoClicar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={`h-9 shrink-0 rounded-full border px-3.5 text-[14px] font-semibold ${ativo ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
    >
      {children}
    </button>
  );
}

function SeloPatrocinado() {
  return <span className="shrink-0 rounded-md bg-papel px-1.5 py-0.5 text-[11.5px] font-bold tracking-wide text-tinta-2 ring-1 ring-linha">Patrocinado</span>;
}

function SeloDestaque() {
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-caneta">
      <BadgeCheck size={14} aria-hidden="true" /> Loja destaque
    </span>
  );
}

function especificacoes(p: Produto): string[] {
  const e = p.especificacao;
  return [
    e.viscosidade,
    e.base ? nomeBase(e.base) : '',
    e.api ? `API ${e.api}` : '',
    ...(e.acea ?? []).map((a) => `ACEA ${a}`),
    ...(e.normas ?? []),
    e.medida ?? '',
    e.amperagem ? `${e.amperagem} Ah` : '',
    e.tipo ?? ''
  ].filter((x): x is string => !!x);
}

function CartaoProduto({
  produto: p,
  hoje,
  uf,
  aoPor,
  aoAbrir,
  fornecedor
}: {
  produto: Produto;
  hoje: string;
  uf: string;
  aoPor: (p: Produto, q: number) => void;
  aoAbrir: (p: Produto) => void;
  fornecedor?: Fornecedor;
}) {
  const { catalogo } = useCatalogo();
  const oferta = melhorOferta(p, catalogo.promocoes, hoje);
  const [qtd, setQtd] = useState(oferta?.quantidadeMinima ?? 1);
  const { preco, promocao } = precoNaQuantidade(p, catalogo.promocoes, hoje, qtd);
  const pago = patrocinado(p.id, catalogo.patrocinios, uf, hoje);
  const specs = especificacoes(p);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-papel ring-1 ring-linha" aria-label={p.nome}>
      <button type="button" onClick={() => aoAbrir(p)} className="group relative block text-left" aria-label={`Ver detalhes de ${p.nome}`}>
        <FotoProduto produto={p} tamanhos="(min-width: 1280px) 300px, (min-width: 640px) 45vw, 100vw" className="aspect-[16/10] w-full transition-[filter] group-hover:brightness-95" />
        <span className="absolute top-2.5 left-2.5 flex gap-1.5">{pago ? <SeloPatrocinado /> : null}</span>
        {oferta ? (
          <span className="absolute top-2.5 right-2.5">
            <Chip tom="oleo" className="shadow-sm">
              <BadgePercent size={14} aria-hidden="true" /> -{desconto(p.preco, oferta.precoPromocional)}%
            </Chip>
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[12.5px] font-semibold text-tinta-3">{nomeCategoria(p.categoria)}</p>
          <button type="button" onClick={() => aoAbrir(p)} className="text-left text-[16.5px] leading-snug font-bold [font-stretch:100%] hover:underline">
            {p.nome}
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-tinta-3">
            <span>
              {embalagem(p)}
              {fornecedor ? `, ${fornecedor.nome}` : ''}
            </span>
            {fornecedor?.destaque ? <SeloDestaque /> : null}
          </p>
        </div>
        {specs.length ? (
          <div className="flex flex-wrap gap-1.5">
            {specs.slice(0, 4).map((e) => (
              <span key={e} className="rounded-md bg-papel-2 px-2 py-0.5 text-[12.5px] font-semibold text-tinta-2">
                {e}
              </span>
            ))}
            {specs.length > 4 ? <span className="px-1 text-[12.5px] font-semibold text-tinta-3">+{specs.length - 4}</span> : null}
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            {promocao ? <p className="num text-[13px] text-tinta-3 line-through">{formatarMoeda(p.preco)}</p> : null}
            <p className="largo num text-[21px] leading-none font-extrabold">{formatarMoeda(preco)}</p>
            <p className="mt-1 text-[12.5px] text-tinta-3">
              {oferta && !promocao
                ? `${formatarMoeda(oferta.precoPromocional)} a partir de ${oferta.quantidadeMinima}`
                : oferta
                  ? `${oferta.titulo} até ${formatarDataCurta(oferta.fim)}`
                  : 'por ' + embalagem(p).toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Passo valor={qtd} aoMudar={setQtd} rotulo={p.nome} />
            <Botao tamanho="pequeno" variante="escuro" onClick={() => aoPor(p, qtd)} aria-label={`Pôr ${qtd} de ${p.nome} no pedido`}>
              <Plus size={16} /> Pôr
            </Botao>
          </div>
        </div>
      </div>
    </article>
  );
}

function DetalheProduto({ produto: p, aoFechar, aoPor, uf }: { produto: Produto | null; aoFechar: () => void; aoPor: (p: Produto, q: number) => void; uf: string }) {
  const { catalogo } = useCatalogo();
  const { referencias } = useReferencias();
  const hoje = useHoje();
  const [qtd, setQtd] = useState(1);
  const [aberto, setAberto] = useState<number | null>(null);
  if (p && aberto !== p.id) {
    setAberto(p.id);
    setQtd(melhorOferta(p, catalogo.promocoes, hoje)?.quantidadeMinima ?? 1);
  }
  if (!p) return <Folha aberta={false} aoFechar={aoFechar} titulo="">{null}</Folha>;

  const fornecedor = catalogo.fornecedores.find((f) => f.id === p.fornecedorId);
  const foto = fotoDoProduto(p);
  const ofertas = promocoesAtivas(catalogo.promocoes, p.id, hoje)
    .filter((x) => x.precoPromocional < p.preco)
    .sort((a, b) => a.quantidadeMinima - b.quantidadeMinima);
  const { preco, promocao } = precoNaQuantidade(p, catalogo.promocoes, hoje, qtd);
  const referencia = p.referenciaId != null ? referencias.find((r) => r.id === p.referenciaId) : undefined;
  const prazo = p.intervaloKm || p.intervaloMeses ? textoDoPrazo(p.intervaloKm, p.intervaloMeses) : referencia && !referencia.segueManual ? textoDoPrazo(referencia.intervaloKm, referencia.intervaloMeses) : null;
  const specs = especificacoes(p);

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={p.nome}
      descricao={`${nomeCategoria(p.categoria)}, ${embalagem(p).toLowerCase()}`}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p>
            {promocao ? <span className="num mr-2 text-[14px] text-tinta-3 line-through">{formatarMoeda(p.preco)}</span> : null}
            <strong className="largo num text-[21px]">{formatarMoeda(preco)}</strong>
            <span className="text-[13px] text-tinta-3"> cada</span>
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
              <Plus size={17} /> Pôr no pedido
            </Botao>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
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
          {specs.map((e) => (
            <span key={e} className="rounded-md bg-papel-2 px-2 py-0.5 text-[13px] font-semibold text-tinta-2">
              {e}
            </span>
          ))}
        </div>

        {p.descricao ? <p className="text-tinta-2">{p.descricao}</p> : null}

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
              {fornecedor.descricao ? <p className="mt-1 text-[14px] text-tinta-2">{fornecedor.descricao}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </Folha>
  );
}

function Passo({ valor, aoMudar, rotulo }: { valor: number; aoMudar: (n: number) => void; rotulo: string }) {
  return (
    <div className="flex h-9 items-center rounded-[10px] border border-linha bg-papel">
      <button type="button" className="grid h-full w-8 place-items-center text-tinta-2 hover:text-tinta" onClick={() => aoMudar(Math.max(1, valor - 1))} aria-label={`Menos ${rotulo}`}>
        <Minus size={15} />
      </button>
      <span className="num w-7 text-center text-[14px] font-bold" aria-live="polite">
        {valor}
      </span>
      <button type="button" className="grid h-full w-8 place-items-center text-tinta-2 hover:text-tinta" onClick={() => aoMudar(Math.min(999, valor + 1))} aria-label={`Mais ${rotulo}`}>
        <Plus size={15} />
      </button>
    </div>
  );
}

function Carrinho({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { catalogo, produto, carregando } = useCatalogo();
  const hoje = useHoje();
  const carrinho = useOficina((s) => s.carrinho);
  const definir = useOficina((s) => s.definirQuantidade);
  const limpar = useOficina((s) => s.limparCarrinho);
  const oficina = useOficina((s) => s.oficina);
  const salvarOficina = useOficina((s) => s.salvarOficina);
  const registrarPedido = useOficina((s) => s.registrarPedido);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const linhas = carrinho
    .map((c) => {
      const p = produto(c.produtoId);
      if (!p) return null;
      const { preco, promocao } = precoNaQuantidade(p, catalogo.promocoes, hoje, c.quantidade);
      return { p, quantidade: c.quantidade, preco, promocao };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const total = linhas.reduce((s, l) => s + l.preco * l.quantidade, 0);
  // produtos que saíram da loja desde que entraram no pedido
  const sairam = carregando ? [] : carrinho.filter((c) => !produto(c.produtoId));
  useEffect(() => {
    if (!sairam.length) return;
    for (const c of sairam) definir(c.produtoId, 0);
    setErro(sairam.length === 1 ? 'Um produto saiu da loja e foi tirado do pedido.' : `${sairam.length} produtos saíram da loja e foram tirados do pedido.`);
  }, [sairam.length]);

  function enviar() {
    setErro(null);
    if (!oficina.nome.trim()) return setErro('Escreva o nome da oficina.');
    if (!normalizarTelefone(oficina.whatsapp)) return setErro('Escreva o WhatsApp da oficina, com DDD. É por ele que o fornecedor fala com você.');
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof enviarPedido>>;
      try {
        r = await enviarPedido({
          oficina: { nome: oficina.nome, whatsapp: oficina.whatsapp, cidade: oficina.cidade, uf: oficina.uf },
          itens: linhas.map((l) => ({ produtoId: l.p.id, quantidade: l.quantidade })),
          observacao: obs
        });
      } catch {
        setErro('Não deu para falar com o servidor. Confira a internet e tente de novo. Se o app ficou aberto muito tempo, recarregue a página.');
        return;
      }
      if (!r.ok) return setErro(r.erro);
      registrarPedido({
        codigo: r.codigo,
        quando: new Date().toISOString(),
        itens: linhas.map((l) => ({ produtoId: l.p.id, nome: l.p.nome, quantidade: l.quantidade, precoUnitario: l.preco })),
        total: r.total ?? Math.round(total * 100) / 100
      });
      setObs('');
      setEnviado(r.codigo);
    });
  }

  function fechar() {
    setEnviado(null);
    setErro(null);
    aoFechar();
  }

  if (enviado) {
    return (
      <Folha aberta={aberto} aoFechar={fechar} titulo="Pedido enviado" rodape={<Botao variante="primario" onClick={fechar}>Fechar</Botao>}>
        <div className="flex flex-col items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-ok-claro text-ok">
            <Check size={26} />
          </span>
          <p>
            Pedido <strong className="largo num tracking-wider">{enviado}</strong> recebido.
          </p>
          <p className="text-tinta-2">
            O fornecedor chama você no WhatsApp {formatarTelefone(oficina.whatsapp)} para combinar pagamento e entrega. Os preços seguem as promoções de hoje.
          </p>
        </div>
      </Folha>
    );
  }

  return (
    <Folha
      aberta={aberto}
      aoFechar={fechar}
      titulo="Seu pedido"
      descricao={linhas.length ? `${linhas.length} ${linhas.length === 1 ? 'produto' : 'produtos'}` : undefined}
      rodape={
        linhas.length ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p>
              Total <strong className="largo num text-[19px]">{formatarMoeda(total)}</strong>
            </p>
            <Botao variante="primario" tamanho="grande" onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar pedido'}
            </Botao>
          </div>
        ) : undefined
      }
    >
      {linhas.length === 0 ? (
        <p className="text-tinta-2">Nada no pedido ainda. Toque em Pôr nos produtos ou nas sugestões dos avisos.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="divide-y divide-linha">
            {linhas.map((l) => (
              <li key={l.p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.p.nome}</p>
                  <p className="text-[13.5px] text-tinta-3">
                    {formatarMoeda(l.preco)} cada
                    {l.promocao ? `, promoção ${l.promocao.titulo.toLowerCase()}` : ''}
                  </p>
                </div>
                <Passo valor={l.quantidade} aoMudar={(n) => definir(l.p.id, n)} rotulo={l.p.nome} />
                <span className="num w-24 text-right font-semibold">{formatarMoeda(l.preco * l.quantidade)}</span>
                <button type="button" className="text-[13px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => definir(l.p.id, 0)}>
                  Tirar
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 rounded-xl bg-papel-2 p-4 sm:grid-cols-2">
            <p className="text-[14px] font-semibold sm:col-span-2">Para o fornecedor falar com você</p>
            <Campo rotulo="Oficina" htmlFor="ped-nome">
              <input id="ped-nome" className={classeEntrada} value={oficina.nome} onChange={(e) => salvarOficina({ nome: e.target.value })} />
            </Campo>
            <Campo rotulo="WhatsApp" htmlFor="ped-whats">
              <input id="ped-whats" className={classeEntrada} value={oficina.whatsapp} onChange={(e) => salvarOficina({ whatsapp: e.target.value })} inputMode="tel" />
            </Campo>
            <Campo rotulo="Observação" htmlFor="ped-obs" className="sm:col-span-2" dica="Ex.: entregar até sexta, pagar no PIX.">
              <textarea id="ped-obs" rows={2} className={classeArea} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} />
            </Campo>
          </div>
          {erro ? (
            <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
          <button type="button" className="self-start text-[14px] font-semibold text-tinta-3 hover:text-atraso" onClick={limpar}>
            Esvaziar pedido
          </button>
        </div>
      )}
    </Folha>
  );
}
