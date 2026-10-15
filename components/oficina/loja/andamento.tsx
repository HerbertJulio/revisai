'use client';

// O que está andando na loja: os alertas de preço com as respostas das lojas e os pedidos com a
// situação de cada loja. Busca no servidor ao abrir, ao voltar para o app e, enquanto tem coisa
// andando, de tempos em tempos (mais rápido com entrega a caminho, como nos apps de entrega).

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { acompanhar, verAlertas } from '@/app/oficina/acoes-loja';
import { useToast } from '@/components/Toasts';
import { faseDoAlerta, propostasEmOrdem, type AlertaDaOficina, type CotaAlertas } from '@/lib/alertas-dados';
import { aCaminho, pedidoEmAndamento, type ParteAcompanhada, type PedidoAcompanhado } from '@/lib/entregas-dados';
import { notificar } from '@/lib/notificacao';
import { fotografar, novidades, type Visto } from '@/lib/novidades';
import { useOficina } from '@/lib/store';

interface Andamento {
  alertas: AlertaDaOficina[];
  cota: CotaAlertas | null;
  pedidos: Record<string, PedidoAcompanhado>;
  /** Propostas para escolher e entregas a caminho (o número na aba da Loja). */
  pendencias: number;
  /** Já buscou pelo menos uma vez. */
  pronto: boolean;
  /** Os códigos de pedido que a última busca consultou (um pedido fora dela ainda não foi buscado). */
  buscados: ReadonlySet<string>;
  erro: string | null;
  /** Busca de novo; com `alertas`, busca os alertas e a cota mesmo antes do primeiro alerta. */
  atualizar(opcoes?: { alertas?: boolean }): Promise<void>;
  /** Põe ou troca um alerta na lista sem esperar o servidor. */
  guardarAlerta(a: AlertaDaOficina, cota?: CotaAlertas): void;
  /** Muda na tela, antes da próxima busca, o que a oficina acabou de fazer (pagou, cancelou). */
  ajustarParte(codigo: string, fornecedorId: number, mudanca: Partial<ParteAcompanhada>): void;
  ajustarAlerta(id: string, mudanca: Partial<AlertaDaOficina>): void;
}

const Contexto = createContext<Andamento | null>(null);

const DIA = 86_400_000;

/** O pedido entra no acompanhamento: dos últimos 45 dias (os mais velhos já terminaram). */
export function pedidoAcompanhavel(p: { codigo: string; quando: string }, agora = Date.now()): boolean {
  return agora - Date.parse(p.quando) < 45 * DIA && /^[A-Z0-9]{6}$/.test(p.codigo);
}

function codigosRecentes(): string[] {
  return useOficina
    .getState()
    .pedidos.filter((p) => pedidoAcompanhavel(p))
    .slice(0, 30)
    .map((p) => p.codigo);
}

/** O código do Pro guardado no aparelho (o servidor confere se ainda vale; a cota dos alertas vem dele). */
export function codigoProGuardado(): string | null {
  const { plano } = useOficina.getState();
  return plano.codigo && /^[0-9A-Z]{16}$/.test(plano.codigo) ? plano.codigo : null;
}

