'use client';

// O estoque da oficina: o que tem, o que está acabando, o que vai faltar para os carros que vencem
// nos próximos 30 dias (e para as ordens e orçamentos em aberto) e quanto pagou em cada compra.

import { ArrowDownToLine, Minus, PackageCheck, PackagePlus, Plus, Search, ShoppingCart, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, Vazio, classeEntrada } from '@/components/ui';
import { itensParaComprar } from '@/lib/avisos';
import { CATEGORIAS, desconto, nomeCategoria, quantidadeComUnidade, type Produto } from '@/lib/catalogo';
import { dataLocal, formatarData } from '@/lib/datas';
import { compraSugerida, fatorDoProduto, itemDoProduto, preverEstoque, reposicao, situacaoDoItem, textoQuantidade, unidadeDaCategoria, type LinhaPrevisao } from '@/lib/estoque';
import { formatarMoeda, formatarNumero, lerNumero } from '@/lib/formatos';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { lerPreco, ofertasDoProduto, precosPagos, ultimoPrecoPago } from '@/lib/precos';
import { calcularDemanda } from '@/lib/recomendacao';
import { useOficina } from '@/lib/store';
import type { Categoria, Id, ItemEstoque, PedidoEnviado, UnidadeEstoque } from '@/lib/tipos';
import { useCatalogo } from './catalogo';
import { FotoProduto } from './FotoProduto';
import { nomeComMarca } from './loja/comum';

function nomeDoItem(i: Pick<ItemEstoque, 'marca' | 'nome'>): string {
  return i.marca && !i.nome.toLowerCase().includes(i.marca.toLowerCase()) ? `${i.marca} ${i.nome}` : i.nome;
}

