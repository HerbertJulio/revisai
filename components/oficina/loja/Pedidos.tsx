'use client';

// Os pedidos depois de enviados, como nos apps de entrega: a situação da parte de cada loja, o Pix
// direto para a loja e o entregador no mapa. E o que está andando (alertas e pedidos) no topo da Loja.

import { BellRing, Check, ChevronRight, Copy, ExternalLink, History, MessageCircle, PackageCheck, RefreshCw, TriangleAlert, Truck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { avisarQuePaguei, codigoDoPix } from '@/app/oficina/acoes-loja';
import { Folha } from '@/components/Folha';
import { QrCode } from '@/components/QrCode';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Secao } from '@/components/ui';
import { dataLocal, formatarData, formatarDiaHora } from '@/lib/datas';
import {
  aCaminho,
  DIAS_DO_LINK,
  etapa,
  ETAPAS,
  haQuantoTempo,
  linkDoMapa,
  mapaEmbutido,
  pedidoEmAndamento,
  pixLiberado,
  pixTrocadoHaPouco,
  posicaoRecente,
  SITUACOES_PARA_OFICINA,
  textoDaMudanca,
  textoDoCancelamento,
  type ParteAcompanhada,
  type PedidoAcompanhado
} from '@/lib/entregas-dados';
import { formatarMoeda, plural } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { PedidoEnviado } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { faseVisivel, resumoDoAlerta } from './Alertas';
import { pedidoAcompanhavel, useAndamento } from './andamento';
import { BotaoEntrar } from './comum';
import { SeloDaLoja } from './reputacao';

/** A situação do pedido numa linha: a da loja, ou um resumo quando são várias. */
function resumoDoPedido(p: PedidoAcompanhado): { texto: string; tom: 'oleo' | 'caneta' | 'ok' | 'atraso' | 'neutro' } {
  if (!p.partes.length) return { texto: 'Pedido recebido', tom: 'oleo' };
  if (p.partes.length === 1) {
    const s = SITUACOES_PARA_OFICINA[p.partes[0].status];
    return { texto: s.nome, tom: s.tom };
  }
  const caminho = p.partes.filter((x) => x.status === 'saiu_entrega').length;
  const entregues = p.partes.filter((x) => x.status === 'entregue').length;
  if (caminho) return { texto: `${plural(caminho, 'loja a caminho', 'lojas a caminho')}`, tom: 'ok' };
  if (entregues === p.partes.length) return { texto: 'Tudo entregue', tom: 'neutro' };
  if (entregues) return { texto: `${entregues} de ${p.partes.length} lojas entregaram`, tom: 'caneta' };
  return { texto: `${p.partes.length} lojas preparando`, tom: 'oleo' };
}

// ---------------------------------------------------------------- topo da Loja

