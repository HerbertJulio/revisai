import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mensagemDoBanco } from '../conta-dados';
import {
  ACOES_DA_MODERACAO,
  COLUNAS_DENUNCIA,
  COLUNAS_PRODUTO_OCULTO,
  lerBloqueios,
  lerDenuncias,
  lerLimiteDeCompra,
  lerProdutosOcultos,
  type AcaoDaModeracao,
  type BloqueioDeCompra,
  type Denuncia,
  type LimiteDeCompra,
  type ProdutoForaDaVitrine
} from './moderacao-dados';

// A moderação e o limite de compra, pela equipe (com o cliente da própria pessoa: o banco confere o
// papel em cada leitura e em cada decisão) e pela oficina (denunciar, ver o próprio limite).

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };
type Lido<T> = { dados: T; erro: string | null };

const ERRO_LEITURA = 'Não deu para carregar agora. Atualize a página em instantes.';

/** As regras do banco viram mensagem (motivo inválido, já denunciou...); o resto, a mensagem geral. */
function mensagem(e: { code?: string; message?: string } | null | undefined, padrao?: string): string {
  if (e?.code === '22023' && e.message) return `${e.message.replace(/\.$/, '')}.`;
  return mensagemDoBanco(e, padrao);
}

export async function filaDeModeracao(sb: SupabaseClient): Promise<Lido<{ abertas: Denuncia[]; decididas: Denuncia[]; ocultos: ProdutoForaDaVitrine[] }>> {
  const [abertas, decididas, ocultos] = await Promise.all([
    sb.from('denuncias').select(COLUNAS_DENUNCIA).in('situacao', ['nova', 'em_analise']).order('criado_em', { ascending: false }).limit(500),
    sb.from('denuncias').select(COLUNAS_DENUNCIA).in('situacao', ['resolvida', 'descartada']).order('resolvido_em', { ascending: false }).limit(30),
    sb.from('produtos').select(COLUNAS_PRODUTO_OCULTO).eq('oculto_moderacao', true).order('nome').limit(300)
  ]);
  const erro = abertas.error ?? decididas.error ?? ocultos.error;
  if (erro) {
    console.error('[moderação] fila', erro);
    return { dados: { abertas: [], decididas: [], ocultos: [] }, erro: ERRO_LEITURA };
  }
  return { dados: { abertas: lerDenuncias(abertas.data), decididas: lerDenuncias(decididas.data), ocultos: lerProdutosOcultos(ocultos.data) }, erro: null };
}

export async function decidir(sb: SupabaseClient, denunciaId: string, acao: string, resolucao: string): Promise<Gravacao<{ denuncias: number }>> {
  if (!/^[0-9a-f-]{36}$/.test(denunciaId) || !ACOES_DA_MODERACAO.includes(acao as AcaoDaModeracao)) return { ok: false, erro: 'Dados inválidos. Atualize a página e tente de novo.' };
  const { data, error } = await sb.rpc('moderacao_decidir', { p_denuncia: denunciaId, p_acao: acao, p_resolucao: resolucao.trim().slice(0, 500) || null });
  if (error) {
    if (error.code !== '42501') console.error('[moderação] decidir', error);
    return { ok: false, erro: mensagem(error) };
  }
  return { ok: true, denuncias: Number((data as { denuncias?: number } | null)?.denuncias ?? 0) };
}

