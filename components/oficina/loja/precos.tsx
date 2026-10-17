'use client';

// O que a oficina já pagou (pedidos da loja e entradas no estoque), para a vitrine mostrar
// "você pagou R$ 25 da última vez" e comparar com as outras lojas.

import { TrendingDown, TrendingUp } from 'lucide-react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Produto } from '@/lib/catalogo';
import { formatarData } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import { lerPreco, ofertasDoProduto, porLitro, precoComparavel, precosPagos, textoComparavel, ultimoPrecoPago, type PrecoPago } from '@/lib/precos';
import { useOficina } from '@/lib/store';
import { useCatalogo } from '../catalogo';
import { FotoProduto } from '../FotoProduto';
import { nomeComMarca } from './comum';

const Contexto = createContext<PrecoPago[]>([]);

export function ProvedorDePrecos({ children }: { children: ReactNode }) {
  const { catalogo } = useCatalogo();
  const pedidos = useOficina((s) => s.pedidos);
  const movimentos = useOficina((s) => s.movimentos);
  const estoque = useOficina((s) => s.estoque);
  const pagos = useMemo(() => precosPagos(pedidos, catalogo, Object.values(movimentos), estoque), [pedidos, catalogo, movimentos, estoque]);
  return <Contexto.Provider value={pagos}>{children}</Contexto.Provider>;
}

export function usePrecosPagos(): PrecoPago[] {
  return useContext(Contexto);
}

/** "Pagou R$ 25,00" com a seta de subiu ou desceu, embaixo do preço do cartão. */
export function SeloPrecoPago({ produto, preco }: { produto: Produto; preco: number }) {
  const pagos = usePrecosPagos();
  const pago = useMemo(() => ultimoPrecoPago(produto, pagos), [produto, pagos]);
  // sem o preço de hoje (quem não entrou na conta), não tem o que comparar
  if (!pago || !(preco > 0)) return null;
  const atual = precoComparavel(produto, preco);
  const subiu = atual > pago.comparavel * 1.005;
  const desceu = atual < pago.comparavel * 0.995;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${subiu ? 'text-atraso' : desceu ? 'text-ok' : 'text-tinta-3'}`} title={`Última compra em ${formatarData(pago.quando.slice(0, 10))}`}>
      {subiu ? <TrendingUp size={13} aria-hidden="true" /> : desceu ? <TrendingDown size={13} aria-hidden="true" /> : null}
      Pagou {textoComparavel(pago.comparavel, porLitro(produto))}
    </span>
  );
}

/** Na ficha do produto: o que pagou da última vez e o preço nas outras lojas. */
export function ComparaPreco({ produto, quantidade, hoje, aoAbrir, acao }: { produto: Produto; quantidade: number; hoje: string; aoAbrir: (p: Produto) => void; acao?: ReactNode }) {
  const { catalogo } = useCatalogo();
  const pagos = usePrecosPagos();
  const { mesmo, parecidos } = useMemo(() => ofertasDoProduto(produto, catalogo, hoje, quantidade), [produto, catalogo, hoje, quantidade]);
  const atual = mesmo.find((o) => o.produto.id === produto.id);
  const pago = useMemo(() => ultimoPrecoPago(produto, pagos), [produto, pagos]);
  const leitura = atual ? lerPreco(atual, pago, mesmo) : null;
  const outras = [...mesmo.filter((o) => o.produto.id !== produto.id), ...parecidos].slice(0, 5);
  if (!leitura && !outras.length && !acao) return null;
  const litro = porLitro(produto);
  return (
    <section className="flex flex-col gap-2" aria-label="Comparar preço">
      <p className="font-bold">Preço</p>
      {leitura ? (
        <p className={`rounded-xl px-3.5 py-2.5 text-[14px] ${leitura.tom === 'caro' ? 'bg-atraso-claro text-atraso' : leitura.tom === 'bom' ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta-2'}`}>{leitura.texto}</p>
      ) : null}
      {outras.length ? (
        <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
          {outras.map((o) => (
            <li key={o.produto.id}>
              <button type="button" onClick={() => aoAbrir(o.produto)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-papel-2">
                <FotoProduto produto={o.produto} tamanhos="40px" className="h-10 w-10 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{o.fornecedor?.nome}</span>
                  <span className="block truncate text-[12.5px] text-tinta-3">
                    {mesmo.includes(o) ? 'Mesmo produto' : nomeComMarca(o.produto)}
                    {o.promocao ? ', em promoção' : ''}
                  </span>
                </span>
                <span className={`num text-[14px] font-bold ${atual && o.comparavel < atual.comparavel ? 'text-ok' : ''}`}>{litro ? textoComparavel(o.comparavel, true) : formatarMoeda(o.preco)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {acao}
    </section>
  );
}
