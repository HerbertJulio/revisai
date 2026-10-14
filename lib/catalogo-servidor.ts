import 'server-only';
import type { Catalogo, Fornecedor, Patrocinio, Produto, Promocao } from './catalogo';
import { CATALOGO_EXEMPLO } from './catalogo-demo';
import { supabaseServidor } from './supabase';

interface LinhaProduto {
  id: number;
  fornecedor_id: number;
  categoria: Produto['categoria'];
  nome: string;
  marca: string | null;
  descricao: string | null;
  unidade: Produto['unidade'];
  conteudo: number | null;
  preco: number;
  especificacao: Produto['especificacao'] | null;
  intervalo_km: number | null;
  intervalo_meses: number | null;
  imagem_url: string | null;
  referencia_id: number | null;
}

interface LinhaFornecedor {
  id: number;
  nome: string;
  cidade: string | null;
  uf: string | null;
  demonstracao: boolean;
  destaque: boolean;
  destaque_ate: string | null;
  descricao: string | null;
}

interface LinhaImpulso {
  produto_id: number;
  uf: string | null;
  inicio: string;
  fim: string;
}

interface LinhaPromocao {
  id: number;
  produto_id: number;
  titulo: string;
  preco_promocional: number;
  quantidade_minima: number;
  inicio: string;
  fim: string;
}

const VALIDADE_MS = 5 * 60_000;
let guardado: { em: number; catalogo: Catalogo } | null = null;

/**
 * O catálogo do banco; sem configuração ou com o banco fora do ar, o de exemplo.
 * Fica 5 minutos na memória do servidor, para o banco não ser consultado a cada visita.
 */
export async function buscarCatalogo(): Promise<{ catalogo: Catalogo; erro?: string }> {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return { catalogo: guardado.catalogo };
  const sb = supabaseServidor();
  if (!sb) return { catalogo: CATALOGO_EXEMPLO, erro: 'Supabase não configurado' };
  try {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const [f, p, pr, im] = await Promise.all([
      sb.from('fornecedores').select('id, nome, cidade, uf, demonstracao, destaque, destaque_ate, descricao').order('id'),
      sb
        .from('produtos')
        .select('id, fornecedor_id, categoria, nome, marca, descricao, unidade, conteudo, preco, especificacao, intervalo_km, intervalo_meses, imagem_url, referencia_id')
        .order('categoria')
        .order('preco'),
      sb.from('promocoes').select('id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim'),
      sb.from('impulsos').select('produto_id, uf, inicio, fim').eq('status', 'ativo').gte('fim', hoje)
    ]);
    const erro = f.error ?? p.error ?? pr.error;
    if (erro) throw erro;
    // sem a tabela de impulsos (banco antigo), a loja segue sem patrocinados
    if (im.error) console.error('[catalogo] impulsos', im.error);
    const fornecedores: Fornecedor[] = ((f.data ?? []) as LinhaFornecedor[]).map((x) => ({
      id: Number(x.id),
      nome: x.nome,
      cidade: x.cidade,
      uf: x.uf,
      demonstracao: x.demonstracao,
      destaque: !!x.destaque && (!x.destaque_ate || x.destaque_ate >= hoje),
      descricao: x.descricao ?? null
    }));
    const ativos = new Set(fornecedores.map((f) => f.id));
    const produtos: Produto[] = ((p.data ?? []) as LinhaProduto[]).filter((x) => ativos.has(Number(x.fornecedor_id))).map((x) => ({
      id: Number(x.id),
      fornecedorId: Number(x.fornecedor_id),
      categoria: x.categoria,
      nome: x.nome,
      marca: x.marca,
      descricao: x.descricao,
      unidade: x.unidade,
      conteudo: x.conteudo == null ? null : Number(x.conteudo),
      preco: Number(x.preco),
      especificacao: x.especificacao ?? {},
      intervaloKm: x.intervalo_km,
      intervaloMeses: x.intervalo_meses,
      imagemUrl: x.imagem_url ?? null,
      referenciaId: x.referencia_id == null ? null : Number(x.referencia_id)
    }));
    const comProduto = new Set(produtos.map((x) => x.id));
    const patrocinios: Patrocinio[] = ((im.data ?? []) as LinhaImpulso[])
      .filter((x) => comProduto.has(Number(x.produto_id)))
      .map((x) => ({ produtoId: Number(x.produto_id), uf: x.uf, inicio: x.inicio, fim: x.fim }));
    const promocoes: Promocao[] = ((pr.data ?? []) as LinhaPromocao[]).map((x) => ({
      id: Number(x.id),
      produtoId: Number(x.produto_id),
      titulo: x.titulo,
      precoPromocional: Number(x.preco_promocional),
      quantidadeMinima: x.quantidade_minima,
      inicio: x.inicio,
      fim: x.fim
    }));
    const catalogo: Catalogo = { origem: 'banco', atualizadoEm: new Date().toISOString(), fornecedores, produtos, promocoes, patrocinios };
    guardado = { em: Date.now(), catalogo };
    return { catalogo };
  } catch (e) {
    console.error('[catalogo] falha ao ler o Supabase', e);
    return { catalogo: CATALOGO_EXEMPLO, erro: 'Banco indisponível' };
  }
}
