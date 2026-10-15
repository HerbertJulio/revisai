'use client';

import { Package, PackageCheck, PackageSearch, Search, SlidersHorizontal, ShoppingCart, X } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useMemo, useRef, useState } from 'react';
import { TrocaExibicao, useExibicao, type Exibicao } from '@/components/exibicao';
import { Folha } from '@/components/Folha';
import { IconeServico } from '@/components/icones';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Secao, Vazio, classeBotao } from '@/components/ui';
import { itensParaComprar } from '@/lib/avisos';
import { desconto, ordenarVitrine, patrocinado, precoNaQuantidade, quantidadeComUnidade, type Produto } from '@/lib/catalogo';
import { formatarMoeda } from '@/lib/formatos';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { compraSugerida, preverEstoque, textoQuantidade } from '@/lib/estoque';
import { calcularDemanda, type LinhaDemanda, type Recomendacao } from '@/lib/recomendacao';
import { useOficina } from '@/lib/store';
import {
  calcularFacetas,
  destaquesDaVitrine,
  filtrarProdutos,
  filtrosAtivos,
  FILTROS_VAZIOS,
  lojaDoDia,
  ORDENS,
  ordenarProdutos,
  quantosFiltros,
  type FiltrosLoja,
  type Ordem
} from '@/lib/vitrine';
import { useCatalogo } from './catalogo';
import { CartaoDemanda } from './demanda';
import { FotoProduto } from './FotoProduto';
import { Carrinho } from './loja/Carrinho';
import { BotaoPor, nomeComMarca, SeloPatrocinado } from './loja/comum';
import { DetalheProduto } from './loja/Detalhe';
import { PainelFiltros } from './loja/Filtros';
import { CartaoGrade, CartaoLojaDestaque, LinhaLista } from './loja/Produtos';
import { BotaoPedirPreco, FolhaAlerta, FolhaNovoAlerta, FolhaPacotes, ListaDeAlertas } from './loja/Alertas';
import { EmAndamento, FolhaPedido, PedidosEnviados } from './loja/Pedidos';
import { ProvedorDePrecos } from './loja/precos';
import { useOfertaDoPro, usePlano } from './plano';
import { Vitrine } from './loja/Vitrine';

const POR_PAGINA = 24;
/** Em que posição dos resultados entra o cartão da loja Destaque. */
const POSICAO_DA_LOJA = 4;
const DEMANDA_VISIVEL = 4;
const CHAVE_EXIBICAO = 'revisai:loja:exibicao';

export function Loja() {
  return (
    <ProvedorDePrecos>
      <ConteudoDaLoja />
    </ProvedorDePrecos>
  );
}

