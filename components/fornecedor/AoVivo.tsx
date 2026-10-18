'use client';

// O painel da loja ao vivo: pedido novo, oficina que avisou que pagou, pedido cancelado pela oficina,
// pedido de devolução ou garantia e alerta de preço novo da região chegam na hora (tempo real do
// banco, com as regras de quem vê o quê). Aparecem num aviso na tela, no título da aba e, se a pessoa deixar, como notificação do
// navegador. Se o tempo real cair, a página se atualiza sozinha a cada 2 minutos enquanto está aberta.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { BellRing, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao } from '@/components/ui';
import type { SituacaoPagamentoParte, SituacaoParte } from '@/lib/marketplace-dados';
import { clienteNavegador, type ConfigPublica } from '@/lib/supabase-navegador';

const RESERVA_MS = 120_000;
const CHAVE_DISPENSA = 'revisai-loja-avisos-dispensado';

type Linha = Record<string, unknown>;
type Conhecido = { status: SituacaoParte; pagamento: SituacaoPagamentoParte };

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** O título da aba com o número de novidades na frente: "(2) Pedidos | Fornecedor Revisaí". */
function tituloCom(n: number) {
  const base = document.title.replace(/^\(\d+\+?\) /, '');
  document.title = n > 0 ? `(${n > 9 ? '9+' : n}) ${base}` : base;
}

function avisarNoNavegador(titulo: string, corpo: string, url: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    const n = new Notification(titulo, { body: corpo, icon: '/icone-192.png', tag: `revisai-loja-${url}` });
    n.onclick = () => {
      window.focus();
      if (location.pathname !== url) location.assign(url);
      n.close();
    };
  } catch {
    // no Android a notificação só sai pelo service worker
    void navigator.serviceWorker
      ?.getRegistration('/')
      .then((r) => r?.showNotification(titulo, { body: corpo, icon: '/icone-192.png', badge: '/icone-192.png', tag: 'revisai-loja', data: { url } }))
      .catch(() => {});
  }
}