export function ProvedorDeAndamento({ children }: { children: ReactNode }) {
  const aparelhoId = useOficina((s) => s.aparelhoId);
  const alertasDesde = useOficina((s) => s.alertasDesde);
  const chaveCodigos = useOficina((s) => s.pedidos.map((p) => p.codigo).join(','));
  // os pedidos que a oficina já deu entrada no estoque chegaram: não contam como a caminho
  const chaveRecebidos = useOficina((s) => s.pedidos.filter((p) => p.recebidoEm).map((p) => p.codigo).join(','));
  const [alertas, setAlertas] = useState<AlertaDaOficina[]>([]);
  const [cota, setCota] = useState<CotaAlertas | null>(null);
  const [pedidos, setPedidos] = useState<Record<string, PedidoAcompanhado>>({});
  const [pronto, setPronto] = useState(false);
  const [buscados, setBuscados] = useState<ReadonlySet<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);
  const ultima = useRef(0);
  const buscando = useRef(false);
  // um pedido de atualização que chegou durante uma busca roda logo depois dela
  const deNovo = useRef<{ alertas?: boolean } | null>(null);
  // cada mudança feita na tela (pagou, cancelou, mandou um alerta) conta: a busca que começou antes
  // dela traz dados velhos e é descartada (e busca de novo)
  const mudancas = useRef(0);
  const visto = useRef<Visto | null>(null);
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

  /** Uma busca no servidor: alertas e cota, e a situação dos pedidos recentes. */
  const buscar = useCallback(
    async (id: string, opcoes: { alertas?: boolean }) => {
      const s = useOficina.getState();
      ultima.current = Date.now();
      const versao = mudancas.current;
      const codigos = codigosRecentes();
      const codigoPro = codigoProGuardado();
      try {
        const [a, p] = await Promise.all([
          s.alertasDesde || codigoPro || opcoes.alertas ? verAlertas({ aparelhoId: id, codigoPro, whatsapp: s.oficina.whatsapp }) : Promise.resolve(null),
          codigos.length ? acompanhar({ aparelhoId: id, codigos }) : Promise.resolve(null)
        ]);
        if (versao !== mudancas.current) {
          deNovo.current = { alertas: !!opcoes.alertas || !!deNovo.current?.alertas };
          return;
        }
        if (a?.ok) {
          setAlertas(a.alertas);
          setCota(a.cota);
        }
        if (p?.ok) {
          setPedidos(Object.fromEntries(p.pedidos.map((x) => [x.codigo, x])));
          setBuscados(new Set(codigos));
        }
        // compara com a última olhada (só quando as duas buscas vieram, para não avisar o que só não carregou)
        if ((!a || a.ok) && (!p || p.ok)) {
          const novosAlertas = a?.ok ? a.alertas : [];
          const novosPedidos = p?.ok ? p.pedidos : [];
          avisar(novidades(visto.current, novosAlertas, novosPedidos));
          visto.current = fotografar(novosAlertas, novosPedidos);
        }
        setErro(a && !a.ok ? a.erro : p && !p.ok ? p.erro : null);
      } catch {
        setErro('Sem conexão. Mostrando o que já tinha.');
      }
    },
    [avisar]
  );

  const atualizar = useCallback(
    async (opcoes?: { alertas?: boolean }): Promise<void> => {
      // já está buscando: guarda o pedido e busca de novo logo depois (o que mudou agora não se perde)
      if (buscando.current) {
        deNovo.current = { alertas: !!opcoes?.alertas || !!deNovo.current?.alertas };
        return;
      }
      buscando.current = true;
      try {
        let vez: { alertas?: boolean } | null = opcoes ?? {};
        while (vez) {
          deNovo.current = null;
          // o número do aparelho é lido a cada volta (pode ter sido criado ou trocado no meio)
          const s = useOficina.getState();
          const id = vez.alertas ? s.garantirAparelhoId() : s.aparelhoId;
          if (!id) break;
          await buscar(id, vez);
          vez = deNovo.current;
        }
      } finally {
        buscando.current = false;
        setPronto(true);
      }
    },
    [buscar]
  );

  // busca ao abrir e quando sai um pedido ou o primeiro alerta
  useEffect(() => {
    void atualizar();
  }, [atualizar, aparelhoId, alertasDesde, chaveCodigos]);

  // com coisa andando, busca de novo de tempos em tempos (e quando o app volta para a frente)
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
  const intervalo = entregasACaminho ? 20_000 : esperando ? 45_000 : andando ? 90_000 : 0;
  useEffect(() => {
    if (!intervalo) return;
    const t = setInterval(() => {
      // em segundo plano, só busca se der para avisar pela notificação do celular (e mais devagar)
      const visivel = document.visibilityState === 'visible';
      let notifica = false;
      try {
        notifica = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      } catch {}
      if (visivel || (notifica && Date.now() - ultima.current >= Math.max(intervalo, 60_000))) void atualizar();
    }, intervalo);
    return () => clearInterval(t);
  }, [intervalo, atualizar]);
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima.current > 15_000) void atualizar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [atualizar]);

  const guardarAlerta = useCallback((a: AlertaDaOficina, c?: CotaAlertas) => {
    mudancas.current++;
    setAlertas((lista) => [a, ...lista.filter((x) => x.id !== a.id)]);
    if (c) setCota(c);
  }, []);
  const ajustarParte = useCallback((codigo: string, fornecedorId: number, mudanca: Partial<ParteAcompanhada>) => {
    mudancas.current++;
    setPedidos((atual) => {
      const p = atual[codigo];
      if (!p) return atual;
      return { ...atual, [codigo]: { ...p, partes: p.partes.map((x) => (x.fornecedorId === fornecedorId ? { ...x, ...mudanca } : x)) } };
    });
  }, []);
  const ajustarAlerta = useCallback((id: string, mudanca: Partial<AlertaDaOficina>) => {
    mudancas.current++;
    setAlertas((lista) => lista.map((a) => (a.id === id ? { ...a, ...mudanca } : a)));
  }, []);

  const valor = useMemo(
    () => ({ alertas, cota, pedidos, pendencias, pronto, buscados, erro, atualizar, guardarAlerta, ajustarParte, ajustarAlerta }),
    [alertas, cota, pedidos, pendencias, pronto, buscados, erro, atualizar, guardarAlerta, ajustarParte, ajustarAlerta]
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAndamento(): Andamento {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAndamento fora do ProvedorDeAndamento');
  return c;
}
