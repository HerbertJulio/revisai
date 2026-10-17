import 'server-only';

// O painel antigo do fornecedor (link com código), pelo servidor, com a chave do sistema.
// As funções do fornecedor sempre recebem o id da sessão dele e só leem e mudam o que é dele;
// essa conferência é feita aqui, antes de cada escrita. O painel novo da loja, por conta, fica
// em lib/loja; o da equipe, em lib/equipe.

import { z } from 'zod';
import { CATEGORIAS } from './catalogo';
import { somarDemanda, type DemandaRecebida, type DemandaRegional, type ItemDemanda } from './demanda';
import { alertasSemResposta } from './alertas';
import { mudancasDaSituacao } from './entregas-dados';
import {
  COLUNAS_CONTRATO,
  COLUNAS_FORNECEDOR,
  COLUNAS_IMPULSO,
  COLUNAS_PARTE,
  COLUNAS_PRODUTO,
  COLUNAS_PROMOCAO,
  lerContratos,
  lerFornecedoresCompletos,
  lerImpulsos,
  lerPartes,
  lerProdutosCompletos,
  lerPromocoesCompletas,
  type ItemDoPedido,
  type LinhaContrato,
  type LinhaFornecedor,
  type LinhaImpulso,
  type LinhaProduto,
  type LinhaPromocao,
  type PedidoDoFornecedor,
  type SituacaoParte
} from './marketplace-dados';
import { diasImpulsoValido, PRECO_IMPULSO } from './planos-fornecedor';
import { hashDoCodigo, marcaDoLink } from './sessao-fornecedor';
import { clienteSistema } from './supabase-servidor';
import type { Categoria } from './tipos';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const SEM_BANCO = 'O banco não está configurado.';
const ERRO_LEITURA = 'Não deu para carregar agora. Atualize a página em instantes.';
const ERRO_GRAVACAO = 'Não deu para salvar agora. Tente de novo.';

export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// ---------------------------------------------------------------- painel do fornecedor

/** O fornecedor dono do código do link (ou null). */
export async function fornecedorDoCodigo(codigo: string): Promise<{ fornecedorId: number; hash: string } | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const hash = hashDoCodigo(codigo);
  const { data, error } = await sb.from('fornecedores_acesso').select('fornecedor_id, hash').eq('hash', hash).maybeSingle();
  if (error || !data) return null;
  return { fornecedorId: Number(data.fornecedor_id), hash: data.hash };
}

/** A sessão ainda vale: o link que a abriu é o link atual do fornecedor. */
export async function sessaoAindaVale(fornecedorId: number, marca: string): Promise<boolean> {
  const sb = clienteSistema();
  if (!sb) return false;
  const { data, error } = await sb.from('fornecedores_acesso').select('hash').eq('fornecedor_id', fornecedorId).maybeSingle();
  if (error || !data) return false;
  return marcaDoLink(data.hash) === marca;
}

export interface PainelFornecedor {
  fornecedor: LinhaFornecedor;
  contrato: LinhaContrato | null;
  produtos: LinhaProduto[];
  promocoes: LinhaPromocao[];
  impulsos: LinhaImpulso[];
  pedidos: PedidoDoFornecedor[];
  demanda: DemandaRegional | null;
  /** Alertas de preço abertos que a loja ainda não respondeu. */
  alertasNovos: number;
  hoje: string;
}

const esquemaPedidoBruto = z.object({
  id: z.union([z.number(), z.string()]).transform(Number),
  codigo: z.string(),
  oficina_nome: z.string(),
  oficina_whatsapp: z.string(),
  oficina_cidade: z.string().nullable(),
  oficina_uf: z.string().nullable(),
  oficina_endereco: z.string().nullish().transform((v) => v ?? null),
  itens: z.array(z.record(z.string(), z.unknown())),
  observacao: z.string().nullable()
});

