'use client';

// O botão de ajuda: abre os pedidos de ajuda da pessoa (só os dela, pelas regras do banco), um pedido
// novo e a conversa com a equipe do Revisaí, com o WhatsApp da equipe como alternativa. Sem conta,
// mostra só o WhatsApp. Usa as funções suporte_abrir, suporte_responder e suporte_situacao.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, LifeBuoy, MessageCircle, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Folha } from '@/components/Folha';
import { Botao, Campo, Chip, classeArea, classeBotao, classeEntrada } from '@/components/ui';
import { quandoFoi } from '@/lib/loja/comum';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';
import {
  COLUNAS_MENSAGEM_DE_AJUDA,
  COLUNAS_PEDIDO_DE_AJUDA,
  conferirMensagem,
  conferirPedido,
  lerMensagensDeAjuda,
  lerPedidosDeAjuda,
  mensagemDoSuporte,
  SITUACOES_DO_PEDIDO,
  whatsappDaEquipe,
  type MensagemDeAjuda,
  type PedidoDeAjuda
} from './dados';

export type AparenciaDaAjuda = 'flutuante' | 'cabecalho' | 'lateral';

type Tela = { tipo: 'lista' } | { tipo: 'novo' } | { tipo: 'conversa'; pedido: PedidoDeAjuda };

const CHAVE_AVISO = 'revisai:ajuda:respondido';

export function BotaoAjuda({
  config,
  usuarioId,
  oficinaId = null,
  fornecedorId = null,
  aparencia = 'flutuante'
}: {
  config: ConfigPublica | null;
  /** null: sem conta (só o WhatsApp). */
  usuarioId: string | null;
  oficinaId?: string | null;
  fornecedorId?: number | null;
  aparencia?: AparenciaDaAjuda;
}) {
  const [aberta, setAberta] = useState(false);
  const [respondidos, setRespondidos] = useState(0);
  const comConta = !!(config && usuarioId);
  const whatsapp = whatsappDaEquipe(process.env.NEXT_PUBLIC_SUPORTE_WHATSAPP, fornecedorId != null ? 'loja' : oficinaId ? 'oficina' : null);

  // a equipe respondeu algum pedido? (um ponto no botão; confere no máximo a cada minuto)
  useEffect(() => {
    if (!config || !usuarioId) return;
    let vivo = true;
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CHAVE_AVISO) ?? 'null') as { quem: string; em: number; n: number } | null;
      if (guardado && guardado.quem === usuarioId && Date.now() - guardado.em < 60_000) {
        setRespondidos(guardado.n);
        return;
      }
    } catch {}
    void clienteNavegador(config)
      .from('suporte_chamados')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', usuarioId)
      .eq('situacao', 'respondido')
      .then(({ count }) => {
        if (!vivo) return;
        setRespondidos(count ?? 0);
        try {
          sessionStorage.setItem(CHAVE_AVISO, JSON.stringify({ quem: usuarioId, em: Date.now(), n: count ?? 0 }));
        } catch {}
      });
    return () => {
      vivo = false;
    };
  }, [config, usuarioId]);

  const ponto = respondidos > 0 ? <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-oleo ring-2 ring-papel" aria-hidden="true" /> : null;
  const rotulo = respondidos > 0 ? 'Ajuda, a equipe respondeu' : 'Ajuda';

  return (
    <>
      {aparencia === 'cabecalho' ? (
        <button type="button" onClick={() => setAberta(true)} aria-label={rotulo} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-tinta-2 hover:bg-papel-2" data-ajuda>
          <LifeBuoy size={19} aria-hidden="true" />
          {ponto}
        </button>
      ) : aparencia === 'lateral' ? (
        <button type="button" onClick={() => setAberta(true)} className="relative flex h-11 w-full items-center gap-3 rounded-[10px] px-3 font-semibold text-tinta-2 transition-colors hover:bg-papel-2 hover:text-tinta" data-ajuda>
          <LifeBuoy size={19} aria-hidden="true" />
          <span className="flex-1 text-left">Ajuda</span>
          {respondidos > 0 ? <span className="h-2.5 w-2.5 rounded-full bg-oleo" aria-label="A equipe respondeu" /> : null}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAberta(true)}
          aria-label={rotulo}
          className="nao-imprimir fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-2 rounded-full bg-tinta px-4 font-semibold text-papel shadow-lg hover:opacity-90 lg:right-6 lg:bottom-6"
          data-ajuda
        >
          <LifeBuoy size={20} aria-hidden="true" />
          <span className="hidden sm:inline">Ajuda</span>
          {ponto}
        </button>
      )}
      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo="Ajuda" descricao="Fale com a equipe do Revisaí. A gente responde por aqui, em horário comercial.">
        {aberta ? (
          comConta ? (
            <Conversas config={config!} usuarioId={usuarioId!} oficinaId={oficinaId} fornecedorId={fornecedorId} whatsapp={whatsapp} aoLer={() => setRespondidos(0)} />
          ) : (
            <SemConta whatsapp={whatsapp} />
          )
        ) : null}
      </Folha>
    </>
  );
}

