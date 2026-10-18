import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { cnpjValido, soNumeros } from '@/lib/cnpj';
import { mensagemDoBanco, type PapelEquipe } from '@/lib/conta-dados';
import { somarDias } from '@/lib/datas';
import type { SituacaoCadastro, SituacaoPedido } from '@/lib/equipe-dados';
import { COLUNAS_IMPULSO, lerImpulsos, type SituacaoImpulso } from '@/lib/marketplace-dados';
import { fimDoImpulso, PLANOS_FORNECEDOR } from '@/lib/planos-fornecedor';
import { hojeEmBrasilia } from './dados';
import { emailValido } from './entrada';
import { pode } from './papeis';
import { lerAcessos, type RegistroDeAcesso, type SituacaoChamado } from './tipos';

// O que a equipe muda no banco. Toda escrita usa o cliente de quem entrou: as políticas e os
// gatilhos do banco conferem o papel de novo e cada mudança fica no histórico (privado.auditar).

type Cliente = SupabaseClient;

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const ERRO_GRAVACAO = 'Não deu para salvar agora. Tente de novo.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function falhou(onde: string, error: { code?: string; message?: string } | null | undefined, padrao = ERRO_GRAVACAO): { ok: false; erro: string } {
  console.error(`[equipe] ${onde}`, error);
  if (error?.code === '22023' && error.message) return { ok: false, erro: error.message.endsWith('.') ? error.message : `${error.message}.` };
  return { ok: false, erro: mensagemDoBanco(error, padrao) };
}

export function idValido(id: unknown): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

export function uuidValido(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

// ---------------------------------------------------------------- pedidos e cadastros

export async function salvarSituacaoPedido(sb: Cliente, id: number, status: SituacaoPedido): Promise<Gravacao> {
  const { data, error } = await sb.from('pedidos').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error) return falhou('situação do pedido', error, 'Não deu para salvar a situação. Tente de novo.');
  return data ? { ok: true } : { ok: false, erro: 'Esse pedido não foi encontrado.' };
}

export async function salvarSituacaoCadastro(sb: Cliente, id: number, situacao: SituacaoCadastro): Promise<Gravacao> {
  const { data, error } = await sb.from('interessados').update({ situacao }).eq('id', id).select('id').maybeSingle();
  if (error) return falhou('situação do cadastro', error, 'Não deu para salvar a situação. Tente de novo.');
  return data ? { ok: true } : { ok: false, erro: 'Esse cadastro não foi encontrado.' };
}

// ---------------------------------------------------------------- lojas

const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .transform((v) => (v && !v.startsWith('55') ? `55${v}` : v))
  .refine((v) => v === '' || /^55\d{10,11}$/.test(v), 'Confira o WhatsApp, com DDD.');

export const esquemaLoja = z.object({
  id: z.number().int().positive().optional(),
  nome: z.string().trim().min(2, 'Escreva o nome da loja.').max(120),
  cidade: z.string().trim().max(80).optional().default(''),
  uf: z
    .string()
    .trim()
    .regex(/^([A-Z]{2})?$/, 'UF inválida.')
    .optional()
    .default(''),
  whatsapp: telefone.optional().default(''),
  descricao: z.string().trim().max(400).optional().default(''),
  ativo: z.boolean(),
  plano: z.enum(['vitrine', 'destaque']),
  destaqueAte: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .optional()
    .default(''),
  comissao: z.number().min(0, 'A comissão vai de 0 a 30%.').max(30, 'A comissão vai de 0 a 30%.'),
  mensalidade: z.number().min(0, 'Confira a mensalidade.').max(100000),
  email: z.string().trim().toLowerCase().max(160).optional().default(''),
  cnpj: z.string().trim().max(20).optional().default(''),
  observacao: z.string().trim().max(300).optional().default('')
});

/**
 * Cria ou edita uma loja. O suporte cadastra lojas; o suporte e o financeiro editam o cadastro;
 * o contrato (plano, comissão, mensalidade) já existente só o financeiro muda.
 */
