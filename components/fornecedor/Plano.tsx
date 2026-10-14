'use client';

import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { quererDestaque } from '@/app/fornecedor/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Chip } from '@/components/ui';
import { formatarMoeda } from '@/lib/formatos';
import { PLANOS_FORNECEDOR, PRECO_IMPULSO, DIAS_IMPULSO, type PlanoFornecedor } from '@/lib/planos-fornecedor';

export function PlanoFornecedorTela({ atual, comissao, mensalidade }: { atual: PlanoFornecedor; comissao: number | null; mensalidade: number | null }) {
  const toast = useToast();
  const [pedido, setPedido] = useState(false);
  const [ocupado, iniciar] = useTransition();

  function querer() {
    iniciar(async () => {
      try {
        const r = await quererDestaque();
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        setPedido(true);
        toast({ texto: 'Pedido recebido. A equipe do Revisaí fala com você para ativar o Destaque.' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-2">
        {(Object.keys(PLANOS_FORNECEDOR) as PlanoFornecedor[]).map((id) => {
          const p = PLANOS_FORNECEDOR[id];
          const eh = id === atual;
          return (
            <section key={id} className={`flex flex-col gap-4 rounded-[22px] px-6 py-6 ${id === 'destaque' ? 'bg-tinta text-papel' : 'bg-papel ring-1 ring-linha'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[24px]">{p.nome}</h2>
                  <p className={id === 'destaque' ? 'text-papel/75' : 'text-tinta-2'}>{p.resumo}</p>
                </div>
                {eh ? <Chip tom={id === 'destaque' ? 'oleo' : 'ok'}>Seu plano</Chip> : null}
              </div>
              <p>
                <span className="largo num text-[30px] font-extrabold">{p.mensalidade ? formatarMoeda(eh && mensalidade != null ? mensalidade : p.mensalidade) : 'Grátis'}</span>
                {p.mensalidade ? <span className={id === 'destaque' ? 'text-papel/75' : 'text-tinta-3'}> por mês</span> : null}
                <span className={`block text-[14px] ${id === 'destaque' ? 'text-papel/75' : 'text-tinta-3'}`}>
                  {String(eh && comissao != null ? comissao : p.comissao).replace('.', ',')}% de comissão sobre os pedidos entregues
                </span>
              </p>
              <ul className="flex flex-col gap-2 text-[15px]">
                {p.itens.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check size={18} className={`mt-0.5 shrink-0 ${id === 'destaque' ? 'text-oleo' : 'text-ok'}`} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              {id === 'destaque' && atual !== 'destaque' ? (
                <Botao variante="primario" tamanho="grande" className="mt-auto" onClick={querer} disabled={ocupado || pedido}>
                  {pedido ? 'Pedido enviado' : 'Quero o Destaque'}
                </Botao>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="flex flex-col gap-3 rounded-[22px] bg-papel px-6 py-6 ring-1 ring-linha">
        <h2 className="text-[22px]">Impulsionar um produto</h2>
        <p className="max-w-prose text-tinta-2">
          Para um lançamento ou uma queima de estoque: o produto aparece primeiro na categoria e ao lado da sugestão de compra das oficinas, com o selo Patrocinado. Peça em Produtos, no botão Impulsionar.
        </p>
        <div className="flex flex-wrap gap-2">
          {DIAS_IMPULSO.map((d) => (
            <span key={d} className="rounded-xl bg-papel-2 px-3 py-2 text-[15px]">
              <strong>{d} dias</strong> por <span className="num font-semibold">{formatarMoeda(PRECO_IMPULSO[d])}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