export function AoVivo({ config, fornecedorId, uf, pedidos }: { config: { url: string; chave: string } | null; fornecedorId: number; uf: string | null; pedidos: { id: number; status: SituacaoParte; pagamento: SituacaoPagamentoParte }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel' | null>(null);
  const [dispensado, setDispensado] = useState(true);
  const conhecidos = useRef(new Map<number, Conhecido>());
  const novidades = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaAtualizacao = useRef(Date.now());

  // o que a página já mostra: só avisa do que mudou depois
  useEffect(() => {
    const m = conhecidos.current;
    for (const p of pedidos) m.set(p.id, { status: p.status, pagamento: p.pagamento });
    ultimaAtualizacao.current = Date.now();
  }, [pedidos]);

  const atualizar = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      ultimaAtualizacao.current = Date.now();
      router.refresh();
    }, 700);
  }, [router]);

  const novidade = useCallback(
    (titulo: string, corpo: string, url: string) => {
      toast({ texto: `${titulo}: ${corpo}`, acao: location.pathname === url ? undefined : { rotulo: 'Ver', fazer: () => router.push(url) } });
      if (document.visibilityState !== 'visible') {
        novidades.current += 1;
        tituloCom(novidades.current);
      }
      avisarNoNavegador(titulo, corpo, url);
      atualizar();
    },
    [toast, router, atualizar]
  );

  // as funções mudam a cada render; o canal usa a versão mais nova sem reabrir a conexão
  const aoPedido = useRef<(evento: string, linha: Linha) => void>(() => {});
  const aoAlerta = useRef<(linha: Linha) => void>(() => {});
  const aoDevolucao = useRef<(evento: string, linha: Linha) => void>(() => {});
  useEffect(() => {
    aoPedido.current = (evento, linha) => {
      const id = Number(linha.id);
      if (!Number.isSafeInteger(id)) return atualizar();
      const status = texto(linha.status) as SituacaoParte;
      const pagamento = texto(linha.pagamento) as SituacaoPagamentoParte;
      const antes = conhecidos.current.get(id);
      conhecidos.current.set(id, { status, pagamento });
      const codigo = texto(linha.codigo) || 'novo';
      const oficina = texto(linha.oficina_nome) || 'uma oficina';
      if (evento === 'INSERT') return novidade('Pedido novo', `${codigo}, de ${oficina}`, '/fornecedor/pedidos');
      if (antes && antes.pagamento !== 'informado' && pagamento === 'informado') return novidade('A oficina avisou que pagou', `pedido ${codigo}. Confira no extrato.`, '/fornecedor/pedidos');
      if (antes && antes.status !== 'cancelado' && status === 'cancelado' && texto(linha.cancelado_por) !== 'loja')
        return novidade('Pedido cancelado', `${codigo}${texto(linha.cancelado_motivo) ? `: ${texto(linha.cancelado_motivo)}` : ''}`, '/fornecedor/pedidos');
      if (!antes || antes.status !== status || antes.pagamento !== pagamento) atualizar();
    };
    aoAlerta.current = (linha) => {
      const titulo = texto(linha.titulo) || 'um produto';
      novidade('Alerta de preço novo', `${titulo}${texto(linha.oficina_cidade) ? ` em ${texto(linha.oficina_cidade)}` : ''}`, '/fornecedor/alertas');
    };
    aoDevolucao.current = (evento, linha) => {
      const compra = texto(linha.codigo) ? `compra ${texto(linha.codigo)}` : 'compra de uma oficina';
      if (evento === 'INSERT') return novidade(texto(linha.tipo) === 'garantia' ? 'Pedido de garantia' : 'Pedido de devolução', compra, '/fornecedor/devolucoes');
      // a oficina mudou o pedido depois da pergunta da loja
      const respondida = Date.parse(texto(linha.respondida_em));
      if (evento === 'UPDATE' && texto(linha.situacao) === 'aberta' && respondida && Date.parse(texto(linha.atualizado_em)) > respondida)
        return novidade('A oficina completou o pedido de devolução', compra, '/fornecedor/devolucoes');
      atualizar();
    };
  });

  // tempo real do banco (com a sessão da pessoa: o banco só manda o que ela pode ver)
  useEffect(() => {
    if (!config) return;
    const sb = clienteNavegador(config);
    let canal: RealtimeChannel | null = null;
    let ativo = true;
    void (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (!ativo || !data.session) return;
        await sb.realtime.setAuth(data.session.access_token);
        canal = sb
          .channel(`loja-${fornecedorId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_fornecedores', filter: `fornecedor_id=eq.${fornecedorId}` }, (p) =>
            aoPedido.current(p.eventType, (p.new ?? {}) as Linha)
          );
        canal.on('postgres_changes', { event: '*', schema: 'public', table: 'devolucoes', filter: `fornecedor_id=eq.${fornecedorId}` }, (p) => aoDevolucao.current(p.eventType, (p.new ?? {}) as Linha));
        // os alertas chegam pela vitrine: só o que a loja pode ver, sem a oficina que pediu
        if (uf) canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas_vitrine', filter: `oficina_uf=eq.${uf}` }, (p) => aoAlerta.current((p.new ?? {}) as Linha));
        canal.subscribe();
      } catch {
        // sem tempo real: fica a atualização a cada 2 minutos
      }
    })();
    return () => {
      ativo = false;
      if (canal) void sb.removeChannel(canal);
    };
  }, [config, fornecedorId, uf]);

  // reserva: atualiza a cada 2 minutos com a aba aberta; ao voltar para a aba, zera o número do título
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaAtualizacao.current >= RESERVA_MS - 1000) {
        ultimaAtualizacao.current = Date.now();
        router.refresh();
      }
    }, 30_000);
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      if (novidades.current) {
        novidades.current = 0;
        tituloCom(0);
      }
      if (Date.now() - ultimaAtualizacao.current >= RESERVA_MS) {
        ultimaAtualizacao.current = Date.now();
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      if (espera.current) clearTimeout(espera.current);
    };
  }, [router]);

  useEffect(() => {
    setPermissao(typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission);
    try {
      setDispensado(localStorage.getItem(CHAVE_DISPENSA) === '1');
    } catch {
      setDispensado(false);
    }
  }, []);

  async function ligar() {
    try {
      const p = await Notification.requestPermission();
      setPermissao(p);
      if (p === 'granted') toast({ texto: 'Pronto. Este aparelho avisa quando chegar pedido ou alerta.' });
      else toast({ texto: 'O navegador não deixou. Dá para liberar nas configurações do site.', tom: 'erro' });
    } catch {
      setPermissao('indisponivel');
    }
  }

  function dispensar() {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_DISPENSA, '1');
    } catch {
      // sem armazenamento: o aviso volta na próxima visita
    }
  }

  if (permissao !== 'default' || dispensado) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-caneta-claro px-4 py-3 text-[14.5px] text-caneta sm:px-5">
      <BellRing size={18} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-1">Quer aviso neste aparelho quando chegar pedido ou alerta de preço, mesmo com o painel em outra aba?</p>
      <Botao tamanho="pequeno" variante="escuro" onClick={() => void ligar()}>
        Ligar os avisos
      </Botao>
      <button type="button" onClick={dispensar} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/50" aria-label="Agora não">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export type { ConfigPublica };