export async function carregarPainelFornecedor(fornecedorId: number): Promise<{ dados: PainelFornecedor | null; erro: string | null }> {
  const sb = clienteSistema();
  if (!sb) return { dados: null, erro: SEM_BANCO };
  const hoje = hojeEmBrasilia();
  const [f, c, p, i, pf] = await Promise.all([
    sb.from('fornecedores').select(COLUNAS_FORNECEDOR).eq('id', fornecedorId).maybeSingle(),
    sb.from('fornecedores_contrato').select(COLUNAS_CONTRATO).eq('fornecedor_id', fornecedorId).maybeSingle(),
    sb.from('produtos').select(COLUNAS_PRODUTO).eq('fornecedor_id', fornecedorId).order('categoria').order('nome'),
    sb.from('impulsos').select(COLUNAS_IMPULSO).eq('fornecedor_id', fornecedorId).order('criado_em', { ascending: false }).limit(100),
    sb.from('pedidos_fornecedores').select(COLUNAS_PARTE).eq('fornecedor_id', fornecedorId).order('criado_em', { ascending: false }).limit(200)
  ]);
  const erro = f.error ?? c.error ?? p.error ?? i.error ?? pf.error;
  if (erro || !f.data) {
    if (erro) console.error('[marketplace] painel do fornecedor', erro);
    return { dados: null, erro: erro ? ERRO_LEITURA : 'Fornecedor não encontrado.' };
  }
  const fornecedor = lerFornecedoresCompletos([f.data]).itens[0];
  if (!fornecedor) return { dados: null, erro: ERRO_LEITURA };
  const produtos = lerProdutosCompletos(p.data).itens;
  const ids = produtos.map((x) => x.id);
  const promos = ids.length ? await sb.from('promocoes').select(COLUNAS_PROMOCAO).in('produto_id', ids).order('fim', { ascending: false }) : { data: [], error: null };
  const partes = lerPartes(pf.data).itens;
  const pedidosBrutos = partes.length ? await sb.from('pedidos').select('id, codigo, oficina_nome, oficina_whatsapp, oficina_cidade, oficina_uf, oficina_endereco, itens, observacao').in('id', partes.map((x) => x.pedido_id)) : { data: [], error: null };
  const mapaPedidos = new Map<number, z.infer<typeof esquemaPedidoBruto>>();
  for (const linha of pedidosBrutos.data ?? []) {
    const r = esquemaPedidoBruto.safeParse(linha);
    if (r.success) mapaPedidos.set(r.data.id, r.data);
  }
  const pedidos: PedidoDoFornecedor[] = partes.flatMap((parte) => {
    const ped = mapaPedidos.get(parte.pedido_id);
    if (!ped) return [];
    const itens = ped.itens
      .filter((x) => Number(x.fornecedor_id) === fornecedorId)
      .map(
        (x): ItemDoPedido => ({
          produto_id: Number(x.produto_id),
          nome: String(x.nome ?? ''),
          fornecedor_id: fornecedorId,
          quantidade: Number(x.quantidade),
          preco_unitario: Number(x.preco_unitario),
          combinado: x.combinado === true
        })
      );
    return [
      {
        id: parte.id,
        codigo: ped.codigo,
        criadoEm: parte.criado_em,
        status: parte.status,
        subtotal: parte.subtotal,
        comissaoPercentual: parte.comissao_percentual,
        oficina: { nome: ped.oficina_nome, whatsapp: ped.oficina_whatsapp, cidade: ped.oficina_cidade, uf: ped.oficina_uf, endereco: ped.oficina_endereco },
        observacao: ped.observacao,
        itens,
        pagamento: parte.pagamento,
        pagamentoEm: parte.pagamento_em,
        entrega: { previsao: parte.entrega_previsao, saiuEm: parte.entrega_saiu_em, posicaoEm: parte.entrega_posicao_em, entregueEm: parte.entregue_em }
      }
    ];
  });
  const categorias = [...new Set(produtos.filter((x) => x.ativo).map((x) => x.categoria))];
  const [demanda, alertasNovos] = await Promise.all([
    fornecedor.uf ? demandaDaRegiao(fornecedor.uf) : Promise.resolve(null),
    fornecedor.ativo ? alertasSemResposta(fornecedorId, fornecedor.uf, categorias).catch(() => 0) : Promise.resolve(0)
  ]);
  return {
    dados: {
      fornecedor,
      contrato: c.data ? (lerContratos([c.data]).itens[0] ?? null) : null,
      produtos,
      promocoes: lerPromocoesCompletas(promos.data).itens,
      impulsos: lerImpulsos(i.data).itens,
      pedidos,
      demanda,
      alertasNovos,
      hoje
    },
    erro: null
  };
}

const esquemaItemDemanda = z.object({
  categoria: z.enum(CATEGORIAS.map((x) => x.id) as [Categoria, ...Categoria[]]),
  titulo: z.string(),
  quantidade: z.number(),
  unidade: z.enum(['L', 'un']),
  carros: z.number()
});

