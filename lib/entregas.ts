import 'server-only';

// O pedido depois de enviado: a oficina acompanha a parte de cada loja, paga por Pix direto para a
// loja e vê a entrega no mapa; a loja confirma o pagamento e manda o link para o entregador; o
// celular do entregador manda a posição.
// A oficina fala com o banco como a pessoa que entrou (o banco só mostra as partes da oficina
// dela). A loja e o entregador usam os módulos de lib/loja e as funções públicas do banco.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { montarPedidos, type LinhaDaParte, type LinhaDoHistorico, type PedidoAcompanhado, type SituacaoPagamento } from './entregas-dados';
import { codigoPix, normalizarChavePix, type TipoChavePix } from './pix';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };
const ERRO = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);

const COLUNAS_PARTE_DA_OFICINA =
  'id, codigo, fornecedor_id, status, subtotal, cashback, itens, pagamento, pagamento_em, entrega_previsao, entrega_saiu_em, entrega_lat, entrega_lng, entrega_precisao, entrega_posicao_em, entregue_em, cancelado_motivo, cancelado_por, criado_em, atualizado_em';

const esquemaParteDaOficina = z.object({
  id: numero,
  codigo: z.string(),
  fornecedor_id: numero,
  status: z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']),
  subtotal: numero,
  cashback: numeroOuNulo.optional().transform((v) => v ?? 0),
  itens: z.unknown(),
  pagamento: z.enum(['pendente', 'informado', 'confirmado']),
  pagamento_em: textoOuNulo,
  entrega_previsao: textoOuNulo,
  entrega_saiu_em: textoOuNulo,
  entrega_lat: numeroOuNulo,
  entrega_lng: numeroOuNulo,
  entrega_precisao: numeroOuNulo,
  entrega_posicao_em: textoOuNulo,
  entregue_em: textoOuNulo,
  cancelado_motivo: textoOuNulo,
  cancelado_por: textoOuNulo,
  criado_em: z.string(),
  atualizado_em: z.string()
});

const esquemaHistorico = z.object({
  parte_id: numero,
  quando: z.string(),
  campo: z.string(),
  de: textoOuNulo,
  para: textoOuNulo,
  quem: z.string(),
  motivo: textoOuNulo
});

/**
 * Quantos dias de pedidos a oficina acompanha: o bastante para pedir garantia ou devolução até 90
 * dias depois da entrega (os mais velhos já terminaram).
 */
export const DIAS_ACOMPANHADOS = 120;

function lerLinhas<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

/**
 * Os pedidos da oficina dos últimos 120 dias, com a situação de cada loja e o histórico. O banco só
 * devolve as partes da oficina de quem entrou; o filtro por oficina_id escolhe entre as oficinas
 * da conta.
 */
export async function acompanharPedidos(sb: SupabaseClient, oficinaId: string): Promise<{ dados: PedidoAcompanhado[]; erro: string | null }> {
  const desde = new Date(Date.now() - DIAS_ACOMPANHADOS * 86_400_000).toISOString();
  const partes = await sb
    .from('pedidos_fornecedores')
    .select(COLUNAS_PARTE_DA_OFICINA)
    .eq('oficina_id', oficinaId)
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(200);
  if (partes.error) {
    console.error('[entregas] partes da oficina', partes.error);
    return { dados: [], erro: ERRO };
  }
  const linhas: LinhaDaParte[] = lerLinhas(esquemaParteDaOficina, partes.data).filter((l) => /^[A-Z0-9]{6}$/.test(l.codigo));
  if (!linhas.length) return { dados: [], erro: null };
  const idsPartes = linhas.map((l) => l.id);
  const idsLojas = [...new Set(linhas.map((l) => l.fornecedor_id))];
  const [hist, forn, pix] = await Promise.all([
    sb.from('pedidos_historico').select('parte_id, quando, campo, de, para, quem, motivo').in('parte_id', idsPartes).order('quando').limit(2000),
    sb.from('fornecedores').select('id, nome, whatsapp').in('id', idsLojas),
    sb.rpc('lojas_com_pix', { p_ids: idsLojas })
  ]);
  if (hist.error) console.error('[entregas] histórico', hist.error);
  if (forn.error) console.error('[entregas] lojas', forn.error);
  const lojas = new Map(((forn.data ?? []) as { id: number | string; nome: string; whatsapp: string | null }[]).map((f) => [Number(f.id), { nome: f.nome, whatsapp: f.whatsapp }]));
  // sem a lista (banco antigo ou fora do ar), o botão do Pix aparece e a loja sem chave avisa na hora
  const comPix = pix.error || !Array.isArray(pix.data) ? null : new Set((pix.data as (number | string)[]).map(Number));
  if (pix.error) console.error('[entregas] lojas com Pix', pix.error);
  const historico: LinhaDoHistorico[] = lerLinhas(esquemaHistorico, hist.data);
  return { dados: montarPedidos(linhas, historico, lojas, (id) => (comPix ? comPix.has(id) : true)), erro: null };
}

