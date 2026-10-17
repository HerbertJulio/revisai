'use client';

// Os produtos da vitrine em grade (cartões) ou em lista (linhas compactas), e o cartão da loja
// Destaque que entra no meio dos resultados. Cada produto mostra o preço da oficina (o da promoção
// ou o combinado com ela), o estoque que a loja informou e, com um carro escolhido no filtro, se a
// peça serve nele.

import { BadgeCheck, Wallet } from 'lucide-react';
import { textoDoPrazoDeEntrega } from '@/lib/loja/dados';
import { desconto, embalagem, nomeCategoria, patrocinado, type Fornecedor, type Produto } from '@/lib/catalogo';
import { formatarMoeda } from '@/lib/formatos';
import { infoDaLoja, infoDoProduto, precoNaVitrine, rotuloDoCarro, serveNoCarroDaVitrine, type CarroDoFiltro } from '@/lib/vitrine';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { useAnuncios, useVistoNaVitrine } from './anuncios';
import { BotaoPor, especificacoes, legendaDoPreco, minuscula, nomeComMarca, quantidadeInicial, SeloDestaque, SeloEstoqueDaLoja, SeloPatrocinado, SeloServeNoCarro, SemPreco } from './comum';
import { saldoNaLoja, useCondicoes } from './condicoes';
import { SeloPrecoPago } from './precos';
import { SeloDaLoja } from './reputacao';

interface PropsProduto {
  produto: Produto;
  fornecedor?: Fornecedor;
  uf: string;
  hoje: string;
  aoPor: (p: Produto, q: number) => void;
  aoAbrir: (p: Produto) => void;
  /** O carro do filtro "Serve no carro": o selo aparece nas peças que a loja diz que servem. */
  carro?: CarroDoFiltro | null;
}

export function useVitrineDoProduto(p: Produto, uf: string, hoje: string) {
  const { catalogo, comPrecos, extras } = useCatalogo();
  const { condicoes } = useCondicoes();
  const { preco, especial } = precoNaVitrine(p, { catalogo, hoje, condicoes });
  return {
    comPrecos,
    preco,
    /** O preço combinado com a oficina é o que vale. */
    especial,
    cheio: preco < p.preco ? p.preco : null,
    desconto: preco < p.preco ? desconto(p.preco, preco) : 0,
    pago: patrocinado(p.id, catalogo.patrocinios, uf, hoje),
    legenda: especial ? 'Preço combinado com você' : legendaDoPreco(p, catalogo.promocoes, hoje),
    quantidade: quantidadeInicial(p, catalogo.promocoes, hoje),
    estoque: infoDoProduto(extras, p.id)?.estoque ?? null,
    prazo: textoDoPrazoDeEntrega(infoDaLoja(extras, p.fornecedorId)?.prazoEntregaHoras),
    extras
  };
}

function Desconto({ valor, grande = false }: { valor: number; grande?: boolean }) {
  return (
    <span className={`num rounded-full bg-oleo font-extrabold text-[#1b1f22] ${grande ? 'px-3 py-1 text-[15px]' : 'px-2 py-0.5 text-[12.5px]'}`}>
      -{valor}%
    </span>
  );
}

/** O que a legenda do preço diz; o preço combinado aparece em azul. */
function Legenda({ texto, especial, className = '' }: { texto: string; especial: boolean; className?: string }) {
  return <p className={`text-[12px] ${especial ? 'font-semibold text-caneta' : 'text-tinta-3'} ${className}`}>{texto}</p>;
}

