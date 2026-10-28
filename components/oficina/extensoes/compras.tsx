'use client';

// Compras formais: pedido ao fornecedor que, ao ser recebido, dá entrada no estoque e abre a
// conta a pagar. Só para o dono e o gerente (envolve custo e dinheiro).

import { Truck } from 'lucide-react';
import type { Extensao } from './tipos';

export const extensao: Extensao = {
  telas: [{ href: '/oficina/compras', rotulo: 'Compras', descricao: 'Pedidos ao fornecedor, entrada no estoque e conta a pagar', Icone: Truck, soGestao: true }]
};
