'use client';

// Garantia e devolução, do lado da oficina: pedir de uma compra entregue (até 90 dias depois da
// entrega), com o motivo, os itens que voltam e até 6 fotos; ver a resposta da loja; responder quando
// a loja pergunta (mudando o pedido), desistir enquanto está aberto e confirmar quando a loja
// resolveu. A loja recebe o aviso no WhatsApp; a resposta dela chega pelo tempo real.

import { Camera, MessageCircle, RotateCcw, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { confirmarDevolucao, desistirDevolucao, fotoParaDevolucao, mudarDevolucao, pedirDevolucao } from '@/app/oficina/acoes-loja';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, classeArea } from '@/components/ui';
import { formatarData, formatarDiaHora } from '@/lib/datas';
import { itensParaDevolver, podePedirDevolucao, situacaoDaDevolucao, type ParteAcompanhada } from '@/lib/entregas-dados';
import { reduzirFoto } from '@/lib/imagem-cliente';
import { TIPOS_DEVOLUCAO, type Devolucao, type TipoDevolucao } from '@/lib/loja/dados';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useAndamento } from './andamento';
import { Passo } from './comum';

const MAXIMO_DE_FOTOS = 6;
const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo.';

/** O que a folha do pedido de garantia ou devolução abre: um pedido novo de uma compra, ou um que já existe. */
export type AberturaDaDevolucao = { parte: ParteAcompanhada; codigo: string } | { devolucao: Devolucao; parte?: ParteAcompanhada };

interface FotoNoPedido {
  caminho: string;
  /** Para mostrar: a do próprio site (a já guardada) ou a do aparelho (a nova). */
  url: string;
}

// ---------------------------------------------------------------- na compra