/** A demanda somada de um estado (só as linhas com oficinas suficientes para ninguém ser identificado). */
export async function demandaDaRegiao(uf: string): Promise<DemandaRegional | null> {
  const sb = clienteSistema();
  if (!sb) return null;
  const desde = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { data, error } = await sb.from('demandas').select('uf, cidade, itens, atualizado_em').eq('uf', uf).gte('atualizado_em', desde).limit(2000);
  if (error) {
    console.error('[marketplace] demanda', error);
    return null;
  }
  const lista: DemandaRecebida[] = (data ?? []).map((d: { uf: string | null; cidade: string | null; itens: unknown; atualizado_em: string }) => ({
    uf: d.uf,
    cidade: d.cidade,
    atualizadoEm: d.atualizado_em,
    itens: (Array.isArray(d.itens) ? d.itens : []).flatMap((x): ItemDemanda[] => {
      const r = esquemaItemDemanda.safeParse(x);
      return r.success ? [r.data] : [];
    })
  }));
  return somarDemanda(lista, uf, new Date());
}

async function produtoDoFornecedor(fornecedorId: number, produtoId: number): Promise<LinhaProduto | null> {
  const sb = clienteSistema();
  if (!sb) return null;
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

export const esquemaProdutoFornecedor = z
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
    especificacao
  })
  .refine((x) => x.unidade !== 'L' || x.conteudo != null, { message: 'Informe quantos litros tem a embalagem.' });

export async function salvarProdutoDoFornecedor(fornecedorId: number, entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const r = esquemaProdutoFornecedor.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  if (d.id && !(await produtoDoFornecedor(fornecedorId, d.id))) return { ok: false, erro: 'Produto não encontrado.' };
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
    especificacao: Object.fromEntries(Object.entries(d.especificacao).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)))
  };
  if (d.id) {
    const { error } = await sb.from('produtos').update(linha).eq('id', d.id).eq('fornecedor_id', fornecedorId);
    if (error) {
      console.error('[marketplace] editar produto', error);
      return { ok: false, erro: ERRO_GRAVACAO };
    }
    return { ok: true, id: d.id };
  }
  const { data, error } = await sb
    .from('produtos')
    .insert({ ...linha, fornecedor_id: fornecedorId })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[marketplace] novo produto', error);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true, id: Number(data.id) };
}

const TIPOS_FOTO: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

