'use client';

// Os pedidos da loja: a parte de cada pedido que é dela. A loja anda com o pedido para a frente
// (em contato, confirmado, saiu, entregue) ou cancela dizendo o motivo, confirma o Pix que a oficina
// avisou que pagou e manda o link da entrega (a oficina vê o entregador no mapa). Cada mudança fica
// no histórico do pedido, que a oficina também vê.

import { Check, ChevronDown, Copy, History, KeyRound, MapPin, MessageCircle, Send, Truck, X } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { confirmarPagamentoDoPedido, marcarSaida, mudarSituacaoDoPedido } from '@/app/fornecedor/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import { formatarDiaHora, formatarHora } from '@/lib/datas';
import { haQuantoTempo, mensagemDoEntregador, mensagemSaiu } from '@/lib/entregas-dados';
import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import { contarPor, FUSO, MOTIVOS_CANCELAMENTO, proximasSituacoes, quandoFoi } from '@/lib/loja/comum';
import type { MudancaDoPedido, PedidoDaLoja, ResumoPix } from '@/lib/loja/dados';
import { SITUACOES_PAGAMENTO, SITUACOES_PARTE, type SituacaoParte } from '@/lib/marketplace-dados';
import { formatarChavePix } from '@/lib/pix';
import { valorDaComissao } from '@/lib/planos-fornecedor';
import { linkWhatsApp } from '@/lib/whatsapp';
import { ChipSituacao, Filtro, LinhaDeFiltros } from './comum';

type FiltroPedido = 'abertos' | SituacaoParte;
type Mudanca = { id: number; status?: SituacaoParte; pagamento?: PedidoDaLoja['pagamento'] };

const NOME_SITUACAO = Object.fromEntries(SITUACOES_PARTE.map((s) => [s.id, s.nome])) as Record<SituacaoParte, string>;
const NOME_PAGAMENTO = Object.fromEntries(SITUACOES_PAGAMENTO.map((s) => [s.id, s.nome])) as Record<string, string>;
const QUEM: Record<MudancaDoPedido['quem'], string> = { loja: 'pela loja', oficina: 'pela oficina', equipe: 'pela equipe do Revisaí', entregador: 'pelo entregador', sistema: 'pelo sistema' };
const TIPOS_PIX: Record<string, string> = { cnpj: 'CNPJ', cpf: 'CPF', telefone: 'celular', email: 'e-mail', aleatoria: 'chave aleatória' };

/** Os nomes das situações para onde a loja pode levar o pedido, como o seletor mostra. */
const NOME_ACAO: Partial<Record<SituacaoParte, string>> = {
  em_contato: 'Em contato com a oficina',
  confirmado: 'Confirmado',
  saiu_entrega: 'Saiu para entrega…',
  entregue: 'Entregue',
  cancelado: 'Cancelar o pedido…'
};

