'use client';

// O que acontece na jornada da ordem quando o orçamento é aprovado ou recusado e quando a ordem
// é concluída: o que o cliente recusou vira lembrete, o checklist segue para a ordem, a garantia
// sai da ordem concluída e, com a conta, os links do cliente são publicados.

import { indiceDaEtapa, registrarEtapa } from '@/lib/andamento';
import { hojeISO } from '@/lib/datas';
import { garantiaDaOrdem } from '@/lib/garantia';
import { lembretesDoOrcamento } from '@/lib/lembretes';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { publicarDepoisDeConcluir } from './publicar';

/** Cria os lembretes do que o cliente recusou (sem repetir os que já existem para o orçamento). */
function lembrarRecusados(orcamentoId: Id, recusadas: Id[] | 'todas') {
  const s = useOficina.getState();
  const orc = s.documentos[orcamentoId];
  if (!orc) return;
  const veiculo = orc.veiculoId ? s.veiculos[orc.veiculoId] : undefined;
  const existentes = Object.values(s.lembretes).filter((l) => l.documentoId === orcamentoId && l.motivo === 'recusado');
  for (const novo of lembretesDoOrcamento(orc, recusadas, { hoje: hojeISO(), clienteId: veiculo?.clienteId ?? null })) {
    const igual = existentes.find((l) => l.descricao === novo.descricao);
    if (igual && igual.situacao !== 'descartado') continue;
    s.salvarRegistro('lembretes', igual ? { ...igual, ...novo } : novo);
  }
}

export function aoAprovarServico(orcamentoId: Id, ordemId: Id, recusadas: Id[]) {
  const s = useOficina.getState();
  const orc = s.documentos[orcamentoId];
  if (!orc) return;
  // aprovado depois de recusado: o que agora foi aprovado sai dos lembretes
  const aindaRecusado = new Set(lembretesDoOrcamento(orc, recusadas, { hoje: hojeISO() }).map((n) => n.descricao));
  for (const l of Object.values(s.lembretes)) {
    if (l.documentoId === orcamentoId && l.motivo === 'recusado' && l.situacao === 'aberto' && !aindaRecusado.has(l.descricao)) {
      useOficina.getState().salvarRegistro('lembretes', { ...l, situacao: 'descartado' });
    }
  }
  if (recusadas.length) lembrarRecusados(orcamentoId, recusadas);
  // o checklist de entrada feito no orçamento segue na ordem
  const ordem = useOficina.getState().documentos[ordemId];
  if (ordem && orc.checklistId && !ordem.checklistId) useOficina.getState().salvarDocumento({ ...ordem, checklistId: orc.checklistId });
}

export function aoRecusarServico(orcamentoId: Id) {
  lembrarRecusados(orcamentoId, 'todas');
}

export function aoConcluirServico(documentoId: Id) {
  const s = useOficina.getState();
  const doc = s.documentos[documentoId];
  if (!doc || doc.tipo !== 'ordem' || doc.situacao !== 'concluida') return;
  const veiculo = doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined;
  let garantiaId = doc.garantiaId && s.garantias[doc.garantiaId] ? doc.garantiaId : null;
  if (!garantiaId) {
    const g = garantiaDaOrdem(doc, { preferencias: s.preferencias, estoque: s.estoque, veiculo, hoje: hojeISO() });
    if (g) garantiaId = s.salvarRegistro('garantias', g);
  }
  const atual = useOficina.getState().documentos[documentoId];
  if (!atual) return;
  // concluída é "pronto" para o cliente (a entrega é o passo seguinte)
  const mudanca = indiceDaEtapa(atual.etapa) < indiceDaEtapa('pronto') ? registrarEtapa(atual, 'pronto', new Date().toISOString()) : null;
  if (garantiaId !== (atual.garantiaId ?? null) || mudanca) useOficina.getState().salvarDocumento({ ...atual, garantiaId, ...(mudanca ?? {}) });
  void publicarDepoisDeConcluir(documentoId);
}
