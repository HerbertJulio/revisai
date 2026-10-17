'use client';

// No pedido da oficina: como pagar cada loja que deu crédito a ela (Pix ou faturado, com o prazo e o
// que ainda cabe no limite) e o limite de compra das oficinas novas. Lojas sem crédito ficam no Pix
// e nem aparecem. O banco confere tudo de novo ao gravar o pedido (RV060, RV061, RV062).

import { CalendarClock, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatarMoeda } from '@/lib/formatos';
import { creditoNasLojas } from '@/lib/loja/acoes-da-oficina';
import type { CreditoNaLoja, FormaDePagamento } from '@/lib/loja/credito-dados';
import type { LimiteDeCompra } from '@/lib/loja/moderacao-dados';

export function EscolhaDePagamento({
  lojas,
  total,
  valor,
  aoMudar
}: {
  /** As lojas do pedido, com a soma dos itens de cada uma. */
  lojas: { id: number; nome: string; subtotal: number }[];
  total: number;
  valor: Record<string, FormaDePagamento>;
  aoMudar: (v: Record<string, FormaDePagamento>) => void;
}) {
  const [dados, setDados] = useState<{ creditos: CreditoNaLoja[]; limite: LimiteDeCompra | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    creditoNasLojas()
      .then((r) => {
        if (vivo && r.ok) setDados({ creditos: r.creditos, limite: r.limite });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!dados) return null;
  const comCredito = lojas.flatMap((l) => {
    const c = dados.creditos.find((x) => x.fornecedorId === l.id);
    return c ? [{ loja: l, credito: c }] : [];
  });
  const limite = dados.limite;
  if (!comCredito.length && !limite) return null;
  const passaDoLimite = limite != null && total > limite.livre;

  return (
    <div className="flex flex-col gap-3" data-escolha-pagamento>
      {limite ? (
        <p className={`flex gap-2 rounded-xl px-3.5 py-2.5 text-[14px] ${passaDoLimite ? 'bg-atraso-claro text-atraso' : 'bg-papel-2 text-tinta-2'}`} role={passaDoLimite ? 'alert' : undefined}>
          <ShieldAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Nos primeiros 30 dias, a oficina compra até {formatarMoeda(limite.limite)} a cada 7 dias pela loja do Revisaí. Nesta semana ainda cabem {formatarMoeda(limite.livre)}.
            {passaDoLimite ? ' Este pedido passa disso: tire alguns itens ou fale com a equipe do Revisaí pelo botão Ajuda.' : ''}
          </span>
        </p>
      ) : null}
      {comCredito.map(({ loja, credito }) => {
        const cabe = loja.subtotal <= credito.livre;
        const escolhido = cabe && valor[String(loja.id)] === 'faturado' ? 'faturado' : 'pix';
        const nome = `pagamento-${loja.id}`;
        return (
          <fieldset key={loja.id} className="flex flex-col gap-2 rounded-xl bg-papel-2 px-4 py-3">
            <legend className="sr-only">Como pagar a {loja.nome}</legend>
            <p className="text-[14px] font-semibold">Como pagar a {loja.nome}</p>
            <label className="flex cursor-pointer items-center gap-2 text-[14.5px]">
              <input type="radio" name={nome} checked={escolhido === 'pix'} onChange={() => aoMudar({ ...valor, [String(loja.id)]: 'pix' })} className="h-4 w-4 shrink-0 accent-[var(--color-tinta)]" />
              Pix, quando a loja confirmar
            </label>
            <label className={`flex items-start gap-2 text-[14.5px] ${cabe ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="radio"
                name={nome}
                checked={escolhido === 'faturado'}
                disabled={!cabe}
                onChange={() => aoMudar({ ...valor, [String(loja.id)]: 'faturado' })}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-tinta)]"
              />
              <span>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock size={15} aria-hidden="true" /> Faturado: paga em {credito.prazoDias} dias depois da entrega
                </span>
                <span className="block text-[13px] text-tinta-3">
                  {cabe
                    ? `Cabem ${formatarMoeda(credito.livre)} no seu limite com a loja.`
                    : `O que cabe no seu limite com a loja (${formatarMoeda(credito.livre)}) não cobre esta compra. Pague uma fatura em aberto ou use o Pix.`}
                </span>
              </span>
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}
