import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import type { SituacaoParte } from '../marketplace-dados';
import { mensagemDaLoja, podeMudar } from './comum';

// A loja anda com a parte dela do pedido. As regras (para a frente, cancelado com motivo, quem muda
// o quê) estão no banco; aqui a loja só pede, como ela mesma.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const ERRO = 'Não deu para salvar agora. Tente de novo.';

async function parte(sb: SupabaseClient, fornecedorId: number, parteId: number): Promise<{ status: SituacaoParte } | null> {
  const { data, error } = await sb.from('pedidos_fornecedores').select('status').eq('id', parteId).eq('fornecedor_id', fornecedorId).maybeSingle();
  if (error || !data) return null;
  return data as { status: SituacaoParte };
}

export async function mudarSituacao(sb: SupabaseClient, fornecedorId: number, parteId: number, status: SituacaoParte, motivo?: string | null): Promise<Gravacao> {
  const atual = await parte(sb, fornecedorId, parteId);
  if (!atual) return { ok: false, erro: 'Pedido não encontrado.' };
  if (atual.status === status) return { ok: true };
  if (!podeMudar(atual.status, status)) return { ok: false, erro: mensagemDaLoja({ code: 'RV010' }) };
  const limpo = (motivo ?? '').trim().slice(0, 200);
  if (status === 'cancelado' && !limpo) return { ok: false, erro: mensagemDaLoja({ code: 'RV011' }) };
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update(status === 'cancelado' ? { status, cancelado_motivo: limpo } : { status })
    .eq('id', parteId)
    .eq('fornecedor_id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[loja] situação', error);
    return { ok: false, erro: mensagemDaLoja(error, ERRO) };
  }
  return data ? { ok: true } : { ok: false, erro: 'Pedido não encontrado.' };
}

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Saiu para a entrega: gera o link do entregador (o banco guarda só o hash) e conta a validade
 * de novo. Só depois de a loja confirmar o pedido.
 */
export async function saidaParaEntrega(sb: SupabaseClient, fornecedorId: number, parteId: number, previsao: string): Promise<Gravacao<{ token: string }>> {
  const atual = await parte(sb, fornecedorId, parteId);
  if (!atual) return { ok: false, erro: 'Pedido não encontrado.' };
  if (atual.status === 'entregue' || atual.status === 'cancelado') return { ok: false, erro: 'Este pedido já terminou.' };
  if (atual.status !== 'confirmado' && atual.status !== 'saiu_entrega') return { ok: false, erro: 'Confirme o pedido antes de mandar para a entrega.' };
  const token = randomBytes(32).toString('base64url');
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update({ status: 'saiu_entrega', entrega_hash: hashDoToken(token), entrega_previsao: previsao.trim().slice(0, 40) || null, entrega_saiu_em: new Date().toISOString() })
    .eq('id', parteId)
    .eq('fornecedor_id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[loja] saída', error);
    return { ok: false, erro: error ? mensagemDaLoja(error, 'Não deu para marcar a saída agora. Tente de novo.') : 'Pedido não encontrado.' };
  }
  return { ok: true, token };
}

export async function confirmarPagamento(sb: SupabaseClient, fornecedorId: number, parteId: number, confirmado: boolean): Promise<Gravacao> {
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update({ pagamento: confirmado ? 'confirmado' : 'pendente' })
    .eq('id', parteId)
    .eq('fornecedor_id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[loja] pagamento', error);
    return { ok: false, erro: error ? mensagemDaLoja(error, ERRO) : 'Pedido não encontrado.' };
  }
  return { ok: true };
}
