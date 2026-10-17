'use client';

// Cobrar o cliente e as notas da oficina: o Pix pelo WhatsApp com a página de pagamento, o clube
// de manutenção (planos com mensalidade por Pix) e a NFS-e e a NF-e pelo emissor de notas. Tudo só
// para o dono e o gerente: o mecânico não vê dinheiro.

import { BadgePercent, Receipt } from 'lucide-react';
import { aoConcluirClube } from '../clube/efeitos';
import { PainelClubeDaOrdem } from '../clube/PainelClubeDaOrdem';
import { PainelDePagamentosDoInicio } from '../cobranca-cliente/Avisos';
import { PainelCobranca } from '../cobranca-cliente/PainelCobranca';
import { PainelNotas } from '../fiscal/PainelNotas';
import { SincroniaDasNotas } from '../fiscal/SincroniaDasNotas';
import type { Extensao } from './tipos';

export const extensao: Extensao = {
  telas: [
    { href: '/oficina/clube', rotulo: 'Clube de manutenção', descricao: 'Planos com mensalidade por Pix, membros e benefícios', Icone: BadgePercent, soGestao: true },
    { href: '/oficina/fiscal', rotulo: 'Notas fiscais', descricao: 'NFS-e da mão de obra e NF-e das peças, e o certificado', Icone: Receipt, soGestao: true }
  ],
  paineisDaOrdem: [PainelCobranca, PainelClubeDaOrdem, PainelNotas],
  paineisDoInicio: [PainelDePagamentosDoInicio, SincroniaDasNotas],
  aoConcluir: aoConcluirClube
};
