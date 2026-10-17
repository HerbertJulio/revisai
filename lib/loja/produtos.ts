import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CATEGORIAS } from '../catalogo';
import { normalizarTelefone } from '../formatos';
import { COLUNAS_PRODUTO, lerProdutosCompletos, type LinhaProduto } from '../marketplace-dados';
import { diasImpulsoValido, PRECO_IMPULSO } from '../planos-fornecedor';
import type { Categoria } from '../tipos';
import { mensagemDaLoja } from './comum';
import { esquemaProdutoDaPlanilha, LIMITE_DA_PLANILHA } from './planilha';

// Vitrine da loja: produtos, fotos, promoções, impulsos, o pedido do Destaque e o cadastro.
// Tudo como a pessoa da loja: o banco barra o que não é da loja dela.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const ERRO_GRAVACAO = 'Não deu para salvar agora. Tente de novo.';

async function produtoDaLoja(sb: SupabaseClient, fornecedorId: number, produtoId: number): Promise<LinhaProduto | null> {
  const { data } = await sb.from('produtos').select(COLUNAS_PRODUTO).eq('id', produtoId).eq('fornecedor_id', fornecedorId).maybeSingle();
  return data ? (lerProdutosCompletos([data]).itens[0] ?? null) : null;
}

const especificacao = z
  .object({
    viscosidade: z.string().trim().max(20).optional(),
    base: z.enum(['mineral', 'semissintetico', 'sintetico']).optional(),
    api: z.string().trim().max(10).optional(),
    acea: z.array(z.string().trim().max(12)).max(6).optional(),
    normas: z.array(z.string().trim().max(40)).max(8).optional(),
    medida: z.string().trim().max(30).optional(),
    amperagem: z.number().int().min(20).max(250).optional(),
    tipo: z.string().trim().max(40).optional()
  })
  .strict();

export const esquemaProdutoDaLoja = z
  .object({
    id: z.number().int().positive().optional(),
    categoria: z.enum(CATEGORIAS.map((x) => x.id) as [Categoria, ...Categoria[]]),
    nome: z.string().trim().min(2, 'Escreva o nome do produto.').max(160),
    marca: z.string().trim().max(80).optional().default(''),
    descricao: z.string().trim().max(600).optional().default(''),
    unidade: z.enum(['un', 'L', 'kit', 'par', 'jogo']),
    conteudo: z.number().positive().max(1000).nullable(),
    preco: z.number().positive('Informe o preço.').max(100000),
    intervaloKm: z.number().int().min(1).max(300000).nullable(),
    intervaloMeses: z.number().int().min(1).max(180).nullable(),
    referenciaId: z.number().int().positive().nullable(),
    ativo: z.boolean(),
    especificacao,
    codigo: z.string().trim().max(60, 'O código tem até 60 letras.').optional().default(''),
    estoque: z.number().int('O estoque é um número inteiro.').min(0).max(1_000_000).nullable().optional().default(null),
    aplicacoes: z
      .array(z.object({ texto: z.string().trim().min(2).max(80), marca: z.string().nullable(), modelo: z.string().nullable(), anoDe: z.number().int().nullable(), anoAte: z.number().int().nullable() }))
      .max(100, 'Até 100 carros por produto.')
      .optional()
      .default([]),
    prazoEntregaHoras: z.number().int().min(1).max(720, 'O prazo de entrega vai até 720 horas.').nullable().optional().default(null)
  })
  .refine((x) => x.unidade !== 'L' || x.conteudo != null, { message: 'Informe quantos litros tem a embalagem.' });

