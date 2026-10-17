// O que mudou na loja desde a última olhada: uma loja respondeu o alerta, o pedido foi confirmado,
// saiu para entrega, chegou ou o Pix foi confirmado, e a loja respondeu um pedido de garantia ou
// devolução. Vira aviso na tela (ou notificação do celular, quando o app está em segundo plano).
// Sem servidor aqui, para dar para testar.

import type { AlertaDaOficina } from './alertas-dados';
import type { PedidoAcompanhado } from './entregas-dados';
import type { Devolucao } from './loja/dados';

export interface Visto {
  respostas: Set<string>;
  /** 'codigo|fornecedor' -> situação e pagamento. */
  partes: Map<string, string>;
  /** id da devolução -> situação e quando a loja respondeu (sem a lista, null: nada a comparar). */
  devolucoes: Map<string, string> | null;
}

type DevolucaoVista = Pick<Devolucao, 'id' | 'situacao' | 'respondidaEm' | 'codigo' | 'loja'>;

export function fotografar(alertas: AlertaDaOficina[], pedidos: PedidoAcompanhado[], devolucoes?: DevolucaoVista[] | null): Visto {
  return {
    respostas: new Set(alertas.flatMap((a) => a.respostas.filter((r) => r.tipo !== 'recusa').map((r) => r.id))),
    partes: new Map(pedidos.flatMap((p) => p.partes.map((x) => [`${p.codigo}|${x.fornecedorId}`, `${x.status}|${x.pagamento}`] as const))),
    devolucoes: devolucoes ? new Map(devolucoes.map((d) => [d.id, `${d.situacao}|${d.respondidaEm ?? ''}`])) : null
  };
}

/** As frases do que mudou (nada na primeira olhada). */
export function novidades(antes: Visto | null, alertas: AlertaDaOficina[], pedidos: PedidoAcompanhado[], devolucoes?: DevolucaoVista[] | null): string[] {
  if (!antes) return [];
  const frases: string[] = [];
  for (const a of alertas)
    for (const r of a.respostas) if (r.tipo !== 'recusa' && !antes.respostas.has(r.id)) frases.push(`A ${r.fornecedor} respondeu o seu alerta de ${a.titulo}.`);
  for (const p of pedidos)
    for (const x of p.partes) {
      const anterior = antes.partes.get(`${p.codigo}|${x.fornecedorId}`);
      if (!anterior) continue;
      const [status, pagamento] = anterior.split('|');
      if (status !== x.status) {
        if (x.status === 'confirmado') frases.push(`A ${x.fornecedor} confirmou o pedido ${p.codigo}.`);
        else if (x.status === 'saiu_entrega') frases.push(`O pedido ${p.codigo} da ${x.fornecedor} saiu para entrega.`);
        else if (x.status === 'entregue') frases.push(`O pedido ${p.codigo} da ${x.fornecedor} foi entregue.`);
        else if (x.status === 'cancelado') frases.push(`A ${x.fornecedor} cancelou o pedido ${p.codigo}.`);
      }
      if (pagamento !== x.pagamento && x.pagamento === 'confirmado') frases.push(`A ${x.fornecedor} confirmou o pagamento do pedido ${p.codigo}.`);
    }
  if (antes.devolucoes && devolucoes)
    for (const d of devolucoes) {
      const anterior = antes.devolucoes.get(d.id);
      if (!anterior) continue;
      const [situacao, respondida] = anterior.split('|');
      const loja = d.loja.nome ?? 'loja';
      const compra = d.codigo ? ` da compra ${d.codigo}` : '';
      if (situacao !== d.situacao) {
        if (d.situacao === 'aceita') frases.push(`A ${loja} aceitou o seu pedido de garantia ou devolução${compra}.`);
        else if (d.situacao === 'recusada') frases.push(`A ${loja} recusou o seu pedido de garantia ou devolução${compra}.`);
        else if (d.situacao === 'resolvida') frases.push(`A ${loja} marcou como resolvido o pedido de garantia ou devolução${compra}.`);
      } else if (d.situacao === 'aberta' && (d.respondidaEm ?? '') !== respondida && d.respondidaEm) {
        frases.push(`A ${loja} respondeu o seu pedido de garantia ou devolução${compra}.`);
      }
    }
  return frases;
}
