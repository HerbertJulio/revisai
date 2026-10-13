'use client';

import { useCallback } from 'react';
import { itensDoVeiculo, type GrupoAviso } from '@/lib/avisos';
import { linkDoCartao, montarCartao } from '@/lib/cartao';
import { useDadosAvisos, useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { ResultadoContato } from '@/lib/tipos';
import { linkWhatsApp, mensagemCartao } from '@/lib/whatsapp';
import { useToast } from '@/components/Toasts';

const TEXTOS: Record<ResultadoContato, string> = {
  avisado: 'Marcado como avisado.',
  agendado: 'Agendado.',
  adiado: 'Adiado.',
  recusou: 'Anotado: o cliente não quer agora.'
};

/** Registra o contato de todos os itens do grupo, com "Desfazer" no aviso. */
export function useContatar() {
  const registrar = useOficina((s) => s.registrarContato);
  const desfazer = useOficina((s) => s.desfazerContatos);
  const toast = useToast();
  return useCallback(
    (grupo: GrupoAviso, resultado: ResultadoContato, extra?: { data?: string; observacao?: string }, texto?: string) => {
      const ids = registrar(
        grupo.itens.map((i) => ({ veiculoId: i.veiculoId, servico: i.servico, atendimentoId: i.atendimentoId })),
        resultado,
        extra
      );
      toast({ texto: texto ?? TEXTOS[resultado], acao: { rotulo: 'Desfazer', fazer: () => desfazer(ids) } });
      return ids;
    },
    [registrar, desfazer, toast]
  );
}

/** Monta o cartão de manutenção do carro e devolve o link e a mensagem para o WhatsApp. */
export function useCartaoDoCarro() {
  const dados = useDadosAvisos();
  const oficina = useOficina((s) => s.oficina);
  const hoje = useHoje();
  return useCallback(
    (veiculoId: string) => {
      const veiculo = dados.veiculos[veiculoId];
      if (!veiculo) return null;
      const cliente = dados.clientes[veiculo.clienteId];
      const { itens } = itensDoVeiculo(veiculo, dados, hoje);
      const cartao = montarCartao(oficina, cliente, veiculo, itens, hoje);
      const link = linkDoCartao(window.location.origin, cartao);
      const texto = mensagemCartao({ cliente: cliente?.nome ?? '', oficina: oficina.nome, veiculo, link });
      return { link, texto, whatsapp: cliente ? linkWhatsApp(cliente.telefone, texto) : null };
    },
    [dados, oficina, hoje]
  );
}
