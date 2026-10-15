// Estoque da oficina: o que tem, o que entra e sai, e o que vai faltar para os carros que vêm aí.
// O óleo é contado em litros (comprado em frasco, galão ou balde); o resto, em unidades.

import { litrosPorUnidade, nomeCategoria, type Catalogo, type Produto } from './catalogo';
import { validoAte } from './documentos';
import { servico as infoServico } from './manutencao';
import { oleoAtende } from './oleos';
import { melhorParaVarios, recomendarOleo, type LinhaDemanda, type Recomendacao } from './recomendacao';
import type { Categoria, Documento, EspecOleo, Id, ItemEstoque, MovimentoEstoque, ServicoId, UnidadeEstoque } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function unidadeDaCategoria(c: Categoria): UnidadeEstoque {
  return c === 'oleo_motor' ? 'L' : 'un';
}

/** Quantas unidades de estoque vêm em uma embalagem do produto (litros no óleo). */
export function fatorDoProduto(p: Pick<Produto, 'categoria' | 'unidade' | 'conteudo'>): number {
  return unidadeDaCategoria(p.categoria) === 'L' ? (litrosPorUnidade(p) ?? 1) : 1;
}

/** O item de estoque que nasce de um produto da loja (com a foto e a ficha técnica dele). */
export function itemDoProduto(p: Produto): Omit<ItemEstoque, 'id' | 'criadoEm' | 'atualizadoEm' | 'quantidade' | 'minimo'> {
  const fator = fatorDoProduto(p);
  return {
    nome: p.nome,
    marca: p.marca ?? undefined,
    categoria: p.categoria,
    especificacao: p.especificacao,
    unidade: unidadeDaCategoria(p.categoria),
    custo: r2(p.preco / fator),
    preco: null,
    produtoLojaId: p.id,
    referenciaId: p.referenciaId ?? undefined,
    imagemUrl: p.imagemUrl
  };
}

export type SituacaoEstoque = 'zerado' | 'baixo' | 'ok';

export function situacaoDoItem(i: Pick<ItemEstoque, 'quantidade' | 'minimo'>): SituacaoEstoque {
  if (i.quantidade <= 0) return 'zerado';
  if (i.minimo > 0 && i.quantidade <= i.minimo) return 'baixo';
  return 'ok';
}

/** "12 un", "1 un", "3,5 L". */
export function textoQuantidade(q: number, unidade: UnidadeEstoque): string {
  const n = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(q);
  return unidade === 'L' ? `${n} L` : `${n} un`;
}

/** O item depois do movimento: a quantidade nunca fica negativa e a entrada com custo atualiza o custo. */
export function aplicarMovimento(item: ItemEstoque, m: Pick<MovimentoEstoque, 'quantidade' | 'tipo' | 'custoUnitario' | 'quando'>): ItemEstoque {
  const quantidade = Math.max(0, r2(item.quantidade + m.quantidade));
  const custo = m.tipo === 'entrada' && m.custoUnitario != null && m.custoUnitario > 0 ? r2(m.custoUnitario) : item.custo;
  return { ...item, quantidade, custo, atualizadoEm: m.quando };
}

/** Preço sugerido para o cliente: o preço do item ou o custo com a margem da oficina. */
export function precoSugerido(i: Pick<ItemEstoque, 'preco' | 'custo'>, margem: number): number | null {
  if (i.preco != null && i.preco > 0) return i.preco;
  if (i.custo != null && i.custo > 0) return r2(i.custo * (1 + Math.max(0, margem) / 100));
  return null;
}

/** Quanto de cada item as peças de uma ordem tiram do estoque. */
export function baixasDoDocumento(d: Pick<Documento, 'linhas'>): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const l of d.linhas) {
    if (!l.estoqueId || l.recusada || l.quantidade <= 0) continue;
    m.set(l.estoqueId, r2((m.get(l.estoqueId) ?? 0) + l.quantidade));
  }
  return m;
}

/** Quanto de um serviço um carro costuma usar, em unidades de estoque. */
export function quantidadePorCarro(s: ServicoId): number {
  if (s === 'velas' || s === 'pneus') return 4;
  return 1;
}

// ---------------------------------------------------------------- previsão de falta

export interface LinhaPrevisao {
  chave: string;
  titulo: string;
  servico: ServicoId;
  categoria: Categoria;
  unidade: UnidadeEstoque;
  /** Quanto vai usar no período (carros que vencem e ordens em aberto). */
  precisa: number;
  tem: number;
  faltam: number;
  carros: number;
  /** Ordens abertas e orçamentos esperando resposta que entram na conta. */
  ordens: number;
  /** Os itens do estoque que entram na conta. */
  itens: { id: Id; nome: string; quantidade: number }[];
  exigido?: EspecOleo;
  /** Óleo de carros sem o óleo do manual cadastrado: não dá para dizer qual comprar. */
  semEspecificacao?: boolean;
}