export function PedidosDaLoja({ pedidos, loja, pix }: { pedidos: PedidoDaLoja[]; loja: string; pix: ResumoPix | null }) {
  const [filtro, setFiltro] = useState<FiltroPedido>('abertos');
  const [lista, mudarOtimista] = useOptimistic(pedidos, (atual, m: Mudanca) =>
    atual.map((p) => (p.id === m.id ? { ...p, ...(m.status ? { status: m.status } : {}), ...(m.pagamento ? { pagamento: m.pagamento } : {}) } : p))
  );
  const contagem = contarPor(lista, (p) => p.status);
  const abertos = lista.filter((p) => p.status === 'novo' || p.status === 'em_contato' || p.status === 'confirmado' || p.status === 'saiu_entrega');
  const visiveis = filtro === 'abertos' ? abertos : lista.filter((p) => p.status === filtro);
  const temPix = pix?.tem ?? false;

  return (
    <div className="flex flex-col gap-5">
      <LinhaDoPix pix={pix} />
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
          {visiveis.map((p) => (
            <li key={p.id}>
              <CartaoDoPedido pedido={p} loja={loja} temPix={temPix} mudarOtimista={mudarOtimista} />
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo={filtro === 'abertos' ? 'Nenhum pedido em aberto' : 'Nenhum pedido aqui'}>Quando uma oficina pedir um produto seu pela loja do Revisaí, o pedido aparece aqui com o WhatsApp dela.</Vazio>
      )}
    </div>
  );
}

function CartaoDoPedido({ pedido: p, loja, temPix, mudarOtimista }: { pedido: PedidoDaLoja; loja: string; temPix: boolean; mudarOtimista: (m: Mudanca) => void }) {
  const toast = useToast();
  const [, iniciar] = useTransition();
  const [painel, setPainel] = useState<'saida' | 'cancelar' | null>(null);
  const agora = Date.now();
  const s = SITUACOES_PARTE.find((x) => x.id === p.status)!;
  const pg = SITUACOES_PAGAMENTO.find((x) => x.id === p.pagamento)!;
  const terminado = p.status === 'entregue' || p.status === 'cancelado';
  const proximas = proximasSituacoes(p.status);
  const whatsapp = linkWhatsApp(
    p.oficina.whatsapp,
    `Olá, ${p.oficina.nome}! Aqui é da ${loja}. Recebi o seu pedido ${p.codigo} pelo Revisaí (${p.itens.map((i) => `${i.quantidade}x ${i.nome}`).join('; ')}), total ${formatarMoeda(p.subtotal)}. Vamos combinar a entrega?`
  );

  function mudar(status: SituacaoParte, motivo?: string) {
    iniciar(async () => {
      mudarOtimista({ id: p.id, status });
      try {
        const r = await mudarSituacaoDoPedido(p.id, status, motivo);
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
        else if (status === 'cancelado') toast({ texto: `Pedido ${p.codigo} cancelado. A oficina vê o motivo no app.` });
        else if (status === 'entregue') toast({ texto: `Pedido ${p.codigo} entregue.` });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. A situação não mudou.', tom: 'erro' });
      }
    });
  }

  function pagamento(confirmado: boolean) {
    iniciar(async () => {
      mudarOtimista({ id: p.id, pagamento: confirmado ? 'confirmado' : 'pendente' });
      try {
        const r = await confirmarPagamentoDoPedido(p.id, confirmado);
        if (!r.ok) toast({ texto: r.erro, tom: 'erro' });
        else toast({ texto: confirmado ? 'Pagamento confirmado. A oficina vê no app.' : 'Pagamento voltou para a combinar.' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Nada mudou.', tom: 'erro' });
      }
    });
  }

  function escolher(v: SituacaoParte) {
    if (v === p.status) return;
    if (v === 'cancelado') return setPainel('cancelar');
    if (v === 'saiu_entrega') return setPainel('saida');
    mudar(v);
  }

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-label={`Pedido ${p.codigo}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="largo num font-extrabold tracking-wider">{p.codigo}</p>
            <ChipSituacao nome={s.nome} tom={s.tom} />
            {p.itens.some((i) => i.combinado) ? <ChipSituacao nome="Preço do alerta" tom="caneta" /> : null}
          </div>
          <p className="mt-0.5 font-semibold">{p.oficina.nome}</p>
          <p className="text-[13.5px] text-tinta-3">
            {[[p.oficina.cidade, p.oficina.uf].filter(Boolean).join(', '), formatarTelefone(p.oficina.whatsapp), quandoFoi(p.criadoEm, agora)].filter(Boolean).join(', ')}
          </p>
          {p.oficina.endereco ? (
            <p className="mt-0.5 flex items-center gap-1 text-[13.5px] text-tinta-2">
              <MapPin size={14} aria-hidden="true" /> {p.oficina.endereco}
            </p>
          ) : null}
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
              {i.combinado ? <span className="text-caneta"> (preço combinado)</span> : null}
            </span>
            <span className="num text-tinta-2">{formatarMoeda(i.preco_unitario * i.quantidade)}</span>
          </li>
        ))}
      </ul>
      {p.observacao ? <p className="text-[14px] text-tinta-2">Observação da oficina: {p.observacao}</p> : null}

      {p.cancelamento ? (
        <p className="rounded-xl bg-atraso-claro px-3.5 py-2.5 text-[14px] text-atraso">
          Cancelado {p.cancelamento.por ? QUEM[p.cancelamento.por] : ''}
          {p.cancelamento.motivo ? `: ${p.cancelamento.motivo}` : '.'}
        </p>
      ) : null}

      {p.status !== 'cancelado' ? (
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <ChipSituacao nome={pg.nome} tom={pg.tom} />
          {p.pagamento === 'informado' && p.pagamentoEm ? <span className="text-tinta-3">{formatarDiaHora(p.pagamentoEm, new Date(), FUSO)}. Confira no extrato.</span> : null}
          {p.pagamento !== 'confirmado' ? (
            <Botao tamanho="pequeno" variante={p.pagamento === 'informado' ? 'escuro' : 'secundario'} onClick={() => pagamento(true)}>
              <Check size={15} aria-hidden="true" /> Confirmar pagamento
            </Botao>
          ) : (
            <button type="button" onClick={() => pagamento(false)} className="text-[13px] font-semibold text-tinta-3 hover:text-atraso">
              Desfazer
            </button>
          )}
        </div>
      ) : null}

      {p.status === 'novo' || p.status === 'em_contato' ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-oleo-claro/60 px-3.5 py-2.5">
          <Botao tamanho="pequeno" variante="escuro" onClick={() => mudar('confirmado')}>
            <Check size={15} aria-hidden="true" /> Confirmar pedido
          </Botao>
          <span className="text-[13.5px] text-tinta-2">
            {temPix ? 'Tem o produto e o preço? Ao confirmar, a oficina vê o seu Pix e pode pagar pelo app.' : 'Tem o produto e o preço? Confirme para a oficina saber.'}
          </span>
        </div>
      ) : null}

      {painel === 'cancelar' ? <Cancelamento codigo={p.codigo} aoCancelar={(motivo) => (setPainel(null), mudar('cancelado', motivo))} aoVoltar={() => setPainel(null)} /> : null}
      {!terminado && (p.status === 'confirmado' || p.status === 'saiu_entrega') && painel !== 'cancelar' ? (
        <SaidaParaEntrega pedido={p} loja={loja} aberto={painel === 'saida'} aoAbrir={(v) => setPainel(v ? 'saida' : null)} aoEntregar={() => mudar('entregue')} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')} onClick={() => p.status === 'novo' && mudar('em_contato')}>
            <MessageCircle size={16} aria-hidden="true" /> Chamar no WhatsApp
          </a>
        ) : null}
        {proximas.length ? (
          <label className="ml-auto flex items-center gap-2 text-[14px] font-semibold text-tinta-2">
            <span className="max-sm:sr-only">Situação</span>
            <select
              aria-label={`Situação do pedido ${p.codigo}`}
              value={p.status}
              onChange={(e) => escolher(e.target.value as SituacaoParte)}
              className="h-10 min-w-0 rounded-[10px] border border-linha bg-papel pr-8 pl-3 text-[16px] font-semibold text-tinta outline-none focus:border-caneta focus:ring-3 focus:ring-caneta/20 sm:h-9 sm:text-[14px]"
            >
              <option value={p.status}>{NOME_SITUACAO[p.status]}</option>
              {proximas.map((x) => (
                <option key={x} value={x}>
                  {x === 'confirmado' && p.status === 'saiu_entrega' ? 'Voltou para a loja (confirmado)' : NOME_ACAO[x]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {p.historico.length ? <Historico historico={p.historico} agora={agora} /> : null}
    </article>
  );
}

/** O motivo do cancelamento: a oficina vê no app, e ele conta na reputação da loja. */
function Cancelamento({ codigo, aoCancelar, aoVoltar }: { codigo: string; aoCancelar: (motivo: string) => void; aoVoltar: () => void }) {
  const [escolhido, setEscolhido] = useState<string>('');
  const [outro, setOutro] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const motivo = escolhido === 'outro' ? outro.trim() : escolhido;

  function confirmar() {
    if (!motivo) return setErro(escolhido === 'outro' ? 'Escreva o motivo.' : 'Escolha o motivo.');
    aoCancelar(motivo.slice(0, 200));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl bg-atraso-claro/60 p-3.5">
      <legend className="sr-only">Cancelar o pedido {codigo}</legend>
      <p className="text-[14.5px] font-semibold">Por que cancelar o pedido {codigo}?</p>
      <p className="-mt-2 text-[13px] text-tinta-2">A oficina vê o motivo. Pedidos cancelados pela loja contam na reputação que as oficinas veem.</p>
      <div className="flex flex-col gap-1.5">
        {[...MOTIVOS_CANCELAMENTO, 'outro'].map((m) => (
          <label key={m} className="flex items-center gap-2.5 text-[14.5px]">
            <input type="radio" name={`motivo-${codigo}`} value={m} checked={escolhido === m} onChange={() => (setEscolhido(m), setErro(null))} className="h-4 w-4 accent-[var(--color-tinta)]" />
            {m === 'outro' ? 'Outro motivo' : m}
          </label>
        ))}
      </div>
      {escolhido === 'outro' ? (
        <Campo rotulo="Qual o motivo?" htmlFor={`outro-${codigo}`}>
          <input id={`outro-${codigo}`} className={classeEntrada} value={outro} onChange={(e) => setOutro(e.target.value)} maxLength={200} autoFocus />
        </Campo>
      ) : null}
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="fantasma" tamanho="pequeno" onClick={aoVoltar}>
          Voltar
        </Botao>
        <Botao variante="perigo" tamanho="pequeno" onClick={confirmar}>
          <X size={15} aria-hidden="true" /> Cancelar o pedido
        </Botao>
      </div>
    </fieldset>
  );
}

function Historico({ historico, agora }: { historico: MudancaDoPedido[]; agora: number }) {
  return (
    <details className="group rounded-xl bg-papel-2/60 px-3.5 py-2 text-[13.5px]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-tinta-2 hover:text-tinta">
        <History size={15} aria-hidden="true" /> Histórico ({historico.length})
        <ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" />
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5 border-l-2 border-linha pl-3">
        {[...historico].reverse().map((h, i) => (
          <li key={`${h.quando}-${i}`}>
            <span className="text-tinta-3">{quandoFoi(h.quando, agora)}</span>{' '}
            {h.campo === 'status' ? (
              <>
                <strong>{h.para ? (NOME_SITUACAO[h.para as SituacaoParte] ?? h.para) : '?'}</strong> {QUEM[h.quem]}
              </>
            ) : (
              <>
                <strong>{h.para ? (NOME_PAGAMENTO[h.para] ?? h.para) : '?'}</strong> {QUEM[h.quem]}
              </>
            )}
            {h.motivo ? <span className="text-tinta-2">: {h.motivo}</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** "Saiu para entrega": gera o link do entregador. A posição aparece para a oficina no mapa. */
function SaidaParaEntrega({ pedido: p, loja, aberto, aoAbrir, aoEntregar }: { pedido: PedidoDaLoja; loja: string; aberto: boolean; aoAbrir: (v: boolean) => void; aoEntregar: () => void }) {
  const toast = useToast();
  const [previsao, setPrevisao] = useState(p.entrega.previsao ?? '');
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const saiu = p.status === 'saiu_entrega';
  const agora = Date.now();

  function gerar() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await marcarSaida(p.id, previsao);
        if (!r.ok) return setErro(r.erro);
        aoAbrir(false);
        setLink(`${window.location.origin}/entrega/${r.token}`);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Link copiado.' });
    } catch {
      toast({ texto: 'Não deu para copiar. Selecione o link e copie.', tom: 'erro' });
    }
  }

  if (link) {
    const paraEntregador = mensagemDoEntregador({ loja, codigo: p.codigo, oficina: p.oficina.nome, endereco: p.oficina.endereco, link });
    const avisarOficina = linkWhatsApp(p.oficina.whatsapp, mensagemSaiu({ loja, codigo: p.codigo, oficina: p.oficina.nome, previsao: previsao.trim() || null, total: p.subtotal }));
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-ok-claro/60 p-3.5">
        <p className="text-[14.5px] font-semibold">Mande este link para quem vai entregar. Com ele aberto no celular, a oficina vê a entrega no mapa. Ele só aparece agora.</p>
        <p className="num rounded-lg bg-papel px-3 py-2 text-[13px] break-all text-tinta-2">{link}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(paraEntregador)}`} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
            <Send size={15} aria-hidden="true" /> Mandar para o entregador
          </a>
          <Botao tamanho="pequeno" onClick={() => void copiar(link)}>
            <Copy size={15} aria-hidden="true" /> Copiar o link
          </Botao>
          <a href={link} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
            Eu mesmo vou entregar
          </a>
          {avisarOficina ? (
            <a href={avisarOficina} target="_blank" rel="noopener noreferrer" className={classeBotao('fantasma', 'pequeno')}>
              <MessageCircle size={15} aria-hidden="true" /> Avisar a oficina
            </a>
          ) : null}
        </div>
        <button type="button" onClick={() => setLink(null)} className="self-start text-[13px] font-semibold text-tinta-3 hover:text-tinta">
          Fechar
        </button>
      </div>
    );
  }

  if (saiu && !aberto)
    return (
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <Truck size={17} className="text-ok" aria-hidden="true" />
        <span>
          Saiu{p.entrega.saiuEm ? ` às ${formatarHora(p.entrega.saiuEm, FUSO)}` : ''}
          {p.entrega.previsao ? `, chega ${p.entrega.previsao}` : ''}
          {p.entrega.posicaoEm ? `. Posição do entregador ${haQuantoTempo(p.entrega.posicaoEm, agora)}` : '. O entregador ainda não abriu o link'}.
        </span>
        <Botao tamanho="pequeno" variante="escuro" onClick={aoEntregar}>
          <Check size={15} aria-hidden="true" /> Entregue
        </Botao>
        <button type="button" onClick={() => aoAbrir(true)} className="text-[13px] font-semibold text-caneta hover:underline">
          Link novo para o entregador
        </button>
      </div>
    );

  if (!aberto)
    return (
      <Botao tamanho="pequeno" onClick={() => aoAbrir(true)} className="self-start">
        <Truck size={15} aria-hidden="true" /> Saiu para entrega
      </Botao>
    );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel-2 p-3.5">
      <Campo rotulo="Quando chega" htmlFor={`prev-${p.id}`} dica="Ex.: hoje até 16h. A oficina vê no app.">
        <input id={`prev-${p.id}`} className={classeEntrada} value={previsao} onChange={(e) => setPrevisao(e.target.value)} maxLength={40} />
      </Campo>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Botao variante="fantasma" tamanho="pequeno" onClick={() => aoAbrir(false)}>
          Voltar
        </Botao>
        <Botao variante="primario" tamanho="pequeno" onClick={gerar} disabled={enviando}>
          {enviando ? 'Gerando…' : saiu ? 'Gerar link novo' : 'Marcar a saída e gerar o link'}
        </Botao>
      </div>
      {saiu ? <p className="text-[13px] text-tinta-3">O link antigo para de funcionar.</p> : null}
    </div>
  );
}

