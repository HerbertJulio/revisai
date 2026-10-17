'use client';

// O cartão do membro do clube (link público tipo 'clube') e o link de pagamento de cada
// mensalidade (tipo 'pagamento'). O cartão mostra os benefícios que restam e a mensalidade em
// aberto: quando um uso é registrado ou uma mensalidade é paga, os dados dele são publicados de novo.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { dadosDoCartao, nomeDaCompetencia, txidDaMensalidade, urlDoCartao } from '@/lib/clube';
import { dadosDoPagamento, recebedorDaOficina, urlDoPagamento } from '@/lib/cobranca-cliente';
import { hojeISO } from '@/lib/datas';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { publicarLink } from '../cobranca-cliente/publicar';

/** O cartão vale um ano e é renovado a cada atualização. */
const DIAS_DO_CARTAO = 400;
const DIAS_DA_MENSALIDADE = 45;

function dadosDoMembro(membroId: Id, hoje: string) {
  const s = useOficina.getState();
  const membro = s.clubeMembros[membroId];
  const plano = membro ? s.clubePlanos[membro.planoId] : undefined;
  if (!membro || !plano) return null;
  const cliente = s.clientes[membro.clienteId];
  const veiculo = membro.veiculoId ? s.veiculos[membro.veiculoId] : undefined;
  return {
    membro,
    plano,
    cliente,
    dados: dadosDoCartao({
      membro,
      plano,
      cliente: cliente?.nome ?? '',
      oficina: s.oficina.nome,
      veiculo,
      cobrancas: Object.values(s.clubeCobrancas),
      recebedor: recebedorDaOficina(s.oficina),
      hoje
    })
  };
}

/** Publica o cartão (ou atualiza os dados do que já existe) e guarda o endereço no membro. */
export async function publicarCartao(sb: SupabaseClient, oficinaId: string, membroId: Id, hoje = hojeISO()): Promise<{ url: string | null; codigo: string | null }> {
  const m = dadosDoMembro(membroId, hoje);
  if (!m) throw new Error('membro sem plano');
  const r = await publicarLink(sb, oficinaId, 'clube', membroId, m.dados, DIAS_DO_CARTAO);
  if (r.token) {
    const url = urlDoCartao(window.location.origin, r.token);
    const atual = useOficina.getState().clubeMembros[membroId];
    if (atual) useOficina.getState().salvarRegistro('clubeMembros', { ...atual, cartao: { codigo: r.codigo, url } });
    return { url, codigo: r.codigo };
  }
  return { url: m.membro.cartao?.url ?? null, codigo: r.codigo ?? m.membro.cartao?.codigo ?? null };
}

/** Atualiza os dados do cartão já mandado ao cliente (nada acontece se ainda não tem cartão). */
export async function atualizarCartao(sb: SupabaseClient, oficinaId: string, membroId: Id, hoje = hojeISO()): Promise<void> {
  const m = dadosDoMembro(membroId, hoje);
  if (!m?.membro.cartao) return;
  await publicarLink(sb, oficinaId, 'clube', membroId, m.dados, DIAS_DO_CARTAO);
}

/** O link de pagamento da mensalidade (o mesmo endereço quando já foi mandado). */
export async function linkDaMensalidade(sb: SupabaseClient, oficinaId: string, cobrancaId: Id, hoje = hojeISO()): Promise<{ url: string | null; pix: string } | null> {
  const s = useOficina.getState();
  const c = s.clubeCobrancas[cobrancaId];
  const membro = c ? s.clubeMembros[c.membroId] : undefined;
  const plano = membro ? s.clubePlanos[membro.planoId] : undefined;
  const recebedor = recebedorDaOficina(s.oficina);
  if (!c || !membro || !plano || !recebedor) return null;
  const cliente = s.clientes[membro.clienteId];
  const dados = dadosDoPagamento({
    recebedor,
    valor: c.valor,
    descricao: `Clube ${plano.nome}: mensalidade de ${nomeDaCompetencia(c.competencia)}`,
    titulo: `Mensalidade de ${nomeDaCompetencia(c.competencia)}`,
    cliente: cliente?.nome ?? '',
    oficina: s.oficina.nome,
    hoje,
    txid: txidDaMensalidade(c),
    dias: DIAS_DA_MENSALIDADE,
    cobrancaId: c.id,
    membroId: membro.id,
    competencia: c.competencia
  });
  const r = await publicarLink(sb, oficinaId, 'pagamento', `mensalidade-${c.id}`, c.pagoEm ? { ...dados, pago: true, pagoEm: c.pagoEm } : dados, DIAS_DA_MENSALIDADE);
  if (r.token) {
    const url = urlDoPagamento(window.location.origin, r.token);
    const atual = useOficina.getState().clubeCobrancas[c.id];
    if (atual) useOficina.getState().salvarRegistro('clubeCobrancas', { ...atual, link: { codigo: r.codigo, url } });
    return { url, pix: dados.pix };
  }
  return { url: c.link?.url ?? null, pix: dados.pix };
}

// ---------------------------------------------------------------- avisos de mudança

let publicador: ((membroId: Id) => void) | null = null;
const pendentes = new Set<Id>();

/** O membro mudou (uso registrado, mensalidade paga): o cartão dele é publicado de novo. */
export function cartaoMudou(membroId: Id): void {
  if (publicador) publicador(membroId);
  else pendentes.add(membroId);
}

/** Liga a atualização dos cartões enquanto a tela tem o banco (com a conta). */
export function usePublicadorDoCartao(sb: SupabaseClient | null, oficinaId: string | null): void {
  useEffect(() => {
    if (!sb || !oficinaId) return;
    const fn = (membroId: Id) => {
      void atualizarCartao(sb, oficinaId, membroId).catch(() => {});
    };
    publicador = fn;
    for (const id of pendentes) fn(id);
    pendentes.clear();
    return () => {
      if (publicador === fn) publicador = null;
    };
  }, [sb, oficinaId]);
}