export async function produtoNaVitrine(sb: SupabaseClient, produtoId: number, visivel: boolean): Promise<Gravacao> {
  if (!Number.isSafeInteger(produtoId) || produtoId < 1) return { ok: false, erro: 'Produto inválido.' };
  const { error } = await sb.rpc('moderacao_produto', { p_produto: produtoId, p_oculto: !visivel });
  if (error) {
    if (error.code !== '42501') console.error('[moderação] produto', error);
    return { ok: false, erro: mensagem(error) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- limite de compra

export async function bloqueiosDeCompra(sb: SupabaseClient, dias = 30): Promise<Lido<BloqueioDeCompra[]>> {
  const { data, error } = await sb.rpc('equipe_bloqueios_de_compra', { p_dias: dias });
  if (error) {
    console.error('[antifraude] bloqueios', error);
    return { dados: [], erro: ERRO_LEITURA };
  }
  return { dados: lerBloqueios(data), erro: null };
}

/** O limite da oficina agora (null = sem limite) e o que a equipe deu (null = o padrão). */
export async function limiteDaOficina(sb: SupabaseClient, oficinaId: string): Promise<Lido<{ agora: LimiteDeCompra | null; daEquipe: number | null }>> {
  const [r, o] = await Promise.all([sb.rpc('compra_limite', { p_oficina: oficinaId }), sb.from('oficinas').select('limite_compra_7d').eq('id', oficinaId).maybeSingle()]);
  if (r.error || o.error) {
    console.error('[antifraude] limite da oficina', r.error ?? o.error);
    return { dados: { agora: null, daEquipe: null }, erro: ERRO_LEITURA };
  }
  const proprio = (o.data as { limite_compra_7d?: number | string | null } | null)?.limite_compra_7d;
  return { dados: { agora: lerLimiteDeCompra(r.data), daEquipe: proprio == null ? null : Number(proprio) }, erro: null };
}

/** A equipe (suporte ou financeiro) dá um limite próprio, ou volta para o padrão (null). */
export async function salvarLimite(sb: SupabaseClient, oficinaId: string, limite: number | null): Promise<Gravacao> {
  if (!/^[0-9a-f-]{36}$/.test(oficinaId)) return { ok: false, erro: 'Oficina inválida.' };
  if (limite != null && (!Number.isFinite(limite) || limite < 0 || limite > 10_000_000)) return { ok: false, erro: 'O limite vai de R$ 0 a R$ 10.000.000.' };
  // pela função do banco: a linha da oficina pela API só aceita a lista do cadastro
  const { error } = await sb.rpc('equipe_limite_de_compra', { p_oficina: oficinaId, p_limite: limite == null ? null : Math.round(limite * 100) / 100 });
  if (error) {
    if (error.code !== '42501') console.error('[antifraude] salvar limite', error);
    return { ok: false, erro: error.code === '42501' ? 'Seu papel na equipe não deixa mudar o limite desta oficina.' : mensagem(error) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- pela oficina

/**
 * A oficina denuncia um produto (ou a loja, sem produto). Erros conhecidos: RV064 (já denunciou e
 * está aberta), RV065 (loja sem compra), P0001 (muitas no dia).
 */
export async function denunciar(
  sb: SupabaseClient,
  oficinaId: string,
  alvo: { produtoId: number | null; fornecedorId: number | null },
  motivo: string,
  texto: string
): Promise<Gravacao<{ id: string }>> {
  const { data, error } = await sb.rpc('denunciar', {
    p_oficina: oficinaId,
    p_produto: alvo.produtoId,
    p_fornecedor: alvo.fornecedorId,
    p_motivo: motivo,
    p_texto: texto.trim().slice(0, 1000) || null
  });
  if (error || typeof data !== 'string') {
    if (error && !['RV064', 'RV065', 'P0001', '22023', '42501'].includes(error.code ?? '')) console.error('[moderação] denunciar', error);
    return { ok: false, erro: mensagem(error, 'Não deu para enviar a denúncia agora. Tente de novo.') };
  }
  return { ok: true, id: data };
}

/** O banco registra a compra barrada pelo limite (depois do RV060 no pedido; ele confere de novo). */
export async function registrarBloqueio(sb: SupabaseClient, oficinaId: string, detalheDoErro: string | null | undefined): Promise<boolean> {
  let valor = 0;
  try {
    valor = Number((JSON.parse(detalheDoErro ?? '{}') as { valor?: unknown }).valor ?? 0);
  } catch {
    valor = 0;
  }
  if (!(valor > 0)) return false;
  const { data, error } = await sb.rpc('compra_registrar_bloqueio', { p_oficina: oficinaId, p_valor: valor });
  if (error) {
    console.error('[antifraude] registrar bloqueio', error);
    return false;
  }
  return data === true;
}
