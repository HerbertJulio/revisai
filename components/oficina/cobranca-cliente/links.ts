'use client';

// Os links de cobrança no app da oficina: publicar a página do Pix, ler os avisos "Já paguei" dos
// clientes (só dono e gerente leem esses links no banco) e confirmar o pagamento, que entra no
// financeiro como conta recebida. Confirmar duas vezes, ou em dois aparelhos, não duplica nada.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mensalidadePaga, nomeDaCompetencia } from '@/lib/clube';
import {
  COLUNAS_DO_LINK,
  idDoLancamentoDaMensalidade,
  idDoLancamentoDoLink,
  lancamentoRecebido,
  lerDadosDoPagamento,
  lerLinkDeCobranca,
  lerRespostaPaguei,
  type LinkDeCobranca
} from '@/lib/cobranca-cliente';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { cartaoMudou } from '../clube/cartao';
import { publicarLink } from './publicar';

export { publicarLink };

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
  const chave = `${oficinaId}|${filtro.documentoId ?? ''}|${filtro.pendentes ? 1 : 0}`;
  const atual = useRef(chave);
  atual.current = chave;
  const { documentoId, pendentes } = filtro;

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

/** Marca a mensalidade do clube como paga: a conta recebida entra no financeiro (categoria clube). */
export function marcarMensalidadePaga(cobrancaId: Id, hoje: string): boolean {
  const s = useOficina.getState();
  const c = s.clubeCobrancas[cobrancaId];
  if (!c) return false;
  if (c.pagoEm && c.lancamentoId) return true;
  const membro = s.clubeMembros[c.membroId];
  const plano = membro ? s.clubePlanos[membro.planoId] : undefined;
  const lancamentoId = idDoLancamentoDaMensalidade(c.id);
  s.salvarRegistro(
    'lancamentos',
    lancamentoRecebido({
      id: lancamentoId,
      valor: c.valor,
      hoje: c.pagoEm ?? hoje,
      descricao: `Clube ${plano?.nome ?? ''}: mensalidade de ${nomeDaCompetencia(c.competencia)}`.replace(/\s+/g, ' '),
      categoria: 'clube',
      clienteId: membro?.clienteId ?? null
    })
  );
  s.salvarRegistro('clubeCobrancas', mensalidadePaga(c, hoje, lancamentoId));
  cartaoMudou(c.membroId);
  return true;
}

export interface Confirmacao {
  ok: boolean;
  erro?: string;
}

/**
 * O cliente avisou que pagou e a oficina viu o Pix na conta: grava a conta recebida (ou a
 * mensalidade paga), marca o aviso como tratado e mostra "pago" na página do cliente.
 */
export async function confirmarPagamento(l: LinkDeCobranca, sb: SupabaseClient, oficinaId: string, hoje: string): Promise<Confirmacao> {
  const s = useOficina.getState();
  if (l.tipo === 'clube') {
    const competencia = lerRespostaPaguei(l.resposta)?.competencia;
    const c = Object.values(s.clubeCobrancas).find((x) => x.membroId === l.ref && x.competencia === competencia);
    if (!c) return { ok: false, erro: `Não achei a mensalidade de ${competencia ? nomeDaCompetencia(competencia) : 'este mês'}. Gere as mensalidades do mês no Clube e confirme de novo.` };
    marcarMensalidadePaga(c.id, hoje);
  } else {
    const dados = lerDadosDoPagamento(l.dados);
    if (!dados) return { ok: false, erro: 'Esta cobrança não abriu. Confira no app do banco e lance à mão no financeiro.' };
    if (dados.cobrancaId) {
      if (!marcarMensalidadePaga(dados.cobrancaId, hoje)) return { ok: false, erro: 'Esta mensalidade não existe mais no Clube.' };
    } else {
      const doc = dados.documentoId ? s.documentos[dados.documentoId] : undefined;
      const veiculo = doc?.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
      s.salvarRegistro(
        'lancamentos',
        lancamentoRecebido({
          id: idDoLancamentoDoLink(l.id),
          valor: dados.valor,
          hoje,
          descricao: `Pix ${dados.titulo || 'da cobrança'}`.slice(0, 200),
          categoria: 'servico',
          clienteId: veiculo?.clienteId ?? null,
          documentoId: dados.documentoId
        })
      );
    }
    try {
      await publicarLink(sb, oficinaId, 'pagamento', l.ref, { ...l.dados, pago: true, pagoEm: hoje }, 15);
    } catch {
      // a página do cliente continua mostrando o aviso; o pagamento já está lançado
    }
  }
  const { error } = await sb.rpc('link_processado', { p_id: l.id });
  if (error) return { ok: false, erro: 'O pagamento foi lançado, mas o aviso não saiu da lista. Tente de novo.' };
  return { ok: true };
}

/** O Pix ainda não caiu: o aviso sai da lista e o cliente pode avisar de novo pela página. */
export async function avisoNaoConfere(l: LinkDeCobranca, sb: SupabaseClient): Promise<Confirmacao> {
  const { error } = await sb.rpc('link_processado', { p_id: l.id });
  return error ? { ok: false, erro: 'Não deu para tirar o aviso agora. Tente de novo.' } : { ok: true };
}
