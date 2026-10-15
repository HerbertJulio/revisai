// O que mudou na loja desde a última olhada: uma loja respondeu o alerta, o pedido foi confirmado,
// saiu para entrega, chegou ou o Pix foi confirmado. Vira aviso na tela (ou notificação do celular,
// quando o app está em segundo plano). Sem servidor aqui, para dar para testar.

import type { AlertaDaOficina } from './alertas-dados';
import type { PedidoAcompanhado } from './entregas-dados';

export interface Visto {
  respostas: Set<string>;
  /** 'codigo|fornecedor' -> situação e pagamento. */
  partes: Map<string, string>;
}

export function fotografar(alertas: AlertaDaOficina[], pedidos: PedidoAcompanhado[]): Visto {
  return {
    respostas: new Set(alertas.flatMap((a) => a.respostas.filter((r) => r.tipo !== 'recusa').map((r) => r.id))),
    partes: new Map(pedidos.flatMap((p) => p.partes.map((x) => [`${p.codigo}|${x.fornecedorId}`, `${x.status}|${x.pagamento}`] as const)))
  };
}

/** As frases do que mudou (nada na primeira olhada). */
export function novidades(antes: Visto | null, alertas: AlertaDaOficina[], pedidos: PedidoAcompanhado[]): string[] {
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
  return frases;
}
