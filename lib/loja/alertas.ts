import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { aceiteEquivalente, embalagemComparavel, litrosDa, resultadoParaLoja, type AlertaParaLoja } from '../alertas-dados';
import { CATEGORIAS, type Unidade } from '../catalogo';
import { formatarMoeda } from '../formatos';
import { chaveDoProduto } from '../precos';
import type { Categoria } from '../tipos';
import { esquemaRespostaDaLoja, mensagemDaLoja } from './comum';

// Os alertas de preço do lado da loja, como a pessoa da loja. A loja lê os alertas pela vitrine
// (alertas_vitrine: os abertos do estado dela, das categorias que ela vende, e os que ela já
// respondeu), sem nada que diga qual oficina pediu, e lê e grava as próprias respostas só pelas
// funções do banco, que também não devolvem a oficina.

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const ERRO = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';
const HORA = 3_600_000;

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const categoria = z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]);

const esquemaAlerta = z.object({
  id: z.string(),
  oficina_cidade: textoOuNulo,
  oficina_uf: z.string(),
  categoria,
  titulo: z.string(),
  produto_id: numeroOuNulo,
  chave: textoOuNulo,
  especificacao: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  quantidade: numero,
  preco_alvo: numero,
  mensagem: textoOuNulo,
  status: z.enum(['aberto', 'fechado', 'cancelado']),
  expira_em: z.string(),
  criado_em: z.string()
});
type LinhaAlerta = z.infer<typeof esquemaAlerta>;
const COLUNAS_ALERTA = 'id, oficina_cidade, oficina_uf, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, mensagem, status, expira_em, criado_em';

const esquemaResposta = z.object({
  id: z.string(),
  alerta_id: z.string(),
  fornecedor_id: numero,
  tipo: z.enum(['aceita', 'contraproposta', 'recusa']),
  produto_id: numeroOuNulo,
  preco: numeroOuNulo,
  quantidade_minima: numeroOuNulo,
  prazo_entrega: textoOuNulo,
  mensagem: textoOuNulo,
  status: z.enum(['enviada', 'escolhida', 'descartada']),
  pedido_id: numeroOuNulo,
  criado_em: z.string()
});
const COLUNAS_RESPOSTA = 'id, alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima, prazo_entrega, mensagem, status, pedido_id, criado_em';

const esquemaProduto = z.object({
  id: numero,
  categoria,
  nome: z.string(),
  marca: textoOuNulo,
  unidade: z.enum(['un', 'L', 'kit', 'par', 'jogo']),
  conteudo: numeroOuNulo,
  preco: numero,
  especificacao: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  ativo: z.boolean()
});
type LinhaProduto = z.infer<typeof esquemaProduto>;
const COLUNAS_PRODUTO = 'id, categoria, nome, marca, unidade, conteudo, preco, especificacao, ativo';

function ler<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

export interface ProdutoDaLoja {
  id: number;
  nome: string;
  categoria: Categoria;
  unidade: Unidade;
  conteudo: number | null;
  preco: number;
  chave: string;
  especificacao: Record<string, unknown>;
}

function litrosDoAlerta(a: Pick<LinhaAlerta, 'categoria' | 'especificacao'>): number | null {
  const e = a.especificacao;
  const unidade = typeof e.unidade === 'string' ? (e.unidade as Unidade) : null;
  if (!unidade) return null;
  return litrosDa({ categoria: a.categoria, unidade, conteudo: typeof e.conteudo === 'number' ? e.conteudo : null });
}

function nomeDoProduto(p: Pick<LinhaProduto, 'marca' | 'nome'>): string {
  return [p.marca, p.nome].filter(Boolean).join(' ');
}

async function lojaEProdutos(sb: SupabaseClient, fornecedorId: number): Promise<{ uf: string | null; produtos: LinhaProduto[] } | null> {
  const [f, p] = await Promise.all([
    sb.from('fornecedores').select('uf, ativo').eq('id', fornecedorId).maybeSingle(),
    sb.from('produtos').select(COLUNAS_PRODUTO).eq('fornecedor_id', fornecedorId).eq('ativo', true)
  ]);
  if (f.error || p.error || !f.data) return null;
  const loja = f.data as { uf: string | null; ativo: boolean };
  return { uf: loja.ativo ? loja.uf : null, produtos: ler(esquemaProduto, p.data) };
}

