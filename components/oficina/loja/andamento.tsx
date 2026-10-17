'use client';

// O que está andando na loja: os alertas de preço com as respostas das lojas e os pedidos com a
// situação de cada loja. Só com a conta (o banco mostra só o que é da oficina escolhida). Busca ao
// abrir, ao voltar para o app e quando o banco avisa pelo tempo real que algo mudou (uma loja
// confirmou, respondeu um alerta, o entregador andou). Com coisa andando, busca também a cada 2
// minutos com o app aberto, para o caso de o tempo real cair.

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { acompanhar, verAlertas } from '@/app/oficina/acoes-loja';
import { useConta } from '@/components/conta/ProvedorConta';
import { useToast } from '@/components/Toasts';
import { faseDoAlerta, propostasEmOrdem, type AlertaDaOficina, type CotaAlertas } from '@/lib/alertas-dados';
import { aCaminho, pedidoEmAndamento, type ParteAcompanhada, type PedidoAcompanhado } from '@/lib/entregas-dados';
import { notificar } from '@/lib/notificacao';
import { fotografar, novidades, type Visto } from '@/lib/novidades';
import { useOficina } from '@/lib/store';
import { assinarLojaDaOficina, INTERVALO_RESERVA_MS, juntarAvisos, type EstadoDoCanal } from './tempo-real';

interface Andamento {
  alertas: AlertaDaOficina[];
  cota: CotaAlertas | null;
  pedidos: Record<string, PedidoAcompanhado>;
  /** Propostas para escolher e entregas a caminho (o número na aba da Loja). */
  pendencias: number;
  /** Já buscou pelo menos uma vez (ou não tem o que buscar, sem conta). */
  pronto: boolean;
  /** Os códigos de pedido que a última busca cobriu (um pedido fora dela ainda não foi buscado). */
  buscados: ReadonlySet<string>;
  erro: string | null;
  /** Tem conta e oficina: os alertas e o acompanhamento só existem com ela. */
  comConta: boolean;
  /** O canal do tempo real (sem ele, as mudanças chegam na busca de 2 em 2 minutos). */
  canal: EstadoDoCanal;
  /** Busca de novo (alertas, cota e pedidos). */
  atualizar(): Promise<void>;
  /** Põe ou troca um alerta na lista sem esperar o servidor. */
  guardarAlerta(a: AlertaDaOficina, cota?: CotaAlertas | null): void;
  /** Muda na tela, antes da próxima busca, o que a oficina acabou de fazer (avisou que pagou). */
  ajustarParte(parteId: number, mudanca: Partial<ParteAcompanhada>): void;
  ajustarAlerta(id: string, mudanca: Partial<AlertaDaOficina>): void;
}

const Contexto = createContext<Andamento | null>(null);

const DIA = 86_400_000;

/** O pedido entra no acompanhamento: dos últimos 45 dias (os mais velhos já terminaram). */
export function pedidoAcompanhavel(p: { codigo: string; quando: string }, agora = Date.now()): boolean {
  return agora - Date.parse(p.quando) < 45 * DIA && /^[A-Z0-9]{6}$/.test(p.codigo);
}

