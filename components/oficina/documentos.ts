'use client';

// Ações das ordens e orçamentos que precisam de mais de uma parte do app: concluir a ordem
// (registrar o serviço com os prazos certos) e montar o link do orçamento para o WhatsApp
// (com a conta, o link do servidor, onde o cliente responde; sem conta, os dados no endereço).

import { useCallback } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { estimarRodagem, kmEstimado, pontosDoVeiculo } from '@/lib/agenda';
import { itensDoAtendimento, mensagemDoOrcamento, totais, validoAte } from '@/lib/documentos';
import { servico as infoServico } from '@/lib/manutencao';
import { linkDoOrcamento, montarOrcamento } from '@/lib/orcamento-link';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { aoConcluirOrdem } from './extensoes';
import { usePrazoDoServico } from './prazos';
import { useContextoDaConta } from './servico/conta';
import { publicarOrcamento } from './servico/publicar';

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
      // concluída mesmo sem serviço de manutenção (um reparo avulso também tem garantia)
      if (useOficina.getState().documentos[id]?.situacao === 'concluida') aoConcluirOrdem(id);
      return { atendimentoId };
    },
    [prazo]
  );
}

export interface LinkDoOrcamento {
  link: string;
  texto: string;
  whatsapp: string | null;
  /** O link é do servidor (o cliente responde por ele). */
  servidor: boolean;
}

/** A mensagem do orçamento com o link escolhido. */
function mensagemComLink(id: Id, link: string, servidor: boolean): LinkDoOrcamento | null {
  const s = useOficina.getState();
  const d = s.documentos[id];
  if (!d) return null;
  const veiculo = d.veiculoId ? s.veiculos[d.veiculoId] : undefined;
  const cliente = veiculo ? s.clientes[veiculo.clienteId] : undefined;
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
  return { link, texto, whatsapp: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null, servidor };
}

/** O link com os dados no endereço (sem conta, e os links já mandados assim continuam abrindo). */
function linkCodificado(id: Id): LinkDoOrcamento | null {
  const s = useOficina.getState();
  const d = s.documentos[id];
  if (!d) return null;
  const veiculo = d.veiculoId ? s.veiculos[d.veiculoId] : undefined;
  const cliente = veiculo ? s.clientes[veiculo.clienteId] : undefined;
  const link = linkDoOrcamento(window.location.origin, montarOrcamento(d, s.oficina, cliente, veiculo));
  return link ? mensagemComLink(id, link, false) : null;
}

/**
 * O link do orçamento e a mensagem pronta para o WhatsApp do cliente (marque como enviado antes:
 * a validade conta dali). Com a conta e o link do servidor já publicado, é ele; senão, o link com
 * os dados no endereço. Para publicar (ou atualizar) o do servidor antes de mandar, use useMandarOrcamento.
 */
export function useLinkDoOrcamento() {
  const { oficina } = useConta();
  return useCallback(
    (id: Id): LinkDoOrcamento | null => {
      const url = useOficina.getState().documentos[id]?.links?.orcamento?.url;
      if (oficina && url) return mensagemComLink(id, url, true);
      return linkCodificado(id);
    },
    [oficina]
  );
}

/**
 * Para o botão "Mandar": com a conta, publica (ou atualiza) o link do servidor, onde o cliente
 * aprova, escolhe os itens ou recusa, e a resposta volta sozinha; sem conta, o link de sempre.
 */
export function useMandarOrcamento() {
  const ctx = useContextoDaConta();
  return useCallback(
    async (id: Id): Promise<({ ok: true } & LinkDoOrcamento) | { ok: false; erro: string }> => {
      if (!ctx) {
        const l = linkCodificado(id);
        return l ? { ok: true, ...l } : { ok: false, erro: 'Confira os itens do orçamento: o link não ficou pronto.' };
      }
      const r = await publicarOrcamento(id, ctx);
      if (!r.ok) return r;
      const l = r.link.url ? mensagemComLink(id, r.link.url, true) : null;
      return l ? { ok: true, ...l } : { ok: false, erro: 'O link não ficou pronto. Tente de novo.' };
    },
    [ctx]
  );
}