/** O que o banco diz quando a oficina pede o Pix ou avisa que pagou. */
function erroDoPix(e: { code?: string; message?: string }): string {
  if (e.code === 'RV021') return 'O Pix aparece quando a loja confirmar o pedido.';
  if (e.code === 'RV022') return 'Esta loja ainda não cadastrou a chave Pix. Combine o pagamento com ela.';
  if (e.code === 'RV023') return 'O seu cashback cobriu esta compra: não tem Pix para pagar.';
  if (e.code === '42501') return /Pagamento só depois/.test(e.message ?? '') ? 'O Pix aparece quando a loja confirmar o pedido.' : 'Pedido não encontrado nesta oficina.';
  if (e.code === '28000') return 'Sua sessão terminou. Entre de novo.';
  return ERRO;
}

const esquemaPixDaParte = z.object({
  tipo: z.enum(['cnpj', 'cpf', 'email', 'telefone', 'aleatoria']),
  chave: z.string(),
  nome: z.string(),
  cidade: z.string(),
  valor: numero,
  codigo: z.string(),
  trocadaEm: textoOuNulo
});

/**
 * O Pix copia e cola da parte de uma loja, com o valor dela. O banco só entrega a chave da loja
 * para a oficina dona do pedido, e só depois de a loja confirmar.
 */
export async function pixDaParte(sb: SupabaseClient, parteId: number): Promise<Gravacao<{ codigo: string; valor: number; recebedor: string; trocadaEm: string | null }>> {
  const { data, error } = await sb.rpc('pix_da_parte', { p_parte: parteId });
  if (error) {
    if (!/^(RV02[123]|42501|28000)$/.test(error.code ?? '')) console.error('[entregas] pix da parte', error);
    return { ok: false, erro: erroDoPix(error) };
  }
  const r = esquemaPixDaParte.safeParse(data);
  if (!r.success) {
    console.error('[entregas] pix da parte fora do formato', r.error.issues[0]);
    return { ok: false, erro: ERRO };
  }
  const pix = r.data;
  const chave = normalizarChavePix(pix.tipo as TipoChavePix, pix.chave);
  if (!chave) return { ok: false, erro: 'A chave Pix da loja está com problema. Combine o pagamento com ela.' };
  return {
    ok: true,
    codigo: codigoPix({ chave, nome: pix.nome, cidade: pix.cidade, valor: pix.valor, txid: `RVS${pix.codigo}${parteId}`, descricao: `Pedido ${pix.codigo} Revisai` }),
    valor: pix.valor,
    recebedor: pix.nome,
    trocadaEm: pix.trocadaEm
  };
}

/** A oficina avisa que pagou; a loja confere no extrato e confirma. O banco aceita só depois da confirmação da loja. */
export async function informarPagamento(sb: SupabaseClient, parteId: number): Promise<Gravacao> {
  const { data, error } = await sb.from('pedidos_fornecedores').update({ pagamento: 'informado' }).eq('id', parteId).eq('pagamento', 'pendente').select('id').maybeSingle();
  if (error) {
    if (error.code !== '42501') console.error('[entregas] informar pagamento', error);
    return { ok: false, erro: erroDoPix(error) };
  }
  if (data) return { ok: true };
  // nada mudou: já estava avisado (ou confirmado), ou a parte não é desta oficina
  const atual = await sb.from('pedidos_fornecedores').select('pagamento').eq('id', parteId).maybeSingle();
  if (atual.error) return { ok: false, erro: ERRO };
  return atual.data ? { ok: true } : { ok: false, erro: 'Pedido não encontrado nesta oficina.' };
}

export type { SituacaoPagamento };