export async function salvarLoja(sb: Cliente, papel: PapelEquipe, entrada: unknown): Promise<Gravacao<{ id: number; aviso?: string }>> {
  const r = esquemaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  if (d.email && !emailValido(d.email)) return { ok: false, erro: 'Confira o e-mail.' };
  if (d.cnpj && !cnpjValido(d.cnpj)) return { ok: false, erro: 'Confira o CNPJ.' };
  if (!d.id && !pode(papel, 'criarLoja')) return { ok: false, erro: 'Só o suporte cadastra lojas.' };
  if (d.id && !pode(papel, 'editarLoja')) return { ok: false, erro: 'Seu papel na equipe não deixa mudar a loja.' };
  const linha = {
    nome: d.nome,
    cidade: d.cidade || null,
    uf: d.uf || null,
    whatsapp: d.whatsapp || null,
    descricao: d.descricao || null,
    ativo: d.ativo,
    email: d.email || null,
    destaque: d.plano === 'destaque',
    destaque_ate: d.plano === 'destaque' && d.destaqueAte ? d.destaqueAte : null,
    // vazio não apaga o CNPJ que a loja já tem
    ...(d.cnpj ? { cnpj: soNumeros(d.cnpj) } : {})
  };
  let id = d.id;
  if (id) {
    const { data, error } = await sb.from('fornecedores').update(linha).eq('id', id).select('id').maybeSingle();
    if (error?.code === '23505') return { ok: false, erro: 'Já existe uma loja aprovada com este CNPJ.' };
    if (error) return falhou('editar loja', error);
    if (!data) return { ok: false, erro: 'Loja não encontrada.' };
  } else {
    const { data, error } = await sb.from('fornecedores').insert({ ...linha, demonstracao: false, verificacao: 'aprovada' }).select('id').single();
    if (error?.code === '23505') return { ok: false, erro: 'Já existe uma loja aprovada com este CNPJ.' };
    if (error || !data) return falhou('nova loja', error);
    id = Number(data.id);
  }
  const contrato = {
    fornecedor_id: id,
    plano: d.plano,
    comissao_percentual: d.comissao,
    mensalidade: d.mensalidade,
    email: d.email || null,
    observacao: d.observacao || null,
    atualizado_em: new Date().toISOString()
  };
  const existe = await sb.from('fornecedores_contrato').select('fornecedor_id').eq('fornecedor_id', id).maybeSingle();
  if (existe.error) return falhou('contrato', existe.error, 'A loja foi salva, mas o contrato não. Tente salvar de novo.');
  if (existe.data) {
    if (!pode(papel, 'mudarContrato')) return { ok: true, id, aviso: 'A loja foi salva. O contrato (plano, comissão e mensalidade) só o financeiro muda.' };
    const { error } = await sb.from('fornecedores_contrato').update(contrato).eq('fornecedor_id', id);
    if (error) return falhou('contrato', error, 'A loja foi salva, mas o contrato não. Tente salvar de novo.');
  } else {
    const { error } = await sb.from('fornecedores_contrato').insert(contrato);
    if (error) return falhou('contrato', error, 'A loja foi salva, mas o contrato não. Tente salvar de novo.');
  }
  return { ok: true, id };
}

/** Convida alguém (o dono, normalmente) para entrar na loja com a conta do e-mail. */
export async function convidarParaLoja(sb: Cliente, fornecedorId: number, email: string, papelNaLoja: 'dono' | 'vendedor'): Promise<Gravacao<{ convite: string }>> {
  const limpo = email.trim().toLowerCase();
  if (!emailValido(limpo)) return { ok: false, erro: 'Confira o e-mail.' };
  const { data, error } = await sb.rpc('convidar', { p_tipo: 'fornecedor', p_alvo: String(fornecedorId), p_email: limpo, p_papel: papelNaLoja });
  if (error) return falhou('convite da loja', error, 'Não deu para convidar agora. Tente de novo.');
  return { ok: true, convite: String(data) };
}

export async function cancelarConvite(sb: Cliente, id: string): Promise<Gravacao> {
  const { data, error } = await sb.rpc('cancelar_convite', { p_id: id });
  if (error) return falhou('cancelar convite', error);
  return data ? { ok: true } : { ok: false, erro: 'Esse convite já foi aceito ou cancelado.' };
}

