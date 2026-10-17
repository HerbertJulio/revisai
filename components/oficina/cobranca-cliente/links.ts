'use client';

// Os links de cobrança no app da oficina: ler os avisos "Já paguei" dos clientes (só o dono e o
// gerente leem esses links no banco) e confirmar o pagamento, que entra no financeiro com os
// lançamentos dele (quita a conta em aberto da ordem, ou vira um recebimento por Pix). Quem marca
// o aviso como tratado primeiro é quem lança: dois aparelhos não lançam o mesmo Pix duas vezes.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mensalidadePaga, nomeDaCompetencia } from '@/lib/clube';
import {
  COLUNAS_DO_LINK,
  idDoLancamentoDaMensalidade,
  lancamentoDoPixDaOrdem,
  lerDadosDoPagamento,
  lerLinkDeCobranca,
  lerRespostaPaguei,
  recebimentoPorPix,
  type LinkDeCobranca
} from '@/lib/cobranca-cliente';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { cartaoMudou } from '../clube/cartao';

/**
 * Troca só o que o cliente vê num link que já existe (o endereço continua o mesmo). Aqui não se
 * sabe o endereço: o publicador comum geraria um endereço novo, e o do cliente pararia de valer.
 */
async function trocarDadosDoLink(sb: SupabaseClient, oficinaId: string, l: LinkDeCobranca, dados: object): Promise<void> {
  const { error } = await sb.rpc('publicar_link', { p_oficina: oficinaId, p_tipo: l.tipo, p_ref: l.ref, p_dados: dados, p_dias: l.tipo === 'clube' ? 400 : 30, p_placa: null, p_novo: false });
  if (error) throw error;
}

export async function lerLinksDeCobranca(sb: SupabaseClient, oficinaId: string, filtro: { documentoId?: Id; pendentes?: boolean } = {}): Promise<LinkDeCobranca[]> {
  let q = sb.from('links_publicos').select(COLUNAS_DO_LINK).eq('oficina_id', oficinaId).in('tipo', ['pagamento', 'clube']).eq('revogado', false);
  if (filtro.documentoId) q = q.eq('dados->>documentoId', filtro.documentoId);
  if (filtro.pendentes) q = q.not('respondido_em', 'is', null).is('processado_em', null);
  const { data, error } = await q.order('criado_em', { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []).map(lerLinkDeCobranca).filter((l): l is LinkDeCobranca => !!l);
}

/** Os links de cobrança da oficina, lidos de novo de tempos em tempos e ao voltar para o app. */
export function useLinksDeCobranca(sb: SupabaseClient | null, oficinaId: string | null, filtro: { documentoId?: Id; pendentes?: boolean }, intervaloMs = 30_000) {
  const [links, setLinks] = useState<LinkDeCobranca[]>([]);
  const [carregado, setCarregado] = useState(false);
  const { documentoId, pendentes } = filtro;
  const chave = `${oficinaId}|${documentoId ?? ''}|${pendentes ? 1 : 0}`;
  const atual = useRef(chave);
  useEffect(() => {
    atual.current = chave;
  }, [chave]);

  const recarregar = useCallback(async () => {
    if (!sb || !oficinaId) return;
    const pedido = chave;
    try {
      const lista = await lerLinksDeCobranca(sb, oficinaId, { documentoId, pendentes });
      if (atual.current === pedido) {
        setLinks(lista);
        setCarregado(true);
      }
    } catch {
      // sem rede: fica o que já tinha
    }
  }, [sb, oficinaId, documentoId, pendentes, chave]);

  useEffect(() => {
    if (!sb || !oficinaId) return;
    void recarregar();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recarregar();
    }, intervaloMs);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void recarregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [sb, oficinaId, recarregar, intervaloMs]);

  return { links, carregado, recarregar };
}

/** Marca a mensalidade do clube como paga: a conta recebida (categoria clube) entra no financeiro. */
export function marcarMensalidadePaga(cobrancaId: Id, hoje: string): boolean {
  const s = useOficina.getState();
  const c = s.clubeCobrancas[cobrancaId];
  if (!c) return false;
  const membro = s.clubeMembros[c.membroId];
  const plano = membro ? s.clubePlanos[membro.planoId] : undefined;
  const lancamentoId = c.lancamentoId ?? idDoLancamentoDaMensalidade(c.id);
  if (!s.lancamentos[lancamentoId]) {
    s.salvarRegistro(
      'lancamentos',
      recebimentoPorPix({
        id: lancamentoId,
        valor: c.valor,
        hoje: c.pagoEm ?? hoje,
        descricao: `Clube ${plano?.nome ?? ''}: mensalidade de ${nomeDaCompetencia(c.competencia)}`.replace(/\s+/g, ' '),
        categoria: 'clube',
        clienteId: membro?.clienteId ?? null
      })
    );
  }
  if (!c.pagoEm || c.lancamentoId !== lancamentoId) s.salvarRegistro('clubeCobrancas', mensalidadePaga(c, hoje, lancamentoId));
  cartaoMudou(c.membroId);
  return true;
}

