import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BancoCobranca, RegistroPagamento } from './aplicar';
import { COLUNAS_ASSINATURA, COLUNAS_PAGAMENTO, type LinhaAssinatura, type LinhaPagamento, type Nota } from './tipos';

// O banco da cobrança pela chave do sistema (as funções do banco só aceitam o servidor).

function falhou(onde: string, error: { message?: string; code?: string } | null): never {
  throw new Error(`[cobranca] ${onde}: ${error?.message ?? 'erro'}${error?.code ? ` (${error.code})` : ''}`);
}

export function numeroOuZero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function lerAssinatura(l: Record<string, unknown>): LinhaAssinatura {
  return { ...(l as unknown as LinhaAssinatura), valor: numeroOuZero(l.valor) };
}

export function lerPagamento(l: Record<string, unknown>): LinhaPagamento {
  return { ...(l as unknown as LinhaPagamento), valor: numeroOuZero(l.valor), fornecedor_id: l.fornecedor_id == null ? null : Number(l.fornecedor_id) };
}

export async function registrarPagamento(sb: SupabaseClient, r: RegistroPagamento): Promise<string> {
  const { data, error } = await sb.rpc('cobranca_registrar_pagamento', {
    p_provedor: r.provedor,
    p_externo: r.externo,
    p_tipo: r.tipo,
    p_oficina: r.oficinaId,
    p_fornecedor: r.fornecedorId,
    p_assinatura: r.assinaturaId,
    p_valor: r.valor,
    p_vencimento: r.vencimento,
    p_metodo: r.metodo,
    p_descricao: r.descricao,
    p_link: r.link,
    p_pix: r.pix,
    p_boleto: r.boleto,
    p_referencia: r.referencia ?? null,
    p_user: r.userId ?? null
  });
  if (error) falhou('registrar pagamento', error);
  return String(data);
}

export async function gravarNota(sb: SupabaseClient, provedor: string, externo: string | null, n: Nota): Promise<boolean> {
  const { data, error } = await sb.rpc('cobranca_nota', {
    p_provedor: provedor,
    p_externo: externo ?? '',
    p_nota: n.externa || null,
    p_numero: n.numero,
    p_url: n.url,
    p_situacao: n.situacao,
    p_erro: n.erro ?? null
  });
  if (error) falhou('nota', error);
  return data === true;
}

export function bancoSupabase(sb: SupabaseClient): BancoCobranca {
  async function rpcBool(nome: string, args: Record<string, unknown>): Promise<boolean> {
    const { data, error } = await sb.rpc(nome, args);
    if (error) falhou(nome, error);
    return data === true;
  }
  return {
    async assinaturaPorExterna(provedor, externa) {
      const { data, error } = await sb.from('assinaturas_pro').select(COLUNAS_ASSINATURA).eq('provedor', provedor).eq('assinatura_externa', externa).maybeSingle();
      if (error) falhou('assinatura', error);
      return data ? lerAssinatura(data as Record<string, unknown>) : null;
    },
    async pagamentoPorExterno(provedor, externo) {
      const { data, error } = await sb.from('pagamentos').select(COLUNAS_PAGAMENTO).eq('provedor', provedor).eq('externo', externo).maybeSingle();
      if (error) falhou('pagamento', error);
      return data ? lerPagamento(data as Record<string, unknown>) : null;
    },
    registrarPagamento: (r) => registrarPagamento(sb, r),
    async confirmarPagamento(provedor, externo, pagoEm) {
      const { data, error } = await sb.rpc('cobranca_pagamento_confirmado', { p_provedor: provedor, p_externo: externo, p_pago_em: pagoEm });
      if (error) falhou('confirmar', error);
      const r = (data ?? {}) as { achou?: boolean; aplicado?: boolean };
      return { achou: !!r.achou, aplicado: !!r.aplicado };
    },
    pagamentoAtrasado: (provedor, externo) => rpcBool('cobranca_pagamento_atrasado', { p_provedor: provedor, p_externo: externo }),
    pagamentoDesfeito: (provedor, externo, situacao) => rpcBool('cobranca_pagamento_desfeito', { p_provedor: provedor, p_externo: externo, p_situacao: situacao }),
    gravarNota: (provedor, externo, nota) => gravarNota(sb, provedor, externo, nota),
    assinaturaCancelada: (provedor, externa) => rpcBool('cobranca_assinatura_cancelada', { p_provedor: provedor, p_externa: externa }),
    autorizacaoAprovada: (provedor, externa) => rpcBool('cobranca_autorizacao_aprovada', { p_provedor: provedor, p_externa: externa })
  };
}
