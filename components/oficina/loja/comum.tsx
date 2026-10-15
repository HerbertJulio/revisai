'use client';

// Peças pequenas da loja: selos, ficha técnica e o seletor de quantidade.

import { BadgeCheck, Minus, Plus, ShoppingCart } from 'lucide-react';
import { embalagem, melhorOferta, quantidadeComUnidade, type Produto, type Promocao } from '@/lib/catalogo';
import { nomeBase } from '@/lib/oleos';
import { useOficina } from '@/lib/store';

export function SeloPatrocinado({ escuro = false }: { escuro?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold tracking-wide ring-1 ${escuro ? 'bg-white/10 text-white/85 ring-white/20' : 'bg-papel text-tinta-2 ring-linha'}`}
    >
      Patrocinado
    </span>
  );
}

export function SeloDestaque() {
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold whitespace-nowrap text-caneta">
      <BadgeCheck size={14} aria-hidden="true" /> Loja destaque
    </span>
  );
}

/** O nome com a marca na frente, quando o fornecedor não escreveu a marca no nome. */
export function nomeComMarca(p: Pick<Produto, 'nome' | 'marca'>): string {
  return p.marca && !p.nome.toLowerCase().includes(p.marca.toLowerCase()) ? `${p.marca} ${p.nome}` : p.nome;
}

/** A ficha técnica em etiquetas curtas: "5W-30", "Sintético", "API SP", "GM dexos1 Gen 3". */
export function especificacoes(p: Produto): string[] {
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

/** "Frasco de 1 L" vira "frasco de 1 L" (só a primeira letra). */
export function minuscula(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** O que vai embaixo do preço: a quantidade mínima da promoção ou a embalagem. */
export function legendaDoPreco(p: Produto, promocoes: Promocao[], hoje: string): string {
  const o = melhorOferta(p, promocoes, hoje);
  if (o && o.quantidadeMinima > 1) return `a partir de ${quantidadeComUnidade(p, o.quantidadeMinima)}`;
  return `por ${minuscula(embalagem(p))}`;
}

/** Quantas unidades entram no pedido com um toque: o mínimo da promoção, ou uma. */
export function quantidadeInicial(p: Produto, promocoes: Promocao[], hoje: string): number {
  return melhorOferta(p, promocoes, hoje)?.quantidadeMinima ?? 1;
}

export function Passo({
  valor,
  aoMudar,
  rotulo,
  minimo = 1,
  maximo = 999,
  escuro = false,
  pequeno = false
}: {
  valor: number;
  aoMudar: (n: number) => void;
  rotulo: string;
  /** Com 0, o menos tira o produto do pedido. */
  minimo?: number;
  maximo?: number;
  escuro?: boolean;
  pequeno?: boolean;
}) {
  const altura = pequeno ? 'h-9' : 'h-10';
  return (
    <div className={`flex ${altura} items-center rounded-[10px] ${escuro ? 'bg-tinta text-papel' : 'border border-linha bg-papel text-tinta'}`}>
      <button
        type="button"
        className={`grid h-full w-8 place-items-center ${escuro ? 'text-papel/80 hover:text-papel' : 'text-tinta-2 hover:text-tinta'}`}
        onClick={() => aoMudar(Math.max(minimo, valor - 1))}
        aria-label={valor - 1 < 1 && minimo === 0 ? `Tirar ${rotulo} do pedido` : `Menos ${rotulo}`}
      >
        <Minus size={15} />
      </button>
      <span className="num w-7 text-center text-[14px] font-bold" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        className={`grid h-full w-8 place-items-center disabled:opacity-30 ${escuro ? 'text-papel/80 hover:text-papel' : 'text-tinta-2 hover:text-tinta'}`}
        onClick={() => aoMudar(Math.min(maximo, valor + 1))}
        disabled={valor >= maximo}
        aria-label={`Mais ${rotulo}`}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

/**
 * "Pôr no pedido" com um toque. Depois que o produto entra no pedido, o botão vira o seletor de
 * quantidade do próprio pedido (o menos no 1 tira o produto).
 */
export function BotaoPor({
  produto,
  quantidade,
  aoPor,
  rotulo = 'Pôr',
  pequeno = false
}: {
  produto: Produto;
  quantidade: number;
  aoPor: (p: Produto, q: number) => void;
  rotulo?: string;
  pequeno?: boolean;
}) {
  const noPedido = useOficina((s) => s.carrinho.find((c) => c.produtoId === produto.id)?.quantidade ?? 0);
  const definir = useOficina((s) => s.definirQuantidade);
  if (noPedido > 0) return <Passo valor={noPedido} aoMudar={(n) => definir(produto.id, n)} rotulo={produto.nome} minimo={0} escuro pequeno={pequeno} />;
  return (
    <button
      type="button"
      onClick={() => aoPor(produto, quantidade)}
      aria-label={`Pôr ${quantidadeComUnidade(produto, quantidade)} de ${produto.nome} no pedido`}
      className={`inline-flex ${pequeno ? 'h-9 px-3' : 'h-10 px-3.5'} shrink-0 items-center gap-1.5 rounded-[10px] bg-tinta text-[14px] font-semibold text-papel transition-opacity hover:opacity-90`}
    >
      <ShoppingCart size={16} aria-hidden="true" />
      <span>{rotulo}</span>
    </button>
  );
}