export async function salvarProduto(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const r = esquemaProdutoDaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  if (d.id && !(await produtoDaLoja(sb, fornecedorId, d.id))) return { ok: false, erro: 'Produto não encontrado.' };
  const linha = {
    categoria: d.categoria,
    nome: d.nome,
    marca: d.marca || null,
    descricao: d.descricao || null,
    unidade: d.unidade,
    conteudo: d.conteudo,
    preco: Math.round(d.preco * 100) / 100,
    intervalo_km: d.intervaloKm,
    intervalo_meses: d.intervaloMeses,
    referencia_id: d.referenciaId,
    ativo: d.ativo,
    especificacao: Object.fromEntries(Object.entries(d.especificacao).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))),
    codigo: d.codigo || null,
    estoque: d.estoque,
    aplicacoes: d.aplicacoes,
    prazo_entrega_horas: d.prazoEntregaHoras
  };
  if (d.id) {
    const { data, error } = await sb.from('produtos').update(linha).eq('id', d.id).eq('fornecedor_id', fornecedorId).select('id').maybeSingle();
    if (error || !data) {
      if (error?.code === '23505') return { ok: false, erro: 'Esse código já é de outro produto da loja.' };
      if (error) console.error('[loja] editar produto', error);
      return { ok: false, erro: error ? mensagemDaLoja(error, ERRO_GRAVACAO) : 'Produto não encontrado.' };
    }
    return { ok: true, id: d.id };
  }
  const { data, error } = await sb
    .from('produtos')
    .insert({ ...linha, fornecedor_id: fornecedorId })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, erro: 'Esse código já é de outro produto da loja.' };
    console.error('[loja] novo produto', error);
    return { ok: false, erro: mensagemDaLoja(error, ERRO_GRAVACAO) };
  }
  return { ok: true, id: Number(data.id) };
}

/**
 * A planilha conferida no navegador vem de novo para cá: confere cada linha com as mesmas regras e
 * grava tudo numa transação só (a função do banco roda como a pessoa, com as regras dela).
 */
export async function importarProdutos(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao<{ novos: number; mudados: number }>> {
  const r = z.array(esquemaProdutoDaPlanilha).min(1, 'A planilha não tem produtos.').max(LIMITE_DA_PLANILHA, `Mande até ${LIMITE_DA_PLANILHA} produtos por vez.`).safeParse(entrada);
  if (!r.success) {
    const i = r.error.issues[0];
    const linha = typeof i?.path[0] === 'number' ? ` (produto ${i.path[0] + 1})` : '';
    return { ok: false, erro: `${i?.message ?? 'Confira a planilha.'}${linha}` };
  }
  const produtos = r.data.map((p) => ({
    ...p,
    preco: Math.round(p.preco * 100) / 100,
    especificacao: Object.fromEntries(Object.entries(p.especificacao).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)))
  }));
  const { data, error } = await sb.rpc('loja_importar_produtos', { p_fornecedor: fornecedorId, p_produtos: produtos });
  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Dois produtos ficaram com o mesmo código. Confira a coluna codigo.' };
    if (error.code === '42501') return { ok: false, erro: 'A planilha tem produto de outra loja. Baixe a planilha de novo e use a da sua loja.' };
    console.error('[loja] importar planilha', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para importar agora. Nada foi mudado; tente de novo.') };
  }
  const x = z.object({ novos: z.number(), mudados: z.number() }).safeParse(data);
  return x.success ? { ok: true, ...x.data } : { ok: true, novos: 0, mudados: 0 };
}

