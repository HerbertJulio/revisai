'use client';

// O clube de manutenção da oficina (só para o dono e o gerente): as mensalidades do mês, os
// membros e os planos. A mensalidade é um Pix por mês que o cliente paga pelo código, não é
// débito automático: o app gera as cobranças do mês, a oficina manda pelo WhatsApp e, quando o
// Pix cai, marca como paga (o valor entra no financeiro).

import { BellRing, Check, ChevronLeft, ChevronRight, MessageCircle, Sparkles } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Vazio } from '@/components/ui';
import {
  competenciaDe,
  mensagemDaMensalidade,
  mensagemDeLembrete,
  mensagemDoCartao,
  mensalidadeAtrasada,
  mensalidadesAtrasadas,
  mensalidadesParaGerar,
  nomeDaCompetencia,
  pixDaMensalidade,
  somarCompetencia
} from '@/lib/clube';
import { recebedorDaOficina } from '@/lib/cobranca-cliente';
import { formatarData } from '@/lib/datas';
import { formatarMoeda, plural, SEM_NOME } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import type { ClubeCobranca, ClubeMembro } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { ListaDeAvisos } from '../cobranca-cliente/Avisos';
import { useGestao } from '../cobranca-cliente/gestao';
import { marcarMensalidadePaga } from '../cobranca-cliente/links';
import { MensagemPronta } from '../cobranca-cliente/Mensagem';
import { SoGestao } from '../financeiro/comum';
import { ChavePixDaOficina } from '../financeiro/Pix';
import { Membros, Planos } from './Cadastros';
import { linkDaMensalidade, publicarCartao } from './cartao';

type Aba = 'mensalidades' | 'membros' | 'planos';

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'mensalidades', nome: 'Mensalidades' },
  { id: 'membros', nome: 'Membros' },
  { id: 'planos', nome: 'Planos' }
];

interface Mensagem {
  titulo: string;
  texto: string;
  whatsapp: string | null;
  link: string | null;
}

export function Clube() {
  return (
    <SoGestao>
      <TelaDoClube />
    </SoGestao>
  );
}

