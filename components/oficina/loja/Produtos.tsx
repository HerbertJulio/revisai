'use client';

// Os produtos da vitrine em grade (cartões) ou em lista (linhas compactas), e o cartão da loja
// Destaque que entra no meio dos resultados.

import { BadgeCheck } from 'lucide-react';
import { embalagem, nomeCategoria, patrocinado, type Fornecedor, type Produto } from '@/lib/catalogo';
import { formatarMoeda } from '@/lib/formatos';
import { descontoDeVitrine, precoDeVitrine } from '@/lib/vitrine';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { BotaoPor, especificacoes, legendaDoPreco, minuscula, nomeComMarca, quantidadeInicial, SeloDestaque, SeloPatrocinado } from './comum';
import { SeloPrecoPago } from './precos';

interface PropsProduto {
  produto: Produto;
  fornecedor?: Fornecedor;
  uf: string;
  hoje: string;
  aoPor: (p: Produto, q: number) => void;
  aoAbrir: (p: Produto) => void;
}

function useVitrineDoProduto(p: Produto, uf: string, hoje: string) {
  const { catalogo } = useCatalogo();
  const preco = precoDeVitrine(p, catalogo.promocoes, hoje);
  return {
    preco,
    cheio: preco < p.preco ? p.preco : null,
    desconto: descontoDeVitrine(p, catalogo.promocoes, hoje),
    pago: patrocinado(p.id, catalogo.patrocinios, uf, hoje),
    legenda: legendaDoPreco(p, catalogo.promocoes, hoje),
    quantidade: quantidadeInicial(p, catalogo.promocoes, hoje)
  };
}

function Desconto({ valor, grande = false }: { valor: number; grande?: boolean }) {
  return (
    <span className={`num rounded-full bg-oleo font-extrabold text-[#1b1f22] ${grande ? 'px-3 py-1 text-[15px]' : 'px-2 py-0.5 text-[12.5px]'}`}>
      -{valor}%
    </span>
  );
}

export function CartaoGrade({ produto: p, fornecedor, uf, hoje, aoPor, aoAbrir }: PropsProduto) {
  const v = useVitrineDoProduto(p, uf, hoje);
  const specs = especificacoes(p);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-papel ring-1 ring-linha transition-shadow hover:ring-tinta-3" aria-label={p.nome}>
      <button type="button" onClick={() => aoAbrir(p)} className="relative block" aria-label={`Ver detalhes de ${p.nome}`} tabIndex={-1}>
        <FotoProduto produto={p} tamanhos="(min-width: 1280px) 260px, (min-width: 768px) 30vw, 50vw" className="aspect-square w-full sm:aspect-[4/3]" />
        {v.pago ? (
          <span className="absolute top-2 left-2">
            <SeloPatrocinado />
          </span>
        ) : null}
        {v.desconto > 0 ? (
          <span className="absolute top-2 right-2">
            <Desconto valor={v.desconto} />
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <p className="text-[12px] font-semibold text-tinta-3 sm:text-[12.5px]">{nomeCategoria(p.categoria)}</p>
        <button type="button" onClick={() => aoAbrir(p)} className="line-clamp-2 text-left text-[14.5px] leading-snug font-bold hover:underline sm:text-[15.5px]">
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
          <div className="min-w-0">
            {v.cheio ? <p className="num text-[12.5px] text-tinta-3 line-through">{formatarMoeda(v.cheio)}</p> : null}
            <p className="largo num text-[18px] leading-none font-extrabold sm:text-[20px]">{formatarMoeda(v.preco)}</p>
            <p className="mt-1 text-[12px] text-tinta-3">{v.legenda}</p>
            <SeloPrecoPago produto={p} preco={v.preco} />
          </div>
          <BotaoPor produto={p} quantidade={v.quantidade} aoPor={aoPor} pequeno />
        </div>
      </div>
    </article>
  );
}

export function LinhaLista({ produto: p, fornecedor, uf, hoje, aoPor, aoAbrir }: PropsProduto) {
  const v = useVitrineDoProduto(p, uf, hoje);
  const specs = especificacoes(p);
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4" aria-label={p.nome}>
      <button type="button" onClick={() => aoAbrir(p)} className="shrink-0 overflow-hidden rounded-xl ring-1 ring-linha" aria-label={`Ver detalhes de ${p.nome}`} tabIndex={-1}>
        <FotoProduto produto={p} tamanhos="80px" className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
      </button>
      <div className="min-w-0 flex-1">
        {v.pago || v.desconto > 0 ? (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {v.pago ? <SeloPatrocinado /> : null}
            {v.desconto > 0 ? <Desconto valor={v.desconto} /> : null}
          </div>
        ) : null}
        <button type="button" onClick={() => aoAbrir(p)} className="line-clamp-2 text-left text-[15px] leading-snug font-bold hover:underline">
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
        </p>
        {specs.length ? <p className="mt-0.5 hidden truncate text-[12.5px] font-semibold text-tinta-2 sm:block">{specs.join(', ')}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 text-right sm:flex-row sm:items-center sm:gap-5">
        <div className="sm:min-w-[118px]">
          {v.cheio ? <p className="num text-[12px] text-tinta-3 line-through">{formatarMoeda(v.cheio)}</p> : null}
          <p className="largo num text-[17px] leading-none font-extrabold sm:text-[19px]">{formatarMoeda(v.preco)}</p>
          <p className="mt-0.5 hidden text-[12px] text-tinta-3 sm:block">{v.legenda}</p>
          <SeloPrecoPago produto={p} preco={v.preco} />
        </div>
        <div className="flex sm:w-[96px] sm:justify-end">
          <BotaoPor produto={p} quantidade={v.quantidade} aoPor={aoPor} pequeno />
        </div>
      </div>
    </li>
  );
}

/** A loja Destaque do dia, no meio dos resultados (parte do que o plano Destaque paga). */
export function CartaoLojaDestaque({ loja, produtos, aoVer, emLinha = false }: { loja: Fornecedor; produtos: number; aoVer: () => void; emLinha?: boolean }) {
  const local = [loja.cidade, loja.uf].filter(Boolean).join(', ');
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
          </div>
        </div>
        {loja.descricao ? <p className={`mt-3 text-[14px] text-white/80 ${emLinha ? 'max-w-[60ch]' : ''}`}>{loja.descricao}</p> : null}
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