/** Os alertas esperando resposta e os pedidos que ainda não chegaram. */
export function EmAndamento({ aoAbrirAlerta, aoAbrirPedido }: { aoAbrirAlerta: (id: string) => void; aoAbrirPedido: (codigo: string) => void }) {
  const { alertas, pedidos } = useAndamento();
  const chaveRecebidos = useOficina((s) => s.pedidos.filter((p) => p.recebidoEm).map((p) => p.codigo).join(','));
  const agora = Date.now();
  const ativos = alertas.filter((a) => {
    const f = faseVisivel(a, agora);
    return f === 'esperando' || f === 'escolher';
  });
  // o pedido que já deu entrada no estoque chegou: sai daqui (continua em Pedidos)
  const recebidos = new Set(chaveRecebidos.split(','));
  const andando = Object.values(pedidos)
    .filter((p) => pedidoEmAndamento(p) && !recebidos.has(p.codigo))
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  if (!ativos.length && !andando.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="t-andamento">
      <h2 id="t-andamento" className="text-[17px] font-bold">
        Em andamento
      </h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {ativos.map((a) => {
          const escolher = faseVisivel(a, agora) === 'escolher' || a.respostas.some((r) => r.tipo !== 'recusa');
          return (
            <li key={a.id}>
              <button type="button" onClick={() => aoAbrirAlerta(a.id)} className="flex w-full items-center gap-3 rounded-2xl bg-papel px-4 py-3 text-left ring-1 ring-linha hover:ring-tinta-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${escolher ? 'bg-caneta-claro text-caneta' : 'bg-oleo-claro text-oleo-tinta'}`}>
                  <BellRing size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.titulo}</span>
                  <span className="block truncate text-[13.5px] text-tinta-2">{resumoDoAlerta(a)}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-tinta-3" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {andando.map((p) => {
          const r = resumoDoPedido(p);
          const caminho = p.partes.find((x) => aCaminho(x, agora));
          return (
            <li key={p.codigo}>
              <button type="button" onClick={() => aoAbrirPedido(p.codigo)} className="flex w-full items-center gap-3 rounded-2xl bg-papel px-4 py-3 text-left ring-1 ring-linha hover:ring-tinta-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${caminho ? 'bg-ok-claro text-ok' : 'bg-papel-2 text-tinta-2'}`}>
                  <Truck size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    Pedido <span className="num tracking-wider">{p.codigo}</span>
                    {p.partes.length === 1 ? <span className="font-normal text-tinta-3">, {p.partes[0].fornecedor}</span> : null}
                  </span>
                  <span className="block truncate text-[13.5px] text-tinta-2">
                    {r.texto}
                    {caminho?.entrega.posicao ? `, posição ${haQuantoTempo(caminho.entrega.posicao.em, Date.now())}` : caminho?.entrega.previsao ? `, chega ${caminho.entrega.previsao}` : ''}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-tinta-3" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- lista

/** O que a lista de pedidos mostra de cada um (o guardado no aparelho, ou só o que veio do banco). */
interface LinhaDePedido {
  codigo: string;
  quando: string;
  itens: number;
  total: number;
  combinado: boolean;
  recebido: boolean;
}

export function PedidosEnviados({ aoAbrir }: { aoAbrir: (codigo: string) => void }) {
  const enviados = useOficina((s) => s.pedidos);
  const { pedidos } = useAndamento();
  // os pedidos da oficina feitos em outro aparelho (que a sincronia ainda não trouxe) também entram
  const locais = new Set(enviados.map((p) => p.codigo));
  const linhas: LinhaDePedido[] = [
    ...enviados.map((p) => ({ codigo: p.codigo, quando: p.quando, itens: p.itens.length, total: p.total, combinado: !!p.alertaId, recebido: !!p.recebidoEm })),
    ...Object.values(pedidos)
      .filter((p) => !locais.has(p.codigo))
      .map((p) => ({
        codigo: p.codigo,
        quando: p.criadoEm,
        itens: p.partes.reduce((n, x) => n + x.itens.length, 0),
        total: p.total,
        combinado: p.partes.some((x) => x.itens.some((i) => i.combinado)),
        recebido: false
      }))
  ].sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
  if (!linhas.length) return null;
  return (
    <Secao titulo="Pedidos">
      <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
        {linhas.map((p) => {
          const acompanhado = pedidos[p.codigo];
          const r = acompanhado ? resumoDoPedido(acompanhado) : null;
          return (
            <li key={p.codigo}>
              <button type="button" onClick={() => aoAbrir(p.codigo)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-papel-2 sm:px-5">
                <Truck size={18} className="text-tinta-3" aria-hidden="true" />
                <span className="largo num font-extrabold tracking-wider">{p.codigo}</span>
                <span className="text-[14px] text-tinta-2">{formatarData(dataLocal(p.quando))}</span>
                <span className="text-[14px] text-tinta-2">{plural(p.itens, 'item', 'itens')}</span>
                {p.combinado ? <Chip tom="caneta">Preço combinado</Chip> : null}
                <span className="num ml-auto font-semibold">{formatarMoeda(p.total)}</span>
                {p.recebido ? <Chip tom="ok">No estoque</Chip> : r ? <Chip tom={r.tom}>{r.texto}</Chip> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

// ---------------------------------------------------------------- acompanhar

export function FolhaPedido({ codigo, aoFechar }: { codigo: string | null; aoFechar: () => void }) {
  const enviado = useOficina((s) => s.pedidos.find((p) => p.codigo === codigo));
  // o pedido entra na busca do acompanhamento (os dos últimos 45 dias)
  const acompanhavel = useOficina((s) => s.pedidos.some((p) => p.codigo === codigo && pedidoAcompanhavel(p)));
  const { pedidos, atualizar, pronto, buscados, erro, comConta } = useAndamento();
  const [atualizando, iniciar] = useTransition();
  const acompanhado = codigo ? pedidos[codigo] : undefined;
  // pedido que a última busca ainda não consultou (acabou de sair): carregando, não "pedido antigo"
  const carregando = comConta && !!codigo && !acompanhado && acompanhavel && (!pronto || !buscados.has(codigo)) && !erro;
  const pediuBusca = useRef<string | null>(null);
  useEffect(() => {
    if (carregando && pronto && codigo && pediuBusca.current !== codigo) {
      pediuBusca.current = codigo;
      void atualizar();
    }
  }, [carregando, pronto, codigo, atualizar]);
  if (!codigo || (!enviado && !acompanhado)) return <Folha aberta={false} aoFechar={aoFechar} titulo="">{null}</Folha>;
  const quando = enviado?.quando ?? acompanhado!.criadoEm;
  const total = acompanhado?.total ?? enviado!.total;
  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={`Pedido ${codigo}`}
      descricao={`Feito ${formatarDiaHora(quando)}, ${formatarMoeda(total)}.`}
      rodape={
        <div className="flex w-full items-center justify-between gap-2">
          {comConta ? (
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => iniciar(atualizar)} disabled={atualizando}>
              <RefreshCw size={15} aria-hidden="true" className={atualizando ? 'animate-spin' : ''} /> Atualizar
            </Botao>
          ) : (
            <span />
          )}
          <Botao variante="primario" onClick={aoFechar}>
            Fechar
          </Botao>
        </div>
      }
    >
      {acompanhado ? (
        <div className="flex flex-col gap-6">
          {acompanhado.partes.map((parte) => (
            <ParteDoPedido key={parte.id} codigo={codigo} parte={parte} recebido={!!enviado?.recebidoEm} varias={acompanhado.partes.length > 1} />
          ))}
        </div>
      ) : carregando ? (
        <div className="min-h-40" aria-busy="true" />
      ) : enviado ? (
        <SemAcompanhamento
          enviado={enviado}
          semConta={!comConta}
          motivo={comConta && acompanhavel && erro ? `Não deu para ver a situação deste pedido agora. ${erro} Toque em Atualizar para tentar de novo.` : undefined}
        />
      ) : null}
    </Folha>
  );
}

/** Pedido sem acompanhamento (feito antes da conta, de fora da oficina, ou sem conexão): mostra o que o app guardou. */
function SemAcompanhamento({ enviado, motivo, semConta }: { enviado: PedidoEnviado; motivo?: string; semConta: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1 rounded-xl bg-papel-2 px-3 py-2.5 text-[14px]">
        {enviado.itens.map((i) => (
          <li key={i.produtoId} className="flex justify-between gap-3">
            <span>
              <span className="num font-semibold">{i.quantidade}x</span> {i.nome}
            </span>
            <span className="num text-tinta-2">{formatarMoeda(i.precoUnitario * i.quantidade)}</span>
          </li>
        ))}
      </ul>
      {motivo ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14.5px] text-atraso" role="alert">
          {motivo}
        </p>
      ) : semConta ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-papel-2 px-4 py-3">
          <p className="max-w-[44ch] text-[14.5px] text-tinta-2">Para acompanhar os pedidos e pagar por Pix aqui, entre na sua conta. Os pedidos feitos sem conta a loja combina pelo WhatsApp.</p>
          <BotaoEntrar rotulo="Entrar" pequeno />
        </div>
      ) : (
        <p className="text-[14.5px] text-tinta-2">Este pedido foi feito antes do acompanhamento pela conta. A loja combina a entrega e o pagamento pelo WhatsApp.</p>
      )}
      {!enviado.recebidoEm ? (
        <Link href="/oficina/estoque" className="self-start text-[14.5px] font-semibold text-caneta hover:underline">
          Chegou? Dar entrada no estoque
        </Link>
      ) : null}
    </div>
  );
}

function ParteDoPedido({ codigo, parte, recebido, varias }: { codigo: string; parte: ParteAcompanhada; recebido: boolean; varias: boolean }) {
  const nomeOficina = useOficina((s) => s.oficina.nome);
  const situacao = SITUACOES_PARA_OFICINA[parte.status];
  const passo = etapa(parte.status);
  const agora = Date.now();
  const zap = parte.whatsapp ? linkWhatsApp(parte.whatsapp, `Olá! Aqui é da ${nomeOficina.trim() || 'oficina'}. É sobre o pedido ${codigo} que fiz pelo Revisaí.`) : null;
  return (
    <section className="flex flex-col gap-4" aria-label={`Parte da ${parte.fornecedor}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{parte.fornecedor}</p>
          <p className="num text-[14px] text-tinta-3">
            {varias ? `${formatarMoeda(parte.subtotal)}, ` : ''}atualizado {haQuantoTempo(parte.atualizadoEm, agora)}
          </p>
          <SeloDaLoja fornecedorId={parte.fornecedorId} compacto />
        </div>
        <Chip tom={situacao.tom}>{situacao.nome}</Chip>
      </div>

      {passo >= 0 ? (
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Etapas do pedido">
          {ETAPAS.map((e, i) => (
            <li key={e.id} className="flex flex-col gap-1.5">
              <span className={`h-1.5 rounded-full ${i <= passo ? (parte.status === 'entregue' ? 'bg-ok' : 'bg-tinta') : 'bg-linha'}`} />
              <span className={`text-[12px] ${i === passo ? 'font-bold text-tinta' : 'text-tinta-3'}`}>{e.nome}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso">
          {parte.cancelamento ? textoDoCancelamento(parte.cancelamento) : 'A loja cancelou esta parte do pedido.'} Fale com a loja se precisar.
        </p>
      )}

      {parte.status === 'saiu_entrega' ? <Entrega parte={parte} /> : null}
      {parte.status === 'entregue' && parte.entrega.entregueEm ? (
        <p className="flex items-center gap-2 text-[14.5px] text-ok">
          <PackageCheck size={18} aria-hidden="true" /> Entregue {formatarDiaHora(parte.entrega.entregueEm)}.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1 rounded-xl bg-papel-2 px-3 py-2.5 text-[14px]">
        {parte.itens.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span>
              <span className="num font-semibold">{i.quantidade}x</span> {i.nome}
              {i.combinado ? <span className="text-caneta"> (preço combinado)</span> : null}
            </span>
            <span className="num text-tinta-2">{formatarMoeda(Math.round(i.precoUnitario * i.quantidade * 100) / 100)}</span>
          </li>
        ))}
      </ul>

      {parte.status !== 'cancelado' ? <Pagamento parte={parte} /> : null}

      <div className="flex flex-wrap gap-2">
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-linha bg-papel px-3 text-sm font-semibold hover:border-tinta-3">
            <MessageCircle size={15} aria-hidden="true" /> Falar com a loja
          </a>
        ) : null}
        {(parte.status === 'entregue' || (parte.status === 'saiu_entrega' && !aCaminho(parte, agora))) && !recebido ? (
          <Link href="/oficina/estoque" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-tinta px-3 text-sm font-semibold text-papel hover:opacity-90">
            <PackageCheck size={15} aria-hidden="true" /> Dar entrada no estoque
          </Link>
        ) : null}
      </div>

      <HistoricoDaParte parte={parte} />
    </section>
  );
}

/** As mudanças da parte (quem confirmou, quando saiu, o pagamento), da mais nova para a mais antiga. */
function HistoricoDaParte({ parte }: { parte: ParteAcompanhada }) {
  if (!parte.historico.length) return null;
  const lista = [...parte.historico].reverse();
  return (
    <details className="group rounded-xl text-[14px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-semibold text-tinta-2 hover:text-tinta">
        <History size={15} aria-hidden="true" /> Histórico ({lista.length})
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5 border-l-2 border-linha pl-3">
        {lista.map((m, i) => (
          <li key={`${m.quando}-${i}`} className="flex flex-wrap gap-x-2">
            <span className="num text-tinta-3">{formatarDiaHora(m.quando)}</span>
            <span className="text-tinta-2">{textoDaMudanca(m)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Entrega({ parte }: { parte: ParteAcompanhada }) {
  const agora = Date.now();
  const pos = parte.entrega.posicao;
  const recente = posicaoRecente(pos, agora);
  if (!aCaminho(parte, agora))
    return (
      <p className="rounded-xl bg-papel-2 px-4 py-3 text-[14px] text-tinta-2">
        Saiu para entrega{parte.entrega.saiuEm ? ` ${formatarDiaHora(parte.entrega.saiuEm)}` : ''} e a loja não marcou como entregue em {DIAS_DO_LINK} dias. Se já chegou, dê entrada no estoque; se não, fale com a loja.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14.5px]">
        <span className="font-semibold">Saiu{parte.entrega.saiuEm ? ` ${formatarDiaHora(parte.entrega.saiuEm)}` : ''}</span>
        {parte.entrega.previsao ? <span className="text-tinta-2">, chega {parte.entrega.previsao}</span> : null}.
      </p>
      {pos && recente ? (
        <>
          <div className="overflow-hidden rounded-2xl ring-1 ring-linha">
            <iframe
              key={`${pos.lat},${pos.lng}`}
              title={`Onde está a entrega da ${parte.fornecedor}`}
              src={mapaEmbutido(pos.lat, pos.lng)}
              className="block h-[240px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-tinta-3">
            <span>
              Posição do entregador {haQuantoTempo(pos.em, agora)}
              {pos.precisao && pos.precisao > 150 ? `, com uns ${Math.round(pos.precisao)} m de erro` : ''}. Mapa do OpenStreetMap.
            </span>
            <a href={linkDoMapa(pos.lat, pos.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-caneta hover:underline">
              Abrir no mapa <ExternalLink size={13} aria-hidden="true" />
            </a>
          </p>
        </>
      ) : (
        <p className="rounded-xl bg-papel-2 px-4 py-3 text-[14px] text-tinta-2">O mapa aparece quando o entregador abrir o link da entrega no celular.</p>
      )}
    </div>
  );
}

function Pagamento({ parte }: { parte: ParteAcompanhada }) {
  const toast = useToast();
  const { atualizar, ajustarParte } = useAndamento();
  const [pix, setPix] = useState<{ codigo: string; valor: number; recebedor: string; trocadaEm: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();

  if (parte.pagamento === 'confirmado')
    return (
      <p className="flex items-center gap-2 rounded-xl bg-ok-claro px-4 py-3 text-[14.5px] font-semibold text-ok">
        <Check size={18} aria-hidden="true" /> A loja confirmou o pagamento.
      </p>
    );
  if (parte.pagamento === 'informado')
    return (
      <p className="rounded-xl bg-papel-2 px-4 py-3 text-[14.5px] text-tinta-2">
        Você avisou que pagou{parte.pagamentoEm ? ` ${formatarDiaHora(parte.pagamentoEm)}` : ''}. A loja confere no extrato e confirma.
      </p>
    );
  if (!parte.pix) return <p className="text-[14px] text-tinta-3">Esta loja ainda não aceita Pix pelo app. Combine o pagamento com ela.</p>;
  // só paga depois que a loja confirma que tem o produto e o preço
  if (!pixLiberado(parte.status)) return <p className="text-[14px] text-tinta-3">O Pix aparece aqui quando a loja confirmar o pedido.</p>;

  function abrir() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await codigoDoPix({ parteId: parte.id });
        if (!r.ok) return setErro(r.erro);
        setPix({ codigo: r.codigo, valor: r.valor, recebedor: r.recebedor, trocadaEm: r.trocadaEm });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function paguei() {
    iniciar(async () => {
      try {
        const r = await avisarQuePaguei({ parteId: parte.id });
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        toast({ texto: 'Avisamos a loja que você pagou.' });
        setPix(null);
        ajustarParte(parte.id, { pagamento: 'informado', pagamentoEm: new Date().toISOString() });
        void atualizar();
      } catch {
        toast({ texto: 'Sem conexão. Tente de novo.', tom: 'erro' });
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Código Pix copiado. Cole no app do banco, em Pix copia e cola.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o código e copie.', tom: 'erro' });
    }
  }

  if (!pix)
    return (
      <div className="flex flex-col items-start gap-2">
        <Botao variante="escuro" onClick={abrir} disabled={carregando}>
          {carregando ? 'Gerando o Pix…' : `Pagar ${formatarMoeda(parte.subtotal)} com Pix`}
        </Botao>
        <p className="text-[13px] text-tinta-3">O dinheiro vai direto para a conta da loja. O Revisaí não passa pelo pagamento.</p>
        {erro ? (
          <p className="text-[14px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-papel-2 px-4 py-5 text-center">
      <p className="text-[14.5px]">
        Pix de <strong className="num">{formatarMoeda(pix.valor)}</strong> para <strong>{pix.recebedor}</strong>
      </p>
      {pixTrocadoHaPouco(pix.trocadaEm, Date.now()) ? (
        <p className="flex max-w-[40ch] items-start gap-2 rounded-xl bg-oleo-claro px-3 py-2 text-left text-[13.5px] text-oleo-tinta">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            A {parte.fornecedor} trocou a chave Pix {pix.trocadaEm ? formatarDiaHora(pix.trocadaEm) : 'há pouco'}. Confira se quem recebe é a loja antes de pagar e, na dúvida, fale com ela.
          </span>
        </p>
      ) : null}
      <QrCode texto={pix.codigo} rotulo={`QR Code do Pix de ${formatarMoeda(pix.valor)} para ${pix.recebedor}`} className="h-56 w-56 rounded-xl bg-white p-1" />
      <p className="max-w-[34ch] text-[13px] text-tinta-3">Abra o app do banco e leia o QR Code, ou copie o código e use o Pix copia e cola.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Botao variante="secundario" onClick={() => void copiar(pix.codigo)}>
          <Copy size={16} aria-hidden="true" /> Copiar o código
        </Botao>
        <Botao variante="primario" onClick={paguei} disabled={carregando}>
          <Check size={16} aria-hidden="true" /> Já paguei
        </Botao>
      </div>
    </div>
  );
}
