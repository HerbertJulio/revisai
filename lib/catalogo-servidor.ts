import 'server-only';
import type { Catalogo, Fornecedor, Patrocinio, Produto, Promocao } from './catalogo';
import { CATALOGO_EXEMPLO } from './catalogo-demo';
import { anunciosComOrcamento } from './loja/anuncios';
import { lerAplicacoes } from './loja/dados';
import { clienteSistema } from './supabase-servidor';
import { EXTRAS_VAZIOS, type Anuncio, type ExtrasDaVitrine, type InfoDaLoja, type InfoDoProduto } from './vitrine';

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
  id: number;
  produto_id: number;
  uf: string | null;
  inicio: string;
  fim: string;
  cpc: number | string | null;
}

interface LinhaInfoDaLoja {
  id: number;
  prazo_entrega_horas: number | null;
  pedido_minimo: number | string | null;
  cashback_percentual: number | string | null;
}

interface LinhaInfoDoProduto {
  id: number;
  estoque: number | string | null;
  aplicacoes: unknown;
  prazo_entrega_horas?: number | string | null;
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
let guardado: { em: number; catalogo: Catalogo; extras: ExtrasDaVitrine } | null = null;

const numeroOuNulo = (v: number | string | null | undefined): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * O catálogo do banco (só o que é público: lojas ativas e os produtos delas), com os preços; sem
 * configuração ou com o banco fora do ar, o de exemplo. Fica 5 minutos na memória do servidor,
 * para o banco não ser consultado a cada visita. Quem não entrou recebe o catálogo sem preços
 * (app/api/catalogo). O banco só entrega as tabelas da loja ao servidor (com a chave do sistema),
 * nunca direto pela chave pública, então os filtros do que é público ficam aqui.
 * Junto, os extras da vitrine: prazo de entrega, pedido mínimo e cashback das lojas, estoque e
 * aplicações dos produtos, e os anúncios no ar (os por clique só enquanto têm teto no dia).
 */
export async function buscarCatalogo(): Promise<{ catalogo: Catalogo; extras: ExtrasDaVitrine; erro?: string }> {
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return { catalogo: guardado.catalogo, extras: guardado.extras };
  const sb = clienteSistema();
  if (!sb) return { catalogo: CATALOGO_EXEMPLO, extras: EXTRAS_VAZIOS, erro: 'Supabase ou a chave do sistema não configurados' };
  try {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const [f, p, pr, im, fx, px] = await Promise.all([
      sb.from('fornecedores').select('id, nome, cidade, uf, demonstracao, destaque, destaque_ate, descricao').eq('ativo', true).order('id'),
      sb
        .from('produtos')
        .select('id, fornecedor_id, categoria, nome, marca, descricao, unidade, conteudo, preco, especificacao, intervalo_km, intervalo_meses, imagem_url, referencia_id')
        .eq('ativo', true)
        .eq('oculto_moderacao', false)
        .order('categoria')
        .order('preco'),
      sb.from('promocoes').select('id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim').eq('ativo', true).gte('fim', hoje),
      sb.from('impulsos').select('id, produto_id, uf, inicio, fim, cpc').eq('status', 'ativo').gte('fim', hoje),
      // os extras vêm à parte: sem as colunas (banco antigo), a loja segue sem eles
      sb.from('fornecedores').select('id, prazo_entrega_horas, pedido_minimo, cashback_percentual').eq('ativo', true),
      sb.from('produtos').select('id, estoque, aplicacoes, prazo_entrega_horas').eq('ativo', true).eq('oculto_moderacao', false)
    ]);
    const erro = f.error ?? p.error ?? pr.error;
    if (erro) throw erro;
    // sem a tabela de impulsos (banco antigo), a loja segue sem patrocinados
    if (im.error) console.error('[catalogo] impulsos', im.error);
    if (fx.error) console.error('[catalogo] extras das lojas', fx.error);
    if (px.error) console.error('[catalogo] extras dos produtos', px.error);
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
    const noAr: Anuncio[] = ((im.data ?? []) as LinhaImpulso[])
      .filter((x) => comProduto.has(Number(x.produto_id)))
      .map((x) => ({ impulsoId: Number(x.id), produtoId: Number(x.produto_id), uf: x.uf, inicio: x.inicio, fim: x.fim, porClique: x.cpc != null }));
    // o anúncio por clique que gastou o teto do dia sai da vitrine até amanhã (o por período fica)
    const comTeto = await anunciosComOrcamento(
      sb,
      noAr.filter((a) => a.porClique).map((a) => a.impulsoId)
    );
    const anuncios = noAr.filter((a) => !a.porClique || comTeto.has(a.impulsoId));
    const patrocinios: Patrocinio[] = anuncios.map((a) => ({ produtoId: a.produtoId, uf: a.uf, inicio: a.inicio, fim: a.fim }));
    const lojas: Record<string, InfoDaLoja> = {};
    for (const x of (fx.data ?? []) as LinhaInfoDaLoja[]) {
      if (!ativos.has(Number(x.id))) continue;
      lojas[String(x.id)] = { prazoEntregaHoras: numeroOuNulo(x.prazo_entrega_horas), pedidoMinimo: numeroOuNulo(x.pedido_minimo), cashbackPercentual: numeroOuNulo(x.cashback_percentual) ?? 0 };
    }
    const infoProdutos: Record<string, InfoDoProduto> = {};
    for (const x of (px.data ?? []) as LinhaInfoDoProduto[]) {
      if (!comProduto.has(Number(x.id))) continue;
      const estoque = numeroOuNulo(x.estoque);
      const aplicacoes = lerAplicacoes(x.aplicacoes);
      const prazoEntregaHoras = numeroOuNulo(x.prazo_entrega_horas);
      // só vai o que a loja informou (o resto é "sem informação")
      if (estoque != null || aplicacoes.length || prazoEntregaHoras != null) infoProdutos[String(x.id)] = { estoque, aplicacoes, prazoEntregaHoras };
    }
    const extras: ExtrasDaVitrine = { lojas, produtos: infoProdutos, anuncios };
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
    guardado = { em: Date.now(), catalogo, extras };
    return { catalogo, extras };
  } catch (e) {
    console.error('[catalogo] falha ao ler o Supabase', e);
    return { catalogo: CATALOGO_EXEMPLO, extras: EXTRAS_VAZIOS, erro: 'Banco indisponível' };
  }
}
