import 'server-only';

// O pedido depois de enviado: a oficina acompanha a parte de cada loja, paga por Pix direto para a
// loja e vê a entrega no mapa; a loja confirma o pagamento e manda o link para o entregador; o
// celular do entregador manda a posição.
// A oficina fala com o banco como a pessoa que entrou (o banco só mostra as partes da oficina
// dela). As funções da loja, do entregador e da rotina diária ainda usam a chave do sistema.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { DIAS_DO_LINK, montarPedidos, type LinhaDaParte, type LinhaDoHistorico, type PedidoAcompanhado, type SituacaoPagamento } from './entregas-dados';
import { codigoPix, normalizarChavePix, type TipoChavePix } from './pix';
import { clienteSistema } from './supabase-servidor';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const SEM_BANCO = 'O servidor ainda não está ligado ao banco.';
const ERRO = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);

const esquemaItem = z.object({
  produto_id: numero,
  nome: z.string(),
  fornecedor_id: numero,
  quantidade: numero,
  preco_unitario: numero,
  combinado: z.boolean().nullish().transform((v) => v ?? false)
});

const esquemaParte = z.object({
  id: numero,
  pedido_id: numero,
  fornecedor_id: numero,
  status: z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']),
  subtotal: numero,
  pagamento: z.enum(['pendente', 'informado', 'confirmado']),
  pagamento_em: textoOuNulo,
  entrega_previsao: textoOuNulo,
  entrega_saiu_em: textoOuNulo,
  entrega_lat: numeroOuNulo,
  entrega_lng: numeroOuNulo,
  entrega_precisao: numeroOuNulo,
  entrega_posicao_em: textoOuNulo,
  entregue_em: textoOuNulo,
  atualizado_em: z.string()
});

const COLUNAS_PARTE =
  'id, pedido_id, fornecedor_id, status, subtotal, pagamento, pagamento_em, entrega_previsao, entrega_saiu_em, entrega_lat, entrega_lng, entrega_precisao, entrega_posicao_em, entregue_em, atualizado_em';