function assinaturaConfere(bytes: Uint8Array, tipo: string): boolean {
  if (tipo === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (tipo === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (tipo === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

/** Guarda a foto do produto no Storage (bucket público "produtos") e liga ao produto. */
export async function enviarFotoDoProduto(fornecedorId: number, produtoId: number, arquivo: File): Promise<Gravacao<{ url: string }>> {
  const tipo = arquivo.type;
  const extensao = TIPOS_FOTO[tipo];
  if (!extensao) return { ok: false, erro: 'Mande a foto em JPG, PNG ou WebP.' };
  if (arquivo.size > 1_000_000) return { ok: false, erro: 'A foto passou de 1 MB. Tente outra.' };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!assinaturaConfere(bytes, tipo)) return { ok: false, erro: 'O arquivo não parece uma foto.' };
  if (!(await produtoDoFornecedor(fornecedorId, produtoId))) return { ok: false, erro: 'Produto não encontrado.' };
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const caminho = `fornecedores/${fornecedorId}/${produtoId}-${Date.now().toString(36)}.${extensao}`;
  const { error } = await sb.storage.from('produtos').upload(caminho, bytes, { contentType: tipo, upsert: false, cacheControl: '31536000' });
  if (error) {
    console.error('[marketplace] foto', error);
    return { ok: false, erro: 'Não deu para guardar a foto. Tente de novo.' };
  }
  const url = sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl;
  const { error: e2 } = await sb.from('produtos').update({ imagem_url: url }).eq('id', produtoId).eq('fornecedor_id', fornecedorId);
  if (e2) {
    console.error('[marketplace] ligar foto', e2);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true, url };
}

export const esquemaPromocaoFornecedor = z
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

export async function salvarPromocaoDoFornecedor(fornecedorId: number, entrada: unknown): Promise<Gravacao<{ id: number }>> {
  const r = esquemaPromocaoFornecedor.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = r.data;
  const produto = await produtoDoFornecedor(fornecedorId, d.produtoId);
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' };
  if (d.precoPromocional >= produto.preco) return { ok: false, erro: 'O preço da promoção precisa ser menor que o preço normal.' };
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const linha = { produto_id: d.produtoId, titulo: d.titulo, preco_promocional: Math.round(d.precoPromocional * 100) / 100, quantidade_minima: d.quantidadeMinima, inicio: d.inicio, fim: d.fim, ativo: d.ativo };
  if (d.id) {
    const atual = await sb.from('promocoes').select('produto_id').eq('id', d.id).maybeSingle();
    if (!atual.data || !(await produtoDoFornecedor(fornecedorId, Number(atual.data.produto_id)))) return { ok: false, erro: 'Promoção não encontrada.' };
    const { error } = await sb.from('promocoes').update(linha).eq('id', d.id);
    if (error) {
      console.error('[marketplace] editar promoção', error);
      return { ok: false, erro: ERRO_GRAVACAO };
    }
    return { ok: true, id: d.id };
  }
  const { data, error } = await sb.from('promocoes').insert(linha).select('id').single();
  if (error || !data) {
    console.error('[marketplace] nova promoção', error);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true, id: Number(data.id) };
}

/** O fornecedor pede para impulsionar um produto; a equipe ativa depois do pagamento. */
export async function pedirImpulso(fornecedorId: number, produtoId: number, dias: number, uf: string): Promise<Gravacao> {
  if (!diasImpulsoValido(dias)) return { ok: false, erro: 'Escolha 7, 15 ou 30 dias.' };
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: 'UF inválida.' };
  const produto = await produtoDoFornecedor(fornecedorId, produtoId);
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' };
  if (!produto.ativo) return { ok: false, erro: 'Ative o produto antes de impulsionar.' };
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const abertos = await sb.from('impulsos').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fornecedorId).eq('status', 'pedido');
  if ((abertos.count ?? 0) >= 5) return { ok: false, erro: 'Você já tem pedidos de impulso esperando. Fale com a equipe.' };
  const { error } = await sb.from('impulsos').insert({ produto_id: produtoId, fornecedor_id: fornecedorId, uf: uf || null, dias, valor: PRECO_IMPULSO[dias], status: 'pedido' });
  if (error) {
    console.error('[marketplace] pedir impulso', error);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true };
}

export async function mudarSituacaoDaParte(fornecedorId: number, parteId: number, status: SituacaoParte): Promise<Gravacao> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const atual = await sb.from('pedidos_fornecedores').select('entrega_saiu_em').eq('id', parteId).eq('fornecedor_id', fornecedorId).maybeSingle();
  if (atual.error || !atual.data) return { ok: false, erro: atual.error ? ERRO_GRAVACAO : 'Pedido não encontrado.' };
  const { data, error } = await sb
    .from('pedidos_fornecedores')
    .update(mudancasDaSituacao(status, { entrega_saiu_em: (atual.data.entrega_saiu_em as string | null) ?? null }, new Date().toISOString()))
    .eq('id', parteId)
    .eq('fornecedor_id', fornecedorId)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[marketplace] situação da parte', error);
    return { ok: false, erro: error ? ERRO_GRAVACAO : 'Pedido não encontrado.' };
  }
  return { ok: true };
}

/** O fornecedor pede o plano Destaque: vira um cadastro para a equipe responder. */
export async function registrarPedidoDePlano(fornecedorId: number): Promise<Gravacao> {
  const sb = clienteSistema();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const { data } = await sb.from('fornecedores').select(COLUNAS_FORNECEDOR).eq('id', fornecedorId).maybeSingle();
  const f = data ? lerFornecedoresCompletos([data]).itens[0] : undefined;
  if (!f) return { ok: false, erro: 'Fornecedor não encontrado.' };
  const contrato = await sb.from('fornecedores_contrato').select('email').eq('fornecedor_id', fornecedorId).maybeSingle();
  const email = (contrato.data?.email as string | null | undefined) ?? null;
  if (!f.whatsapp && !email) return { ok: false, erro: 'A equipe ainda não tem o WhatsApp da sua loja. Mande uma mensagem para o Revisaí.' };
  const { error } = await sb.from('interessados').insert({
    tipo: 'fornecedor',
    nome: f.nome,
    empresa: f.nome,
    whatsapp: f.whatsapp,
    email,
    cidade: f.cidade,
    uf: f.uf,
    plano: 'destaque',
    mensagem: 'Pediu o plano Destaque pelo painel do fornecedor.',
    origem: 'painel-fornecedor',
    consentimento: true
  });
  if (error?.code === 'P0001') return { ok: true };
  if (error) {
    console.error('[marketplace] pedido de plano', error);
    return { ok: false, erro: ERRO_GRAVACAO };
  }
  return { ok: true };
}