/** Aprova (a loja entra no ar) ou recusa (com o motivo) quem pediu para vender. */
export async function decidirLoja(sb: Cliente, fornecedorId: number, aprovar: boolean, observacao: string): Promise<Gravacao> {
  const obs = observacao.trim().slice(0, 300);
  if (!aprovar && obs.length < 5) return { ok: false, erro: 'Escreva o motivo da recusa. A loja vê esse texto.' };
  const mudanca = aprovar ? { verificacao: 'aprovada', verificacao_obs: obs || null, ativo: true } : { verificacao: 'recusada', verificacao_obs: obs, ativo: false };
  const { data, error } = await sb.from('fornecedores').update(mudanca).eq('id', fornecedorId).in('verificacao', ['pendente', 'recusada']).select('id').maybeSingle();
  if (error) return falhou('decidir loja', error);
  if (!data) return { ok: false, erro: 'Essa loja já foi aprovada ou não existe mais. Atualize a página.' };
  if (aprovar) {
    // a loja que se cadastrou sozinha entra no plano Vitrine de tabela, o mesmo do contrato das lojas
    const existe = await sb.from('fornecedores_contrato').select('fornecedor_id').eq('fornecedor_id', fornecedorId).maybeSingle();
    if (!existe.error && !existe.data) {
      const v = PLANOS_FORNECEDOR.vitrine;
      const contrato = await sb
        .from('fornecedores_contrato')
        .insert({ fornecedor_id: fornecedorId, plano: 'vitrine', comissao_percentual: v.comissao, mensalidade: v.mensalidade, atualizado_em: new Date().toISOString() });
      if (contrato.error) return falhou('contrato da loja aprovada', contrato.error, 'A loja foi aprovada, mas o plano não foi gravado. Abra a loja em Lojas e salve o plano.');
    }
  }
  return { ok: true };
}

export async function decidirImpulso(sb: Cliente, id: number, decisao: Exclude<SituacaoImpulso, 'pedido'>, inicio: string | null): Promise<Gravacao> {
  const atual = await sb.from('impulsos').select(COLUNAS_IMPULSO).eq('id', id).maybeSingle();
  const linha = atual.data ? lerImpulsos([atual.data]).itens[0] : undefined;
  if (atual.error || !linha) return { ok: false, erro: 'Impulso não encontrado.' };
  const hoje = hojeEmBrasilia();
  let mudanca: Record<string, unknown> = { status: decisao, atualizado_em: new Date().toISOString() };
  if (decisao === 'ativo') {
    const comeca = inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : hoje;
    mudanca = { ...mudanca, inicio: comeca, fim: fimDoImpulso(comeca, linha.dias) };
  }
  if (decisao === 'encerrado' && linha.status === 'ativo') mudanca = { ...mudanca, fim: hoje < (linha.fim ?? '') ? hoje : linha.fim };
  const { data, error } = await sb.from('impulsos').update(mudanca).eq('id', id).select('id').maybeSingle();
  if (error) return falhou('decidir impulso', error);
  return data ? { ok: true } : { ok: false, erro: 'Seu papel na equipe não deixa decidir impulsos.' };
}

/** Aprova uma sugestão (entra na base para todos) ou tira da base. */
export async function decidirReferencia(sb: Cliente, id: number, aprovar: boolean): Promise<Gravacao> {
  const agora = new Date().toISOString();
  const mudanca = aprovar ? { aprovado: true, ativo: true, atualizado_em: agora } : { ativo: false, atualizado_em: agora };
  const { data, error } = await sb.from('produtos_referencia').update(mudanca).eq('id', id).select('id').maybeSingle();
  if (error) return falhou('decidir referência', error);
  return data ? { ok: true } : { ok: false, erro: 'Linha não encontrada.' };
}

// ---------------------------------------------------------------- oficinas: plano e alertas

/** Dá ou estende o Pro (o banco grava a assinatura ligada à oficina e empurra o pro_ate). */
export async function darPro(sb: Cliente, oficinaId: string, meses: number, valor: number | null, observacao: string): Promise<Gravacao<{ ate: string }>> {
  if (!Number.isInteger(meses) || meses < 1 || meses > 36) return { ok: false, erro: 'Escolha de 1 a 36 meses.' };
  if (valor != null && (!Number.isFinite(valor) || valor < 0 || valor > 100_000)) return { ok: false, erro: 'Confira o valor recebido.' };
  const { data, error } = await sb.rpc('equipe_dar_pro', { p_oficina: oficinaId, p_meses: meses, p_valor: valor, p_observacao: observacao.trim().slice(0, 300) || null });
  if (error) return falhou('dar Pro', error);
  return { ok: true, ate: String((data as { ate?: unknown } | null)?.ate ?? '') };
}