function itensDe(dados: unknown): z.infer<typeof esquemaItem>[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquemaItem.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** O link do entregador vale por 3 dias depois da saída (se a loja esquecer de marcar a entrega). */
const VALIDADE_DO_LINK_MS = DIAS_DO_LINK * 24 * 3_600_000;

function saidaMinima(): string {
  return new Date(Date.now() - VALIDADE_DO_LINK_MS).toISOString();
}

/** Ao terminar a entrega, a posição do entregador é apagada. */
const SEM_POSICAO = { entrega_lat: null, entrega_lng: null, entrega_precisao: null, entrega_posicao_em: null };

// ---------------------------------------------------------------- oficina

/** Quantos dias de pedidos a oficina acompanha (os mais velhos já terminaram). */
export const DIAS_ACOMPANHADOS = 45;

const COLUNAS_PARTE_DA_OFICINA =
  'id, codigo, fornecedor_id, status, subtotal, itens, pagamento, pagamento_em, entrega_previsao, entrega_saiu_em, entrega_lat, entrega_lng, entrega_precisao, entrega_posicao_em, entregue_em, cancelado_motivo, cancelado_por, criado_em, atualizado_em';

const esquemaParteDaOficina = z.object({
  id: numero,
  codigo: z.string(),
  fornecedor_id: numero,
  status: z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']),
  subtotal: numero,
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

function lerLinhas<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

/**
 * Os pedidos da oficina dos últimos 45 dias, com a situação de cada loja e o histórico. O banco só
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
    if (!/^(RV02[12]|42501|28000)$/.test(error.code ?? '')) console.error('[entregas] pix da parte', error);
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

// ---------------------------------------------------------------- loja

const TIPOS_PIX = ['cnpj', 'cpf', 'email', 'telefone', 'aleatoria'] as const;

export const esquemaPix = z.object({
  tipo: z.enum(TIPOS_PIX),
  chave: z.string().trim().min(1, 'Escreva a chave Pix.').max(100),
  nome: z.string().trim().min(2, 'Escreva o nome de quem recebe, como está no banco.').max(80),
  cidade: z.string().trim().min(2, 'Escreva a cidade.').max(80)
});

const ERRO_CHAVE: Record<TipoChavePix, string> = {
  cnpj: 'O CNPJ tem 14 letras e números (como aparece no cartão do CNPJ).',
  cpf: 'O CPF tem 11 números.',
  email: 'Confira o e-mail da chave.',
  telefone: 'Escreva o celular da chave com DDD.',
  aleatoria: 'A chave aleatória tem 32 letras e números, com tracinhos (como aparece no app do banco).'
};

export interface PixDaLoja {
  tipo: TipoChavePix;
  chave: string;
  nome: string;
  cidade: string;
}

export async function lerPixDaLoja(fornecedorId: number): Promise<PixDaLoja | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const { data } = await sb.from('fornecedores_pix').select('tipo, chave, nome, cidade').eq('fornecedor_id', fornecedorId).maybeSingle();
  return (data as PixDaLoja | null) ?? null;
}

export async function salvarPixDaLoja(fornecedorId: number, entrada: unknown): Promise<Gravacao> {
  const r = esquemaPix.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira a chave Pix.' };
  const d = r.data;
  const chave = normalizarChavePix(d.tipo, d.chave);
  if (!chave) return { ok: false, erro: ERRO_CHAVE[d.tipo] };
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const { error } = await sb
    .from('fornecedores_pix')
    .upsert({ fornecedor_id: fornecedorId, tipo: d.tipo, chave, nome: d.nome.slice(0, 25).trim(), cidade: d.cidade.slice(0, 15).trim(), atualizado_em: new Date().toISOString() }, { onConflict: 'fornecedor_id' });
  if (error) {
    console.error('[entregas] salvar pix', error);
    return { ok: false, erro: 'Não deu para salvar a chave agora. Tente de novo.' };
  }
  return { ok: true };
}

async function parteDaLoja(fornecedorId: number, parteId: number) {
  const sb = clienteSistema();
  if (!sb) return null;
  const { data, error } = await sb.from('pedidos_fornecedores').select(COLUNAS_PARTE).eq('id', parteId).eq('fornecedor_id', fornecedorId).maybeSingle();
  if (error || !data) return null;
  const r = esquemaParte.safeParse(data);
  return r.success ? r.data : null;
}

/** A loja marca que o pedido saiu: gera o link do entregador (o banco guarda só o hash). */
export async function saidaParaEntrega(fornecedorId: number, parteId: number, previsao: string): Promise<Gravacao<{ token: string }>> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const parte = await parteDaLoja(fornecedorId, parteId);
  if (!parte) return { ok: false, erro: 'Pedido não encontrado.' };
  if (parte.status === 'entregue' || parte.status === 'cancelado') return { ok: false, erro: 'Este pedido já terminou.' };
  const token = randomBytes(32).toString('base64url');
  const agora = new Date().toISOString();
  const { error } = await sb
    .from('pedidos_fornecedores')
    .update({
      status: 'saiu_entrega',
      entrega_hash: hashDoToken(token),
      entrega_previsao: previsao.trim().slice(0, 40) || null,
      // um link novo conta a validade de novo
      entrega_saiu_em: agora,
      atualizado_em: agora
    })
    .eq('id', parteId)
    .eq('fornecedor_id', fornecedorId);
  if (error) {
    console.error('[entregas] saída', error);
    return { ok: false, erro: 'Não deu para marcar a saída agora. Tente de novo.' };
  }
  return { ok: true, token };
}

export async function confirmarPagamento(fornecedorId: number, parteId: number, confirmado: boolean): Promise<Gravacao> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const agora = new Date().toISOString();
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update(confirmado ? { pagamento: 'confirmado', pagamento_em: agora, atualizado_em: agora } : { pagamento: 'pendente', pagamento_em: null, atualizado_em: agora })
    .eq('id', parteId)
    .eq('fornecedor_id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[entregas] confirmar pagamento', error);
    return { ok: false, erro: error ? 'Não deu para salvar agora. Tente de novo.' : 'Pedido não encontrado.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- entregador

export interface DadosDaEntrega {
  codigo: string;
  loja: string;
  oficina: string;
  whatsapp: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  itens: { nome: string; quantidade: number }[];
  previsao: string | null;
  posicaoEm: string | null;
}

/** O que o entregador vê pelo link (ou null se o link não vale mais). */
export async function dadosDaEntrega(token: string): Promise<DadosDaEntrega | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const parte = await sb
    .from('pedidos_fornecedores')
    .select('pedido_id, fornecedor_id, status, entrega_previsao, entrega_posicao_em, entrega_saiu_em')
    .eq('entrega_hash', hashDoToken(token))
    .maybeSingle();
  const linha = parte.data as { pedido_id: number; fornecedor_id: number; status: string; entrega_previsao: string | null; entrega_posicao_em: string | null; entrega_saiu_em: string | null } | null;
  if (parte.error || !linha || linha.status !== 'saiu_entrega') return null;
  if (!linha.entrega_saiu_em || linha.entrega_saiu_em < saidaMinima()) return null;
  const fornecedorId = Number(linha.fornecedor_id);
  const [ped, forn] = await Promise.all([
    sb.from('pedidos').select('codigo, oficina_nome, oficina_whatsapp, oficina_endereco, oficina_cidade, oficina_uf, itens').eq('id', Number(linha.pedido_id)).maybeSingle(),
    sb.from('fornecedores').select('nome').eq('id', fornecedorId).maybeSingle()
  ]);
  if (ped.error || !ped.data) return null;
  const p = ped.data as { codigo: string; oficina_nome: string; oficina_whatsapp: string; oficina_endereco: string | null; oficina_cidade: string | null; oficina_uf: string | null; itens: unknown };
  return {
    codigo: p.codigo,
    loja: (forn.data as { nome: string } | null)?.nome ?? 'Loja',
    oficina: p.oficina_nome,
    whatsapp: p.oficina_whatsapp,
    endereco: p.oficina_endereco,
    cidade: p.oficina_cidade,
    uf: p.oficina_uf,
    itens: itensDe(p.itens)
      .filter((i) => i.fornecedor_id === fornecedorId)
      .map((i) => ({ nome: i.nome, quantidade: i.quantidade })),
    previsao: linha.entrega_previsao ?? null,
    posicaoEm: linha.entrega_posicao_em ?? null
  };
}

export async function registrarPosicao(token: string, pos: { lat: number; lng: number; precisao: number | null }): Promise<Gravacao> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update({
      entrega_lat: Math.round(pos.lat * 1e6) / 1e6,
      entrega_lng: Math.round(pos.lng * 1e6) / 1e6,
      entrega_precisao: pos.precisao == null ? null : Math.round(pos.precisao),
      entrega_posicao_em: new Date().toISOString()
    })
    .eq('entrega_hash', hashDoToken(token))
    .eq('status', 'saiu_entrega')
    .gt('entrega_saiu_em', saidaMinima())
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[entregas] posição', error);
    return { ok: false, erro: ERRO };
  }
  return data ? { ok: true } : { ok: false, erro: 'Este link não vale mais. A entrega pode ter terminado.' };
}

export async function concluirEntrega(token: string): Promise<Gravacao> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const agora = new Date().toISOString();
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update({ status: 'entregue', entregue_em: agora, entrega_hash: null, ...SEM_POSICAO, atualizado_em: agora })
    .eq('entrega_hash', hashDoToken(token))
    .eq('status', 'saiu_entrega')
    .gt('entrega_saiu_em', saidaMinima())
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[entregas] concluir', error);
    return { ok: false, erro: ERRO };
  }
  return data ? { ok: true } : { ok: false, erro: 'Este link não vale mais. A entrega pode já ter sido marcada.' };
}

export type { SituacaoPagamento };

/**
 * Para a rotina diária: entregas que a loja esqueceu de marcar. Depois de 3 dias, o link do entregador
 * para de valer e a última posição dele é apagada.
 */
export async function limparEntregasVelhas(): Promise<number> {
  const sb = clienteSistema();
  if (!sb) return 0;
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update({ entrega_hash: null, ...SEM_POSICAO })
    .lt('entrega_saiu_em', saidaMinima())
    .or('entrega_hash.not.is.null,entrega_lat.not.is.null')
    .select('id');
  if (error) {
    console.error('[entregas] limpeza', error);
    return 0;
  }
  return (data ?? []).length;
}
