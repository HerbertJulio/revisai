// Os pedidos de ajuda como a pessoa vê (só os dela) e o WhatsApp da equipe. Sem nada de servidor.

import { z } from 'zod';
import { normalizarTelefone } from '@/lib/formatos';

export type SituacaoDoPedido = 'novo' | 'respondido' | 'fechado';

export const SITUACOES_DO_PEDIDO: Record<SituacaoDoPedido, { nome: string; tom: 'oleo' | 'ok' | 'neutro' }> = {
  novo: { nome: 'Esperando a equipe', tom: 'oleo' },
  respondido: { nome: 'A equipe respondeu', tom: 'ok' },
  fechado: { nome: 'Encerrado', tom: 'neutro' }
};

export interface PedidoDeAjuda {
  id: string;
  assunto: string;
  situacao: SituacaoDoPedido;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MensagemDeAjuda {
  id: number;
  autor: 'cliente' | 'equipe';
  texto: string;
  criadoEm: string;
}

export const COLUNAS_PEDIDO_DE_AJUDA = 'id, assunto, situacao, criado_em, atualizado_em';
export const COLUNAS_MENSAGEM_DE_AJUDA = 'id, autor, texto, criado_em';

export function lerPedidosDeAjuda(d: unknown): PedidoDeAjuda[] {
  return (Array.isArray(d) ? d : []).flatMap((x) => {
    const r = z.object({ id: z.string(), assunto: z.string(), situacao: z.enum(['novo', 'respondido', 'fechado']), criado_em: z.string(), atualizado_em: z.string() }).safeParse(x);
    return r.success ? [{ id: r.data.id, assunto: r.data.assunto, situacao: r.data.situacao, criadoEm: r.data.criado_em, atualizadoEm: r.data.atualizado_em }] : [];
  });
}

export function lerMensagensDeAjuda(d: unknown): MensagemDeAjuda[] {
  return (Array.isArray(d) ? d : []).flatMap((x) => {
    const r = z.object({ id: z.union([z.number(), z.string()]).transform(Number), autor: z.enum(['cliente', 'equipe']), texto: z.string(), criado_em: z.string() }).safeParse(x);
    return r.success ? [{ id: r.data.id, autor: r.data.autor, texto: r.data.texto, criadoEm: r.data.criado_em }] : [];
  });
}

/** Assunto de 2 a 120 letras e mensagem de 1 a 4.000 (as mesmas regras do banco). */
export function conferirPedido(assunto: string, texto: string): string | null {
  if (assunto.trim().length < 2) return 'Escreva o assunto em poucas palavras.';
  if (assunto.trim().length > 120) return 'O assunto tem até 120 letras.';
  return conferirMensagem(texto);
}

export function conferirMensagem(texto: string): string | null {
  if (!texto.trim()) return 'Escreva a mensagem.';
  if (texto.trim().length > 4000) return 'A mensagem tem até 4.000 letras.';
  return null;
}

/** O link do WhatsApp da equipe (NEXT_PUBLIC_SUPORTE_WHATSAPP), ou null sem número configurado. */
export function whatsappDaEquipe(numero: string | null | undefined, onde: 'oficina' | 'loja' | null): string | null {
  const n = normalizarTelefone(numero ?? '');
  if (!n) return null;
  const texto = onde === 'loja' ? 'Olá! Preciso de ajuda com o painel da minha loja no Revisaí.' : onde === 'oficina' ? 'Olá! Preciso de ajuda com o Revisaí na minha oficina.' : 'Olá! Preciso de ajuda com o Revisaí.';
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** As mensagens das funções do suporte (limite de pedidos, sessão) em português. */
export function mensagemDoSuporte(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return 'Não deu para enviar agora. Tente de novo.';
  if (e.code === '28000') return 'Sua sessão terminou. Entre de novo.';
  if (e.code === 'P0001' && e.message) return `${e.message.replace(/\.$/, '')}. Tente mais tarde ou use o WhatsApp.`;
  if (e.code === '42501') return 'Este pedido de ajuda não é da sua conta.';
  return 'Não deu para enviar agora. Tente de novo.';
}
