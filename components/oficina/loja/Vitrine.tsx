'use client';

// O carrossel do topo da loja: produtos impulsionados (o selo Patrocinado é o que o fornecedor
// paga) e as maiores promoções do dia. Passa no dedo, nas setas ou nos pontos; não anda sozinho.
// O patrocinado conta como visto quando aparece e como clique quando a oficina abre ou põe no pedido.

import { ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { embalagem, melhorOferta, type Fornecedor, type Produto } from '@/lib/catalogo';
import { formatarDataCurta } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import type { DestaqueDaVitrine } from '@/lib/vitrine';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { useAnuncios, useVistoNaVitrine } from './anuncios';
import { BotaoEntrar, nomeComMarca, SeloPatrocinado, SemPreco } from './comum';
import { useVitrineDoProduto } from './Produtos';

export function Vitrine({
  destaques,
  fornecedores,
  uf,
  hoje,
  aoPor,
  aoAbrir
}: {
  destaques: DestaqueDaVitrine[];
  fornecedores: Map<number, Fornecedor>;
  uf: string;
  hoje: string;
  aoPor: (p: Produto, q: number) => void;
  aoAbrir: (p: Produto) => void;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);

  const irPara = useCallback((i: number) => {
    const el = trilho.current;
    if (!el) return;
    const reduzir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduzir ? 'auto' : 'smooth' });
  }, []);

  // os destaques mudaram (o catálogo chegou): volta para o primeiro. Sem isso, o navegador mantém
  // à vista o slide que estava (agora em outra posição) e o patrocinado do começo fica escondido.
  const chave = destaques.map((d) => d.produto.id).join(',');
  useEffect(() => {
    trilho.current?.scrollTo({ left: 0, behavior: 'auto' });
    setAtual(0);
  }, [chave]);

  if (!destaques.length) return null;
  const total = destaques.length;

  return (
    <section aria-roledescription="carrossel" aria-label="Destaques da loja" className="relative">
      <div
        ref={trilho}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== atual) setAtual(Math.min(total - 1, Math.max(0, i)));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[22px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {destaques.map((d, i) => (
          <Slide key={d.produto.id} destaque={d} indice={i} total={total} fornecedor={fornecedores.get(d.produto.fornecedorId)} uf={uf} hoje={hoje} aoPor={aoPor} aoAbrir={aoAbrir} />
        ))}
      </div>

      {total > 1 ? (
        <>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {destaques.map((d, i) => (
              <button
                key={d.produto.id}
                type="button"
                onClick={() => irPara(i)}
                aria-label={`Ir para o destaque ${i + 1} de ${total}`}
                aria-current={i === atual ? 'true' : undefined}
                className="grid h-6 w-6 place-items-center"
              >
                <span className={`block h-2 rounded-full transition-[width,background-color] ${i === atual ? 'w-6 bg-tinta' : 'w-2 bg-linha'}`} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => irPara(atual === 0 ? total - 1 : atual - 1)}
            aria-label="Destaque anterior"
            className="absolute top-[calc(50%-18px)] left-3 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-papel/90 text-tinta shadow-sm ring-1 ring-linha hover:bg-papel md:grid"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => irPara(atual === total - 1 ? 0 : atual + 1)}
            aria-label="Próximo destaque"
            className="absolute top-[calc(50%-18px)] right-3 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-papel/90 text-tinta shadow-sm ring-1 ring-linha hover:bg-papel md:grid"
          >
            <ChevronRight size={20} />
          </button>
        </>
      ) : null}
    </section>
  );
}

function Slide({
  destaque,
  indice,
  total,
  fornecedor,
  uf,
  hoje,
  aoPor,
  aoAbrir
}: {
  destaque: DestaqueDaVitrine;
  indice: number;
  total: number;
  fornecedor?: Fornecedor;
  uf: string;
  hoje: string;
  aoPor: (p: Produto, q: number) => void;
  aoAbrir: (p: Produto) => void;
}) {
  const { catalogo } = useCatalogo();
  const { conta } = useConta();
  const { clicar } = useAnuncios();
  const p = destaque.produto;
  const pago = destaque.motivo === 'patrocinado';
  const visto = useVistoNaVitrine(p.id, pago);
  const v = useVitrineDoProduto(p, uf, hoje);
  const oferta = melhorOferta(p, catalogo.promocoes, hoje);
  const abrir = () => {
    if (pago) clicar(p.id);
    aoAbrir(p);
  };
  return (
    <article
      ref={visto}
      aria-roledescription="slide"
      aria-label={`${indice + 1} de ${total}, ${nomeComMarca(p)}`}
      className="grid w-full shrink-0 snap-center grid-rows-[150px_auto] overflow-hidden bg-asfalto text-white sm:grid-cols-[1.2fr_1fr] sm:grid-rows-none md:min-h-[260px]"
    >
      <div className="order-2 flex flex-col justify-between gap-5 p-5 sm:order-1 sm:p-7 md:pl-16">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            {pago ? <SeloPatrocinado escuro /> : <span className="font-bold text-oleo">Oferta</span>}
            {fornecedor ? <span className="text-white/60">{fornecedor.nome}</span> : null}
          </p>
          <h3 className="meio-largo mt-2 line-clamp-2 text-[22px] leading-tight font-extrabold sm:text-[27px]">{nomeComMarca(p)}</h3>
          <p className="mt-1.5 text-[14.5px] text-white/70">{oferta && !v.especial ? `${oferta.titulo}, até ${formatarDataCurta(oferta.fim)}` : embalagem(p)}</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          {v.comPrecos ? (
            <div>
              {v.cheio ? <p className="num text-[14px] text-white/50 line-through">{formatarMoeda(v.cheio)}</p> : null}
              <p className="largo num text-[30px] leading-none font-extrabold text-oleo">{formatarMoeda(v.preco)}</p>
              <p className={`mt-1 text-[13px] ${v.especial ? 'font-semibold text-white' : 'text-white/65'}`}>{v.legenda}</p>
            </div>
          ) : (
            <SemPreco escuro />
          )}
          <div className="flex flex-wrap gap-2">
            {conta ? (
              <button
                type="button"
                onClick={() => {
                  if (pago) clicar(p.id);
                  aoPor(p, v.quantidade);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-oleo px-4 text-[15px] font-semibold text-[#1b1f22] hover:brightness-[0.96]"
              >
                <ShoppingCart size={17} aria-hidden="true" /> Pôr no pedido
              </button>
            ) : (
              <BotaoEntrar claro />
            )}
            <button type="button" onClick={abrir} className="inline-flex h-11 items-center rounded-[10px] border border-white/30 px-4 text-[15px] font-semibold text-white hover:border-white/70 hover:bg-white/5">
              Detalhes
            </button>
          </div>
        </div>
      </div>
      <button type="button" onClick={abrir} className="relative order-1 block min-h-[150px] sm:order-2" aria-label={`Ver detalhes de ${p.nome}`} tabIndex={-1}>
        <FotoProduto produto={p} tamanhos="(min-width: 640px) 45vw, 100vw" className="absolute inset-0 h-full w-full" prioridade={indice === 0} />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-asfalto/70 to-transparent sm:bg-gradient-to-r sm:from-asfalto sm:via-asfalto/20" aria-hidden="true" />
        {v.desconto > 0 && v.comPrecos ? <span className="num absolute top-4 right-4 rounded-full bg-oleo px-3 py-1 text-[15px] font-extrabold text-[#1b1f22]">-{v.desconto}%</span> : null}
      </button>
    </article>
  );
}
