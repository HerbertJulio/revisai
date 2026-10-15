'use client';

// Ações das ordens e orçamentos que precisam de mais de uma parte do app: concluir a ordem
// (registrar o serviço com os prazos certos) e montar o link do orçamento para o WhatsApp.

import { useCallback } from 'react';
import { estimarRodagem, kmEstimado, pontosDoVeiculo } from '@/lib/agenda';
import { itensDoAtendimento, mensagemDoOrcamento, totais, validoAte } from '@/lib/documentos';
import { servico as infoServico } from '@/lib/manutencao';
import { linkDoOrcamento, montarOrcamento } from '@/lib/orcamento-link';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { usePrazoDoServico } from './prazos';

/** Conclui a ordem: registra o serviço (os avisos saem dele) e tira as peças do estoque. */
export function useConcluirOrdem() {
  const prazo = usePrazoDoServico();
  return useCallback(
    (id: Id, hoje: string): { atendimentoId: Id | null; erro?: string } => {
      const s = useOficina.getState();
      const d = s.documentos[id];
      const veiculo = d?.veiculoId ? s.veiculos[d.veiculoId] : undefined;
      if (!d || !veiculo) return { atendimentoId: null, erro: 'Esta ordem não tem carro. Edite e escolha o carro.' };
      // sem o km da ordem, usa a estimativa pelo histórico; sem histórico, os prazos ficam só por tempo
      let km = d.km;
      let soTempo = false;
      if (km == null) {
        const pontos = pontosDoVeiculo(veiculo.id, Object.values(s.atendimentos), Object.values(s.leituras));
        if (pontos.length) km = kmEstimado(pontos, estimarRodagem(pontos, veiculo, s.preferencias.kmMesPadrao, hoje).kmDia, hoje);
        else {
          km = 0;
          soTempo = true;
        }
      }
      const itens = itensDoAtendimento(d, (servico, produto) => {
        const p = prazo(servico, produto, veiculo);
        return { km: p.km, meses: p.meses };
      }).map((i) => (soTempo ? { ...i, intervaloKm: null, intervaloMeses: i.intervaloMeses ?? infoServico(i.servico).normal.meses ?? 12 } : i));
      const atendimentoId = s.concluirOrdem(id, { itens, km, data: hoje });
      // o óleo usado não vira o "óleo do manual"; só anota a base (sintético, mineral) quando o manual já está cadastrado
      const oleo = itens.find((i) => i.servico === 'troca_oleo')?.produto?.especificacao;
      const atual = useOficina.getState().veiculos[veiculo.id];
      if (oleo?.base && atual?.oleo?.viscosidades?.length && atual.oleo.base !== oleo.base) s.salvarVeiculo({ ...atual, oleo: { ...atual.oleo, base: oleo.base } });
      return { atendimentoId };
    },
    [prazo]
  );
}

/** O link do orçamento e a mensagem pronta para o WhatsApp do cliente (marque como enviado antes: a validade conta dali). */
export function useLinkDoOrcamento() {
  return useCallback((id: Id): { link: string; texto: string; whatsapp: string | null } | null => {
    const s = useOficina.getState();
    const d = s.documentos[id];
    if (!d) return null;
    const veiculo = d.veiculoId ? s.veiculos[d.veiculoId] : undefined;
    const cliente = veiculo ? s.clientes[veiculo.clienteId] : undefined;
    const link = linkDoOrcamento(window.location.origin, montarOrcamento(d, s.oficina, cliente, veiculo));
    if (!link) return null;
    const texto = mensagemDoOrcamento({
      oficina: s.oficina.nome,
      cliente: cliente?.nome ?? '',
      carro: veiculo?.modelo ?? '',
      placa: veiculo?.placa ?? '',
      numero: d.numero,
      total: totais(d).total,
      validade: validoAte(d),
      link
    });
    return { link, texto, whatsapp: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null };
  }, []);
}