/** Lança o Pix confirmado: a mensalidade do clube, ou o Pix da ordem no financeiro. */
function lancarPix(l: LinkDeCobranca, hoje: string): { ok: boolean; erro?: string } {
  const s = useOficina.getState();
  if (l.tipo === 'clube') {
    const competencia = lerRespostaPaguei(l.resposta)?.competencia;
    const c = Object.values(s.clubeCobrancas).find((x) => x.membroId === l.ref && x.competencia === competencia);
    if (!c) return { ok: false, erro: `Não achei a mensalidade de ${competencia ? nomeDaCompetencia(competencia) : 'este mês'} no Clube. Gere as mensalidades do mês e marque como paga lá.` };
    marcarMensalidadePaga(c.id, hoje);
    return { ok: true };
  }
  const dados = lerDadosDoPagamento(l.dados);
  if (!dados) return { ok: false, erro: 'Esta cobrança não abriu. Lance o recebimento à mão no financeiro.' };
  if (dados.cobrancaId) return marcarMensalidadePaga(dados.cobrancaId, hoje) ? { ok: true } : { ok: false, erro: 'Esta mensalidade não existe mais no Clube.' };
  if (!dados.documentoId) return { ok: false, erro: 'Esta cobrança não é de uma ordem. Lance o recebimento à mão no financeiro.' };
  const doc = s.documentos[dados.documentoId];
  const veiculo = doc?.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
  const r = lancamentoDoPixDaOrdem(
    {
      linkId: l.id,
      valor: dados.valor,
      hoje,
      descricao: `Pix ${dados.titulo || 'da cobrança'}`,
      clienteId: veiculo?.clienteId ?? null,
      documentoId: dados.documentoId,
      observacao: l.codigo ? `Pix pelo link ${l.codigo}` : undefined
    },
    Object.values(s.lancamentos)
  );
  if (r.quitar) s.salvarRegistro('lancamentos', r.quitar);
  if (r.novo) s.salvarRegistro('lancamentos', r.novo);
  return { ok: true };
}

export interface Confirmacao {
  ok: boolean;
  erro?: string;
  /** Outro aparelho já tinha confirmado (nada foi lançado de novo). */
  jaTratado?: boolean;
}

/**
 * O cliente avisou que pagou (ou a oficina viu o Pix na conta): marca o aviso como tratado e,
 * se foi este aparelho que marcou, lança no financeiro e mostra "pago" na página do cliente.
 */
export async function confirmarPagamento(l: LinkDeCobranca, sb: SupabaseClient, oficinaId: string, hoje: string): Promise<Confirmacao> {
  const { data, error } = await sb.rpc('link_processado', { p_id: l.id });
  if (error) return { ok: false, erro: 'Não deu para confirmar agora. Confira a internet e tente de novo.' };
  // false com o aviso ainda aberto aqui: outro aparelho marcou antes (e lançou). Já tratado antes
  // ("ainda não caiu") e o Pix caiu depois: lança agora (o id fixo não deixa duplicar).
  if (data === false && !l.processadoEm) return { ok: true, jaTratado: true };
  const r = lancarPix(l, hoje);
  if (!r.ok) return r;
  if (l.tipo === 'pagamento') {
    try {
      await trocarDadosDoLink(sb, oficinaId, l, { ...l.dados, pago: true, pagoEm: hoje });
    } catch {
      // a página do cliente continua sem o "pago"; o dinheiro já está lançado
    }
  }
  return { ok: true };
}

/** O Pix ainda não caiu: o aviso sai da lista e a página do cliente volta a mostrar o "Já paguei". */
export async function avisoNaoConfere(l: LinkDeCobranca, sb: SupabaseClient, oficinaId: string): Promise<Confirmacao> {
  const { error } = await sb.rpc('link_processado', { p_id: l.id });
  if (error) return { ok: false, erro: 'Não deu para tirar o aviso agora. Tente de novo.' };
  try {
    await trocarDadosDoLink(sb, oficinaId, l, { ...l.dados, naoCaiuEm: new Date().toISOString() });
  } catch {
    // o aviso já saiu da lista; a página só demora a mostrar o botão de novo
  }
  return { ok: true };
}