/** Uma linha sobre o Pix no topo dos pedidos: o dono vê a chave; o vendedor, se a loja recebe. */
function LinhaDoPix({ pix }: { pix: ResumoPix | null }) {
  if (!pix) return null;
  const dono = pix.dono;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-papel px-4 py-3.5 ring-1 ring-linha sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
          <KeyRound size={19} aria-hidden="true" />
        </span>
        <p className="min-w-0 text-[14.5px]">
          {dono && pix.atual ? (
            <>
              <span className="font-semibold">Pix pelo app ligado.</span>{' '}
              <span className="text-tinta-2">
                Chave {TIPOS_PIX[pix.atual.tipo]} {formatarChavePix(pix.atual.tipo, pix.atual.chave)}, em nome de {pix.atual.nome}.
                {pix.troca ? ` Troca pedida: vale ${formatarDiaHora(pix.troca.valeEm, new Date(), FUSO)}.` : ''}
              </span>
            </>
          ) : dono ? (
            <>
              <span className="font-semibold">Receba por Pix pelo app.</span> <span className="text-tinta-2">A oficina paga com o QR Code do valor do pedido, direto na conta da loja, e você confirma aqui.</span>
            </>
          ) : pix.tem ? (
            <>
              <span className="font-semibold">A loja recebe por Pix pelo app.</span> <span className="text-tinta-2">A chave fica com o dono da loja.</span>
            </>
          ) : (
            <>
              <span className="font-semibold">A loja ainda não tem chave Pix.</span> <span className="text-tinta-2">Peça para o dono cadastrar em Sua loja: assim a oficina paga pelo app.</span>
            </>
          )}
        </p>
      </div>
      {dono ? (
        <Link href="/fornecedor/conta#pix" className={classeBotao(pix.atual ? 'secundario' : 'escuro', 'pequeno')}>
          {pix.atual ? 'Ver a chave' : 'Cadastrar a chave Pix'}
        </Link>
      ) : null}
    </div>
  );
}
