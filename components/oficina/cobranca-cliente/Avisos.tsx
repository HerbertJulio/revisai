'use client';

// "O cliente avisou que pagou": quem, quanto, do quê e quando, com os botões para confirmar (o Pix
// caiu na conta) ou tirar da lista (ainda não caiu). Aparece na ordem, no clube e no início.

import { Check, ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao } from '@/components/ui';
import { lerDadosDoCartao, mensalidadesAtrasadas, nomeDaCompetencia } from '@/lib/clube';
import { avisoPendente, lerDadosDoPagamento, type LinkDeCobranca } from '@/lib/cobranca-cliente';
import { formatarDiaHora } from '@/lib/datas';
import { formatarMoeda, plural } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { ContextoDaConta } from '../servico/conta';
import { useGestao } from './gestao';
import { avisoNaoConfere, confirmarPagamento, useLinksDeCobranca } from './links';

function useDescricao(l: LinkDeCobranca) {
  const cobrancas = useOficina((s) => s.clubeCobrancas);
  const membros = useOficina((s) => s.clubeMembros);
  const planos = useOficina((s) => s.clubePlanos);
  return useMemo(() => {
    const r = avisoPendente(l);
    if (l.tipo === 'pagamento') {
      const d = lerDadosDoPagamento(l.dados);
      return { valor: d?.valor ?? null, sobre: d?.titulo || d?.descricao || '', quem: r?.nome || d?.cliente || 'O cliente' };
    }
    const cartao = lerDadosDoCartao(l.dados);
    const competencia = r?.competencia ?? null;
    const c = Object.values(cobrancas).find((x) => x.membroId === l.ref && x.competencia === competencia);
    const plano = membros[l.ref] ? planos[membros[l.ref].planoId] : undefined;
    return {
      valor: c?.valor ?? cartao?.aberta?.valor ?? null,
      sobre: `Clube ${plano?.nome ?? cartao?.plano.nome ?? ''}: mensalidade de ${competencia ? nomeDaCompetencia(competencia) : 'este mês'}`.replace(/\s+/g, ' '),
      quem: r?.nome || cartao?.cliente || 'O cliente'
    };
  }, [l, cobrancas, membros, planos]);
}

export function AvisoDePagamento({ l, ctx, aoTratar }: { l: LinkDeCobranca; ctx: ContextoDaConta; aoTratar: () => void }) {
  const toast = useToast();
  const hoje = useHoje();
  const [ocupado, setOcupado] = useState(false);
  const info = useDescricao(l);
  const r = avisoPendente(l);
  if (!r) return null;

  async function confirmar() {
    setOcupado(true);
    const c = await confirmarPagamento(l, ctx.sb, ctx.oficinaId, hoje);
    setOcupado(false);
    if (!c.ok) {
      toast({ texto: c.erro ?? 'Não deu para confirmar agora.', tom: 'erro' });
      return;
    }
    toast({ texto: c.jaTratado ? 'Outro aparelho já tinha confirmado este Pix.' : `${info.valor ? formatarMoeda(info.valor) : 'O Pix'} entrou no caixa de hoje.` });
    aoTratar();
  }

  async function naoCaiu() {
    setOcupado(true);
    const c = await avisoNaoConfere(l, ctx.sb, ctx.oficinaId);
    setOcupado(false);
    if (!c.ok) {
      toast({ texto: c.erro ?? 'Não deu agora.', tom: 'erro' });
      return;
    }
    toast({ texto: 'Tirado da lista. O cliente pode avisar de novo pela página.' });
    aoTratar();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-ok-claro px-3.5 py-3 text-[14.5px]" role="status" data-aviso-pagamento={l.id}>
      <p>
        <strong>
          {info.quem} avisou que pagou{info.valor ? ` ${formatarMoeda(info.valor)}` : ''}
        </strong>
        {info.sobre ? ` (${info.sobre})` : ''}
        {r.quando ? `, ${formatarDiaHora(r.quando)}` : ''}.
      </p>
      <p className="text-[13px] text-tinta-2">Confira no app do banco se o Pix caiu antes de confirmar.</p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" tamanho="pequeno" onClick={confirmar} disabled={ocupado}>
          <Check size={16} aria-hidden="true" /> Caiu, confirmar
        </Botao>
        <Botao variante="fantasma" tamanho="pequeno" onClick={naoCaiu} disabled={ocupado}>
          Ainda não caiu
        </Botao>
      </div>
    </div>
  );
}

/** Os avisos de todos os links (no clube e no início). */
export function ListaDeAvisos({ ctx, titulo, filtro }: { ctx: ContextoDaConta; titulo?: string; filtro?: (l: LinkDeCobranca) => boolean }) {
  const { links, recarregar } = useLinksDeCobranca(ctx.sb, ctx.oficinaId, { pendentes: true });
  const lista = links.filter((l) => avisoPendente(l) && (!filtro || filtro(l)));
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-2.5" aria-label={titulo ?? 'Clientes avisaram que pagaram'}>
      {titulo ? <h2 className="text-[19px]">{titulo}</h2> : null}
      {lista.map((l) => (
        <AvisoDePagamento key={l.id} l={l} ctx={ctx} aoTratar={() => void recarregar()} />
      ))}
    </section>
  );
}

/** No início: os Pix que os clientes avisaram e as mensalidades do clube atrasadas. */
export function PainelDePagamentosDoInicio() {
  const { gestao, ctx } = useGestao();
  const hoje = useHoje();
  const cobrancas = useOficina((s) => s.clubeCobrancas);
  const atrasadas = useMemo(() => mensalidadesAtrasadas(Object.values(cobrancas), hoje).length, [cobrancas, hoje]);
  if (!gestao) return null;
  return (
    <>
      {ctx ? <ListaDeAvisos ctx={ctx} titulo="Clientes avisaram que pagaram" /> : null}
      {atrasadas ? (
        <Link href="/oficina/clube?aba=mensalidades" className="flex items-center gap-3 rounded-2xl bg-oleo-claro px-4 py-3 text-oleo-tinta ring-1 ring-linha hover:brightness-[0.98]">
          <Clock size={18} aria-hidden="true" />
          <span className="min-w-0 flex-1 font-semibold">{plural(atrasadas, 'mensalidade do clube atrasada', 'mensalidades do clube atrasadas')}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : null}
    </>
  );
}
