'use client';

// A jornada da ordem de serviço: os links do cliente (orçamento, andamento, checklist, garantia e
// histórico), a prova da aprovação, o checklist de entrada, a garantia e os lembretes do que o
// cliente recusou.

import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { Documento, Id } from '@/lib/tipos';
import { PainelDoAndamento } from '../servico/Andamento';
import { PainelDaAprovacao } from '../servico/Comprovante';
import { aoAprovarServico, aoConcluirServico, aoRecusarServico } from '../servico/efeitos';
import { EscutaDasRespostas, EscutaDoInicio } from '../servico/Escuta';
import { GarantiasDoCarro, PainelDaGarantia } from '../servico/Garantia';
import { HistoricoParaVenda } from '../servico/Historico';
import { LembretesDoCarro } from '../servico/Lembretes';
import { ChecklistsDoCarro, PainelDoChecklist } from '../servico/PainelChecklist';
import { PainelDoLinkDoOrcamento } from '../servico/PainelOrcamento';
import type { Extensao } from './tipos';

function EscutaNaOrdem(_props: { doc: Documento }) {
  return <EscutaDasRespostas />;
}

function ServicoNoCarro({ veiculoId }: { veiculoId: Id }) {
  return (
    <>
      <EscutaDasRespostas />
      <LembretesDoCarro veiculoId={veiculoId} />
      <GarantiasDoCarro veiculoId={veiculoId} />
      <ChecklistsDoCarro veiculoId={veiculoId} />
      <HistoricoParaVenda veiculoId={veiculoId} />
    </>
  );
}

export const extensao: Extensao = {
  telas: [
    { href: '/oficina/garantias', rotulo: 'Garantias', descricao: 'Os certificados de garantia das ordens entregues', Icone: ShieldCheck },
    { href: '/oficina/checklist', rotulo: 'Checklists de entrada', descricao: 'Como cada carro chegou, com fotos e a assinatura do cliente', Icone: ClipboardCheck }
  ],
  paineisDaOrdem: [EscutaNaOrdem, PainelDoLinkDoOrcamento, PainelDaAprovacao, PainelDoAndamento, PainelDoChecklist, PainelDaGarantia],
  paineisDoCarro: [ServicoNoCarro],
  paineisDoInicio: [EscutaDoInicio],
  aoConcluir: aoConcluirServico,
  aoAprovar: aoAprovarServico,
  aoRecusar: aoRecusarServico
};