/** Estende o teste do Pro por mais uns dias (a partir do fim do teste, ou de hoje). */
export async function estenderTeste(sb: Cliente, oficinaId: string, dias: number): Promise<Gravacao<{ ate: string }>> {
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) return { ok: false, erro: 'Escolha de 1 a 90 dias.' };
  const atual = await sb.from('oficinas').select('teste_ate').eq('id', oficinaId).maybeSingle();
  if (atual.error) return falhou('teste da oficina', atual.error);
  if (!atual.data) return { ok: false, erro: 'Oficina não encontrada.' };
  const hoje = hojeEmBrasilia();
  const base = (atual.data as { teste_ate: string | null }).teste_ate;
  const ate = somarDias(base && base > hoje ? base : hoje, dias);
  const { data, error } = await sb.from('oficinas').update({ teste_ate: ate }).eq('id', oficinaId).select('id').maybeSingle();
  if (error) return falhou('estender teste', error);
  return data ? { ok: true, ate } : { ok: false, erro: 'Oficina não encontrada.' };
}

/** Desativa (ninguém da oficina usa) ou reativa a oficina. */
export async function mudarAtivaDaOficina(sb: Cliente, oficinaId: string, ativa: boolean): Promise<Gravacao> {
  const { data, error } = await sb.from('oficinas').update({ ativa }).eq('id', oficinaId).select('id').maybeSingle();
  if (error) return falhou('ativar oficina', error);
  return data ? { ok: true } : { ok: false, erro: 'Oficina não encontrada.' };
}

export async function mudarFundador(sb: Cliente, oficinaId: string, fundador: boolean): Promise<Gravacao> {
  const { data, error } = await sb.from('oficinas').update({ fundador }).eq('id', oficinaId).select('id').maybeSingle();
  if (error) return falhou('fundador', error);
  return data ? { ok: true } : { ok: false, erro: 'Oficina não encontrada.' };
}

/** Libera alertas de preço extras para a oficina (depois do pagamento do pacote). */
export async function liberarAlertas(sb: Cliente, oficinaId: string, quantidade: number, valor: number | null, observacao: string): Promise<Gravacao> {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 1000) return { ok: false, erro: 'A quantidade vai de 1 a 1000.' };
  if (valor != null && (!Number.isFinite(valor) || valor < 0)) return { ok: false, erro: 'Confira o valor recebido.' };
  const { error } = await sb.from('alertas_creditos').insert({ oficina_id: oficinaId, quantidade, valor, observacao: observacao.trim().slice(0, 200) || null });
  if (error) return falhou('liberar alertas', error, 'Não deu para liberar agora. Tente de novo.');
  return { ok: true };
}

// ---------------------------------------------------------------- equipe

export async function convidarParaEquipe(sb: Cliente, email: string, papel: PapelEquipe, nome: string): Promise<Gravacao> {
  const limpo = email.trim().toLowerCase();
  if (!emailValido(limpo)) return { ok: false, erro: 'Confira o e-mail.' };
  if (!['admin', 'suporte', 'financeiro'].includes(papel)) return { ok: false, erro: 'Escolha o papel.' };
  const { error } = await sb.rpc('equipe_convidar', { p_email: limpo, p_papel: papel, p_nome: nome.trim().slice(0, 80) || null });
  if (error) return falhou('convidar para a equipe', error, 'Não deu para convidar agora. Tente de novo.');
  return { ok: true };
}

export async function mudarPessoaDaEquipe(sb: Cliente, userId: string, papel: PapelEquipe, ativo: boolean): Promise<Gravacao> {
  if (!['admin', 'suporte', 'financeiro'].includes(papel)) return { ok: false, erro: 'Escolha o papel.' };
  const { data, error } = await sb.rpc('equipe_mudar', { p_user: userId, p_papel: papel, p_ativo: ativo });
  if (error) return falhou('mudar a equipe', error);
  return data ? { ok: true } : { ok: false, erro: 'Essa pessoa não está mais na equipe.' };
}

export async function cancelarConviteDaEquipe(sb: Cliente, email: string): Promise<Gravacao> {
  const { data, error } = await sb.rpc('equipe_cancelar_convite', { p_email: email });
  if (error) return falhou('cancelar convite da equipe', error);
  return data ? { ok: true } : { ok: false, erro: 'Esse convite já foi usado ou cancelado.' };
}