function ConteudoDaLoja() {
  const { catalogo, carregando, semConexao } = useCatalogo();
  const hoje = useHoje();
  const uf = useOficina((s) => s.oficina.uf);
  const carrinho = useOficina((s) => s.carrinho);
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<Produto | null>(null);
  const [filtros, setFiltros] = useState<FiltrosLoja>(FILTROS_VAZIOS);
  const [ordem, setOrdem] = useState<Ordem>('relevancia');
  const [exibicao, setExibicao] = useExibicao(CHAVE_EXIBICAO);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [painelAberto, setPainelAberto] = useState(false);
  const [novoAlerta, setNovoAlerta] = useState<{ produto: Produto; quantidade: number } | null>(null);
  const [alertaAberto, setAlertaAberto] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [pacotes, setPacotes] = useState(false);
  const plano = usePlano();
  const ofertaPro = useOfertaDoPro();
  const catalogoRef = useRef<HTMLElement>(null);

  const fornecedores = useMemo(() => new Map(catalogo.fornecedores.map((f) => [f.id, f])), [catalogo]);
  const ctx = useMemo(() => ({ catalogo, uf, hoje }), [catalogo, uf, hoje]);
  const base = useMemo(() => catalogo.produtos.filter((p) => fornecedores.has(p.fornecedorId)), [catalogo, fornecedores]);
  const resultado = useMemo(() => ordenarProdutos(filtrarProdutos(base, filtros, ctx), ordem, ctx), [base, filtros, ctx, ordem]);
  const facetas = useMemo(() => calcularFacetas(base, filtros, ctx), [base, filtros, ctx]);
  const destaques = useMemo(() => destaquesDaVitrine(ordenarVitrine(base, catalogo, uf, hoje), ctx, 5), [base, catalogo, uf, hoje, ctx]);
  const loja = useMemo(() => lojaDoDia(catalogo.fornecedores, base, hoje), [catalogo, base, hoje]);
  const ativos = filtrosAtivos(filtros, ctx);
  const demonstracao = catalogo.origem === 'exemplo' || catalogo.fornecedores.some((f) => f.demonstracao);
  const visiveis = resultado.slice(0, limite);
  const mostrarLoja = !!loja && !filtros.fornecedores.length && !filtros.busca.trim() && resultado.length > POSICAO_DA_LOJA;

  const itensCarrinho = carrinho.reduce((n, c) => n + c.quantidade, 0);
  const totalCarrinho = carrinho.reduce((soma, c) => {
    const p = base.find((x) => x.id === c.produtoId);
    return p ? soma + precoNaQuantidade(p, catalogo.promocoes, hoje, c.quantidade).preco * c.quantidade : soma;
  }, 0);

  function mudarFiltros(f: FiltrosLoja) {
    setFiltros(f);
    setLimite(POR_PAGINA);
  }

  function por(p: Produto, quantidade: number) {
    adicionar(p.id, quantidade);
    toast({ texto: `${quantidadeComUnidade(p, quantidade)} de ${nomeComMarca(p)} no pedido.`, acao: { rotulo: 'Ver pedido', fazer: () => setAberto(true) } });
  }

  function pedirPreco(p: Produto, quantidade: number) {
    setDetalhe(null);
    if (!plano.liberado) return ofertaPro('alertas');
    setNovoAlerta({ produto: p, quantidade });
  }

  function verAlerta(id: string) {
    setDetalhe(null);
    setAlertaAberto(id);
  }

  function verLoja(id: number) {
    mudarFiltros({ ...FILTROS_VAZIOS, fornecedores: [id] });
    catalogoRef.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Loja</h1>
          <p className="mt-1 max-w-[60ch] text-tinta-2">Peças e óleo para os serviços que estão vencendo, com o preço das promoções dos fornecedores.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/oficina/estoque" className={classeBotao('secundario')}>
            <Package size={18} aria-hidden="true" /> Estoque
          </Link>
          <Botao variante={itensCarrinho ? 'escuro' : 'secundario'} onClick={() => setAberto(true)}>
            <ShoppingCart size={18} />
            {itensCarrinho ? `Pedido de ${formatarMoeda(totalCarrinho)}` : 'Pedido vazio'}
          </Botao>
        </div>
      </header>

      {demonstracao ? (
        <p className="rounded-xl border border-dashed border-linha bg-papel px-4 py-3 text-[14px] text-tinta-2">
          Vitrine de demonstração, com fornecedores e preços de exemplo. Dá para testar o pedido; a equipe do Revisaí recebe e entra em contato.
        </p>
      ) : null}
      {semConexao ? <p className="text-[14px] text-oleo-tinta">Sem conexão. Mostrando a última versão da loja que ficou salva.</p> : null}

      <EmAndamento aoAbrirAlerta={setAlertaAberto} aoAbrirPedido={setPedidoAberto} />

      <Vitrine destaques={destaques} fornecedores={fornecedores} hoje={hoje} aoPor={por} aoAbrir={setDetalhe} />

      <ParaOsCarros aoPor={por} aoAbrir={setDetalhe} />

      <section ref={catalogoRef} className="flex scroll-mt-20 flex-col gap-4" aria-labelledby="t-catalogo">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="t-catalogo" className="text-[21px]">
              Catálogo
            </h2>
            <p className="mt-0.5 text-[14px] text-tinta-3">
              {carregando ? 'Atualizando…' : `${base.length} produtos de ${catalogo.fornecedores.length} ${catalogo.fornecedores.length === 1 ? 'fornecedor' : 'fornecedores'}`}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filtros">
            <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-2 pb-4">
              <PainelFiltros filtros={filtros} facetas={facetas} aoMudar={mudarFiltros} />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-4">
            <BarraDaBusca
              filtros={filtros}
              aoMudar={mudarFiltros}
              ordem={ordem}
              aoOrdenar={(o) => {
                setOrdem(o);
                setLimite(POR_PAGINA);
              }}
              exibicao={exibicao}
              aoExibir={setExibicao}
              aoAbrirFiltros={() => setPainelAberto(true)}
            />

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0 lg:hidden" role="group" aria-label="Categorias">
              <ChipCategoria ativo={!filtros.categoria} aoClicar={() => mudarFiltros({ ...filtros, categoria: null, viscosidades: [], bases: [], normas: [] })}>
                Todas
              </ChipCategoria>
              {facetas.categorias.map((c) => (
                <ChipCategoria key={c.valor} ativo={filtros.categoria === c.valor} aoClicar={() => mudarFiltros({ ...filtros, categoria: filtros.categoria === c.valor ? null : c.valor, viscosidades: [], bases: [], normas: [] })}>
                  {c.nome}
                </ChipCategoria>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 text-[14px] text-tinta-2" aria-live="polite">
                <strong className="num text-tinta">{resultado.length}</strong> {resultado.length === 1 ? 'produto' : 'produtos'}
              </p>
              {ativos.map((a) => (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => mudarFiltros(a.sem)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-linha bg-papel pr-2 pl-3 text-[13px] font-semibold text-tinta hover:border-tinta-3"
                  aria-label={`Tirar o filtro ${a.rotulo}`}
                >
                  {a.rotulo} <X size={14} aria-hidden="true" className="text-tinta-3" />
                </button>
              ))}
              {ativos.length > 1 ? (
                <button type="button" onClick={() => mudarFiltros(FILTROS_VAZIOS)} className="text-[13.5px] font-semibold text-caneta hover:underline">
                  Limpar tudo
                </button>
              ) : null}
              <div className="ml-auto sm:hidden">
                <TrocaExibicao exibicao={exibicao} aoExibir={setExibicao} />
              </div>
            </div>

            {resultado.length === 0 ? (
              <Vazio
                titulo="Nenhum produto com esses filtros"
                acao={
                  ativos.length ? (
                    <Botao onClick={() => mudarFiltros(FILTROS_VAZIOS)}>Limpar os filtros</Botao>
                  ) : undefined
                }
              >
                Tente outra palavra, tire um filtro ou escolha outra categoria.
              </Vazio>
            ) : exibicao === 'grade' ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
                {visiveis.map((p, i) => (
                  <Fragment key={p.id}>
                    {mostrarLoja && loja && i === POSICAO_DA_LOJA ? (
                      <CartaoLojaDestaque loja={loja} produtos={base.filter((x) => x.fornecedorId === loja.id).length} aoVer={() => verLoja(loja.id)} />
                    ) : null}
                    <CartaoGrade produto={p} fornecedor={fornecedores.get(p.fornecedorId)} uf={uf} hoje={hoje} aoPor={por} aoAbrir={setDetalhe} />
                  </Fragment>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
                {visiveis.map((p, i) => (
                  <Fragment key={p.id}>
                    {mostrarLoja && loja && i === POSICAO_DA_LOJA ? (
                      <li className="p-2">
                        <CartaoLojaDestaque loja={loja} produtos={base.filter((x) => x.fornecedorId === loja.id).length} aoVer={() => verLoja(loja.id)} emLinha />
                      </li>
                    ) : null}
                    <LinhaLista produto={p} fornecedor={fornecedores.get(p.fornecedorId)} uf={uf} hoje={hoje} aoPor={por} aoAbrir={setDetalhe} />
                  </Fragment>
                ))}
              </ul>
            )}

            {resultado.length > visiveis.length ? (
              <button type="button" onClick={() => setLimite((l) => l + POR_PAGINA)} className="inline-flex h-11 items-center gap-2 self-center rounded-[10px] border border-linha bg-papel px-4 text-[15px] font-semibold hover:border-tinta-3">
                Mostrar mais {Math.min(POR_PAGINA, resultado.length - visiveis.length)}
                <span className="num text-tinta-3">de {resultado.length - visiveis.length}</span>
              </button>
            ) : null}

            <p className="text-[13px] text-tinta-3">
              Os produtos com o selo Patrocinado pagaram para aparecer primeiro. As lojas Destaque têm plano mensal. Fotos sem marca são ilustrativas;{' '}
              <Link href="/creditos" className="font-semibold text-caneta hover:underline">
                veja os créditos
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <PedidosEnviados aoAbrir={setPedidoAberto} />

      <ListaDeAlertas aoAbrir={setAlertaAberto} aoComprar={() => setPacotes(true)} />

      <Folha
        aberta={painelAberto}
        aoFechar={() => setPainelAberto(false)}
        titulo="Filtros"
        rodape={
          <div className="flex w-full items-center justify-between gap-2">
            <Botao variante="fantasma" onClick={() => mudarFiltros({ ...FILTROS_VAZIOS, busca: filtros.busca })} disabled={!quantosFiltros(filtros) && !filtros.categoria}>
              Limpar
            </Botao>
            <Botao variante="primario" onClick={() => setPainelAberto(false)}>
              Ver {resultado.length} {resultado.length === 1 ? 'produto' : 'produtos'}
            </Botao>
          </div>
        }
      >
        <PainelFiltros filtros={filtros} facetas={facetas} aoMudar={mudarFiltros} />
      </Folha>

      <DetalheProduto
        produto={detalhe}
        aoFechar={() => setDetalhe(null)}
        aoPor={por}
        aoAbrir={setDetalhe}
        uf={uf}
        acaoPreco={(p, q) => <BotaoPedirPreco produto={p} aoPedir={() => pedirPreco(p, q)} aoVerAlerta={verAlerta} />}
      />
      <Carrinho aberto={aberto} aoFechar={() => setAberto(false)} aoAcompanhar={setPedidoAberto} />
      <FolhaNovoAlerta pedido={novoAlerta} aoFechar={() => setNovoAlerta(null)} aoVerAlerta={setAlertaAberto} aoComprar={() => setPacotes(true)} />
      <FolhaAlerta alertaId={alertaAberto} aoFechar={() => setAlertaAberto(null)} aoAcompanhar={(c) => {
        setAlertaAberto(null);
        setPedidoAberto(c);
      }} />
      <FolhaPedido codigo={pedidoAberto} aoFechar={() => setPedidoAberto(null)} />
      <FolhaPacotes aberta={pacotes} aoFechar={() => setPacotes(false)} />
    </div>
  );
}

function BarraDaBusca({
  filtros,
  aoMudar,
  ordem,
  aoOrdenar,
  exibicao,
  aoExibir,
  aoAbrirFiltros
}: {
  filtros: FiltrosLoja;
  aoMudar: (f: FiltrosLoja) => void;
  ordem: Ordem;
  aoOrdenar: (o: Ordem) => void;
  exibicao: Exibicao;
  aoExibir: (e: Exibicao) => void;
  aoAbrirFiltros: () => void;
}) {
  const n = quantosFiltros(filtros);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[200px] flex-1 basis-full sm:basis-auto">
        <span className="sr-only">Buscar produto</span>
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
        <input
          type="search"
          value={filtros.busca}
          onChange={(e) => aoMudar({ ...filtros, busca: e.target.value })}
          placeholder="5W-30, dexos, filtro, 185/65, loja…"
          className="h-11 w-full min-w-0 rounded-[10px] border border-linha bg-papel pr-3 pl-10 text-[16px] outline-none placeholder:text-tinta-3 focus:border-caneta focus:ring-3 focus:ring-caneta/20"
        />
      </label>
      <button
        type="button"
        onClick={aoAbrirFiltros}
        className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-linha bg-papel px-3.5 text-[15px] font-semibold hover:border-tinta-3 lg:hidden"
      >
        <SlidersHorizontal size={17} aria-hidden="true" /> Filtros
        {n ? <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-tinta px-1.5 text-[12px] font-bold text-papel">{n}</span> : null}
      </button>
      <label className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <span className="sr-only">Ordenar</span>
        <select
          value={ordem}
          onChange={(e) => aoOrdenar(e.target.value as Ordem)}
          className="h-11 w-full min-w-0 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[16px] font-semibold outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 sm:w-auto sm:text-[14.5px]"
        >
          {ORDENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="hidden sm:block">
        <TrocaExibicao exibicao={exibicao} aoExibir={aoExibir} />
      </div>
    </div>
  );
}

function ChipCategoria({ ativo, aoClicar, children }: { ativo: boolean; aoClicar: () => void; children: React.ReactNode }) {
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

/**
 * O que os carros dos clientes vão precisar nos próximos 30 dias (e as ordens em aberto), contra o
 * que tem no estoque: a sugestão de compra é só do que falta, com a promoção que vale.
 */
function ParaOsCarros({ aoPor, aoAbrir }: { aoPor: (p: Produto, q: number) => void; aoAbrir: (p: Produto) => void }) {
  const { catalogo } = useCatalogo();
  const dados = useDadosAvisos();
  const hoje = useHoje();
  const uf = useOficina((s) => s.oficina.uf);
  const estoque = useOficina((s) => s.estoque);
  const documentos = useOficina((s) => s.documentos);
  const [todas, setTodas] = useState(false);
  const demanda = useMemo(() => calcularDemanda(itensParaComprar(dados, hoje, 30), catalogo, hoje, 30), [dados, catalogo, hoje]);
  const previsao = useMemo(() => preverEstoque(demanda, Object.values(documentos), Object.values(estoque), hoje), [demanda, documentos, estoque, hoje]);
  const temEstoque = Object.keys(estoque).length > 0;
  const fornecedores = useMemo(() => new Map(catalogo.fornecedores.map((f) => [f.id, f])), [catalogo]);
  const linhas = useMemo(
    () =>
      previsao
        .filter((l) => !l.semEspecificacao)
        .map((l) => ({ l, r: compraSugerida(l, estoque, catalogo, hoje) }))
        .filter((x) => x.r || x.l.faltam <= 0),
    [previsao, estoque, catalogo, hoje]
  );
  const semOleo = previsao.filter((l) => l.semEspecificacao);
  const semProduto = demanda.filter((l) => !l.recomendacao && !l.semEspecificacao && !linhas.some((x) => x.l.chave === l.chave));
  const visiveis = todas ? linhas : linhas.slice(0, DEMANDA_VISIVEL);

  /** Um produto patrocinado da mesma categoria, para mostrar ao lado da sugestão mais barata. */
  function patrocinadoParecido(r: Recomendacao): Produto | undefined {
    const viscosidade = r.produto.especificacao.viscosidade;
    return catalogo.produtos.find(
      (p) =>
        p.id !== r.produto.id &&
        p.categoria === r.produto.categoria &&
        patrocinado(p.id, catalogo.patrocinios, uf, hoje) &&
        (p.categoria !== 'oleo_motor' || (!!viscosidade && p.especificacao.viscosidade === viscosidade))
    );
  }

  return (
    <Secao
      titulo="Para os próximos 30 dias"
      descricao={temEstoque ? 'O que os carros dos seus clientes e as ordens em aberto vão usar, menos o que já tem no estoque.' : 'O que os carros dos seus clientes vão precisar, somado. Comprando junto, entra na promoção por quantidade.'}
      acao={
        <Link href="/oficina/estoque" className="shrink-0 text-[14.5px] font-semibold text-caneta hover:underline">
          {temEstoque ? 'Ver o estoque' : 'Cadastrar o estoque'}
        </Link>
      }
    >
      {previsao.length === 0 ? (
        <Vazio titulo="Nenhuma troca prevista para os próximos 30 dias">Quando os avisos chegarem perto, a soma do que comprar aparece aqui.</Vazio>
      ) : (
        <ul className="divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
          {visiveis.map(({ l, r }) => {
            const alternativa = r ? patrocinadoParecido(r) : undefined;
            const cobre = l.faltam <= 0;
            return (
              <li key={l.chave} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex items-start gap-x-4 sm:items-center">
                  {r ? (
                    <button type="button" onClick={() => aoAbrir(r.produto)} className="shrink-0 overflow-hidden rounded-xl ring-1 ring-linha" aria-label={`Ver ${r.produto.nome}`}>
                      <FotoProduto produto={r.produto} tamanhos="56px" className="h-14 w-14" />
                    </button>
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-ok-claro text-ok">
                      <PackageCheck size={22} aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{l.titulo}</p>
                    <p className="text-[14px] text-tinta-2">
                      {[l.carros ? `${l.carros} ${l.carros === 1 ? 'carro' : 'carros'}` : '', l.ordens ? `${l.ordens} em aberto` : ''].filter(Boolean).join(' e ')}, precisa de {textoQuantidade(l.precisa, l.unidade)}
                      {temEstoque ? (
                        <>
                          , tem {textoQuantidade(l.tem, l.unidade)}
                          {cobre ? '' : ', '}
                          {cobre ? null : <strong className="text-atraso">faltam {textoQuantidade(l.faltam, l.unidade)}</strong>}
                        </>
                      ) : null}
                    </p>
                    {r ? (
                      <p className="mt-1 text-[14px]">
                        {quantidadeComUnidade(r.produto, r.quantidade)} de <span className="font-semibold">{nomeComMarca(r.produto)}</span>
                        {fornecedores.get(r.produto.fornecedorId) ? <span className="text-tinta-3">, {fornecedores.get(r.produto.fornecedorId)?.nome}</span> : null} por <strong className="num">{formatarMoeda(r.total)}</strong>
                        {r.promocao ? <Chip tom="oleo" className="ml-2 align-middle">-{desconto(r.produto.preco, r.promocao.precoPromocional)}%</Chip> : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-[14px] font-semibold text-ok">O estoque cobre.</p>
                    )}
                    {r ? (
                      <div className="mt-2.5 sm:hidden">
                        <BotaoPor produto={r.produto} quantidade={r.quantidade} aoPor={aoPor} rotulo="Pôr no pedido" />
                      </div>
                    ) : null}
                  </div>
                  {r ? (
                    <div className="hidden sm:block">
                      <BotaoPor produto={r.produto} quantidade={r.quantidade} aoPor={aoPor} rotulo="Pôr no pedido" />
                    </div>
                  ) : null}
                </div>
                {alternativa ? (
                  <button
                    type="button"
                    onClick={() => aoAbrir(alternativa)}
                    className="flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2 text-left text-[13.5px] hover:bg-linha/50 sm:ml-[72px]"
                  >
                    <SeloPatrocinado />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{nomeComMarca(alternativa)}</span>
                      <span className="text-tinta-3">, {fornecedores.get(alternativa.fornecedorId)?.nome}</span>
                    </span>
                    <span className="num font-semibold">{formatarMoeda(precoNaQuantidade(alternativa, catalogo.promocoes, hoje, 1).preco)}</span>
                  </button>
                ) : null}
              </li>
            );
          })}
          {linhas.length > DEMANDA_VISIVEL ? (
            <li>
              <button type="button" onClick={() => setTodas(!todas)} className="w-full px-4 py-3 text-left text-[14.5px] font-semibold text-caneta hover:bg-papel-2 sm:px-5">
                {todas ? 'Mostrar menos' : `Mostrar as outras ${linhas.length - DEMANDA_VISIVEL}`}
              </button>
            </li>
          ) : null}
          {semOleo.length ? (
            <li className="flex items-start gap-4 px-4 py-3.5 text-[14px] sm:px-5">
              <span className="grid h-10 w-14 shrink-0 place-items-center text-tinta-3">
                <IconeServico servico="troca_oleo" />
              </span>
              <p className="min-w-0 flex-1 text-tinta-2">
                {semOleo.reduce((n, l) => n + l.carros, 0)} {semOleo.reduce((n, l) => n + l.carros, 0) === 1 ? 'carro' : 'carros'} sem o óleo do manual cadastrado. Cadastre na página do carro para o app escolher o produto.
              </p>
            </li>
          ) : null}
          <SemProdutoNaLoja linhas={semProduto} />
        </ul>
      )}
      <CartaoDemanda />
    </Secao>
  );
}

/** As compras previstas que ainda não têm produto na loja, numa linha só para não encher a lista. */
function SemProdutoNaLoja({ linhas }: { linhas: LinhaDemanda[] }) {
  const compartilha = useOficina((s) => s.preferencias.compartilharDemanda);
  if (!linhas.length) return null;
  return (
    <li className="flex items-start gap-4 bg-papel-2/50 px-4 py-3.5 sm:px-5">
      <span className="grid h-10 w-14 shrink-0 place-items-center text-tinta-3">
        <PackageSearch size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 text-[14px]">
        <p className="font-semibold text-tinta-2">Ainda sem produto na loja</p>
        <p className="text-tinta-3">
          {linhas.map((l, i) => (
            <span key={l.chave}>
              {i ? ', ' : ''}
              {l.titulo} <span className="num">({l.carros === 1 ? '1 carro' : `${l.carros} carros`})</span>
            </span>
          ))}
          .{compartilha ? ' Os fornecedores da região veem essa procura e podem cadastrar.' : ''}
        </p>
      </div>
    </li>
  );
}