export function CartaoGrade({ produto: p, fornecedor, uf, hoje, aoPor, aoAbrir, carro }: PropsProduto) {
  const v = useVitrineDoProduto(p, uf, hoje);
  const { clicar } = useAnuncios();
  const visto = useVistoNaVitrine(p.id, v.pago);
  const specs = especificacoes(p);
  const serve = carro && serveNoCarroDaVitrine(p.id, v.extras, carro) === 'sim';
  const abrir = () => {
    if (v.pago) clicar(p.id);
    aoAbrir(p);
  };
  return (
    <article ref={visto} className="flex h-full flex-col overflow-hidden rounded-2xl bg-papel ring-1 ring-linha transition-shadow hover:ring-tinta-3" aria-label={p.nome}>
      <button type="button" onClick={abrir} className="relative block" aria-label={`Ver detalhes de ${p.nome}`} tabIndex={-1}>
        <FotoProduto produto={p} tamanhos="(min-width: 1280px) 260px, (min-width: 768px) 30vw, 50vw" className="aspect-square w-full sm:aspect-[4/3]" />
        {v.pago ? (
          <span className="absolute top-2 left-2">
            <SeloPatrocinado />
          </span>
        ) : null}
        {v.desconto > 0 && v.comPrecos ? (
          <span className="absolute top-2 right-2">
            <Desconto valor={v.desconto} />
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <p className="text-[12px] font-semibold text-tinta-3 sm:text-[12.5px]">{nomeCategoria(p.categoria)}</p>
        <button type="button" onClick={abrir} className="line-clamp-2 text-left text-[14.5px] leading-snug font-bold hover:underline sm:text-[15.5px]">
          {nomeComMarca(p)}
        </button>
        <p className="text-[12.5px] leading-snug text-tinta-3 sm:text-[13px]">
          {embalagem(p)}
          {fornecedor ? `, ${fornecedor.nome}` : ''}
          {fornecedor?.destaque ? (
            <>
              {' '}
              <SeloDestaque />
            </>
          ) : null}
        </p>
        {serve || v.estoque != null ? (
          <div className="flex flex-wrap gap-1">
            {serve ? <SeloServeNoCarro carro={rotuloDoCarro(carro!)} pequeno /> : null}
            <SeloEstoqueDaLoja estoque={v.estoque} pequeno />
          </div>
        ) : null}
        {specs.length ? (
          <div className="hidden flex-wrap gap-1.5 sm:flex">
            {specs.slice(0, 2).map((e) => (
              <span key={e} className="max-w-full truncate rounded-md bg-papel-2 px-2 py-0.5 text-[12px] font-semibold text-tinta-2">
                {e}
              </span>
            ))}
            {specs.length > 2 ? <span className="self-center px-0.5 text-[12px] font-semibold text-tinta-3">+{specs.length - 2}</span> : null}
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          {v.comPrecos ? (
            <div className="min-w-0">
              {v.cheio ? <p className="num text-[12.5px] text-tinta-3 line-through">{formatarMoeda(v.cheio)}</p> : null}
              <p className="largo num text-[18px] leading-none font-extrabold sm:text-[20px]">{formatarMoeda(v.preco)}</p>
              <Legenda texto={v.legenda} especial={v.especial} className="mt-1" />
              <SeloPrecoPago produto={p} preco={v.preco} />
            </div>
          ) : (
            <SemPreco className="min-w-0 max-w-[14ch]" />
          )}
          <BotaoPor produto={p} quantidade={v.quantidade} aoPor={(x, q) => {
            if (v.pago) clicar(x.id);
            aoPor(x, q);
          }} pequeno />
        </div>
      </div>
    </article>
  );
}

export function LinhaLista({ produto: p, fornecedor, uf, hoje, aoPor, aoAbrir, carro }: PropsProduto) {
  const v = useVitrineDoProduto(p, uf, hoje);
  const { clicar } = useAnuncios();
  const visto = useVistoNaVitrine(p.id, v.pago);
  const specs = especificacoes(p);
  const serve = carro && serveNoCarroDaVitrine(p.id, v.extras, carro) === 'sim';
  const abrir = () => {
    if (v.pago) clicar(p.id);
    aoAbrir(p);
  };
  return (
    <li ref={visto} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4" aria-label={p.nome}>
      <button type="button" onClick={abrir} className="shrink-0 overflow-hidden rounded-xl ring-1 ring-linha" aria-label={`Ver detalhes de ${p.nome}`} tabIndex={-1}>
        <FotoProduto produto={p} tamanhos="80px" className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
      </button>
      <div className="min-w-0 flex-1">
        {v.pago || (v.desconto > 0 && v.comPrecos) || serve || v.estoque != null ? (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {v.pago ? <SeloPatrocinado /> : null}
            {v.desconto > 0 && v.comPrecos ? <Desconto valor={v.desconto} /> : null}
            {serve ? <SeloServeNoCarro carro={rotuloDoCarro(carro!)} pequeno /> : null}
            <SeloEstoqueDaLoja estoque={v.estoque} pequeno />
          </div>
        ) : null}
        <button type="button" onClick={abrir} className="line-clamp-2 text-left text-[15px] leading-snug font-bold hover:underline">
          {nomeComMarca(p)}
        </button>
        <p className="text-[13px] leading-snug text-tinta-3">
          {nomeCategoria(p.categoria)}, {minuscula(embalagem(p))}
          {fornecedor ? `, ${fornecedor.nome}` : ''}
          {fornecedor?.destaque ? (
            <>
              {' '}
              <SeloDestaque />
            </>
          ) : null}
          {v.prazo ? <span className="hidden sm:inline">, {minuscula(v.prazo)}</span> : null}
        </p>
        {specs.length ? <p className="mt-0.5 hidden truncate text-[12.5px] font-semibold text-tinta-2 sm:block">{specs.join(', ')}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 text-right sm:flex-row sm:items-center sm:gap-5">
        {v.comPrecos ? (
          <div className="sm:min-w-[118px]">
            {v.cheio ? <p className="num text-[12px] text-tinta-3 line-through">{formatarMoeda(v.cheio)}</p> : null}
            <p className="largo num text-[17px] leading-none font-extrabold sm:text-[19px]">{formatarMoeda(v.preco)}</p>
            <Legenda texto={v.legenda} especial={v.especial} className={`mt-0.5 ${v.especial ? '' : 'hidden sm:block'}`} />
            <SeloPrecoPago produto={p} preco={v.preco} />
          </div>
        ) : (
          <SemPreco className="hidden max-w-[14ch] sm:block sm:min-w-[118px]" />
        )}
        <div className="flex sm:w-[96px] sm:justify-end">
          <BotaoPor produto={p} quantidade={v.quantidade} aoPor={(x, q) => {
            if (v.pago) clicar(x.id);
            aoPor(x, q);
          }} pequeno />
        </div>
      </div>
    </li>
  );
}

/** A loja Destaque do dia, no meio dos resultados (parte do que o plano Destaque paga). */
export function CartaoLojaDestaque({ loja, produtos, aoVer, emLinha = false }: { loja: Fornecedor; produtos: number; aoVer: () => void; emLinha?: boolean }) {
  const { extras, comPrecos } = useCatalogo();
  const condicoes = useCondicoes();
  const local = [loja.cidade, loja.uf].filter(Boolean).join(', ');
  const info = infoDaLoja(extras, loja.id);
  const prazo = textoDoPrazoDeEntrega(info?.prazoEntregaHoras);
  const saldo = saldoNaLoja(condicoes, loja.id);
  const detalhes = [prazo, info?.cashbackPercentual ? `${String(info.cashbackPercentual).replace('.', ',')}% de cashback` : null].filter(Boolean).join(', ');
  return (
    <aside
      aria-label={`Loja destaque, ${loja.nome}`}
      className={`flex gap-4 rounded-2xl bg-asfalto p-5 text-white ${emLinha ? 'flex-wrap items-center justify-between' : 'h-full flex-col justify-between'}`}
    >
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1 text-[12.5px] font-bold text-oleo">
          <BadgeCheck size={15} aria-hidden="true" /> Loja destaque
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="largo grid h-12 w-12 shrink-0 place-items-center rounded-full bg-oleo text-[20px] font-extrabold text-[#1b1f22]" aria-hidden="true">
            {loja.nome.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="leading-snug font-bold">{loja.nome}</p>
            {local ? <p className="text-[13px] text-white/65">{local}</p> : null}
            <SeloDaLoja fornecedorId={loja.id} escuro compacto />
          </div>
        </div>
        {loja.descricao ? <p className={`mt-3 text-[14px] text-white/80 ${emLinha ? 'max-w-[60ch]' : ''}`}>{loja.descricao}</p> : null}
        {detalhes ? <p className="mt-2 text-[13px] text-white/70">{detalhes}.</p> : null}
        {comPrecos && saldo > 0 ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[13px] font-semibold text-oleo">
            <Wallet size={14} aria-hidden="true" /> Seu cashback aqui: <span className="num">{formatarMoeda(saldo)}</span>
          </p>
        ) : null}
      </div>
      <div className={`flex gap-3 ${emLinha ? 'items-center' : 'flex-col items-start'}`}>
        <p className="text-[13px] text-white/65">{produtos === 1 ? '1 produto na loja' : `${produtos} produtos na loja`}</p>
        <button type="button" onClick={aoVer} className="inline-flex h-9 items-center rounded-[10px] bg-oleo px-3 text-sm font-semibold whitespace-nowrap text-[#1b1f22] hover:brightness-[0.96]">
          Ver produtos da loja
        </button>
      </div>
    </aside>
  );
}