/** Para o app da oficina: a conta, a oficina e o banco vêm do ProvedorConta. */
export function BotaoAjudaDaOficina({ aparencia }: { aparencia: AparenciaDaAjuda }) {
  const { conta, oficina, config } = useConta();
  return <BotaoAjuda config={config} usuarioId={conta?.usuario.id ?? null} oficinaId={oficina?.id ?? null} aparencia={aparencia} />;
}

function LinkWhatsApp({ whatsapp, destaque = false }: { whatsapp: string; destaque?: boolean }) {
  return (
    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao(destaque ? 'whatsapp' : 'secundario', destaque ? 'grande' : 'normal', 'self-start')}>
      <MessageCircle size={18} aria-hidden="true" /> Falar no WhatsApp
    </a>
  );
}

function SemConta({ whatsapp }: { whatsapp: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      {whatsapp ? (
        <>
          <p className="text-tinta-2">Chame a equipe do Revisaí no WhatsApp e conte o que aconteceu.</p>
          <LinkWhatsApp whatsapp={whatsapp} destaque />
        </>
      ) : (
        <p className="text-tinta-2">Entre na sua conta para pedir ajuda à equipe do Revisaí.</p>
      )}
      <p className="text-[14px] text-tinta-3">
        Com a conta, o pedido de ajuda fica guardado e a resposta chega aqui.{' '}
        <Link href="/entrar" className="font-semibold underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}

function Conversas({
  config,
  usuarioId,
  oficinaId,
  fornecedorId,
  whatsapp,
  aoLer
}: {
  config: ConfigPublica;
  usuarioId: string;
  oficinaId: string | null;
  fornecedorId: number | null;
  whatsapp: string | null;
  aoLer: () => void;
}) {
  const sb = clienteNavegador(config);
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' });
  const [pedidos, setPedidos] = useState<PedidoDeAjuda[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await sb.from('suporte_chamados').select(COLUNAS_PEDIDO_DE_AJUDA).eq('user_id', usuarioId).order('atualizado_em', { ascending: false }).limit(20);
    if (error) {
      setErro('Não deu para carregar os seus pedidos de ajuda agora.');
      setPedidos([]);
      return;
    }
    setErro(null);
    setPedidos(lerPedidosDeAjuda(data));
  }, [sb, usuarioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (tela.tipo === 'novo')
    return (
      <NovoPedido
        sb={sb}
        oficinaId={oficinaId}
        fornecedorId={fornecedorId}
        aoVoltar={() => setTela({ tipo: 'lista' })}
        aoAbrir={(p) => {
          setPedidos((l) => [p, ...(l ?? [])]);
          setTela({ tipo: 'conversa', pedido: p });
        }}
      />
    );
  if (tela.tipo === 'conversa')
    return (
      <Conversa
        sb={sb}
        pedido={tela.pedido}
        aoVoltar={() => {
          setTela({ tipo: 'lista' });
          void carregar();
        }}
        aoLer={aoLer}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <Botao variante="escuro" onClick={() => setTela({ tipo: 'novo' })} className="self-start">
        <Plus size={17} aria-hidden="true" /> Novo pedido de ajuda
      </Botao>
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      {pedidos == null ? (
        <p className="text-[14px] text-tinta-3" aria-busy="true">
          Carregando…
        </p>
      ) : pedidos.length ? (
        <ul className="divide-y divide-linha overflow-hidden rounded-xl ring-1 ring-linha">
          {pedidos.map((p) => {
            const s = SITUACOES_DO_PEDIDO[p.situacao];
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setTela({ tipo: 'conversa', pedido: p })} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-papel-2">
                  <span className="min-w-0 flex-1 font-semibold">{p.assunto}</span>
                  <span className="flex items-center gap-2 text-[13px] text-tinta-3">
                    <Chip tom={s.tom}>{s.nome}</Chip>
                    {quandoFoi(p.atualizadoEm, Date.now())}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[14.5px] text-tinta-2">Nenhum pedido de ajuda ainda. Conte o que aconteceu e a equipe responde aqui.</p>
      )}
      {whatsapp ? (
        <div className="flex flex-col gap-2 border-t border-linha pt-4">
          <p className="text-[14px] text-tinta-3">É urgente? Fale direto no WhatsApp.</p>
          <LinkWhatsApp whatsapp={whatsapp} />
        </div>
      ) : null}
    </div>
  );
}

function NovoPedido({
  sb,
  oficinaId,
  fornecedorId,
  aoVoltar,
  aoAbrir
}: {
  sb: SupabaseClient;
  oficinaId: string | null;
  fornecedorId: number | null;
  aoVoltar: () => void;
  aoAbrir: (p: PedidoDeAjuda) => void;
}) {
  const [assunto, setAssunto] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const problema = conferirPedido(assunto, texto);
    if (problema) return setErro(problema);
    setErro(null);
    setEnviando(true);
    try {
      const { data, error } = await sb.rpc('suporte_abrir', { p_assunto: assunto.trim(), p_texto: texto.trim(), p_oficina: oficinaId, p_fornecedor: fornecedorId });
      if (error || typeof data !== 'string') return setErro(mensagemDoSuporte(error));
      const agora = new Date().toISOString();
      aoAbrir({ id: data, assunto: assunto.trim(), situacao: 'novo', criadoEm: agora, atualizadoEm: agora });
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-tinta-2 hover:text-tinta">
        <ArrowLeft size={16} aria-hidden="true" /> Seus pedidos
      </button>
      <Campo rotulo="Assunto" htmlFor="ajuda-assunto" dica="Ex.: não consigo mudar o preço de um produto.">
        <input id="ajuda-assunto" className={classeEntrada} value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={120} />
      </Campo>
      <Campo rotulo="O que aconteceu" htmlFor="ajuda-texto" dica="Conte o que você tentou fazer e o que apareceu na tela.">
        <textarea id="ajuda-texto" rows={5} className={classeArea} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
      </Campo>
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Botao variante="primario" onClick={() => void enviar()} disabled={enviando}>
          <Send size={16} aria-hidden="true" /> {enviando ? 'Enviando…' : 'Enviar para a equipe'}
        </Botao>
      </div>
    </div>
  );
}

function Conversa({ sb, pedido, aoVoltar, aoLer }: { sb: SupabaseClient; pedido: PedidoDeAjuda; aoVoltar: () => void; aoLer: () => void }) {
  const [mensagens, setMensagens] = useState<MensagemDeAjuda[] | null>(null);
  const [situacao, setSituacao] = useState(pedido.situacao);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const lido = useRef(aoLer);
  useEffect(() => {
    lido.current = aoLer;
  });

  const carregar = useCallback(async () => {
    const [m, c] = await Promise.all([
      sb.from('suporte_mensagens').select(COLUNAS_MENSAGEM_DE_AJUDA).eq('chamado_id', pedido.id).order('id').limit(300),
      sb.from('suporte_chamados').select('situacao').eq('id', pedido.id).maybeSingle()
    ]);
    if (m.error) return setErro('Não deu para carregar a conversa agora.');
    setMensagens(lerMensagensDeAjuda(m.data));
    const s = (c.data as { situacao?: string } | null)?.situacao;
    if (s === 'novo' || s === 'respondido' || s === 'fechado') setSituacao(s);
  }, [sb, pedido.id]);

  // abre, lê e fica de olho: tempo real quando dá, e de 15 em 15 segundos com a conversa aberta
  useEffect(() => {
    void carregar();
    if (pedido.situacao === 'respondido') {
      lido.current();
      try {
        sessionStorage.removeItem(CHAVE_AVISO);
      } catch {}
    }
    let canal: RealtimeChannel | null = null;
    let vivo = true;
    void (async () => {
      try {
        // com a sessão da pessoa: o banco só manda as mensagens que ela pode ver
        const { data } = await sb.auth.getSession();
        if (!vivo || !data.session) return;
        await sb.realtime.setAuth(data.session.access_token);
        canal = sb
          .channel(`ajuda-${pedido.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suporte_mensagens', filter: `chamado_id=eq.${pedido.id}` }, () => void carregar())
          .subscribe();
      } catch {
        // sem tempo real: fica a busca de 15 em 15 segundos
      }
    })();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
      if (canal) void sb.removeChannel(canal);
    };
  }, [carregar, sb, pedido.id, pedido.situacao]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens?.length]);

  async function responder() {
    const problema = conferirMensagem(texto);
    if (problema) return setErro(problema);
    setErro(null);
    setEnviando(true);
    try {
      const { error } = await sb.rpc('suporte_responder', { p_chamado: pedido.id, p_texto: texto.trim() });
      if (error) return setErro(mensagemDoSuporte(error));
      setTexto('');
      setSituacao('novo');
      await carregar();
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function encerrar() {
    setEnviando(true);
    try {
      const { error } = await sb.rpc('suporte_situacao', { p_chamado: pedido.id, p_situacao: 'fechado' });
      if (error) return setErro(mensagemDoSuporte(error));
      setSituacao('fechado');
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const s = SITUACOES_DO_PEDIDO[situacao];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={aoVoltar} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-tinta-2 hover:text-tinta">
          <ArrowLeft size={16} aria-hidden="true" /> Seus pedidos
        </button>
        <Chip tom={s.tom}>{s.nome}</Chip>
      </div>
      <p className="font-bold">{pedido.assunto}</p>
      {mensagens == null ? (
        <p className="text-[14px] text-tinta-3" aria-busy="true">
          Carregando…
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5" aria-label="Conversa com a equipe">
          {mensagens.map((m) => (
            <li key={m.id} className={`flex flex-col gap-1 ${m.autor === 'cliente' ? 'items-end' : 'items-start'}`}>
              <p className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] whitespace-pre-wrap ${m.autor === 'cliente' ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta'}`}>{m.texto}</p>
              <span className="text-[12px] text-tinta-3">
                {m.autor === 'cliente' ? 'Você' : 'Equipe do Revisaí'}, {quandoFoi(m.criadoEm, Date.now())}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div ref={fim} />
      <Campo rotulo={situacao === 'fechado' ? 'Escrever de novo (o pedido abre outra vez)' : 'Responder'} htmlFor="ajuda-resposta">
        <textarea id="ajuda-resposta" rows={3} className={classeArea} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
      </Campo>
      {erro ? (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {situacao !== 'fechado' ? (
          <Botao variante="fantasma" onClick={() => void encerrar()} disabled={enviando}>
            Já resolvi, encerrar
          </Botao>
        ) : null}
        <Botao variante="primario" onClick={() => void responder()} disabled={enviando}>
          <Send size={16} aria-hidden="true" /> {enviando ? 'Enviando…' : 'Enviar'}
        </Botao>
      </div>
    </div>
  );
}