function nomeDoItem(i: Pick<ItemEstoque, 'marca' | 'nome'>): string {
  return i.marca && !i.nome.toLowerCase().startsWith(i.marca.toLowerCase()) ? `${i.marca} ${i.nome}` : i.nome;
}

function atendeOleo(i: ItemEstoque, exigido: EspecOleo | undefined): boolean {
  return !!exigido && i.categoria === 'oleo_motor' && oleoAtende(i.especificacao ?? {}, exigido).atende;
}

/**
 * Cruza o que os carros vão precisar (as linhas da demanda dos próximos dias) e as ordens em aberto
 * com o estoque: quanto precisa, quanto tem e quanto falta. Cada item do estoque entra numa linha
 * só (o óleo vai para a primeira linha cuja exigência ele atende).
 */
export function preverEstoque(demanda: LinhaDemanda[], documentos: Documento[], estoque: ItemEstoque[], hoje: string): LinhaPrevisao[] {
  const linhas = new Map<string, LinhaPrevisao>();
  const disponivel = new Map(estoque.map((i) => [i.id, i]));
  const usados = new Set<Id>();

  for (const l of demanda) {
    const categoria = infoServico(l.servico).categoria;
    if (!categoria) continue;
    const unidade = unidadeDaCategoria(categoria);
    const precisa = l.servico === 'troca_oleo' ? l.volume : l.carros * quantidadePorCarro(l.servico);
    linhas.set(l.chave, {
      chave: l.chave,
      titulo: l.titulo,
      servico: l.servico,
      categoria,
      unidade,
      precisa: r2(precisa),
      tem: 0,
      faltam: 0,
      carros: l.carros,
      ordens: 0,
      itens: [],
      exigido: l.exigido,
      semEspecificacao: l.semEspecificacao
    });
  }

  // ordens abertas, orçamentos aprovados que ainda não viraram ordem e os que esperam resposta
  const abertos = documentos.filter(
    (d) => (d.tipo === 'ordem' && d.situacao === 'aberta') || (d.tipo === 'orcamento' && (d.situacao === 'enviado' || (d.situacao === 'aprovado' && !d.ordemId)) && validoAte(d) >= hoje)
  );
  for (const d of abertos) {
    const contou = new Set<string>();
    for (const linha of d.linhas) {
      if (linha.recusada || linha.tipo !== 'peca' || linha.quantidade <= 0) continue;
      const item = linha.estoqueId ? disponivel.get(linha.estoqueId) : undefined;
      const categoria = item?.categoria ?? linha.produto?.categoria ?? (linha.servico ? infoServico(linha.servico).categoria : null);
      if (!categoria) continue;
      let alvo: LinhaPrevisao | undefined;
      if (categoria === 'oleo_motor') {
        alvo = [...linhas.values()].find((x) => x.categoria === 'oleo_motor' && item && atendeOleo(item, x.exigido));
        if (!alvo && item) {
          const chave = `item:${item.id}`;
          alvo = linhas.get(chave) ?? {
            chave,
            titulo: nomeDoItem(item),
            servico: 'troca_oleo',
            categoria,
            unidade: item.unidade,
            precisa: 0,
            tem: 0,
            faltam: 0,
            carros: 0,
            ordens: 0,
            itens: [],
            exigido: item.especificacao?.viscosidade ? { viscosidades: [item.especificacao.viscosidade], base: item.especificacao.base } : undefined
          };
          linhas.set(chave, alvo);
        }
      } else {
        alvo = [...linhas.values()].find((x) => x.categoria === categoria);
        if (!alvo) {
          const s = linha.servico ?? 'revisao';
          alvo = { chave: `cat:${categoria}`, titulo: nomeCategoria(categoria), servico: s, categoria, unidade: unidadeDaCategoria(categoria), precisa: 0, tem: 0, faltam: 0, carros: 0, ordens: 0, itens: [] };
          linhas.set(alvo.chave, alvo);
        }
      }
      if (!alvo) continue;
      alvo.precisa = r2(alvo.precisa + linha.quantidade);
      if (!contou.has(alvo.chave)) {
        alvo.ordens++;
        contou.add(alvo.chave);
      }
    }
  }

  // o estoque entra na primeira linha que ele atende
  const ordenadas = [...linhas.values()].sort((a, b) => b.precisa - a.precisa);
  for (const linha of ordenadas) {
    for (const item of estoque) {
      if (usados.has(item.id) || item.quantidade <= 0) continue;
      const serve = linha.categoria === 'oleo_motor' ? atendeOleo(item, linha.exigido) && item.unidade === 'L' : item.categoria === linha.categoria;
      if (!serve) continue;
      usados.add(item.id);
      linha.tem = r2(linha.tem + item.quantidade);
      linha.itens.push({ id: item.id, nome: nomeDoItem(item), quantidade: item.quantidade });
    }
    linha.faltam = linha.semEspecificacao ? 0 : r2(Math.max(0, linha.precisa - linha.tem));
  }

  return ordenadas.filter((l) => l.precisa > 0).sort((a, b) => Number(b.faltam > 0) - Number(a.faltam > 0) || b.precisa - a.precisa || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/**
 * O que comprar para cobrir a falta: o produto da loja ligado ao item do estoque (se houver),
 * senão o que sai mais barato para a quantidade. A quantidade é em embalagens.
 */
export function compraSugerida(linha: LinhaPrevisao, estoque: Record<Id, ItemEstoque>, catalogo: Catalogo, hoje: string): Recomendacao | null {
  if (linha.faltam <= 0) return null;
  if (linha.categoria === 'oleo_motor') {
    if (!linha.exigido) return null;
    return recomendarOleo(linha.exigido, linha.faltam, catalogo, hoje)[0] ?? null;
  }
  const ligados = linha.itens.map((x) => estoque[x.id]?.produtoLojaId).filter((x): x is number => x != null);
  const ativos = new Set(catalogo.fornecedores.map((f) => f.id));
  const produto = catalogo.produtos.find((p) => ligados.includes(p.id) && ativos.has(p.fornecedorId));
  if (produto) {
    const quantidade = Math.max(1, Math.ceil(linha.faltam / fatorDoProduto(produto) - 1e-9));
    const promocoes = catalogo.promocoes.filter((x) => x.produtoId === produto.id && x.inicio <= hoje && x.fim >= hoje);
    const promocao = promocoes.filter((x) => quantidade >= x.quantidadeMinima && x.precoPromocional < produto.preco).sort((a, b) => a.precoPromocional - b.precoPromocional)[0] ?? null;
    const oferta = promocoes.filter((x) => x.precoPromocional < produto.preco).sort((a, b) => a.precoPromocional - b.precoPromocional)[0] ?? null;
    const preco = promocao ? promocao.precoPromocional : produto.preco;
    return { produto, quantidade, precoUnitario: preco, total: r2(preco * quantidade), promocao, oferta, motivos: ['O mesmo do seu estoque'] };
  }
  const r = melhorParaVarios(linha.servico, Math.max(1, Math.ceil(linha.faltam / quantidadePorCarro(linha.servico))), catalogo, hoje);
  return r;
}

/** Os itens abaixo do mínimo (ou zerados), do mais urgente para o menos. */
export function itensParaRepor(estoque: ItemEstoque[]): ItemEstoque[] {
  const peso = { zerado: 0, baixo: 1, ok: 2 } as const;
  return estoque
    .filter((i) => situacaoDoItem(i) !== 'ok' && (i.minimo > 0 || i.quantidade <= 0))
    .sort((a, b) => peso[situacaoDoItem(a)] - peso[situacaoDoItem(b)] || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Quantas embalagens do produto da loja levam o item de volta ao mínimo (com folga de um mínimo). */
export function reposicao(item: Pick<ItemEstoque, 'quantidade' | 'minimo'>, produto: Pick<Produto, 'categoria' | 'unidade' | 'conteudo'>): number {
  const alvo = Math.max(item.minimo * 2, item.minimo + 1, 1);
  const falta = Math.max(0, alvo - item.quantidade);
  return Math.max(1, Math.ceil(falta / fatorDoProduto(produto) - 1e-9));
}

/**
 * A falta mais urgente em uma frase, para o resumo do dia: "Vai faltar Óleo 5W-30 nos próximos 30 dias:
 * tem 25 L e precisa de mais 5 L." O óleo vem primeiro; depois a maior falta.
 */
export function faltaMaisUrgente(linhas: LinhaPrevisao[]): LinhaPrevisao | null {
  const faltando = linhas.filter((l) => l.faltam > 0 && !l.semEspecificacao && l.tem > 0);
  if (!faltando.length) return null;
  return [...faltando].sort((a, b) => Number(b.categoria === 'oleo_motor') - Number(a.categoria === 'oleo_motor') || b.faltam / b.precisa - a.faltam / a.precisa)[0];
}

export function fraseDaFalta(l: Pick<LinhaPrevisao, 'titulo' | 'tem' | 'faltam' | 'unidade'>): string {
  return `Vai faltar ${l.titulo} nos próximos 30 dias: você tem ${textoQuantidade(l.tem, l.unidade)} e vai precisar de mais ${textoQuantidade(l.faltam, l.unidade)}.`;
}