// ---------------------------------------------------------------- titulares (LGPD) e acessos

/** Tudo o que o Revisaí guarda sobre um e-mail (o pedido fica no histórico). */
export async function exportarTitular(sb: Cliente, email: string): Promise<Gravacao<{ dados: unknown }>> {
  const limpo = email.trim().toLowerCase();
  if (!emailValido(limpo)) return { ok: false, erro: 'Confira o e-mail.' };
  const { data, error } = await sb.rpc('titular_exportar', { p_email: limpo });
  if (error) return falhou('exportar titular', error, 'Não deu para exportar agora. Tente de novo.');
  return { ok: true, dados: data };
}

/** Apaga a conta e os cadastros de um e-mail (o pedido fica no histórico). */
export async function apagarTitular(sb: Cliente, email: string): Promise<Gravacao<{ cadastros: number; conta: boolean }>> {
  const limpo = email.trim().toLowerCase();
  if (!emailValido(limpo)) return { ok: false, erro: 'Confira o e-mail.' };
  const { data, error } = await sb.rpc('titular_apagar', { p_email: limpo });
  if (error) return falhou('apagar titular', error, 'Não deu para apagar agora. Tente de novo.');
  const r = (data ?? {}) as { cadastros?: unknown; conta?: unknown };
  return { ok: true, cadastros: Number(r.cadastros ?? 0), conta: r.conta === true };
}

export interface PedidoDeAcessos {
  email?: string;
  ip?: string;
  de?: string;
  ate?: string;
  motivo: string;
}

/** A consulta dos registros de acesso (ordem judicial): só admin, com motivo, e fica no histórico. */
export async function consultarAcessos(sb: Cliente, p: PedidoDeAcessos): Promise<Gravacao<{ registros: RegistroDeAcesso[]; userId: string | null }>> {
  const motivo = p.motivo.trim().slice(0, 300);
  const email = (p.email ?? '').trim().toLowerCase();
  const ip = (p.ip ?? '').trim().slice(0, 64);
  if (motivo.length < 5) return { ok: false, erro: 'Escreva o motivo, como o número do processo ou do ofício.' };
  if (!email && !ip) return { ok: false, erro: 'Diga o e-mail da conta ou o IP.' };
  if (email && !emailValido(email)) return { ok: false, erro: 'Confira o e-mail.' };
  const dia = /^\d{4}-\d{2}-\d{2}$/;
  if ((p.de && !dia.test(p.de)) || (p.ate && !dia.test(p.ate))) return { ok: false, erro: 'Confira as datas.' };
  let userId: string | null = null;
  if (email) {
    const { data, error } = await sb.rpc('equipe_id_do_email', { p_email: email });
    if (error) return falhou('conta do e-mail', error);
    if (!data) return { ok: false, erro: 'Nenhuma conta com esse e-mail.' };
    userId = String(data);
  }
  const { data, error } = await sb.rpc('acessos_consultar', {
    p_user: userId,
    p_ip: ip || null,
    p_de: p.de ? `${p.de}T00:00:00-03:00` : null,
    p_ate: p.ate ? `${p.ate}T23:59:59.999-03:00` : null,
    p_motivo: motivo
  });
  if (error) return falhou('consultar acessos', error, 'Não deu para consultar agora. Tente de novo.');
  return { ok: true, registros: lerAcessos(data).itens, userId };
}

// ---------------------------------------------------------------- suporte

export async function responderChamado(sb: Cliente, id: string, texto: string): Promise<Gravacao> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: 'Escreva a resposta.' };
  if (limpo.length > 4000) return { ok: false, erro: 'A resposta passou de 4.000 letras. Divida em duas.' };
  const { error } = await sb.rpc('suporte_responder', { p_chamado: id, p_texto: limpo });
  if (error) return falhou('responder chamado', error, 'Não deu para mandar agora. Tente de novo.');
  return { ok: true };
}

export async function mudarSituacaoDoChamado(sb: Cliente, id: string, situacao: SituacaoChamado): Promise<Gravacao> {
  const { error } = await sb.rpc('suporte_situacao', { p_chamado: id, p_situacao: situacao });
  if (error) return falhou('situação do chamado', error);
  return { ok: true };
}