/** Os pedidos de garantia ou devolução de uma compra e o botão de pedir (quando dá). */
export function DevolucoesDaParte({ parte, codigo, aoAbrir }: { parte: ParteAcompanhada; codigo: string; aoAbrir: (a: AberturaDaDevolucao) => void }) {
  const { devolucoes, comConta } = useAndamento();
  if (!comConta) return null;
  const daParte = devolucoes.filter((d) => d.parteId === parte.id);
  const pode = podePedirDevolucao(parte, daParte, Date.now());
  if (!daParte.length && !pode.pode && !pode.motivo) return null;
  return (
    <div className="flex flex-col gap-2">
      {daParte.map((d) => (
        <CartaoDevolucao key={d.id} d={d} aoAbrir={aoAbrir} parte={parte} compacto />
      ))}
      {pode.pode ? (
        <button
          type="button"
          onClick={() => aoAbrir({ parte, codigo })}
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-[10px] border border-linha bg-papel px-3 text-sm font-semibold hover:border-tinta-3"
        >
          <RotateCcw size={15} aria-hidden="true" /> Pedir garantia ou devolução
        </button>
      ) : pode.motivo ? (
        <p className="text-[13px] text-tinta-3">{pode.motivo}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- na Loja

/** Todos os pedidos de garantia ou devolução da oficina, com a resposta de cada loja. */
export function ListaDeDevolucoes({ aoAbrir, aoAbrirPedido }: { aoAbrir: (a: AberturaDaDevolucao) => void; aoAbrirPedido: (codigo: string) => void }) {
  const { devolucoes, pedidos, comConta } = useAndamento();
  if (!comConta || !devolucoes.length) return null;
  const partes = new Map(Object.values(pedidos).flatMap((p) => p.partes.map((x) => [x.id, x] as const)));
  return (
    <Secao titulo="Garantia e devolução" descricao="Os pedidos que você fez às lojas e o que cada uma respondeu.">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {devolucoes.map((d) => (
          <li key={d.id}>
            <CartaoDevolucao d={d} parte={partes.get(d.parteId)} aoAbrir={aoAbrir} aoAbrirPedido={aoAbrirPedido} />
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function CartaoDevolucao({
  d,
  parte,
  aoAbrir,
  aoAbrirPedido,
  compacto = false
}: {
  d: Devolucao;
  parte?: ParteAcompanhada;
  aoAbrir: (a: AberturaDaDevolucao) => void;
  aoAbrirPedido?: (codigo: string) => void;
  compacto?: boolean;
}) {
  const toast = useToast();
  const { atualizar, ajustarDevolucao } = useAndamento();
  const [ocupado, iniciar] = useTransition();
  const [desistindo, setDesistindo] = useState(false);
  const s = situacaoDaDevolucao(d);
  const itens = d.itens.length ? d.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ') : 'A compra toda';
  const zap = d.loja.whatsapp ? linkWhatsApp(d.loja.whatsapp, `Olá! É sobre o pedido de ${TIPOS_DEVOLUCAO[d.tipo].toLowerCase()} da compra ${d.codigo ?? ''} que fiz pelo Revisaí.`) : null;

  function desistir() {
    iniciar(async () => {
      try {
        const r = await desistirDevolucao(d.id);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        ajustarDevolucao(d.id, null);
        toast({ texto: 'Pedido cancelado. A loja não precisa mais responder.' });
        void atualizar();
      } catch {
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  function confirmar() {
    iniciar(async () => {
      try {
        const r = await confirmarDevolucao(d.id);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        ajustarDevolucao(d.id, { situacao: 'resolvida', resolvidaEm: new Date().toISOString() });
        toast({ texto: 'Pronto: o pedido ficou como resolvido.' });
        void atualizar();
      } catch {
        toast({ texto: SEM_CONEXAO, tom: 'erro' });
      }
    });
  }

  return (
    <article className={`flex flex-col gap-2.5 rounded-2xl bg-papel ring-1 ring-linha ${compacto ? 'px-3.5 py-3' : 'h-full px-4 py-4'}`} aria-label={`${TIPOS_DEVOLUCAO[d.tipo]} da compra ${d.codigo ?? ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">
            {TIPOS_DEVOLUCAO[d.tipo]}
            {compacto ? '' : <span className="font-normal text-tinta-3">, {d.loja.nome ?? 'loja'}</span>}
          </p>
          <p className="text-[13px] text-tinta-3">
            {d.codigo ? <span className="num tracking-wider">{d.codigo}</span> : null}
            {d.codigo ? ', ' : ''}pedido em {formatarData(d.criadoEm)}
          </p>
        </div>
        <Chip tom={s.tom}>{s.nome}</Chip>
      </div>
      <p className="text-[14px] text-tinta-2">
        <span className="font-semibold text-tinta">{itens}.</span> {d.motivo}
      </p>
      {d.fotos.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Fotos">
          {d.fotos.map((f) => (
            <li key={f.caminho}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-linha">
                <img src={f.url} alt="Foto do pedido" className="h-14 w-14 object-cover" loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {d.resposta ? (
        <div className={`rounded-xl px-3.5 py-2.5 text-[14px] ${d.situacao === 'recusada' ? 'bg-atraso-claro text-atraso' : 'bg-papel-2 text-tinta-2'}`}>
          <p className="text-[12.5px] font-semibold">
            {d.loja.nome ?? 'A loja'}
            {d.respondidaEm ? `, ${formatarDiaHora(d.respondidaEm)}` : ''}
          </p>
          <p>{d.resposta}</p>
        </div>
      ) : null}
      {d.situacao === 'aceita' ? <p className="text-[13.5px] text-tinta-2">Combine com a loja a troca ou o reembolso. Quando estiver resolvido, confirme aqui.</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {s.acao === 'responder' ? (
          <Botao tamanho="pequeno" variante="escuro" onClick={() => aoAbrir({ devolucao: d, parte })} disabled={ocupado}>
            Responder à loja
          </Botao>
        ) : d.situacao === 'aberta' ? (
          <Botao tamanho="pequeno" onClick={() => aoAbrir({ devolucao: d, parte })} disabled={ocupado}>
            Mudar o pedido
          </Botao>
        ) : null}
        {s.acao === 'confirmar' ? (
          <Botao tamanho="pequeno" variante="escuro" onClick={confirmar} disabled={ocupado}>
            Já resolveu
          </Botao>
        ) : null}
        {d.situacao === 'aberta' ? (
          desistindo ? (
            <span className="inline-flex items-center gap-2 text-[13.5px]">
              Cancelar este pedido?
              <button type="button" onClick={desistir} disabled={ocupado} className="font-semibold text-atraso hover:underline">
                Sim, cancelar
              </button>
              <button type="button" onClick={() => setDesistindo(false)} className="font-semibold text-tinta-3 hover:underline">
                Não
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setDesistindo(true)} className="text-[13.5px] font-semibold text-tinta-3 hover:text-atraso">
              Desistir
            </button>
          )
        ) : null}
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-caneta hover:underline">
            <MessageCircle size={14} aria-hidden="true" /> Falar com a loja
          </a>
        ) : null}
        {aoAbrirPedido && d.codigo ? (
          <button type="button" onClick={() => aoAbrirPedido(d.codigo!)} className="text-[13.5px] font-semibold text-caneta hover:underline">
            Ver a compra
          </button>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- o pedido

/** A folha para pedir garantia ou devolução (ou mudar o pedido aberto, respondendo à loja). */
export function FolhaDevolucao({ abertura, aoFechar }: { abertura: AberturaDaDevolucao | null; aoFechar: () => void }) {
  if (!abertura) return <Folha aberta={false} aoFechar={aoFechar} titulo="">{null}</Folha>;
  const chave = 'devolucao' in abertura ? abertura.devolucao.id : `nova-${abertura.parte.id}`;
  return <FormularioDevolucao key={chave} abertura={abertura} aoFechar={aoFechar} />;
}

function FormularioDevolucao({ abertura, aoFechar }: { abertura: AberturaDaDevolucao; aoFechar: () => void }) {
  const toast = useToast();
  const { atualizar, ajustarDevolucao } = useAndamento();
  const existente = 'devolucao' in abertura ? abertura.devolucao : null;
  const parte = abertura.parte;
  // os itens da compra (sem a compra à mão, os do próprio pedido)
  const daCompra = parte ? itensParaDevolver(parte) : (existente?.itens ?? []).map((i) => ({ produtoId: i.produtoId, nome: i.nome, quantidade: i.quantidade }));
  const [tipo, setTipo] = useState<TipoDevolucao>(existente?.tipo ?? 'devolucao');
  const [motivo, setMotivo] = useState(existente?.motivo ?? '');
  const [quantidades, setQuantidades] = useState<Record<number, number>>(() => {
    if (existente?.itens.length) return Object.fromEntries(existente.itens.map((i) => [i.produtoId, i.quantidade]));
    return Object.fromEntries(daCompra.map((i) => [i.produtoId, i.quantidade]));
  });
  const [fotos, setFotos] = useState<FotoNoPedido[]>(() => existente?.fotos.map((f) => ({ caminho: f.caminho, url: f.url })) ?? []);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const loja = existente?.loja.nome ?? parte?.fornecedor ?? 'a loja';
  const codigo = existente?.codigo ?? ('codigo' in abertura ? abertura.codigo : '') ?? '';
  const escolhidos = daCompra.filter((i) => (quantidades[i.produtoId] ?? 0) > 0);

  async function porFotos(lista: FileList | null) {
    if (!lista?.length) return;
    const espaco = MAXIMO_DE_FOTOS - fotos.length;
    if (espaco <= 0) return setErro(`No máximo ${MAXIMO_DE_FOTOS} fotos.`);
    setErro(lista.length > espaco ? `Entraram só ${espaco} ${espaco === 1 ? 'foto' : 'fotos'}: o máximo é ${MAXIMO_DE_FOTOS}.` : null);
    setEnviandoFotos(true);
    try {
      for (const arquivo of Array.from(lista).slice(0, espaco)) {
        const reduzida = await reduzirFoto(arquivo, 1280, 0.8);
        const dados = new FormData();
        dados.set('foto', reduzida);
        const r = await fotoParaDevolucao(dados);
        if (!r.ok) {
          setErro(r.erro);
          break;
        }
        setFotos((atual) => [...atual, { caminho: r.caminho, url: URL.createObjectURL(reduzida) }]);
      }
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : SEM_CONEXAO);
    } finally {
      setEnviandoFotos(false);
    }
  }

  function enviar() {
    setErro(null);
    const texto = motivo.trim();
    if (texto.length < 5) return setErro('Conte o motivo em poucas palavras (o que aconteceu com a peça).');
    if (daCompra.length && !escolhidos.length) return setErro('Escolha pelo menos um item que volta.');
    // todos os itens com a quantidade toda: a compra toda
    const tudo = daCompra.length > 0 && daCompra.every((i) => (quantidades[i.produtoId] ?? 0) >= i.quantidade);
    const itens = tudo && !existente?.itens.length ? [] : escolhidos.map((i) => ({ produtoId: i.produtoId, quantidade: quantidades[i.produtoId] }));
    const dados = { tipo, motivo: texto, itens, fotos: fotos.map((f) => f.caminho) };
    iniciar(async () => {
      try {
        if (existente) {
          const r = await mudarDevolucao(existente.id, dados);
          if (!r.ok) return setErro(r.erro);
          ajustarDevolucao(existente.id, { tipo, motivo: texto, atualizadoEm: new Date().toISOString() });
          toast({ texto: `Pedido atualizado. A ${loja} vê a mudança.` });
        } else if (parte) {
          const r = await pedirDevolucao({ parteId: parte.id, ...dados });
          if (!r.ok) return setErro(r.erro);
          toast({ texto: `Pedido de ${TIPOS_DEVOLUCAO[tipo].toLowerCase()} enviado para a ${loja}.` });
        }
        void atualizar();
        aoFechar();
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={existente ? (situacaoDaDevolucao(existente).acao === 'responder' ? 'Responder à loja' : 'Mudar o pedido') : 'Garantia ou devolução'}
      descricao={`${codigo ? `Compra ${codigo}, ` : ''}${loja}.`}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={enviar} disabled={enviando || enviandoFotos}>
            {enviando ? 'Enviando…' : existente ? 'Mandar para a loja' : 'Pedir à loja'}
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {existente?.resposta && situacaoDaDevolucao(existente).acao === 'responder' ? (
          <div className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">
            <p className="font-semibold">A {loja} perguntou:</p>
            <p>{existente.resposta}</p>
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[14px] font-bold">O que você precisa</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(['devolucao', 'garantia'] as const).map((t) => (
              <label key={t} className={`flex cursor-pointer flex-col gap-0.5 rounded-xl px-3.5 py-3 ring-1 ${tipo === t ? 'bg-papel-2 ring-2 ring-tinta' : 'ring-linha hover:ring-tinta-3'}`}>
                <span className="flex items-center gap-2 font-semibold">
                  <input type="radio" name="tipo-devolucao" checked={tipo === t} onChange={() => setTipo(t)} className="accent-[var(--tinta)]" />
                  {TIPOS_DEVOLUCAO[t]}
                </span>
                <span className="pl-6 text-[13px] text-tinta-3">{t === 'devolucao' ? 'Veio errada, não serve no carro ou não precisa mais.' : 'A peça deu defeito no uso.'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {daCompra.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[14px] font-bold">O que volta</legend>
            <ul className="divide-y divide-linha rounded-xl ring-1 ring-linha">
              {daCompra.map((i) => {
                const q = quantidades[i.produtoId] ?? 0;
                return (
                  <li key={i.produtoId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[14px]">
                      <input
                        type="checkbox"
                        checked={q > 0}
                        onChange={(e) => setQuantidades((a) => ({ ...a, [i.produtoId]: e.target.checked ? i.quantidade : 0 }))}
                        className="h-[18px] w-[18px] shrink-0 accent-[var(--tinta)]"
                      />
                      <span className="min-w-0">{i.nome}</span>
                    </label>
                    {q > 0 && i.quantidade > 1 ? (
                      <Passo valor={q} aoMudar={(n) => setQuantidades((a) => ({ ...a, [i.produtoId]: n }))} rotulo={i.nome} maximo={i.quantidade} pequeno />
                    ) : (
                      <span className="num text-[13px] text-tinta-3">{q > 0 ? `${q} de ${i.quantidade}` : `comprou ${i.quantidade}`}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        <Campo rotulo="O que aconteceu" htmlFor="dev-motivo" dica="Ex.: o filtro veio com a rosca diferente; a bateria não segura carga depois de 2 semanas.">
          <textarea id="dev-motivo" rows={3} className={classeArea} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} />
        </Campo>

        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-bold">Fotos (até {MAXIMO_DE_FOTOS})</p>
          {fotos.length ? (
            <ul className="flex flex-wrap gap-2">
              {fotos.map((f) => (
                <li key={f.caminho} className="relative">
                  <img src={f.url} alt="Foto do pedido" className="h-20 w-20 rounded-lg object-cover ring-1 ring-linha" />
                  <button
                    type="button"
                    onClick={() => setFotos((a) => a.filter((x) => x.caminho !== f.caminho))}
                    className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-tinta text-papel"
                    aria-label="Tirar a foto"
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-tinta-3">A foto da peça e da etiqueta ajuda a loja a responder mais rápido.</p>
          )}
          <label
            className={`inline-flex h-10 items-center gap-2 self-start rounded-[10px] border border-linha bg-papel px-3.5 text-[14px] font-semibold hover:border-tinta-3 ${fotos.length >= MAXIMO_DE_FOTOS || enviandoFotos ? 'pointer-events-none opacity-45' : 'cursor-pointer'}`}
            aria-disabled={fotos.length >= MAXIMO_DE_FOTOS || enviandoFotos}
          >
            <Camera size={17} aria-hidden="true" /> {enviandoFotos ? 'Enviando a foto…' : 'Pôr fotos'}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={fotos.length >= MAXIMO_DE_FOTOS || enviandoFotos}
              onChange={(e) => {
                const alvo = e.target;
                void porFotos(alvo.files).finally(() => {
                  alvo.value = '';
                });
              }}
            />
          </label>
        </div>

        <p className="rounded-xl bg-papel-2 px-4 py-3 text-[13.5px] text-tinta-2">
          A {loja} recebe o pedido e responde aqui: pode pedir mais informação, aceitar ou recusar. A troca ou o reembolso vocês combinam direto; o Revisaí não passa pelo dinheiro.
        </p>

        {erro ? (
          <p className="rounded-lg bg-atraso-claro px-3 py-2 text-[14px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </Folha>
  );
}
