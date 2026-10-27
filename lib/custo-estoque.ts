// Custo e valor do estoque: o custo médio ponderado (para quando a entrada passar a usá-lo), a
// posição de estoque valorizada (quanto de dinheiro está parado em peças) e o consumo/CMV do
// período. Funções puras, sem banco nem navegador, para testar.

import { diaEmBrasilia } from './datas';
import { nomeCategoria } from './catalogo';
import type { Categoria, Id, ItemEstoque, MovimentoEstoque } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

function nomeDoItem(i: Pick<ItemEstoque, 'marca' | 'nome'>): string {
  return i.marca && !i.nome.toLowerCase().startsWith(i.marca.toLowerCase()) ? `${i.marca} ${i.nome}` : i.nome;
}

/**
 * Custo médio ponderado depois de uma entrada: mistura o que já tinha com o que entrou. Quando não
 * havia saldo ou custo, vale o custo que entrou. É o custo correto de um ERP; a entrada do estoque
 * passa a usá-lo quando o núcleo (lib/estoque e lib/sincronia-dados) for ligado a esta conta.
 */
export function custoMedio(qtdAtual: number, custoAtual: number | null, qtdEntra: number, custoEntra: number): number {
  const base = Math.max(0, qtdAtual);
  const total = base + qtdEntra;
  if (base <= 0 || custoAtual == null || custoAtual <= 0 || total <= 0) return r2(custoEntra);
  return r2((base * custoAtual + qtdEntra * custoEntra) / total);
}

export interface ItemValorizado {
  id: Id;
  nome: string;
  categoria: Categoria;
  quantidade: number;
  custo: number;
  valor: number;
}

export interface PosicaoValorizada {
  total: number;
  itens: ItemValorizado[];
  porCategoria: { categoria: Categoria; nome: string; valor: number }[];
  /** Itens sem custo cadastrado: não entram no valor, mas é bom saber quantos são. */
  semCusto: number;
}

/** Quanto de dinheiro está parado no estoque, por item e por categoria. */
export function posicaoValorizada(estoque: ItemEstoque[]): PosicaoValorizada {
  const comValor = estoque.filter((i) => i.quantidade > 0 && i.custo != null && i.custo > 0);
  const itens: ItemValorizado[] = comValor
    .map((i) => ({ id: i.id, nome: nomeDoItem(i), categoria: i.categoria, quantidade: i.quantidade, custo: i.custo as number, valor: r2(i.quantidade * (i.custo as number)) }))
    .sort((a, b) => b.valor - a.valor);
  const porCat = new Map<Categoria, number>();
  for (const i of itens) porCat.set(i.categoria, r2((porCat.get(i.categoria) ?? 0) + i.valor));
  const porCategoria = [...porCat.entries()].map(([categoria, valor]) => ({ categoria, nome: nomeCategoria(categoria), valor })).sort((a, b) => b.valor - a.valor);
  const total = r2(itens.reduce((s, i) => s + i.valor, 0));
  const semCusto = estoque.filter((i) => i.quantidade > 0 && !(i.custo != null && i.custo > 0)).length;
  return { total, itens, porCategoria, semCusto };
}

export interface ConsumoDoPeriodo {
  total: number;
  itens: { id: Id; nome: string; quantidade: number; valor: number }[];
}

/**
 * Consumo de peças no período (o CMV): as saídas de estoque entre `de` e `ate`, valorizadas pelo
 * custo atual do item. É uma aproximação (o custo exato de cada saída não é guardado); quando a
 * entrada passar a usar o custo médio, fica fiel.
 */
export function consumoValorizado(
  movimentos: MovimentoEstoque[],
  estoque: Record<Id, ItemEstoque>,
  periodo: { de: string; ate: string }
): ConsumoDoPeriodo {
  const porItem = new Map<Id, number>();
  for (const m of movimentos) {
    if (m.tipo !== 'saida') continue;
    const dia = diaEmBrasilia(m.quando);
    if (dia < periodo.de || dia > periodo.ate) continue;
    porItem.set(m.itemId, r2((porItem.get(m.itemId) ?? 0) + Math.abs(m.quantidade)));
  }
  const itens = [...porItem.entries()]
    .map(([id, quantidade]) => {
      const item = estoque[id];
      const custo = item?.custo ?? 0;
      return { id, nome: item ? nomeDoItem(item) : 'Item removido', quantidade, valor: r2(quantidade * custo) };
    })
    .filter((x) => x.quantidade > 0)
    .sort((a, b) => b.valor - a.valor);
  const total = r2(itens.reduce((s, i) => s + i.valor, 0));
  return { total, itens };
}
