'use client';

// O hub de gestão (ERP) da oficina: estoque valorizado, resultado (DRE), fluxo de caixa e
// indicadores. Uma tela só, em abas, só para o dono e o gerente.

import { BarChart3 } from 'lucide-react';
import type { Extensao } from './tipos';

export const extensao: Extensao = {
  telas: [{ href: '/oficina/gestao', rotulo: 'Gestão', descricao: 'Estoque valorizado, resultado (DRE), fluxo de caixa e indicadores', Icone: BarChart3, soGestao: true }]
};
