// Contas e datas do painel da loja. Sem nada de servidor: serve às páginas e aos componentes.

import { z } from 'zod';
import type { SituacaoParte } from '../marketplace-dados';

export const FUSO = 'America/Sao_Paulo';

export type Tom = 'neutro' | 'oleo' | 'atraso' | 'ok' | 'caneta';

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });

/** O dia no horário de Brasília, como 'AAAA-MM-DD'. */
export function diaEmBrasilia(instante: number | string | Date): string {
  return formatoDia.format(new Date(instante));
}

export function hojeEmBrasilia(): string {
  return diaEmBrasilia(Date.now());
}

/** 'hoje às 21:17', 'ontem às 09:05', '12/10 às 14:30' ou '12/10/2025 às 14:30'. */
export function quandoFoi(iso: string, agora: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = diaEmBrasilia(d);
  const hoje = diaEmBrasilia(agora);
  const hora = formatoHora.format(d);
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === diaEmBrasilia(agora - 86_400_000)) return `ontem às ${hora}`;
  const [a, m, dd] = dia.split('-');
  return a === hoje.slice(0, 4) ? `${dd}/${m} às ${hora}` : `${dd}/${m}/${a} às ${hora}`;
}

/** Data de calendário 'AAAA-MM-DD' como '31/10' (ano atual) ou '31/10/2027'. */
export function dataCurta(dia: string, hoje: string): string {
  const [a, m, d] = dia.slice(0, 10).split('-');
  return a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

export function contarPor<T, K extends string>(lista: T[], chave: (item: T) => K): Partial<Record<K, number>> {
  const r: Partial<Record<K, number>> = {};
  for (const item of lista) {
    const k = chave(item);
    r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}

/** Primeiro dia do mês em Brasília, para somar as vendas do mês. */
export function inicioDoMes(hoje: string): string {
  return `${hoje.slice(0, 7)}-01`;
}

// ---------------------------------------------------------------- busca

/** Texto para busca sem acento e sem maiúscula. */
export function paraBusca(...partes: (string | null | undefined)[]): string {
  return partes
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Todas as palavras digitadas aparecem no texto do item. */
export function combina(texto: string, busca: string): boolean {
  const termos = paraBusca(busca).split(/\s+/).filter(Boolean);
  return termos.every((t) => texto.includes(t));
}

// ---------------------------------------------------------------- promoções

export type SituacaoPromocao = 'em_vigor' | 'programada' | 'encerrada' | 'pausada';

export const SITUACOES_PROMOCAO: { id: SituacaoPromocao; nome: string; plural: string; tom: Tom }[] = [
  { id: 'em_vigor', nome: 'Em vigor', plural: 'Em vigor', tom: 'ok' },
  { id: 'programada', nome: 'Programada', plural: 'Programadas', tom: 'caneta' },
  { id: 'encerrada', nome: 'Encerrada', plural: 'Encerradas', tom: 'neutro' },
  { id: 'pausada', nome: 'Pausada', plural: 'Pausadas', tom: 'atraso' }
];

export function situacaoPromocao(p: { ativo: boolean; inicio: string; fim: string }, hoje: string): SituacaoPromocao {
  if (!p.ativo) return 'pausada';
  if (p.fim < hoje) return 'encerrada';
  if (p.inicio > hoje) return 'programada';
  return 'em_vigor';
}

/** Desconto em % (arredondado), ou 0 se a promoção não baixar o preço. */
export function descontoPercentual(preco: number, promocional: number): number {
  if (!(preco > 0) || !(promocional < preco)) return 0;
  return Math.round((1 - promocional / preco) * 100);
}

// ---------------------------------------------------------------- situação dos pedidos

/**
 * As situações para onde a loja pode levar a parte do pedido (as mesmas regras do banco):
 * para a frente, ou cancelado com motivo; entregue e cancelado não voltam.
 */
export function proximasSituacoes(atual: SituacaoParte): SituacaoParte[] {
  switch (atual) {
    case 'novo':
      return ['em_contato', 'confirmado', 'cancelado'];
    case 'em_contato':
      return ['confirmado', 'cancelado'];
    case 'confirmado':
      return ['saiu_entrega', 'entregue', 'cancelado'];
    case 'saiu_entrega':
      return ['entregue', 'cancelado', 'confirmado'];
    default:
      return [];
  }
}

export function podeMudar(de: SituacaoParte, para: SituacaoParte): boolean {
  return proximasSituacoes(de).includes(para);
}

/** Os motivos que a loja escolhe ao cancelar (e o "outro", escrito). */
export const MOTIVOS_CANCELAMENTO = ['Sem o produto no estoque', 'A oficina desistiu', 'Não consegui falar com a oficina', 'Preço ou prazo não fecharam'] as const;

// ---------------------------------------------------------------- resposta ao alerta

const uuid = z.uuid();
const preco = z.number().positive().max(100_000);
const prazoEntrega = z.string().trim().max(60).optional().default('');
const mensagem = z.string().trim().max(300).optional().default('');

export const esquemaRespostaDaLoja = z.discriminatedUnion('tipo', [
  z.object({ alertaId: uuid, tipo: z.literal('recusa'), mensagem }),
  z.object({ alertaId: uuid, tipo: z.literal('aceita'), produtoId: z.number().int().positive(), prazoEntrega, mensagem }),
  z.object({
    alertaId: uuid,
    tipo: z.literal('contraproposta'),
    produtoId: z.number().int().positive(),
    preco,
    quantidadeMinima: z.number().int().min(1).max(999),
    prazoEntrega,
    mensagem
  })
]);

// ---------------------------------------------------------------- erros do banco

/** As mensagens das regras do banco para a loja (o resto, uma mensagem geral). */
export function mensagemDaLoja(e: { code?: string; message?: string } | null | undefined, padrao = 'Não deu para salvar agora. Tente de novo.'): string {
  if (!e) return padrao;
  switch (e.code) {
    case 'RV010':
      return 'Essa mudança de situação não vale. O pedido anda para a frente: novo, em contato, confirmado, saiu e entregue.';
    case 'RV011':
      return 'Diga o motivo do cancelamento.';
    case 'RV012':
      return 'Esse pagamento não vale para um pedido cancelado.';
    case 'RV004':
      return 'Este alerta já terminou.';
    case 'RV020':
      return 'Confirme o código do e-mail para trocar a chave Pix.';
    case '28000':
      return 'Sua sessão terminou. Entre de novo.';
    case '23505':
      return 'Isso já existe.';
    case '42501':
      return /permission denied|violates row-level/i.test(e.message ?? '') || !e.message ? 'Você não tem permissão para isso.' : `${e.message.replace(/\.$/, '')}.`;
    case 'P0001':
      return e.message ? `${e.message.replace(/\.$/, '')}.` : padrao;
    case '22023':
      return e.message ? `${e.message.replace(/\.$/, '')}.` : padrao;
    default:
      return padrao;
  }
}