/** Os alertas que a loja pode responder (estado dela, categorias que ela vende) e os que ela já respondeu. */
export async function alertasParaLoja(sb: SupabaseClient, fornecedorId: number): Promise<{ alertas: AlertaParaLoja[]; produtos: ProdutoDaLoja[]; uf: string | null; erro: string | null }> {
  const base = await lojaEProdutos(sb, fornecedorId);
  if (!base) return { alertas: [], produtos: [], uf: null, erro: ERRO };
  const produtos = base.produtos.map((p): ProdutoDaLoja => ({ id: p.id, nome: nomeDoProduto(p), categoria: p.categoria, unidade: p.unidade, conteudo: p.conteudo, preco: p.preco, chave: chaveDoProduto(p), especificacao: p.especificacao }));
  const categorias = [...new Set(produtos.map((p) => p.categoria))];
  const agora = Date.now();
  const minhas = await sb.rpc('loja_respostas_dos_alertas', { p_fornecedor: fornecedorId, p_desde: new Date(agora - 30 * 24 * HORA).toISOString() });
  if (minhas.error) {
    console.error('[loja] respostas', minhas.error);
    return { alertas: [], produtos, uf: base.uf, erro: ERRO };
  }
  const respostas = ler(esquemaResposta, minhas.data);
  const [abertos, respondidos] = await Promise.all([
    base.uf && categorias.length
      ? sb.from('alertas_vitrine').select(COLUNAS_ALERTA).eq('oficina_uf', base.uf).eq('status', 'aberto').gt('expira_em', new Date(agora).toISOString()).in('categoria', categorias).order('criado_em', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    respostas.length ? sb.from('alertas_vitrine').select(COLUNAS_ALERTA).in('id', respostas.map((r) => r.alerta_id)) : Promise.resolve({ data: [], error: null })
  ]);
  if (abertos.error || respondidos.error) {
    console.error('[loja] alertas', abertos.error ?? respondidos.error);
    return { alertas: [], produtos, uf: base.uf, erro: ERRO };
  }
  const vistos = new Map<string, LinhaAlerta>();
  for (const a of [...ler(esquemaAlerta, abertos.data), ...ler(esquemaAlerta, respondidos.data)]) vistos.set(a.id, a);
  // o código do pedido sai da parte da loja (a loja não lê o pedido inteiro)
  const idsPedidos = respostas.flatMap((r) => (r.status === 'escolhida' && r.pedido_id != null ? [r.pedido_id] : []));
  const pe = idsPedidos.length ? await sb.from('pedidos_fornecedores').select('pedido_id, codigo').eq('fornecedor_id', fornecedorId).in('pedido_id', idsPedidos) : { data: [] };
  const pedidos = new Map(((pe.data ?? []) as { pedido_id: number; codigo: string | null }[]).map((x) => [Number(x.pedido_id), x.codigo ?? '']));
  const alertas = [...vistos.values()]
    .map((a): AlertaParaLoja => {
      const minha = respostas.find((r) => r.alerta_id === a.id) ?? null;
      return {
        id: a.id,
        titulo: a.titulo,
        categoria: a.categoria,
        chave: a.chave,
        especificacao: a.especificacao,
        quantidade: a.quantidade,
        precoAlvo: a.preco_alvo,
        litros: litrosDoAlerta(a),
        cidade: a.oficina_cidade,
        uf: a.oficina_uf,
        mensagem: a.mensagem,
        expiraEm: a.expira_em,
        criadoEm: a.criado_em,
        resultado: resultadoParaLoja({ status: a.status, expiraEm: a.expira_em }, minha, agora),
        minha: minha
          ? { id: minha.id, tipo: minha.tipo, produtoId: minha.produto_id, preco: minha.preco, quantidadeMinima: minha.quantidade_minima, prazoEntrega: minha.prazo_entrega, mensagem: minha.mensagem, status: minha.status }
          : null,
        pedido: minha?.pedido_id != null ? pedidos.get(minha.pedido_id) || null : null
      };
    })
    .sort((x, y) => (x.criadoEm < y.criadoEm ? 1 : -1));
  return { alertas, produtos, uf: base.uf, erro: null };
}

/** Quantos alertas abertos a loja ainda não respondeu (para o número na aba). */
export async function contarAlertasSemResposta(sb: SupabaseClient, fornecedorId: number, uf: string, categorias: Categoria[]): Promise<number> {
  if (!categorias.length) return 0;
  const a = await sb.from('alertas_vitrine').select('id').eq('oficina_uf', uf).eq('status', 'aberto').gt('expira_em', new Date().toISOString()).in('categoria', categorias).limit(200);
  const ids = ((a.data ?? []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return 0;
  const r = await sb.rpc('loja_respostas_dos_alertas', { p_fornecedor: fornecedorId, p_alertas: ids });
  const respondidos = new Set(((r.data ?? []) as { alerta_id: string }[]).map((x) => x.alerta_id));
  return ids.filter((id) => !respondidos.has(id)).length;
}

/**
 * A loja aceita, faz contraproposta ou recusa. O banco confere de novo (alerta aberto, loja do
 * estado, produto dela e da mesma categoria) e grava a oficina dona na resposta.
 */
export async function responderAlerta(sb: SupabaseClient, fornecedorId: number, entrada: unknown): Promise<Gravacao> {
  const r = esquemaRespostaDaLoja.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira a resposta.' };
  const d = r.data;
  const base = await lojaEProdutos(sb, fornecedorId);
  if (!base) return { ok: false, erro: ERRO };
  const a = await sb.from('alertas_vitrine').select(COLUNAS_ALERTA).eq('id', d.alertaId).maybeSingle();
  const alerta = a.data ? ler(esquemaAlerta, [a.data])[0] : undefined;
  if (!alerta || alerta.oficina_uf !== base.uf || !base.produtos.some((p) => p.categoria === alerta.categoria)) return { ok: false, erro: 'Alerta não encontrado.' };
  if (alerta.status !== 'aberto' || Date.parse(alerta.expira_em) <= Date.now()) return { ok: false, erro: 'Este alerta já terminou.' };
  const atual = await sb.rpc('loja_respostas_dos_alertas', { p_fornecedor: fornecedorId, p_alertas: [alerta.id] });
  if (atual.error) return { ok: false, erro: ERRO };
  const minha = ler(esquemaResposta, atual.data)[0];
  if (minha && (minha.status !== 'enviada' || minha.pedido_id != null)) return { ok: false, erro: 'Este alerta já terminou.' };

  let linha: { tipo: 'aceita' | 'contraproposta' | 'recusa'; produto_id: number | null; preco: number | null; quantidade_minima: number | null; prazo_entrega: string | null; mensagem: string | null } = {
    tipo: 'recusa',
    produto_id: null,
    preco: null,
    quantidade_minima: null,
    prazo_entrega: null,
    mensagem: d.mensagem || null
  };
  if (d.tipo !== 'recusa') {
    const produto = base.produtos.find((p) => p.id === d.produtoId);
    if (!produto || produto.categoria !== alerta.categoria) return { ok: false, erro: 'Escolha um produto seu da mesma categoria do alerta.' };
    let preco: number;
    let minimo: number;
    if (d.tipo === 'aceita') {
      if (!embalagemComparavel({ litros: litrosDoAlerta(alerta), especificacao: alerta.especificacao }, produto))
        return { ok: false, erro: 'A embalagem do seu produto é diferente da que a oficina pediu. Mande uma contraproposta com o seu preço.' };
      ({ preco, quantidadeMinima: minimo } = aceiteEquivalente({ quantidade: alerta.quantidade, precoAlvo: alerta.preco_alvo, litros: litrosDoAlerta(alerta) }, produto));
    } else {
      preco = Math.round(d.preco * 100) / 100;
      minimo = d.quantidadeMinima;
      if (preco >= produto.preco) return { ok: false, erro: `O preço da proposta precisa ser menor que o seu preço na loja (${formatarMoeda(produto.preco)}).` };
    }
    linha = { tipo: d.tipo, produto_id: produto.id, preco, quantidade_minima: minimo, prazo_entrega: d.prazoEntrega || null, mensagem: d.mensagem || null };
  }
  // o banco cria a resposta ou muda a que ainda não foi escolhida (a oficina pode estar fechando agora mesmo)
  const { error } = await sb.rpc('loja_responder_alerta', {
    p_fornecedor: fornecedorId,
    p_alerta: alerta.id,
    p_tipo: linha.tipo,
    p_produto: linha.produto_id,
    p_preco: linha.preco,
    p_minimo: linha.quantidade_minima,
    p_prazo: linha.prazo_entrega,
    p_mensagem: linha.mensagem
  });
  if (error) {
    if (error.code === 'RV004') return { ok: false, erro: 'Este alerta já terminou.' };
    if (error.code === '23505') return { ok: false, erro: 'Você já respondeu este alerta. Atualize a página.' };
    console.error('[loja] responder', error);
    return { ok: false, erro: mensagemDaLoja(error, 'Não deu para mandar a resposta agora. Tente de novo.') };
  }
  return { ok: true };
}