export function ProvedorDeAndamento({ children }: { children: ReactNode }) {
  const { oficina, banco } = useConta();
  const oficinaId = oficina?.id ?? null;
  const chaveCodigos = useOficina((s) => s.pedidos.map((p) => p.codigo).join(','));
  // os pedidos que a oficina já deu entrada no estoque chegaram: não contam como a caminho
  const chaveRecebidos = useOficina((s) => s.pedidos.filter((p) => p.recebidoEm).map((p) => p.codigo).join(','));
  const [alertas, setAlertas] = useState<AlertaDaOficina[]>([]);
  const [cota, setCota] = useState<CotaAlertas | null>(null);
  const [pedidos, setPedidos] = useState<Record<string, PedidoAcompanhado>>({});
  const [pronto, setPronto] = useState(false);
  const [buscados, setBuscados] = useState<ReadonlySet<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [canal, setCanal] = useState<EstadoDoCanal>('conectando');
  const oficinaAtual = useRef<string | null>(null);
  const ultima = useRef(0);
  const buscando = useRef(false);
  // um pedido de atualização que chegou durante uma busca roda logo depois dela
  const deNovo = useRef(false);
  // cada mudança feita na tela (pagou, mandou um alerta) conta: a busca que começou antes dela
  // traz dados velhos e é descartada (e busca de novo)
  const mudancas = useRef(0);
  const visto = useRef<Visto | null>(null);
  const estadoDoCanal = useRef<EstadoDoCanal>('conectando');
  const toast = useToast();
  const router = useRouter();

  /** Avisa o que mudou: na tela, se o app está aberto; no celular, se está em segundo plano. */
  const avisar = useCallback(
    (frases: string[]) => {
      if (!frases.length) return;
      const texto = frases.length === 1 ? frases[0] : `${frases[0]} E mais ${frases.length - 1} ${frases.length === 2 ? 'novidade' : 'novidades'} na Loja.`;
      if (document.visibilityState === 'visible') toast({ texto, acao: { rotulo: 'Ver', fazer: () => router.push('/oficina/loja') } });
      else void notificar('Revisaí', texto);
    },
    [toast, router]
  );

  /** Uma busca no servidor: alertas e cota, e a situação dos pedidos da oficina. */
  const buscar = useCallback(
    async (id: string) => {
      ultima.current = Date.now();
      const versao = mudancas.current;
      // os pedidos deste aparelho que esta busca cobre: os que já tinham saído quando ela começou
      const codigos = useOficina
        .getState()
        .pedidos.filter((p) => pedidoAcompanhavel(p))
        .map((p) => p.codigo);
      try {
        const [a, p] = await Promise.all([verAlertas(), acompanhar()]);
        // trocou de oficina no meio: o que voltou é da outra
        if (oficinaAtual.current !== id) return;
        if (versao !== mudancas.current) {
          deNovo.current = true;
          return;
        }
        if (a.ok) {
          setAlertas(a.alertas);
          setCota(a.cota);
        }
        if (p.ok) {
          setPedidos(Object.fromEntries(p.pedidos.map((x) => [x.codigo, x])));
          setBuscados(new Set([...codigos, ...p.pedidos.map((x) => x.codigo)]));
        }
        // compara com a última olhada (só quando as duas buscas vieram, para não avisar o que só não carregou)
        if (a.ok && p.ok) {
          avisar(novidades(visto.current, a.alertas, p.pedidos));
          visto.current = fotografar(a.alertas, p.pedidos);
        }
        setErro(!a.ok ? a.erro : !p.ok ? p.erro : null);
      } catch {
        setErro('Sem conexão. Mostrando o que já tinha.');
      }
    },
    [avisar]
  );

  const atualizar = useCallback(async (): Promise<void> => {
    if (!oficinaAtual.current) return;
    // já está buscando: busca de novo logo depois (o que mudou agora não se perde)
    if (buscando.current) {
      deNovo.current = true;
      return;
    }
    buscando.current = true;
    try {
      for (;;) {
        // a oficina é lida a cada volta (pode ter sido trocada no meio)
        const id: string | null = oficinaAtual.current;
        if (!id) break;
        deNovo.current = false;
        await buscar(id);
        if (!deNovo.current && oficinaAtual.current === id) break;
      }
    } finally {
      buscando.current = false;
      setPronto(true);
    }
  }, [buscar]);

  // ao abrir, ao trocar de oficina e quando sai um pedido (neste aparelho ou em outro, pela sincronia)
  useEffect(() => {
    if (oficinaAtual.current !== oficinaId) {
      oficinaAtual.current = oficinaId;
      visto.current = null;
      setAlertas([]);
      setCota(null);
      setPedidos({});
      setBuscados(new Set());
      setErro(null);
      setPronto(!oficinaId);
    }
    if (oficinaId) void atualizar();
  }, [oficinaId, chaveCodigos, atualizar]);

  // o tempo real: cada aviso do banco vira uma busca (juntando os que chegam em sequência)
  useEffect(() => {
    if (!oficinaId) return;
    const sb = banco();
    const mudar = (e: EstadoDoCanal) => {
      // voltou depois de cair: o que mudou no meio não chegou
      if (e === 'ligado' && estadoDoCanal.current === 'caiu') void atualizar();
      estadoDoCanal.current = e;
      setCanal(e);
    };
    if (!sb) {
      mudar('caiu');
      return;
    }
    mudar('conectando');
    const juntar = juntarAvisos(() => void atualizar(), 800);
    const desligar = assinarLojaDaOficina(sb, oficinaId, () => juntar.avisar(), mudar);
    return () => {
      juntar.parar();
      desligar();
    };
  }, [oficinaId, banco, atualizar]);

  const agora = Date.now();
  const recebidos = new Set(chaveRecebidos.split(','));
  const naoRecebidos = Object.values(pedidos).filter((p) => !recebidos.has(p.codigo));
  const entregasACaminho = naoRecebidos.reduce((n, p) => n + p.partes.filter((x) => aCaminho(x, agora)).length, 0);
  const esperando = alertas.some((a) => {
    const fase = faseDoAlerta(a, propostasEmOrdem(a).length, agora);
    return fase === 'esperando' || fase === 'escolher';
  });
  const andando = naoRecebidos.some(pedidoEmAndamento);
  const pendencias =
    alertas.filter((a) => {
      const fase = faseDoAlerta(a, propostasEmOrdem(a).length, agora);
      return (fase === 'esperando' || fase === 'escolher') && propostasEmOrdem(a).length > 0;
    }).length + entregasACaminho;

  // a reserva: com coisa andando e o app aberto, busca a cada 2 minutos (o tempo real pode ter caído)
  const precisaOlhar = !!oficinaId && (entregasACaminho > 0 || esperando || andando);
  useEffect(() => {
    if (!precisaOlhar) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - ultima.current >= INTERVALO_RESERVA_MS - 5_000) void atualizar();
    }, INTERVALO_RESERVA_MS);
    return () => clearInterval(t);
  }, [precisaOlhar, atualizar]);
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima.current > 15_000) void atualizar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [atualizar]);

  const guardarAlerta = useCallback((a: AlertaDaOficina, c?: CotaAlertas | null) => {
    mudancas.current++;
    setAlertas((lista) => [a, ...lista.filter((x) => x.id !== a.id)]);
    if (c) setCota(c);
  }, []);
  const ajustarParte = useCallback((parteId: number, mudanca: Partial<ParteAcompanhada>) => {
    mudancas.current++;
    setPedidos((atual) => {
      const codigo = Object.values(atual).find((p) => p.partes.some((x) => x.id === parteId))?.codigo;
      if (!codigo) return atual;
      const p = atual[codigo];
      return { ...atual, [codigo]: { ...p, partes: p.partes.map((x) => (x.id === parteId ? { ...x, ...mudanca } : x)) } };
    });
  }, []);
  const ajustarAlerta = useCallback((id: string, mudanca: Partial<AlertaDaOficina>) => {
    mudancas.current++;
    setAlertas((lista) => lista.map((a) => (a.id === id ? { ...a, ...mudanca } : a)));
  }, []);

  const comConta = !!oficinaId;
  const valor = useMemo(
    () => ({ alertas, cota, pedidos, pendencias, pronto, buscados, erro, comConta, canal, atualizar, guardarAlerta, ajustarParte, ajustarAlerta }),
    [alertas, cota, pedidos, pendencias, pronto, buscados, erro, comConta, canal, atualizar, guardarAlerta, ajustarParte, ajustarAlerta]
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAndamento(): Andamento {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAndamento fora do ProvedorDeAndamento');
  return c;
}
