'use client';

// O dinheiro da oficina: o financeiro (contas, caixa do dia, fiado e Pix do balcão), os
// relatórios e, no detalhe da OS, o pagamento e quem fez. Tudo só para o dono e o gerente.

import { ChartColumn, Wallet } from 'lucide-react';
import { AvisoDoFinanceiro } from '../financeiro/AvisoDoInicio';
import { PainelDaOrdem } from '../financeiro/PainelDaOrdem';
import type { Extensao } from './tipos';

export const extensao: Extensao = {
  telas: [
    { href: '/oficina/financeiro', rotulo: 'Financeiro', descricao: 'Contas a receber e a pagar, caixa do dia, fiado e Pix', Icone: Wallet, soGestao: true },
    { href: '/oficina/relatorios', rotulo: 'Relatórios', descricao: 'Faturamento, ticket médio, margem, comissão e a média da região', Icone: ChartColumn, soGestao: true }
  ],
  paineisDaOrdem: [PainelDaOrdem],
  paineisDoInicio: [AvisoDoFinanceiro]
};
