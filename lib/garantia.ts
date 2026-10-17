// A garantia do serviço entregue. Quando a ordem é concluída, cada serviço e cada peça da ordem
// ganham o prazo padrão da oficina (o Código de Defesa do Consumidor, art. 26, dá 90 dias para
// serviço e produto duráveis). O cliente consulta pela placa e pelo código do certificado.

import { z } from 'zod';
import { diasEntre, somarDias } from './datas';
import { primeiroNome } from './formatos';
import type { Garantia } from './registros-oficina';
import type { Cliente, Documento, ItemEstoque, Preferencias, Veiculo } from './tipos';

export const DIAS_PADRAO_DA_GARANTIA = 90;

export const CONDICOES_PADRAO =
  'A garantia cobre defeito da peça e do serviço feitos nesta ordem. Não cobre mau uso, batida, desgaste natural, peça trazida pelo cliente nem serviço de outra oficina nas mesmas peças. Para usar a garantia, traga o carro com este certificado (ou a placa e o código).';

export type ItemDaGarantia = Garantia['itens'][number];

export function prazosDaOficina(prefs: Pick<Preferencias, 'garantiaPadrao'>): { servicosDias: number; pecasDias: number; condicoes: string } {
  const g = prefs.garantiaPadrao;
  const dias = (n: number | undefined) => (n != null && Number.isFinite(n) && n > 0 ? Math.min(3650, Math.round(n)) : DIAS_PADRAO_DA_GARANTIA);
  return { servicosDias: dias(g?.servicosDias), pecasDias: dias(g?.pecasDias), condicoes: g?.condicoes?.trim() || CONDICOES_PADRAO };
}

/**
 * A garantia da ordem concluída: um item por serviço e por peça aprovados (o resto, como a
 * vistoria abatida, fica de fora). Sem nenhum serviço ou peça, não tem garantia (null).
 */
export function garantiaDaOrdem(
  doc: Documento,
  ctx: { preferencias: Pick<Preferencias, 'garantiaPadrao'>; estoque?: Record<string, ItemEstoque>; veiculo?: Veiculo; hoje: string }
): Omit<Garantia, 'id' | 'criadoEm' | 'atualizadoEm'> | null {
  const p = prazosDaOficina(ctx.preferencias);
  const itens: ItemDaGarantia[] = [];
  for (const l of doc.linhas) {
    if (l.recusada || !l.descricao.trim() || (l.tipo !== 'servico' && l.tipo !== 'peca')) continue;
    if (l.valorUnitario != null && l.valorUnitario < 0) continue;
    const marca = l.tipo === 'peca' && l.estoqueId ? ctx.estoque?.[l.estoqueId]?.marca?.trim() : undefined;
    itens.push({
      descricao: l.descricao.trim().slice(0, 160),
      tipo: l.tipo,
      dias: l.tipo === 'servico' ? p.servicosDias : p.pecasDias,
      km: null,
      ...(marca ? { marca: marca.slice(0, 60) } : {})
    });
  }
  if (!itens.length) return null;
  return {
    documentoId: doc.id,
    veiculoId: doc.veiculoId,
    clienteId: ctx.veiculo?.clienteId ?? null,
    placa: ctx.veiculo?.placa ?? '',
    inicio: (doc.concluidoEm ?? '').slice(0, 10) || ctx.hoje,
    itens: itens.slice(0, 60),
    condicoes: p.condicoes
  };
}

/** Até quando vale o item (o último dia). */
export function fimDoItem(inicio: string, item: Pick<ItemDaGarantia, 'dias'>): string {
  return somarDias(inicio, Math.max(0, item.dias));
}

export function situacaoDoItem(inicio: string, item: Pick<ItemDaGarantia, 'dias'>, hoje: string): { vigente: boolean; ate: string; diasRestantes: number } {
  const ate = fimDoItem(inicio, item);
  const diasRestantes = diasEntre(hoje, ate);
  return { vigente: diasRestantes >= 0, ate, diasRestantes };
}

/** O último dia de garantia entre todos os itens. */
export function fimDaGarantia(g: Pick<Garantia, 'inicio' | 'itens'>): string {
  return g.itens.reduce((fim, i) => {
    const ate = fimDoItem(g.inicio, i);
    return ate > fim ? ate : fim;
  }, g.inicio);
}

/** Por quantos dias o link vale: até o fim da garantia mais um mês, nunca menos de um ano. */
export function diasDoLinkDaGarantia(g: Pick<Garantia, 'inicio' | 'itens'>, hoje: string): number {
  return Math.min(3650, Math.max(365, diasEntre(hoje, fimDaGarantia(g)) + 30));
}

// ---------------------------------------------------------------- o certificado (link e consulta)

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const esquemaGarantiaLink = z.object({
  v: z.literal(1),
  numero: z.number().int().nullish(),
  inicio: dia,
  cliente: z.string().max(60),
  carro: z.object({ nome: z.string().max(80), placa: z.string().max(8), ano: z.number().int().nullish() }),
  itens: z
    .array(
      z.object({
        descricao: z.string().max(160),
        tipo: z.enum(['servico', 'peca']),
        dias: z.number().int().min(0).max(3650),
        km: z.number().int().nullish(),
        marca: z.string().max(60).nullish()
      })
    )
    .min(1)
    .max(60),
  condicoes: z.string().max(2000).nullish()
});
export type DadosGarantiaLink = z.infer<typeof esquemaGarantiaLink>;

export function lerGarantiaDoLink(dados: unknown): DadosGarantiaLink | null {
  const r = esquemaGarantiaLink.safeParse(dados);
  return r.success ? r.data : null;
}

export function dadosDaGarantia(g: Garantia, ctx: { numero?: number | null; cliente?: Cliente; veiculo?: Veiculo }): DadosGarantiaLink {
  const ano = ctx.veiculo?.ano && ctx.veiculo.ano >= 1900 && ctx.veiculo.ano <= 2100 ? Math.round(ctx.veiculo.ano) : null;
  return {
    v: 1,
    numero: ctx.numero ?? null,
    inicio: g.inicio,
    cliente: primeiroNome(ctx.cliente?.nome ?? '').slice(0, 60),
    carro: { nome: [ctx.veiculo?.marca, ctx.veiculo?.modelo].filter(Boolean).join(' ').slice(0, 80) || 'Carro', placa: (ctx.veiculo?.placa ?? g.placa ?? '').slice(0, 8), ano },
    itens: g.itens.slice(0, 60).map((i) => ({ descricao: i.descricao.slice(0, 160), tipo: i.tipo, dias: Math.max(0, Math.min(3650, Math.round(i.dias))), km: i.km ?? null, marca: i.marca?.slice(0, 60) || null })),
    condicoes: g.condicoes?.trim().slice(0, 2000) || null
  };
}

export function mensagemDaGarantia(ctx: { oficina: string; cliente: string; carro: string; link: string; codigo: string }): string {
  const nome = primeiroNome(ctx.cliente);
  return `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}. Este é o certificado de garantia do serviço no seu ${ctx.carro.trim() || 'carro'}. Guarde o código ${ctx.codigo}: com ele e a placa você consulta a garantia quando quiser. ${ctx.link}`;
}
