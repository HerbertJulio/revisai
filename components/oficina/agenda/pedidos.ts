'use client';

// Os pedidos de horário que chegam pelo link público. Só com a conta: ficam no banco
// (public.agendamentos_online) e chegam pelo tempo real filtrado pela oficina; sem tempo real,
// a tela busca de novo a cada 15 segundos enquanto está aberta. Um estado só para o app inteiro
// (a aba de pedidos, o número na aba e o painel do início usam o mesmo).

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';

export type SituacaoPedido = 'novo' | 'aceito' | 'recusado' | 'cancelado';

export interface PedidoOnline {
  id: string;
  data: string;
  hora: string;
  duracaoMin: number;
  nome: string;
  telefone: string;
  placa: string | null;
  servico: string;
  observacao: string | null;
  situacao: SituacaoPedido;
  criadoEm: string;
  respondidoEm: string | null;
  agendamentoId: string | null;
}

interface EstadoPedidos {
  oficinaId: string | null;
  pedidos: PedidoOnline[];
  carregado: boolean;
  erro: string | null;
  tempoReal: boolean;
}

const VAZIO: EstadoPedidos = { oficinaId: null, pedidos: [], carregado: false, erro: null, tempoReal: false };
const COLUNAS = 'id, data, hora, duracao_min, nome, telefone, placa, servico, observacao, situacao, criado_em, respondido_em, agendamento_id';
const RESERVA_MS = 15_000;

let estado: EstadoPedidos = VAZIO;
const ouvintes = new Set<() => void>();