function TelaDoClube() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const hoje = useHoje();
  const { ctx } = useGestao();
  const oficina = useOficina((s) => s.oficina);
  const planos = useOficina((s) => s.clubePlanos);
  const temPlano = Object.keys(planos).length > 0;
  const pedida = params.get('aba');
  const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : temPlano ? 'mensalidades' : 'planos';
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [ocupado, setOcupado] = useState<Id | null>(null);
  const semChave = !recebedorDaOficina(oficina);

  function ir(a: Aba) {
    router.replace(a === 'mensalidades' ? '/oficina/clube' : `/oficina/clube?aba=${a}`, { scroll: false });
  }

  async function mandarCartao(m: ClubeMembro) {
    if (!ctx) {
      toast({ texto: 'Para mandar o cartão por link, entre na conta da oficina.', tom: 'erro' });
      return;
    }
    setOcupado(m.id);
    const r = await publicarCartao(ctx.sb, ctx.oficinaId, m.id, hoje);
    setOcupado(null);
    if (!r.ok) {
      toast({ texto: r.erro, tom: 'erro' });
      return;
    }
    const s = useOficina.getState();
    const cliente = s.clientes[m.clienteId];
    const texto = mensagemDoCartao({ oficina: s.oficina.nome, cliente: cliente?.nome ?? '', plano: s.clubePlanos[m.planoId]?.nome ?? '', link: r.link.url ?? '' });
    setMensagem({ titulo: 'Cartão do clube', texto, whatsapp: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null, link: r.link.url ?? null });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="largo text-[30px] sm:text-[34px]">Clube de manutenção</h1>
        <p className="mt-1 max-w-[62ch] text-tinta-2">
          Planos com mensalidade para o cliente manter o carro em dia, com serviços incluídos e desconto. A mensalidade é um Pix por mês que o cliente paga pelo código: não é débito automático.
        </p>
      </header>

      {semChave ? <ChavePixDaOficina id="chave-pix" /> : null}
      {ctx ? <ListaDeAvisos ctx={ctx} titulo="Membros avisaram que pagaram" filtro={(l) => l.tipo === 'clube' || typeof l.dados.cobrancaId === 'string'} /> : null}

      <div role="tablist" aria-label="Partes do clube" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {ABAS.map((a) => {
          const sel = a.id === aba;
          return (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={sel}
              onClick={() => ir(a.id)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
            >
              {a.nome}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {aba === 'mensalidades' ? <Mensalidades aoMensagem={setMensagem} /> : null}
        {aba === 'membros' ? <Membros aoMandarCartao={mandarCartao} ocupado={ocupado} /> : null}
        {aba === 'planos' ? <Planos /> : null}
      </div>

      <Folha aberta={!!mensagem} aoFechar={() => setMensagem(null)} titulo={mensagem?.titulo ?? ''} descricao="Abra o WhatsApp do cliente com a mensagem pronta, ou copie.">
        {mensagem ? <MensagemPronta texto={mensagem.texto} whatsapp={mensagem.whatsapp} link={mensagem.link} /> : null}
      </Folha>
    </div>
  );
}

function Mensalidades({ aoMensagem }: { aoMensagem: (m: Mensagem) => void }) {
  const hoje = useHoje();
  const toast = useToast();
  const { ctx } = useGestao();
  const membros = useOficina((s) => s.clubeMembros);
  const planos = useOficina((s) => s.clubePlanos);
  const cobrancas = useOficina((s) => s.clubeCobrancas);
  const clientes = useOficina((s) => s.clientes);
  const [competencia, setCompetencia] = useState(competenciaDe(hoje));
  const [ocupado, setOcupado] = useState<Id | null>(null);
  const lista = useMemo(() => Object.values(cobrancas), [cobrancas]);
  const doMes = useMemo(() => lista.filter((c) => c.competencia === competencia).sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0)), [lista, competencia]);
  const paraGerar = useMemo(() => mensalidadesParaGerar(Object.values(membros), planos, lista, competencia), [membros, planos, lista, competencia]);
  const atrasadasDeOutrosMeses = useMemo(() => mensalidadesAtrasadas(lista, hoje).filter((c) => c.competencia !== competencia), [lista, hoje, competencia]);
  const totalDoMes = doMes.reduce((s, c) => s + c.valor, 0);
  const pagoNoMes = doMes.filter((c) => c.pagoEm).reduce((s, c) => s + c.valor, 0);

  function gerar() {
    const s = useOficina.getState();
    for (const c of paraGerar) s.salvarRegistro('clubeCobrancas', c);
    toast({ texto: `${plural(paraGerar.length, 'mensalidade gerada', 'mensalidades geradas')} de ${nomeDaCompetencia(competencia)}. Agora é mandar pelo WhatsApp.` });
  }

  function contexto(c: ClubeCobranca) {
    const s = useOficina.getState();
    const membro = s.clubeMembros[c.membroId];
    const plano = membro ? s.clubePlanos[membro.planoId] : undefined;
    const cliente = membro ? s.clientes[membro.clienteId] : undefined;
    return { s, membro, plano, cliente, recebedor: recebedorDaOficina(s.oficina) };
  }

  async function linkEPix(c: ClubeCobranca): Promise<{ url: string | null; pix: string } | null> {
    const { plano, recebedor } = contexto(c);
    if (!plano || !recebedor) return null;
    if (!ctx) return { url: null, pix: pixDaMensalidade(recebedor, c, plano) };
    setOcupado(c.id);
    const r = await linkDaMensalidade(ctx.sb, ctx.oficinaId, c.id, hoje);
    setOcupado(null);
    if (r?.erro) toast({ texto: `${r.erro} A mensagem vai só com o código Pix.`, tom: 'erro' });
    return r ? { url: r.url, pix: r.pix } : { url: null, pix: pixDaMensalidade(recebedor, c, plano) };
  }

  async function mandar(c: ClubeCobranca) {
    const { s, plano, cliente, recebedor } = contexto(c);
    if (!recebedor) return toast({ texto: 'Cadastre a chave Pix da oficina primeiro.', tom: 'erro' });
    if (!plano) return toast({ texto: 'O plano deste membro foi apagado.', tom: 'erro' });
    const r = await linkEPix(c);
    if (!r) return;
    const texto = mensagemDaMensalidade({ oficina: s.oficina.nome, cliente: cliente?.nome ?? '', plano: plano.nome, competencia: c.competencia, valor: c.valor, vencimento: c.vencimento, link: r.url, pix: r.pix });
    aoMensagem({ titulo: `Mensalidade de ${nomeDaCompetencia(c.competencia)}`, texto, whatsapp: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null, link: r.url });
  }

  async function lembrar(c: ClubeCobranca) {
    const { s, plano, cliente, recebedor } = contexto(c);
    if (!recebedor || !plano) return toast({ texto: 'Cadastre a chave Pix da oficina primeiro.', tom: 'erro' });
    const r = await linkEPix(c);
    if (!r) return;
    const texto = mensagemDeLembrete({ oficina: s.oficina.nome, cliente: cliente?.nome ?? '', plano: plano.nome, competencia: c.competencia, valor: c.valor, link: r.url, pix: r.pix });
    const atual = useOficina.getState().clubeCobrancas[c.id];
    if (atual) useOficina.getState().salvarRegistro('clubeCobrancas', { ...atual, lembradoEm: new Date().toISOString() });
    aoMensagem({ titulo: 'Lembrete da mensalidade', texto, whatsapp: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null, link: r.url });
  }

  function pagar(c: ClubeCobranca) {
    const nome = contexto(c).cliente?.nome ?? 'o membro';
    if (!window.confirm(`O Pix de ${formatarMoeda(c.valor)} de ${nome} caiu na conta da oficina?`)) return;
    marcarMensalidadePaga(c.id, hoje);
    // a página do Pix da mensalidade passa a mostrar "pago"
    if (ctx && c.link?.url) void linkDaMensalidade(ctx.sb, ctx.oficinaId, c.id, hoje).catch(() => {});
    toast({ texto: `${formatarMoeda(c.valor)} no caixa de hoje, na categoria clube.` });
  }

  function linha(c: ClubeCobranca) {
    const membro = membros[c.membroId];
    const cliente = membro ? clientes[membro.clienteId] : undefined;
    const plano = membro ? planos[membro.planoId] : undefined;
    const atrasada = mensalidadeAtrasada(c, hoje);
    return (
      <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5" data-mensalidade={c.id}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{cliente?.nome && cliente.nome !== SEM_NOME ? cliente.nome : 'Cliente sem nome'}</span>
          <span className="text-[13.5px] text-tinta-3">{plano?.nome ?? ''}</span>
          {c.pagoEm ? <Chip tom="ok">Paga em {formatarData(c.pagoEm)}</Chip> : atrasada ? <Chip tom="atraso">Atrasada</Chip> : <Chip>Em aberto</Chip>}
          <span className="num ml-auto font-extrabold">{formatarMoeda(c.valor)}</span>
        </div>
        <p className="text-[13.5px] text-tinta-2">
          {nomeDaCompetencia(c.competencia)} · vence em {formatarData(c.vencimento)}
          {c.link?.codigo ? ` · link ${c.link.codigo}` : ''}
          {c.lembradoEm ? ` · lembrado em ${formatarData(c.lembradoEm.slice(0, 10))}` : ''}
        </p>
        {!c.pagoEm ? (
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="pequeno" variante="whatsapp" onClick={() => void mandar(c)} disabled={ocupado === c.id}>
              <MessageCircle size={15} aria-hidden="true" /> Mandar
            </Botao>
            <Botao tamanho="pequeno" onClick={() => pagar(c)}>
              <Check size={15} aria-hidden="true" /> Marcar como paga
            </Botao>
            {atrasada ? (
              <Botao tamanho="pequeno" variante="fantasma" onClick={() => void lembrar(c)} disabled={ocupado === c.id}>
                <BellRing size={15} aria-hidden="true" /> Lembrar
              </Botao>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Botao tamanho="pequeno" variante="fantasma" onClick={() => setCompetencia(somarCompetencia(competencia, -1))} aria-label="Mês anterior">
          <ChevronLeft size={17} />
        </Botao>
        <span className="min-w-[160px] text-center font-bold capitalize">{nomeDaCompetencia(competencia)}</span>
        <Botao tamanho="pequeno" variante="fantasma" onClick={() => setCompetencia(somarCompetencia(competencia, 1))} aria-label="Próximo mês">
          <ChevronRight size={17} />
        </Botao>
        {doMes.length ? (
          <span className="num ml-auto text-[14px] text-tinta-2">
            Recebido {formatarMoeda(pagoNoMes)} de {formatarMoeda(totalDoMes)}
          </span>
        ) : null}
      </div>

      {paraGerar.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-oleo-claro px-4 py-3 text-oleo-tinta">
          <Sparkles size={18} aria-hidden="true" />
          <span className="min-w-0 flex-1 font-semibold">{plural(paraGerar.length, 'mensalidade para gerar', 'mensalidades para gerar')} em {nomeDaCompetencia(competencia)}.</span>
          <Botao variante="escuro" tamanho="pequeno" onClick={gerar}>
            Gerar as mensalidades
          </Botao>
        </div>
      ) : null}

      {doMes.length ? (
        <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha" aria-label={`Mensalidades de ${nomeDaCompetencia(competencia)}`}>
          {doMes.map((c) => linha(c))}
        </ul>
      ) : !paraGerar.length ? (
        <Vazio titulo={`Nenhuma mensalidade em ${nomeDaCompetencia(competencia)}`}>Com membros ativos no clube, as mensalidades do mês aparecem aqui para gerar.</Vazio>
      ) : null}

      {atrasadasDeOutrosMeses.length ? (
        <section className="flex flex-col gap-2.5" aria-labelledby="t-atrasadas">
          <h2 id="t-atrasadas" className="text-[19px]">
            Atrasadas de outros meses
          </h2>
          <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
            {atrasadasDeOutrosMeses.map((c) => linha(c))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
