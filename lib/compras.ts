// Compras formais: o pedido de compra ao fornecedor e o que o recebimento gera — a entrada no
// estoque (com o custo) e a conta a pagar. Funções puras, sem banco nem navegador, para testar;
// a gravação e o recebimento ficam no store (lib/store.ts) e as telas em components/oficina/compras.

import type { FormaPagamento, ItemPedidoCompra, NovoItemExtra, PedidoCompra } from './registros-oficina';
import type { Id } from './tipos';

export const SITUACOES_COMPRA: { id: PedidoCompra['situacao']; nome: string }[] = [
  { id: 'rascunho', nome: 'Rascunho' },
  { id: 'enviado', nome: 'Enviado' },
  { id: 'recebido', nome: 'Recebido' },
  { id: 'cancelado', nome: 'Cancelado' }
];

export function nomeDaSituacao(s: PedidoCompra['situacao']): string {
  return SITUACOES_COMPRA.find((x) => x.id === s)?.nome ?? s;
}

export function itemDeCompraVazio(): ItemPedidoCompra {
  return { id: '', descricao: '', estoqueId: null, quantidade: 1, custoUnitario: 0 };
}

/** Total da compra em reais, somando em centavos para não acumular erro de arredondamento. */
export function totalDaCompra(p: Pick<PedidoCompra, 'itens'>): number {
  const centavos = p.itens.reduce((s, it) => s + Math.round((it.quantidade || 0) * (it.custoUnitario || 0) * 100), 0);
  return centavos / 100;
}

/** Pode receber (dar entrada e abrir a conta a pagar)? */
export function podeReceber(p: PedidoCompra): boolean {
  return p.situacao !== 'recebido' && p.situacao !== 'cancelado' && p.itens.some((it) => it.quantidade > 0);
}

/** As entradas de estoque que o recebimento gera: só os itens ligados a um item do estoque. */
export function entradasDaCompra(p: PedidoCompra): { itemId: Id; quantidade: number; custoUnitario: number }[] {
  return p.itens
    .filter((it) => it.estoqueId && it.quantidade > 0)
    .map((it) => ({ itemId: it.estoqueId as Id, quantidade: it.quantidade, custoUnitario: it.custoUnitario }));
}

/** A conta a pagar ao fornecedor que nasce do recebimento da compra. */
export function contaAPagarDaCompra(p: PedidoCompra, opcoes: { vencimento: string; forma?: FormaPagamento | null; compraId: Id }): NovoItemExtra<'lancamentos'> {
  return {
    tipo: 'pagar',
    descricao: `Compra — ${p.fornecedor}`.trim(),
    valor: totalDaCompra(p),
    vencimento: opcoes.vencimento,
    pagoEm: null,
    forma: opcoes.forma ?? null,
    categoria: 'fornecedor',
    favorecido: p.fornecedor,
    compraId: opcoes.compraId,
    observacao: p.observacao || undefined
  };
}

/** Conferência antes de gravar (usada pela tela). Devolve o problema, ou null quando está ok. */
export function problemaDaCompra(p: { fornecedor: string; itens: ItemPedidoCompra[] }): string | null {
  if (!p.fornecedor.trim()) return 'Diga de quem é a compra (o fornecedor).';
  const itens = p.itens.filter((it) => it.descricao.trim() || it.quantidade > 0 || it.custoUnitario > 0);
  if (!itens.length) return 'Adicione pelo menos um item.';
  for (const it of itens) {
    if (!it.descricao.trim()) return 'Cada item precisa de uma descrição.';
    if (!(it.quantidade > 0)) return 'A quantidade de cada item precisa ser maior que zero.';
    if (it.custoUnitario < 0) return 'O custo não pode ser negativo.';
  }
  return null;
}

/** Só os itens que valem (com descrição e quantidade), já numerados, para gravar. */
export function itensLimpos(itens: ItemPedidoCompra[], novoId: () => Id): ItemPedidoCompra[] {
  return itens
    .filter((it) => it.descricao.trim() && it.quantidade > 0)
    .map((it) => ({
      id: it.id || novoId(),
      descricao: it.descricao.trim(),
      estoqueId: it.estoqueId || null,
      quantidade: it.quantidade,
      custoUnitario: Math.max(0, Math.round((it.custoUnitario || 0) * 100) / 100)
    }));
}
