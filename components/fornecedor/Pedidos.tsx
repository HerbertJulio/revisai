'use client';

import { MessageCircle } from 'lucide-react';
import { useOptimistic, useState, useTransition } from 'react';
import { mudarSituacaoPedidoFornecedor } from '@/app/fornecedor/acoes';
import { ChipSituacao, Filtro, LinhaDeFiltros, SeletorSituacao } from '@/components/equipe/comum';
import { useToast } from '@/components/Toasts';
import { Vazio, classeBotao } from '@/components/ui';
import { contarPor, quandoFoi } from '@/lib/equipe-dados';
import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import { SITUACOES_PARTE, type PedidoDoFornecedor, type SituacaoParte } from '@/lib/marketplace-dados';
import { valorDaComissao } from '@/lib/planos-fornecedor';
import { linkWhatsApp } from '@/lib/whatsapp';

type FiltroPedido = 'abertos' | SituacaoParte;

export function PedidosFornecedor({ pedidos, loja }: { pedidos: PedidoDoFornecedor[]; loja: string }) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<FiltroPedido>('abertos');
  const [lista, mudarOtimista] = useOptimistic(pedidos, (atual, m: { id: number; status: SituacaoParte }) => atual.map((p) => (p.id === m.id ? { ...p, status: m.status } : p)));
  const [, iniciar] = useTransition();
  const agora = Date.now();
  const contagem = contarPor(lista, (p) => p.status);
  const abertos = lista.filter((p) => p.status === 'novo' || p.status === 'em_contato' || p.status === 'confirmado');
  const visiveis = filtro === 'abertos' ? abertos : lista.filter((p) => p.status === filtro);

  function mudar(p: PedidoDoFornecedor, status: SituacaoParte) {
    iniciar(async () => {
      mudarOtimista({ id: p.id, status });
      try {
        const r = await mudarSituacaoPedidoFornecedor(p.id, status);
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. A situação não mudou.', tom: 'erro' });
      }
    });
  }

  function mensagem(p: PedidoDoFornecedor): string {
    const itens = p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join('; ');
    return `Olá, ${p.oficina.nome}! Aqui é da ${loja}. Recebi o seu pedido ${p.codigo} pelo Revisaí (${itens}), total ${formatarMoeda(p.subtotal)}. Vamos combinar a entrega e o pagamento?`;
  }

  return (
    <div className="flex flex-col gap-5">
      <LinhaDeFiltros rotulo="Filtrar pedidos">
        <Filtro ativo={filtro === 'abertos'} aoClicar={() => setFiltro('abertos')} n={abertos.length}>
          Em aberto
        </Filtro>
        {SITUACOES_PARTE.map((s) => (
          <Filtro key={s.id} ativo={filtro === s.id} aoClicar={() => setFiltro(s.id)} n={contagem[s.id] ?? 0}>
            {s.nome}
          </Filtro>
        ))}
      </LinhaDeFiltros>
      {visiveis.length ? (
        <ul className="flex flex-col gap-3">
          {visiveis.map((p) => {
            const s = SITUACOES_PARTE.find((x) => x.id === p.status)!;
            const whatsapp = linkWhatsApp(p.oficina.whatsapp, mensagem(p));
            return (
              <li key={p.id}>
                <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={`Pedido ${p.codigo}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="largo num font-extrabold tracking-wider">{p.codigo}</p>
                        <ChipSituacao nome={s.nome} tom={s.tom} />
                      </div>
                      <p className="mt-0.5 font-semibold">{p.oficina.nome}</p>
                      <p className="text-[13.5px] text-tinta-3">
                        {[[p.oficina.cidade, p.oficina.uf].filter(Boolean).join(', '), formatarTelefone(p.oficina.whatsapp), quandoFoi(p.criadoEm, agora)].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-[18px] font-extrabold">{formatarMoeda(p.subtotal)}</p>
                      <p className="text-[12.5px] text-tinta-3">comissão {formatarMoeda(valorDaComissao(p.subtotal, p.comissaoPercentual))}</p>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1 rounded-xl bg-papel-2 px-3 py-2.5 text-[14px]">
                    {p.itens.map((i) => (
                      <li key={i.produto_id} className="flex justify-between gap-3">
                        <span>
                          <span className="num font-semibold">{i.quantidade}x</span> {i.nome}
                        </span>
                        <span className="num text-tinta-2">{formatarMoeda(i.preco_unitario * i.quantidade)}</span>
                      </li>
                    ))}
                  </ul>
                  {p.observacao ? <p className="text-[14px] text-tinta-2">Observação da oficina: {p.observacao}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {whatsapp ? (
                      <a
                        href={whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={classeBotao('whatsapp', 'pequeno')}
                        onClick={() => p.status === 'novo' && mudar(p, 'em_contato')}
                      >
                        <MessageCircle size={16} aria-hidden="true" /> Chamar no WhatsApp
                      </a>
                    ) : null}
                    <SeletorSituacao valor={p.status} opcoes={SITUACOES_PARTE} aoMudar={(v) => mudar(p, v)} rotulo={`Situação do pedido ${p.codigo}`} />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <Vazio titulo={filtro === 'abertos' ? 'Nenhum pedido em aberto' : 'Nenhum pedido aqui'}>Quando uma oficina pedir um produto seu pela loja do Revisaí, o pedido aparece aqui com o WhatsApp dela.</Vazio>
      )}
    </div>
  );
}