export function Estoque() {
  const estoque = useOficina((s) => s.estoque);
  const pedidos = useOficina((s) => s.pedidos);
  const hoje = useHoje();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [aberto, setAberto] = useState<Id | null>(null);
  const [novo, setNovo] = useState(false);
  const [receber, setReceber] = useState<PedidoEnviado | null>(null);
  const itens = useMemo(() => Object.values(estoque).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR')), [estoque]);
  const categorias = useMemo(() => [...new Set(itens.map((i) => i.categoria))], [itens]);
  const t = busca.trim().toLowerCase();
  const visiveis = itens.filter((i) => (!categoria || i.categoria === categoria) && (!t || `${i.marca ?? ''} ${i.nome} ${i.codigo ?? ''}`.toLowerCase().includes(t)));
  const aReceber = pedidos.filter((p) => !p.recebidoEm).slice(0, 5);
  const valorEmEstoque = itens.reduce((s, i) => s + (i.custo ?? 0) * i.quantidade, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Estoque</h1>
          <p className="mt-1 max-w-[60ch] text-tinta-2">
            {itens.length ? `${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'}, uns ${formatarMoeda(valorEmEstoque)} em mercadoria. ` : ''}O que sai nas ordens de serviço é descontado sozinho.
          </p>
        </div>
        <Botao variante="primario" onClick={() => setNovo(true)}>
          <PackagePlus size={18} aria-hidden="true" /> Adicionar produto
        </Botao>
      </header>

      {aReceber.length ? (
        <section className="flex flex-col gap-2 rounded-2xl bg-caneta-claro px-4 py-3.5 text-caneta" aria-label="Pedidos para dar entrada">
          <p className="flex items-center gap-2 font-bold">
            <ArrowDownToLine size={18} aria-hidden="true" /> Chegou o pedido? Dê entrada no estoque
          </p>
          <ul className="flex flex-col gap-2">
            {aReceber.map((p) => (
              <li key={p.codigo} className="flex flex-wrap items-center gap-2 text-[14.5px]">
                <span className="largo num font-extrabold tracking-wider">{p.codigo}</span>
                <span className="min-w-0 flex-1">
                  {formatarData(dataLocal(p.quando))}, {p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'}, {formatarMoeda(p.total)}
                </span>
                <Botao tamanho="pequeno" variante="escuro" onClick={() => setReceber(p)}>
                  Dar entrada
                </Botao>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Previsao hoje={hoje} />

      <Secao titulo="Produtos">
        {itens.length ? (
          <>
            <div className="flex flex-col gap-3">
              <label className="relative">
                <span className="sr-only">Buscar no estoque</span>
                <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
                <input className={`${classeEntrada} pl-10`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, marca ou código" autoComplete="off" />
              </label>
              {categorias.length > 1 ? (
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0" role="group" aria-label="Categorias">
                  <BotaoCategoria ativo={!categoria} aoClicar={() => setCategoria(null)}>
                    Todas
                  </BotaoCategoria>
                  {categorias.map((c) => (
                    <BotaoCategoria key={c} ativo={categoria === c} aoClicar={() => setCategoria(categoria === c ? null : c)}>
                      {nomeCategoria(c)}
                    </BotaoCategoria>
                  ))}
                </div>
              ) : null}
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {visiveis.map((i) => (
                <li key={i.id}>
                  <CartaoItem item={i} aoAbrir={() => setAberto(i.id)} />
                </li>
              ))}
            </ul>
            {!visiveis.length ? <p className="text-tinta-2">Nada com esse nome.</p> : null}
          </>
        ) : (
          <Vazio titulo="Nenhum produto no estoque ainda" acao={<Botao variante="primario" onClick={() => setNovo(true)}>Adicionar o primeiro</Botao>}>
            Cadastre o óleo, os filtros e as peças que a oficina guarda. Escolha da loja que já vem com foto e ficha técnica. Daí o app avisa o que vai faltar e quanto você pagou da última vez.
          </Vazio>
        )}
      </Secao>

      <FolhaItem id={aberto} aoFechar={() => setAberto(null)} />
      <FolhaNovo aberta={novo} aoFechar={() => setNovo(false)} aoCriado={(id) => setAberto(id)} />
      <FolhaReceber pedido={receber} aoFechar={() => setReceber(null)} />
    </div>
  );
}

function BotaoCategoria({ ativo, aoClicar, children }: { ativo: boolean; aoClicar: () => void; children: React.ReactNode }) {
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

function CartaoItem({ item: i, aoAbrir }: { item: ItemEstoque; aoAbrir: () => void }) {
  const mover = useOficina((s) => s.moverEstoque);
  const situacao = situacaoDoItem(i);
  const passo = i.unidade === 'L' ? 1 : 1;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-papel px-3 py-3 ring-1 ring-linha">
      <button type="button" onClick={aoAbrir} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <FotoProduto produto={{ imagemUrl: i.imagemUrl, categoria: i.categoria, nome: i.nome }} tamanhos="56px" className="h-14 w-14 shrink-0 rounded-xl ring-1 ring-linha" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 leading-snug font-bold">{nomeDoItem(i)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-tinta-3">
            {situacao === 'zerado' ? <Chip tom="atraso">Acabou</Chip> : situacao === 'baixo' ? <Chip tom="oleo">Acabando</Chip> : null}
            {i.minimo ? <span>mínimo {textoQuantidade(i.minimo, i.unidade)}</span> : null}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="largo num text-[22px] leading-none font-extrabold">{formatarNumero(i.quantidade, 2)}</span>
        <span className="text-[12px] font-semibold text-tinta-3">{i.unidade === 'L' ? 'litros' : 'unid.'}</span>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" onClick={() => mover({ itemId: i.id, tipo: 'ajuste', quantidade: passo, origem: { tipo: 'manual' } })} className="grid h-8 w-9 place-items-center rounded-lg bg-papel-2 text-tinta-2 hover:text-tinta" aria-label={`Mais um de ${i.nome}`}>
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => mover({ itemId: i.id, tipo: 'ajuste', quantidade: -passo, origem: { tipo: 'manual' } })}
          disabled={i.quantidade <= 0}
          className="grid h-8 w-9 place-items-center rounded-lg bg-papel-2 text-tinta-2 hover:text-tinta disabled:opacity-40"
          aria-label={`Menos um de ${i.nome}`}
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}

/** O que vai faltar: os carros que vencem em 30 dias e as ordens e orçamentos em aberto. */
function Previsao({ hoje }: { hoje: string }) {
  const { catalogo } = useCatalogo();
  const dados = useDadosAvisos();
  const estoque = useOficina((s) => s.estoque);
  const documentos = useOficina((s) => s.documentos);
  const linhas = useMemo(() => {
    const demanda = calcularDemanda(itensParaComprar(dados, hoje, 30), catalogo, hoje, 30);
    return preverEstoque(demanda, Object.values(documentos), Object.values(estoque), hoje);
  }, [dados, catalogo, hoje, documentos, estoque]);
  const faltando = linhas.filter((l) => l.faltam > 0);
  const cobertos = linhas.filter((l) => l.faltam <= 0 && !l.semEspecificacao);
  const repor = useMemo(() => Object.values(estoque).filter((i) => situacaoDoItem(i) !== 'ok' && i.minimo > 0 && !faltando.some((l) => l.itens.some((x) => x.id === i.id))), [estoque, faltando]);

  if (!linhas.length && !repor.length) return null;
  return (
    <Secao titulo="Para os próximos 30 dias" descricao="O que os carros que vencem e as ordens em aberto vão usar, contra o que tem no estoque.">
      {faltando.length ? (
        <ul className="flex flex-col gap-2.5">
          {faltando.map((l) => (
            <li key={l.chave}>
              <LinhaFalta linha={l} hoje={hoje} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-ok-claro px-4 py-3 font-semibold text-ok">
          <PackageCheck size={18} aria-hidden="true" /> O estoque cobre tudo o que está previsto.
        </p>
      )}
      {repor.length ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
          <p className="font-bold">Abaixo do mínimo</p>
          <ul className="flex flex-col gap-2">
            {repor.map((i) => (
              <ReporItem key={i.id} item={i} />
            ))}
          </ul>
        </div>
      ) : null}
      {cobertos.length ? (
        <p className="text-[13.5px] text-tinta-3">
          Cobertos: {cobertos.map((l) => `${l.titulo} (${textoQuantidade(l.precisa, l.unidade)} de ${textoQuantidade(l.tem, l.unidade)})`).join(', ')}.
        </p>
      ) : null}
    </Secao>
  );
}

function LinhaFalta({ linha: l, hoje }: { linha: LinhaPrevisao; hoje: string }) {
  const { catalogo } = useCatalogo();
  const estoque = useOficina((s) => s.estoque);
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const toast = useToast();
  const compra = useMemo(() => compraSugerida(l, estoque, catalogo, hoje), [l, estoque, catalogo, hoje]);
  const fornecedor = compra ? catalogo.fornecedores.find((f) => f.id === compra.produto.fornecedorId) : undefined;
  const origem = [l.carros ? `${l.carros} ${l.carros === 1 ? 'carro' : 'carros'} vencendo` : '', l.ordens ? `${l.ordens} ${l.ordens === 1 ? 'ordem ou orçamento' : 'ordens e orçamentos'}` : ''].filter(Boolean).join(' e ');
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{l.titulo}</p>
          <p className="text-[13.5px] text-tinta-3">{origem}</p>
        </div>
        <span className="num shrink-0 rounded-full bg-atraso-claro px-2.5 py-1 text-[13.5px] font-bold text-atraso">faltam {textoQuantidade(l.faltam, l.unidade)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-xl bg-papel-2 px-3 py-2">
          <dt className="text-tinta-3">Vai precisar</dt>
          <dd className="largo num text-[19px] font-extrabold">{textoQuantidade(l.precisa, l.unidade)}</dd>
        </div>
        <div className="rounded-xl bg-papel-2 px-3 py-2">
          <dt className="text-tinta-3">Tem no estoque</dt>
          <dd className="largo num text-[19px] font-extrabold">{textoQuantidade(l.tem, l.unidade)}</dd>
        </div>
      </dl>
      {compra ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl ring-1 ring-linha px-3 py-2.5">
          <FotoProduto produto={compra.produto} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-linha" />
          <div className="min-w-0 flex-1 basis-48 text-[14px]">
            <p className="font-semibold">
              {quantidadeComUnidade(compra.produto, compra.quantidade)} de {nomeComMarca(compra.produto)}
            </p>
            <p className="text-tinta-2">
              {fornecedor?.nome}, <strong className="num text-tinta">{formatarMoeda(compra.total)}</strong>
              {compra.promocao ? <Chip tom="oleo" className="ml-2 align-middle">-{desconto(compra.produto.preco, compra.promocao.precoPromocional)}% {compra.promocao.titulo.toLowerCase()}</Chip> : null}
              {!compra.promocao && compra.oferta ? (
                <span className="text-oleo-tinta">
                  {' '}
                  · {compra.oferta.titulo.toLowerCase()} a partir de {quantidadeComUnidade(compra.produto, compra.oferta.quantidadeMinima)}
                </span>
              ) : null}
            </p>
          </div>
          <Botao
            tamanho="pequeno"
            variante="escuro"
            onClick={() => {
              adicionar(compra.produto.id, compra.quantidade);
              toast({ texto: `${quantidadeComUnidade(compra.produto, compra.quantidade)} no pedido da loja.` });
            }}
          >
            <ShoppingCart size={15} aria-hidden="true" /> Pôr no pedido
          </Botao>
        </div>
      ) : l.semEspecificacao ? (
        <p className="text-[13.5px] text-tinta-3">Cadastre o óleo do manual desses carros para o app saber qual comprar.</p>
      ) : (
        <p className="text-[13.5px] text-tinta-3">Ainda não tem esse produto na loja do Revisaí.</p>
      )}
    </div>
  );
}

function ReporItem({ item: i }: { item: ItemEstoque }) {
  const { produto } = useCatalogo();
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const toast = useToast();
  const p = i.produtoLojaId != null ? produto(i.produtoLojaId) : undefined;
  const q = p ? reposicao(i, p) : 0;
  return (
    <li className="flex flex-wrap items-center gap-2 text-[14.5px]">
      <span className="min-w-0 flex-1">
        {nomeDoItem(i)}: tem {textoQuantidade(i.quantidade, i.unidade)}, mínimo {textoQuantidade(i.minimo, i.unidade)}
      </span>
      {p ? (
        <Botao
          tamanho="pequeno"
          onClick={() => {
            adicionar(p.id, q);
            toast({ texto: `${quantidadeComUnidade(p, q)} no pedido da loja.` });
          }}
        >
          <ShoppingCart size={15} aria-hidden="true" /> Pôr {quantidadeComUnidade(p, q)}
        </Botao>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------- item: editar, contar, entrada, histórico

function FolhaItem({ id, aoFechar }: { id: Id | null; aoFechar: () => void }) {
  const item = useOficina((s) => (id ? s.estoque[id] : undefined));
  return (
    <Folha aberta={!!item} aoFechar={aoFechar} titulo={item ? nomeDoItem(item) : ''} descricao={item ? nomeCategoria(item.categoria) : undefined}>
      {item ? <DetalheItem key={item.id} item={item} aoFechar={aoFechar} /> : null}
    </Folha>
  );
}

function DetalheItem({ item, aoFechar }: { item: ItemEstoque; aoFechar: () => void }) {
  const salvar = useOficina((s) => s.salvarItemEstoque);
  const remover = useOficina((s) => s.removerItemEstoque);
  const mover = useOficina((s) => s.moverEstoque);
  const movimentos = useOficina((s) => s.movimentos);
  const pedidos = useOficina((s) => s.pedidos);
  const estoque = useOficina((s) => s.estoque);
  const adicionar = useOficina((s) => s.adicionarAoCarrinho);
  const { catalogo, produto } = useCatalogo();
  const hoje = useHoje();
  const toast = useToast();
  const [contagem, setContagem] = useState(formatarNumero(item.quantidade, 2));
  const [entrada, setEntrada] = useState({ quantidade: '', custo: item.custo != null ? formatarNumero(item.custo, 2) : '', fornecedor: '' });
  const [minimo, setMinimo] = useState(String(item.minimo || ''));
  const [preco, setPreco] = useState(item.preco != null ? formatarNumero(item.preco, 2) : '');
  const historico = Object.values(movimentos)
    .filter((m) => m.itemId === item.id)
    .sort((a, b) => (a.quando < b.quando ? 1 : -1))
    .slice(0, 12);
  const p = item.produtoLojaId != null ? produto(item.produtoLojaId) : undefined;

  const leitura = useMemo(() => {
    if (!p) return null;
    const pagos = precosPagos(pedidos, catalogo, Object.values(movimentos), estoque);
    const { mesmo } = ofertasDoProduto(p, catalogo, hoje);
    const atual = mesmo.find((o) => o.produto.id === p.id);
    return atual ? { leitura: lerPreco(atual, ultimoPrecoPago(p, pagos), mesmo), atual } : null;
  }, [p, pedidos, catalogo, movimentos, estoque, hoje]);

  function guardarDados() {
    salvar({ ...item, minimo: Math.max(0, lerNumero(minimo) ?? 0), preco: lerNumero(preco) });
    toast({ texto: 'Salvo.' });
  }

  function contar() {
    const q = lerNumero(contagem);
    if (q == null || q < 0) return toast({ texto: 'Confira a quantidade contada.', tom: 'erro' });
    const dif = Math.round((q - item.quantidade) * 100) / 100;
    if (dif === 0) return toast({ texto: 'A contagem bate com o estoque.' });
    mover({ itemId: item.id, tipo: 'ajuste', quantidade: dif, origem: { tipo: 'contagem', rotulo: 'Contagem' } });
    toast({ texto: `Estoque ajustado para ${textoQuantidade(q, item.unidade)}.` });
  }

  function darEntrada() {
    const q = lerNumero(entrada.quantidade);
    if (q == null || q <= 0) return toast({ texto: 'Escreva quanto chegou.', tom: 'erro' });
    const custo = lerNumero(entrada.custo);
    mover({ itemId: item.id, tipo: 'entrada', quantidade: q, custoUnitario: custo && custo > 0 ? custo : null, fornecedor: entrada.fornecedor.trim() || undefined, origem: { tipo: 'manual' } });
    setEntrada({ quantidade: '', custo: entrada.custo, fornecedor: entrada.fornecedor });
    setContagem(formatarNumero(item.quantidade + q, 2));
    toast({ texto: `Entrada de ${textoQuantidade(q, item.unidade)}.` });
  }

  const unidade = item.unidade === 'L' ? 'litro' : 'unidade';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <FotoProduto produto={{ imagemUrl: item.imagemUrl, categoria: item.categoria, nome: item.nome }} tamanhos="80px" className="h-20 w-20 shrink-0 rounded-xl ring-1 ring-linha" />
        <div>
          <p className="largo num text-[32px] leading-none font-extrabold">{textoQuantidade(item.quantidade, item.unidade)}</p>
          <p className="mt-1 text-[14px] text-tinta-2">{item.custo != null ? `Pagou ${formatarMoeda(item.custo)} por ${unidade} na última compra.` : 'Sem o preço de compra ainda.'}</p>
        </div>
      </div>

      {p && leitura ? (
        <div className={`flex flex-col gap-2 rounded-xl px-3.5 py-3 text-[14px] ${leitura.leitura?.tom === 'caro' ? 'bg-atraso-claro text-atraso' : leitura.leitura?.tom === 'bom' ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta-2'}`}>
          <p>
            Na loja hoje: <strong className="num">{formatarMoeda(leitura.atual.preco)}</strong> por {quantidadeComUnidade(p, 1)}, na {leitura.atual.fornecedor?.nome}. {leitura.leitura?.texto}
          </p>
          <Botao
            tamanho="pequeno"
            variante="escuro"
            className="self-start"
            onClick={() => {
              const melhor = leitura.leitura?.melhor?.produto ?? p;
              const q = reposicao(item, melhor);
              adicionar(melhor.id, q);
              toast({ texto: `${quantidadeComUnidade(melhor, q)} no pedido da loja.` });
            }}
          >
            <ShoppingCart size={15} aria-hidden="true" /> Comprar {leitura.leitura?.melhor ? `na ${leitura.leitura.melhor.fornecedor?.nome}` : 'de novo'}
          </Botao>
        </div>
      ) : null}

      <section className="flex flex-col gap-2" aria-label="Entrada">
        <h3 className="font-bold">Chegou mercadoria</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
          <input className={`${classeEntrada} num`} value={entrada.quantidade} onChange={(e) => setEntrada({ ...entrada, quantidade: e.target.value })} inputMode="decimal" placeholder={item.unidade === 'L' ? 'Litros' : 'Quantidade'} aria-label="Quantidade que chegou" />
          <input className={`${classeEntrada} num`} value={entrada.custo} onChange={(e) => setEntrada({ ...entrada, custo: e.target.value })} inputMode="decimal" placeholder={`R$ por ${unidade}`} aria-label={`Quanto pagou por ${unidade}`} />
          <input className={`${classeEntrada} col-span-2 sm:col-span-1`} value={entrada.fornecedor} onChange={(e) => setEntrada({ ...entrada, fornecedor: e.target.value })} placeholder="De quem comprou" aria-label="De quem comprou" />
          <Botao variante="escuro" onClick={darEntrada} className="col-span-2 sm:col-span-1">
            Dar entrada
          </Botao>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Ajustes">
        <Campo rotulo="Contei e tem" htmlFor="e-contagem">
          <div className="flex gap-2">
            <input id="e-contagem" className={`${classeEntrada} num`} value={contagem} onChange={(e) => setContagem(e.target.value)} inputMode="decimal" />
            <Botao onClick={contar}>Ajustar</Botao>
          </div>
        </Campo>
        <Campo rotulo="Mínimo" htmlFor="e-minimo" dica="Abaixo disso, avisa.">
          <input id="e-minimo" className={`${classeEntrada} num`} value={minimo} onChange={(e) => setMinimo(e.target.value)} onBlur={guardarDados} inputMode="decimal" />
        </Campo>
        <Campo rotulo={`Preço para o cliente (${unidade})`} htmlFor="e-preco" dica="Vazio: custo mais a sua margem.">
          <input id="e-preco" className={`${classeEntrada} num`} value={preco} onChange={(e) => setPreco(e.target.value)} onBlur={guardarDados} inputMode="decimal" placeholder="0,00" />
        </Campo>
      </section>

      {historico.length ? (
        <section className="flex flex-col gap-2" aria-label="Histórico">
          <h3 className="font-bold">Entradas e saídas</h3>
          <ul className="flex flex-col divide-y divide-linha rounded-xl ring-1 ring-linha">
            {historico.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3.5 py-2 text-[14px]">
                <span className={`num w-20 font-bold ${m.quantidade > 0 ? 'text-ok' : 'text-atraso'}`}>
                  {m.quantidade > 0 ? '+' : ''}
                  {formatarNumero(m.quantidade, 2)}
                </span>
                <span className="min-w-0 flex-1 truncate text-tinta-2">
                  {m.origem?.rotulo ?? (m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'saida' ? 'Saída' : 'Ajuste')}
                  {m.fornecedor ? `, ${m.fornecedor}` : ''}
                  {m.custoUnitario ? `, ${formatarMoeda(m.custoUnitario)} por ${unidade}` : ''}
                </span>
                <span className="text-tinta-3">{formatarData(dataLocal(m.quando))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (!window.confirm(`Tirar ${nomeDoItem(item)} do estoque?`)) return;
          remover(item.id);
          aoFechar();
        }}
        className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-tinta-3 hover:text-atraso"
      >
        <Trash2 size={15} aria-hidden="true" /> Tirar do estoque
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- novo item

function FolhaNovo({ aberta, aoFechar, aoCriado }: { aberta: boolean; aoFechar: () => void; aoCriado: (id: Id) => void }) {
  const { catalogo } = useCatalogo();
  const salvar = useOficina((s) => s.salvarItemEstoque);
  const mover = useOficina((s) => s.moverEstoque);
  const estoque = useOficina((s) => s.estoque);
  const toast = useToast();
  const [modo, setModo] = useState<'loja' | 'outro'>('loja');
  const [busca, setBusca] = useState('');
  const [escolhido, setEscolhido] = useState<Produto | null>(null);
  const [f, setF] = useState({ nome: '', marca: '', categoria: 'filtro_oleo' as Categoria, unidade: 'un' as UnidadeEstoque, quantidade: '', minimo: '', custo: '' });
  const [erro, setErro] = useState<string | null>(null);
  const ativos = new Set(catalogo.fornecedores.map((x) => x.id));
  const t = busca.trim().toLowerCase();
  const doCatalogo = catalogo.produtos.filter((p) => ativos.has(p.fornecedorId) && (!t || `${p.marca ?? ''} ${p.nome} ${nomeCategoria(p.categoria)}`.toLowerCase().includes(t))).slice(0, 30);

  function fechar() {
    setEscolhido(null);
    setBusca('');
    setErro(null);
    setF({ nome: '', marca: '', categoria: 'filtro_oleo', unidade: 'un', quantidade: '', minimo: '', custo: '' });
    aoFechar();
  }

  function escolher(p: Produto) {
    const ja = Object.values(estoque).find((i) => i.produtoLojaId === p.id);
    if (ja) {
      toast({ texto: 'Esse produto já está no estoque.' });
      fechar();
      aoCriado(ja.id);
      return;
    }
    setEscolhido(p);
    const base = itemDoProduto(p);
    setF({ ...f, nome: base.nome, marca: base.marca ?? '', categoria: p.categoria, unidade: base.unidade, custo: base.custo != null ? formatarNumero(base.custo, 2) : '' });
  }

  function criar() {
    setErro(null);
    const quantidade = lerNumero(f.quantidade) ?? 0;
    const minimo = lerNumero(f.minimo) ?? 0;
    const custo = lerNumero(f.custo);
    if (!escolhido && f.nome.trim().length < 2) return setErro('Escreva o nome do produto.');
    if (quantidade < 0 || minimo < 0) return setErro('Confira as quantidades.');
    const base = escolhido ? itemDoProduto(escolhido) : { nome: f.nome, marca: f.marca || undefined, categoria: f.categoria, unidade: f.unidade, custo: null, preco: null };
    const id = salvar({ ...base, nome: f.nome.trim() || base.nome, marca: f.marca.trim() || base.marca, custo: custo && custo > 0 ? custo : base.custo, quantidade: 0, minimo });
    if (quantidade > 0) mover({ itemId: id, tipo: 'entrada', quantidade, custoUnitario: custo && custo > 0 ? custo : null, origem: { tipo: 'manual', rotulo: 'Estoque inicial' } });
    toast({ texto: 'No estoque.' });
    fechar();
  }

  const unidade = (escolhido ? unidadeDaCategoria(escolhido.categoria) : f.unidade) === 'L' ? 'litros' : 'unidades';
  return (
    <Folha
      aberta={aberta}
      aoFechar={fechar}
      titulo="Adicionar ao estoque"
      rodape={
        escolhido || modo === 'outro' ? (
          <Botao variante="primario" onClick={criar}>
            Pôr no estoque
          </Botao>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {!escolhido ? (
          <div className="flex gap-1 self-start rounded-[12px] bg-papel-2 p-1" role="tablist">
            {(['loja', 'outro'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)} className={`h-9 rounded-[10px] px-3.5 text-[14.5px] font-semibold ${modo === m ? 'bg-papel shadow-sm' : 'text-tinta-2'}`}>
                {m === 'loja' ? 'Da loja, com foto' : 'Outro produto'}
              </button>
            ))}
          </div>
        ) : null}

        {modo === 'loja' && !escolhido ? (
          <>
            <input className={classeEntrada} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="5W-30, filtro, pastilha, marca…" aria-label="Buscar na loja" autoComplete="off" />
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {doCatalogo.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => escolher(p)} className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-papel text-left ring-1 ring-linha hover:ring-tinta-3">
                    <FotoProduto produto={p} tamanhos="160px" className="aspect-[4/3] w-full" />
                    <span className="line-clamp-2 px-2.5 pt-2 text-[13.5px] leading-snug font-semibold">{nomeComMarca(p)}</span>
                    <span className="num px-2.5 pb-2 text-[12.5px] text-tinta-3">{formatarMoeda(p.preco)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!doCatalogo.length ? <p className="text-tinta-2">Nada na loja com esse nome. Use Outro produto.</p> : null}
          </>
        ) : (
          <>
            {escolhido ? (
              <div className="flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2.5">
                <FotoProduto produto={escolhido} tamanhos="48px" className="h-12 w-12 shrink-0 rounded-lg" />
                <p className="min-w-0 flex-1 font-semibold">{nomeComMarca(escolhido)}</p>
                <button type="button" onClick={() => setEscolhido(null)} className="text-[14px] font-semibold text-caneta">
                  Trocar
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome" htmlFor="n-nome" className="sm:col-span-2">
                  <input id="n-nome" className={classeEntrada} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Filtro de óleo PSL 55" autoFocus />
                </Campo>
                <Campo rotulo="Marca" htmlFor="n-marca">
                  <input id="n-marca" className={classeEntrada} value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
                </Campo>
                <Campo rotulo="Categoria" htmlFor="n-cat">
                  <select id="n-cat" className={classeEntrada} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as Categoria, unidade: unidadeDaCategoria(e.target.value as Categoria) })}>
                    {CATEGORIAS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Conta em" htmlFor="n-unid">
                  <select id="n-unid" className={classeEntrada} value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value as UnidadeEstoque })}>
                    <option value="un">Unidades</option>
                    <option value="L">Litros</option>
                  </select>
                </Campo>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo={`Tem (${unidade})`} htmlFor="n-q">
                <input id="n-q" className={`${classeEntrada} num`} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} inputMode="decimal" placeholder="0" />
              </Campo>
              <Campo rotulo="Mínimo" htmlFor="n-min">
                <input id="n-min" className={`${classeEntrada} num`} value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} inputMode="decimal" placeholder="0" />
              </Campo>
              <Campo rotulo={`Custo (${unidade === 'litros' ? 'litro' : 'unidade'})`} htmlFor="n-custo">
                <input id="n-custo" className={`${classeEntrada} num`} value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} inputMode="decimal" placeholder="0,00" />
              </Campo>
            </div>
            {escolhido && fatorDoProduto(escolhido) > 1 ? <p className="text-[13.5px] text-tinta-3">O óleo conta em litros: um {quantidadeComUnidade(escolhido, 1)} são {formatarNumero(fatorDoProduto(escolhido), 2)} litros.</p> : null}
          </>
        )}
        {erro ? (
          <p className="text-[14px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </Folha>
  );
}

// ---------------------------------------------------------------- pedido que chegou

function FolhaReceber({ pedido, aoFechar }: { pedido: PedidoEnviado | null; aoFechar: () => void }) {
  const { catalogo, produto } = useCatalogo();
  const estoque = useOficina((s) => s.estoque);
  const salvar = useOficina((s) => s.salvarItemEstoque);
  const receber = useOficina((s) => s.receberPedido);
  const toast = useToast();

  const linhas = useMemo(
    () =>
      (pedido?.itens ?? []).map((i) => {
        const p = produto(i.produtoId);
        const item = Object.values(estoque).find((x) => x.produtoLojaId === i.produtoId);
        const fator = p ? fatorDoProduto(p) : 1;
        return { i, p, item, quantidade: i.quantidade * fator, custo: Math.round((i.precoUnitario / fator) * 100) / 100, unidade: item?.unidade ?? (p ? unidadeDaCategoria(p.categoria) : 'un') };
      }),
    [pedido, estoque, produto]
  );

  function confirmar() {
    if (!pedido) return;
    const entradas = linhas.map((l) => {
      const itemId =
        l.item?.id ??
        salvar(
          l.p
            ? { ...itemDoProduto(l.p), quantidade: 0, minimo: 0 }
            : { nome: l.i.nome, categoria: 'outros', unidade: 'un', quantidade: 0, minimo: 0, custo: null, preco: null, produtoLojaId: l.i.produtoId }
        );
      return { itemId, quantidade: l.quantidade, custoUnitario: l.custo, fornecedor: l.i.fornecedor ?? catalogo.fornecedores.find((f) => f.id === (l.i.fornecedorId ?? l.p?.fornecedorId))?.nome };
    });
    receber(pedido.codigo, entradas);
    toast({ texto: `Entrada do pedido ${pedido.codigo} no estoque.` });
    aoFechar();
  }

  return (
    <Folha
      aberta={!!pedido}
      aoFechar={aoFechar}
      titulo={pedido ? `Pedido ${pedido.codigo}` : ''}
      descricao="Confira o que chegou. As quantidades e os preços entram no estoque."
      rodape={
        <Botao variante="primario" onClick={confirmar}>
          <ArrowDownToLine size={17} aria-hidden="true" /> Dar entrada
        </Botao>
      }
    >
      <ul className="flex flex-col divide-y divide-linha">
        {linhas.map((l) => (
          <li key={l.i.produtoId} className="flex items-center gap-3 py-2.5">
            {l.p ? <FotoProduto produto={l.p} tamanhos="44px" className="h-11 w-11 shrink-0 rounded-lg ring-1 ring-linha" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{l.i.nome}</span>
              <span className="block text-[13px] text-tinta-3">
                {l.item ? 'Soma no que já tem' : 'Entra como produto novo'}, {formatarMoeda(l.custo)} por {l.unidade === 'L' ? 'litro' : 'unidade'}
              </span>
            </span>
            <span className="num font-bold">+{textoQuantidade(l.quantidade, l.unidade)}</span>
          </li>
        ))}
      </ul>
      {linhas.some((l) => !l.p) ? (
        <p className="mt-3 flex items-start gap-2 text-[13.5px] text-oleo-tinta">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> Algum produto saiu da loja; ele entra com o nome do pedido.
        </p>
      ) : null}
    </Folha>
  );
}
