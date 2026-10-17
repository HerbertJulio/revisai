'use client';

// O que a loja tem a receber nas vendas faturadas: vencidas, em aberto, as que vencem depois da
// entrega e as recebidas. A loja marca a fatura como recebida (o mesmo "pagamento confirmado" do
// pedido) e lembra a oficina pelo WhatsApp com a mensagem pronta.

import { Check, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { confirmarPagamentoDoPedido } from '@/app/fornecedor/acoes';
import { Numero } from '@/components/painel/Numero';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Vazio, classeBotao } from '@/components/ui';
import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import { quandoFoi } from '@/lib/loja/comum';
import { AVISO_DO_RISCO, mensagemDeCobranca, resumirFaturas, SITUACOES_DA_FATURA, situacaoDaFatura, textoDoVencimento, type Fatura, type SituacaoDaFatura } from '@/lib/loja/credito-dados';
import { linkWhatsApp } from '@/lib/whatsapp';
import { Filtro, LinhaDeFiltros } from './comum';

type Aba = Exclude<SituacaoDaFatura, 'cancelada'>;

const ABAS: { id: Aba; nome: string; vazio: string }[] = [
  { id: 'vencida', nome: 'Vencidas', vazio: 'Nenhuma fatura vencida. Bom sinal.' },
  { id: 'aberta', nome: 'Em aberto', vazio: 'Nenhuma fatura entregue esperando pagamento.' },
  { id: 'aguardando_entrega', nome: 'Vencem depois da entrega', vazio: 'Nenhum pedido faturado esperando a entrega.' },
  { id: 'recebida', nome: 'Recebidas', vazio: 'Nenhuma fatura recebida ainda.' }
];

export function AReceber({ faturas, loja, hoje, temCredito }: { faturas: Fatura[]; loja: string; hoje: string; temCredito: boolean }) {
  const [lista, mudarOtimista] = useOptimistic(faturas, (atual, m: { id: number; recebida: boolean }) =>
    atual.map((f) => (f.id === m.id ? { ...f, pagamento: m.recebida ? 'confirmado' : 'pendente', pagamentoEm: m.recebida ? new Date().toISOString() : null } : f))
  );
  const resumo = resumirFaturas(lista, hoje);
  const [aba, setAba] = useState<Aba>(resumo.porSituacao.vencida.length ? 'vencida' : 'aberta');
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const visiveis = resumo.porSituacao[aba];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Numero rotulo="Em aberto" valor={formatarMoeda(resumo.aberto)} detalhe={`${resumo.porSituacao.aberta.length + resumo.porSituacao.vencida.length + resumo.porSituacao.aguardando_entrega.length} faturas`} />
        <Numero rotulo="Vencido" valor={formatarMoeda(resumo.vencido)} detalhe={resumo.porSituacao.vencida.length ? 'Lembre a oficina pelo WhatsApp' : 'Nada vencido'} />
        <Numero rotulo="Recebido no mês" valor={formatarMoeda(resumo.recebidoNoMes)} />
      </div>

      <p className="rounded-2xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta sm:px-5">{AVISO_DO_RISCO}</p>

      {!faturas.length ? (
        <Vazio
          titulo="Nenhuma venda faturada ainda"
          acao={
            <Link href="/fornecedor/credito" className={classeBotao('escuro', 'pequeno')}>
              {temCredito ? 'Ver o crédito dos clientes' : 'Dar crédito a um cliente'}
            </Link>
          }
        >
          Quando a loja der crédito a uma oficina que já comprou, ela pode escolher pagar faturado no pedido. As faturas aparecem aqui, com o vencimento contado da entrega.
        </Vazio>
      ) : (
        <>
          <LinhaDeFiltros rotulo="Filtrar faturas">
            {ABAS.map((a) => (
              <Filtro key={a.id} ativo={aba === a.id} aoClicar={() => setAba(a.id)} n={resumo.porSituacao[a.id].length}>
                {a.nome}
              </Filtro>
            ))}
          </LinhaDeFiltros>
          {visiveis.length ? (
            <ul className="flex flex-col gap-3">
              {visiveis.map((f) => (
                <li key={f.id}>
                  <CartaoDaFatura fatura={f} loja={loja} hoje={hoje} mudarOtimista={mudarOtimista} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo={atual.vazio} />
          )}
        </>
      )}
    </div>
  );
}

function CartaoDaFatura({ fatura: f, loja, hoje, mudarOtimista }: { fatura: Fatura; loja: string; hoje: string; mudarOtimista: (m: { id: number; recebida: boolean }) => void }) {
  const toast = useToast();
  const [ocupado, iniciar] = useTransition();
  const agora = Date.now();
  const situacao = situacaoDaFatura(f, hoje);
  const s = SITUACOES_DA_FATURA[situacao];
  const zap = situacao !== 'recebida' ? linkWhatsApp(f.whatsapp, mensagemDeCobranca(f, loja, hoje)) : null;

  function receber(recebida: boolean) {
    iniciar(async () => {
      mudarOtimista({ id: f.id, recebida });
      try {
        const r = await confirmarPagamentoDoPedido(f.id, recebida);
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
        else toast({ texto: recebida ? `Fatura ${f.codigo} recebida. O limite da oficina volta a ficar livre.` : `Fatura ${f.codigo} voltou para a receber.` });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Nada mudou.', tom: 'erro' });
      }
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={`Fatura do pedido ${f.codigo}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="largo num font-extrabold tracking-wider">{f.codigo}</p>
            <Chip tom={s.tom}>{s.nome}</Chip>
            {f.pagamento === 'informado' ? <Chip tom="oleo">A oficina diz que pagou</Chip> : null}
          </div>
          <p className="mt-0.5 font-semibold">{f.oficina}</p>
          <p className="text-[13.5px] text-tinta-3">
            {[formatarTelefone(f.whatsapp), `pedido ${quandoFoi(f.criadoEm, agora)}`, f.entregueEm ? `entregue ${quandoFoi(f.entregueEm, agora)}` : null].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="text-right">
          <p className="num text-[18px] font-extrabold">{formatarMoeda(f.valor)}</p>
          {f.cashback > 0 ? <p className="text-[12.5px] text-tinta-3">já sem {formatarMoeda(f.cashback)} de cashback</p> : null}
          <p className={`text-[13px] ${situacao === 'vencida' ? 'font-semibold text-atraso' : 'text-tinta-3'}`}>
            {situacao === 'recebida' ? (f.pagamentoEm ? `recebida ${quandoFoi(f.pagamentoEm, agora)}` : 'recebida') : textoDoVencimento(f, hoje)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {situacao === 'recebida' ? (
          <button type="button" onClick={() => receber(false)} disabled={ocupado} className="text-[13px] font-semibold text-tinta-3 hover:text-atraso">
            Desfazer
          </button>
        ) : (
          <Botao tamanho="pequeno" variante={situacao === 'vencida' || f.pagamento === 'informado' ? 'escuro' : 'secundario'} onClick={() => receber(true)} disabled={ocupado}>
            <Check size={15} aria-hidden="true" /> Marcar como recebida
          </Botao>
        )}
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
            <MessageCircle size={15} aria-hidden="true" /> Lembrar no WhatsApp
          </a>
        ) : null}
      </div>
    </article>
  );
}