function mudar(parte: Partial<EstadoPedidos>) {
  estado = { ...estado, ...parte };
  for (const f of ouvintes) f();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function lerPedido(l: Record<string, unknown>): PedidoOnline {
  const situacao = texto(l.situacao);
  return {
    id: texto(l.id),
    data: texto(l.data).slice(0, 10),
    hora: texto(l.hora),
    duracaoMin: Number(l.duracao_min) || 30,
    nome: texto(l.nome),
    telefone: texto(l.telefone),
    placa: l.placa ? texto(l.placa) : null,
    servico: texto(l.servico),
    observacao: l.observacao ? texto(l.observacao) : null,
    situacao: situacao === 'aceito' || situacao === 'recusado' || situacao === 'cancelado' ? situacao : 'novo',
    criadoEm: texto(l.criado_em),
    respondidoEm: l.respondido_em ? texto(l.respondido_em) : null,
    agendamentoId: l.agendamento_id ? texto(l.agendamento_id) : null
  };
}

// ---------------------------------------------------------------- busca e tempo real

let sbAtual: SupabaseClient | null = null;
let usuarios = 0;
let canal: RealtimeChannel | null = null;
let reserva: ReturnType<typeof setInterval> | null = null;
let buscando: Promise<void> | null = null;

/** Os novos (todos) e os respondidos nos últimos 30 dias. */
async function buscar(): Promise<void> {
  const sb = sbAtual;
  const oficinaId = estado.oficinaId;
  if (!sb || !oficinaId) return;
  if (buscando) return buscando;
  buscando = (async () => {
    try {
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [novos, respondidos] = await Promise.all([
        sb.from('agendamentos_online').select(COLUNAS).eq('oficina_id', oficinaId).eq('situacao', 'novo').order('data').order('hora').limit(200),
        sb.from('agendamentos_online').select(COLUNAS).eq('oficina_id', oficinaId).neq('situacao', 'novo').gte('respondido_em', desde).order('respondido_em', { ascending: false }).limit(50)
      ]);
      if (estado.oficinaId !== oficinaId) return;
      const erro = novos.error ?? respondidos.error;
      if (erro) {
        mudar({ erro: 'Não deu para buscar os pedidos agora.', carregado: true });
        return;
      }
      const lista = [...(novos.data ?? []), ...(respondidos.data ?? [])].map((l) => lerPedido(l as Record<string, unknown>));
      mudar({ pedidos: lista, carregado: true, erro: null });
    } catch {
      mudar({ erro: 'Sem conexão para buscar os pedidos.', carregado: true });
    } finally {
      buscando = null;
    }
  })();
  return buscando;
}

function aoVoltar() {
  if (document.visibilityState === 'visible') void buscar();
}

let geracao = 0;

function ligar(sb: SupabaseClient, oficinaId: string): () => void {
  if (estado.oficinaId !== oficinaId || sbAtual !== sb) {
    desligarTudo();
    geracao++;
    sbAtual = sb;
    estado = { ...VAZIO, oficinaId };
    for (const f of ouvintes) f();
  }
  const minha = geracao;
  usuarios++;
  if (usuarios === 1) {
    void buscar();
    try {
      canal = sb
        .channel(`agenda-pedidos-${oficinaId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos_online', filter: `oficina_id=eq.${oficinaId}` }, () => void buscar())
        .subscribe((status) => {
          const ligado = status === 'SUBSCRIBED';
          if (ligado !== estado.tempoReal) mudar({ tempoReal: ligado });
          if (ligado) void buscar();
        });
    } catch {
      canal = null;
    }
    // reserva: sem o tempo real, busca de novo a cada 15 segundos enquanto a tela está visível
    reserva = setInterval(() => {
      if (!estado.tempoReal && document.visibilityState === 'visible') void buscar();
    }, RESERVA_MS);
    document.addEventListener('visibilitychange', aoVoltar);
  }
  return () => {
    // a oficina mudou no meio: a ligação antiga já foi desfeita
    if (minha !== geracao) return;
    usuarios = Math.max(0, usuarios - 1);
    if (usuarios === 0) desligarTudo();
  };
}

function desligarTudo() {
  if (reserva) clearInterval(reserva);
  reserva = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar);
  if (canal && sbAtual) void sbAtual.removeChannel(canal).catch(() => {});
  canal = null;
  usuarios = 0;
}

/** Os pedidos pelo link desta oficina (vazio sem conta). */
export function usePedidosOnline() {
  const { banco, oficina } = useConta();
  const oficinaId = oficina?.id ?? null;
  useEffect(() => {
    if (!oficinaId) return;
    const sb = banco();
    if (!sb) return;
    return ligar(sb, oficinaId);
  }, [oficinaId, banco]);
  const atual = useSyncExternalStore(assinar, () => estado, () => VAZIO);
  const valido = !!oficinaId && atual.oficinaId === oficinaId;
  const atualizar = useCallback(() => buscar(), []);
  return {
    comConta: !!oficinaId,
    pedidos: valido ? atual.pedidos : [],
    novos: valido ? atual.pedidos.filter((p) => p.situacao === 'novo') : [],
    carregado: valido ? atual.carregado : !oficinaId,
    erro: valido ? atual.erro : null,
    tempoReal: valido && atual.tempoReal,
    atualizar
  };
}

/** Mostra a resposta na lista na hora (antes de a busca voltar). */
export function ajustarPedido(id: string, mudanca: Partial<PedidoOnline>): void {
  mudar({ pedidos: estado.pedidos.map((p) => (p.id === id ? { ...p, ...mudanca } : p)) });
}

export type Resposta = { ok: true; situacao: SituacaoPedido; agendamentoId: string | null } | { ok: false; erro: string };

/** Responde o pedido no banco (aceito com o id do agendamento que entra na agenda, recusado ou cancelado). */
export async function responderPedido(sb: SupabaseClient, id: string, situacao: Exclude<SituacaoPedido, 'novo'>, agendamentoId: string | null = null): Promise<Resposta> {
  try {
    const { data, error } = await sb.rpc('agenda_responder', { p_id: id, p_situacao: situacao, p_agendamento_id: agendamentoId });
    if (error) {
      if (error.code === 'RV074') return { ok: false, erro: 'Este pedido já foi respondido em outro aparelho.' };
      if (error.code === '42501') return { ok: false, erro: 'Sem permissão para responder este pedido.' };
      return { ok: false, erro: 'Não deu para responder agora. Tente de novo.' };
    }
    const r = (data ?? {}) as { situacao?: string; agendamentoId?: string | null };
    const s = r.situacao === 'aceito' || r.situacao === 'recusado' || r.situacao === 'cancelado' ? r.situacao : situacao;
    ajustarPedido(id, { situacao: s, agendamentoId: r.agendamentoId ?? null, respondidoEm: new Date().toISOString() });
    void buscar();
    return { ok: true, situacao: s, agendamentoId: r.agendamentoId ?? null };
  } catch {
    return { ok: false, erro: 'Sem conexão. Tente de novo.' };
  }
}
