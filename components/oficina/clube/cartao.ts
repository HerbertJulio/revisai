'use client';

// O cartão do membro do clube (link público tipo 'clube') e o link de pagamento de cada
// mensalidade (tipo 'pagamento'), publicados como os outros links do cliente (lib/links-publicos).
// O cartão mostra os benefícios que restam e a mensalidade em aberto: quando um uso é registrado
// ou uma mensalidade é paga, os dados dele são publicados de novo (o endereço continua o mesmo).

import type { SupabaseClient } from '@supabase/supabase-js';
import { dadosDoCartao, nomeDaCompetencia, txidDaMensalidade } from '@/lib/clube';
import { dadosDoPagamento, recebedorDaOficina } from '@/lib/cobranca-cliente';
import { hojeISO } from '@/lib/datas';
import { publicarLink, type LinkGuardado, type ResultadoDaPublicacao } from '@/lib/links-publicos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { contextoDaConta } from '../servico/conta';

/** O cartão vale pouco mais de um ano e é renovado a cada atualização. */
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

/** Publica o cartão (ou atualiza o que já existe, no mesmo endereço) e guarda o endereço no membro. */
export async function publicarCartao(sb: SupabaseClient, oficinaId: string, membroId: Id, hoje = hojeISO()): Promise<ResultadoDaPublicacao> {
  const m = dadosDoMembro(membroId, hoje);
  if (!m) return { ok: false, erro: 'Este membro está sem plano.' };
  const r = await publicarLink(sb, window.location.origin, { oficinaId, tipo: 'clube', ref: membroId, dados: m.dados, dias: DIAS_DO_CARTAO }, m.membro.cartao);
  if (r.ok) guardarNoMembro(membroId, r.link);
  return r;
}

function guardarNoMembro(membroId: Id, link: LinkGuardado) {
  const atual = useOficina.getState().clubeMembros[membroId];
  if (atual && (atual.cartao?.url !== link.url || atual.cartao?.codigo !== link.codigo)) useOficina.getState().salvarRegistro('clubeMembros', { ...atual, cartao: link });
}

/** Atualiza o cartão já mandado ao cliente (nada acontece se ele ainda não tem cartão). */
export async function atualizarCartao(sb: SupabaseClient, oficinaId: string, membroId: Id, hoje = hojeISO()): Promise<void> {
  const m = dadosDoMembro(membroId, hoje);
  if (!m?.membro.cartao?.url) return;
  const r = await publicarLink(sb, window.location.origin, { oficinaId, tipo: 'clube', ref: membroId, dados: m.dados, dias: DIAS_DO_CARTAO }, m.membro.cartao);
  if (r.ok) guardarNoMembro(membroId, r.link);
}

/** O link de pagamento da mensalidade (o mesmo endereço quando já foi mandado). */
export async function linkDaMensalidade(sb: SupabaseClient, oficinaId: string, cobrancaId: Id, hoje = hojeISO()): Promise<{ url: string | null; pix: string; erro?: string } | null> {
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
  const r = await publicarLink(
    sb,
    window.location.origin,
    { oficinaId, tipo: 'pagamento', ref: `mensalidade-${c.id}`, dados: c.pagoEm ? { ...dados, pago: true, pagoEm: c.pagoEm } : dados, dias: DIAS_DA_MENSALIDADE },
    c.link
  );
  if (!r.ok) return { url: null, pix: dados.pix, erro: r.erro };
  const atual = useOficina.getState().clubeCobrancas[c.id];
  if (atual && atual.link?.url !== r.link.url) useOficina.getState().salvarRegistro('clubeCobrancas', { ...atual, link: r.link });
  return { url: r.link.url ?? null, pix: dados.pix };
}

/**
 * O membro mudou (uso registrado ao concluir a ordem, mensalidade paga): publica o cartão de
 * novo com a conta ligada a este aparelho. Sem conta, não há cartão para atualizar.
 */
export function cartaoMudou(membroId: Id): void {
  const ctx = contextoDaConta();
  if (!ctx || ctx.papel === 'mecanico') return;
  void atualizarCartao(ctx.sb, ctx.oficinaId, membroId).catch(() => {});
}