const TIPOS_FOTO: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export function assinaturaConfere(bytes: Uint8Array, tipo: string): boolean {
  if (tipo === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (tipo === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (tipo === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

/** Guarda a foto no Storage (bucket público "produtos", na pasta da loja) e liga ao produto. */
export async function enviarFoto(sb: SupabaseClient, fornecedorId: number, produtoId: number, arquivo: File): Promise<Gravacao<{ url: string }>> {
  const tipo = arquivo.type;
  const extensao = TIPOS_FOTO[tipo];
  if (!extensao) return { ok: false, erro: 'Mande a foto em JPG, PNG ou WebP.' };
  if (arquivo.size > 1_000_000) return { ok: false, erro: 'A foto passou de 1 MB. Tente outra.' };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!assinaturaConfere(bytes, tipo)) return { ok: false, erro: 'O arquivo não parece uma foto.' };
  if (!(await produtoDaLoja(sb, fornecedorId, produtoId))) return { ok: false, erro: 'Produto não encontrado.' };
  const caminho = `fornecedores/${fornecedorId}/${produtoId}-${Date.now().toString(36)}.${extensao}`;
  const { error } = await sb.storage.from('produtos').upload(caminho, bytes, { contentType: tipo, upsert: false, cacheControl: '31536000' });
  if (error) {
    console.error('[loja] foto', error);
    return { ok: false, erro: 'Não deu para guardar a foto. Tente de novo.' };
  }
  const url = sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl;
  const { error: e2 } = await sb.from('produtos').update({ imagem_url: url }).eq('id', produtoId).eq('fornecedor_id', fornecedorId);
  if (e2) {
    console.error('[loja] ligar foto', e2);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true, url };
}

export const esquemaPromocaoDaLoja = z
  .object({
    id: z.number().int().positive().optional(),
    produtoId: z.number().int().positive(),
    titulo: z.string().trim().min(2, 'Dê um nome curto para a promoção.').max(80),
    precoPromocional: z.number().positive('Informe o preço da promoção.').max(100000),
    quantidadeMinima: z.number().int().min(1).max(1000),
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha quando começa.'),
    fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha quando acaba.'),
    ativo: z.boolean()
  })
  .refine((x) => x.fim >= x.inicio, { message: 'A promoção precisa acabar depois de começar.' });

export async function salvarPromocao(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const r = esquemaPromocaoDaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  const produto = await produtoDaLoja(sb, fornecedorId, d.produtoId);
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' };
  if (d.precoPromocional >= produto.preco) return { ok: false, erro: 'O preço da promoção precisa ser menor que o preço normal.' };
  const linha = { produto_id: d.produtoId, titulo: d.titulo, preco_promocional: Math.round(d.precoPromocional * 100) / 100, quantidade_minima: d.quantidadeMinima, inicio: d.inicio, fim: d.fim, ativo: d.ativo };
  if (d.id) {
    const atual = await sb.from('promocoes').select('produto_id').eq('id', d.id).maybeSingle();
    if (!atual.data || !(await produtoDaLoja(sb, fornecedorId, Number(atual.data.produto_id)))) return { ok: false, erro: 'Promoção não encontrada.' };
    const { error } = await sb.from('promocoes').update(linha).eq('id', d.id);
    if (error) {
      console.error('[loja] editar promoção', error);
      return { ok: false, erro: mensagemDaLoja(error, ERRO_GRAVACAO) };
    }
    return { ok: true, id: d.id };
  }
  const { data, error } = await sb.from('promocoes').insert(linha).select('id').single();
  if (error || !data) {
    console.error('[loja] nova promoção', error);
    return { ok: false, erro: mensagemDaLoja(error, ERRO_GRAVACAO) };
  }
  return { ok: true, id: Number(data.id) };
}

/** A loja pede para impulsionar um produto; a equipe ativa depois do pagamento. */
/** Anúncio por clique: quanto a loja paga por clique e o teto do dia. */
export interface PorClique {
  cpc: number;
  orcamentoDiario: number;
}

export const CPC_MINIMO = 0.3;

export async function pedirImpulso(sb: SupabaseClient, fornecedorId: number, produtoId: number, dias: number, uf: string, porClique: PorClique | null = null): Promise<Gravacao> {
  if (!diasImpulsoValido(dias)) return { ok: false, erro: 'Escolha 7, 15 ou 30 dias.' };
  if (porClique) {
    const { cpc, orcamentoDiario } = porClique;
    if (!(cpc >= CPC_MINIMO) || cpc > 100) return { ok: false, erro: `O clique vai de R$ ${CPC_MINIMO.toFixed(2).replace('.', ',')} a R$ 100.` };
    if (!(orcamentoDiario >= 1) || orcamentoDiario > 10000) return { ok: false, erro: 'O teto por dia vai de R$ 1 a R$ 10.000.' };
    if (orcamentoDiario < cpc) return { ok: false, erro: 'O teto do dia precisa pagar pelo menos um clique.' };
  }
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: 'UF inválida.' };
  const produto = await produtoDaLoja(sb, fornecedorId, produtoId);
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' };
  if (!produto.ativo) return { ok: false, erro: 'Ative o produto antes de impulsionar.' };
  const abertos = await sb.from('impulsos').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fornecedorId).eq('status', 'pedido');
  if ((abertos.count ?? 0) >= 5) return { ok: false, erro: 'Você já tem pedidos de impulso esperando. Fale com a equipe.' };
  const { error } = await sb.from('impulsos').insert({
    produto_id: produtoId,
    fornecedor_id: fornecedorId,
    uf: uf || null,
    dias,
    // por clique, a loja paga pelos cliques (no teto do dia), não pelo período
    valor: porClique ? 0 : PRECO_IMPULSO[dias as keyof typeof PRECO_IMPULSO],
    cpc: porClique ? Math.round(porClique.cpc * 100) / 100 : null,
    orcamento_diario: porClique ? Math.round(porClique.orcamentoDiario * 100) / 100 : null,
    status: 'pedido'
  });
  if (error) {
    console.error('[loja] pedir impulso', error);
    return { ok: false, erro: mensagemDaLoja(error, ERRO_GRAVACAO) };
  }
  return { ok: true };
}

/** O pedido do plano Destaque vira um cadastro para a equipe responder. */
export async function pedirDestaque(sb: SupabaseClient, loja: { nome: string; whatsapp: string | null; email: string | null; cidade: string | null; uf: string | null }, emailDaPessoa: string): Promise<Gravacao> {
  const email = loja.email ?? (emailDaPessoa || null);
  if (!loja.whatsapp && !email) return { ok: false, erro: 'Cadastre o WhatsApp da loja em Sua loja para a equipe falar com você.' };
  const { error } = await sb.from('interessados').insert({
    tipo: 'fornecedor',
    nome: loja.nome,
    empresa: loja.nome,
    whatsapp: loja.whatsapp,
    email,
    cidade: loja.cidade,
    uf: loja.uf,
    plano: 'destaque',
    mensagem: 'Pediu o plano Destaque pelo painel da loja.',
    origem: 'painel-fornecedor',
    consentimento: true
  });
  if (error?.code === 'P0001') return { ok: true };
  if (error) {
    console.error('[loja] pedido de plano', error);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true };
}

export const esquemaCadastroDaLoja = z.object({
  nome: z.string().trim().min(2, 'Escreva o nome da loja.').max(120),
  descricao: z.string().trim().max(400).optional().default(''),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(160).optional().default(''),
  cidade: z.string().trim().max(80).optional().default(''),
  prazoEntregaHoras: z.number().int().min(1).max(720).nullable().optional().default(null),
  avisarWhatsapp: z.boolean().optional().default(true),
  pedidoMinimo: z.number().positive('O pedido mínimo precisa ser maior que zero.').max(100000).nullable().optional().default(null)
});

/** O dono muda o cadastro da loja. O estado (UF), o CNPJ e o plano ficam com a equipe. */
export async function salvarCadastro(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao> {
  const r = esquemaCadastroDaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  const whatsapp = d.whatsapp ? normalizarTelefone(d.whatsapp) : null;
  if (d.whatsapp && !whatsapp) return { ok: false, erro: 'Confira o WhatsApp, com DDD.' };
  const email = d.email.toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'Confira o e-mail.' };
  const { data, error } = await sb
    .from('fornecedores')
    .update({ nome: d.nome, descricao: d.descricao || null, whatsapp, email: email || null, cidade: d.cidade || null, prazo_entrega_horas: d.prazoEntregaHoras, avisar_whatsapp: d.avisarWhatsapp, pedido_minimo: d.pedidoMinimo == null ? null : Math.round(d.pedidoMinimo * 100) / 100 })
    .eq('id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[loja] cadastro', error);
    return { ok: false, erro: error ? mensagemDaLoja(error, ERRO_GRAVACAO) : 'Loja não encontrada.' };
  }
  return { ok: true };
}
