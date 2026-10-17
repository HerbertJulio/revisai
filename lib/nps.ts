// NPS: a pergunta "de 0 a 10, quanto você indicaria o Revisaí para outra oficina?" e a conta.
// Promotores dão 9 ou 10, neutros 7 ou 8, detratores de 0 a 6; o NPS é a porcentagem de
// promotores menos a de detratores (de -100 a 100). O banco faz a mesma conta (nps_resumo).

import { z } from 'zod';

export const PERGUNTA_NPS = 'De 0 a 10, quanto você indicaria o Revisaí para outra oficina?';

/** Só pergunta depois de 30 dias usando a oficina, e de novo a cada 90 (respondendo ou dispensando). */
export const DIAS_ANTES_DA_PRIMEIRA = 30;
export const DIAS_ENTRE_PERGUNTAS = 90;
/** O banco aceita uma resposta por pessoa a cada 60 dias. */
export const DIAS_ENTRE_RESPOSTAS = 60;

export type CategoriaNps = 'promotor' | 'neutro' | 'detrator';

export function categoriaDaNota(nota: number): CategoriaNps {
  if (nota >= 9) return 'promotor';
  if (nota >= 7) return 'neutro';
  return 'detrator';
}

export interface ContaNps {
  respostas: number;
  promotores: number;
  neutros: number;
  detratores: number;
  /** De -100 a 100; null sem respostas. */
  nps: number | null;
}

/** Arredonda como o round() do Postgres (o meio vai para longe do zero). */
function arredondar(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

export function npsDe(promotores: number, detratores: number, respostas: number): number | null {
  return respostas > 0 ? arredondar((100 * (promotores - detratores)) / respostas) : null;
}

export function contarNps(notas: Iterable<number>): ContaNps {
  const c = { respostas: 0, promotores: 0, neutros: 0, detratores: 0 };
  for (const n of notas) {
    if (!Number.isInteger(n) || n < 0 || n > 10) continue;
    c.respostas++;
    const cat = categoriaDaNota(n);
    if (cat === 'promotor') c.promotores++;
    else if (cat === 'neutro') c.neutros++;
    else c.detratores++;
  }
  return { ...c, nps: npsDe(c.promotores, c.detratores, c.respostas) };
}

const DIA = 86_400_000;

/** A mesma regra do banco (nps_pendente), para conferir e mostrar. */
export function devePerguntar(ctx: { membroDesde: string | null; ultimaResposta: string | null; ultimaDispensa: string | null; agora?: Date }): boolean {
  const agora = (ctx.agora ?? new Date()).getTime();
  const ha = (iso: string | null) => (iso ? (agora - new Date(iso).getTime()) / DIA : Infinity);
  if (!ctx.membroDesde || ha(ctx.membroDesde) < DIAS_ANTES_DA_PRIMEIRA) return false;
  return ha(ctx.ultimaResposta) >= DIAS_ENTRE_PERGUNTAS && ha(ctx.ultimaDispensa) >= DIAS_ENTRE_PERGUNTAS;
}

/** "Promotores", "Neutros", "Detratores" com a porcentagem. */
export function porcentagem(parte: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((100 * parte) / total)}%`;
}

const numero = z.coerce.number().int().nonnegative();
const conta = z.object({ respostas: numero, promotores: numero, neutros: numero, detratores: numero, nps: z.coerce.number().int().nullable() });

export const esquemaResumoNps = z.object({
  total: conta,
  meses: z.array(conta.extend({ mes: z.string().regex(/^\d{4}-\d{2}$/) })),
  notas: z.array(z.object({ nota: z.coerce.number().int().min(0).max(10), respostas: numero })).default([]),
  comentarios: z.array(
    z.object({
      nota: z.coerce.number().int().min(0).max(10),
      comentario: z.string(),
      criadoEm: z.string(),
      oficina: z.string().nullable(),
      loja: z.string().nullable()
    })
  )
});
export type ResumoNps = z.infer<typeof esquemaResumoNps>;

export function lerResumoNps(dados: unknown): ResumoNps | null {
  const r = esquemaResumoNps.safeParse(dados);
  return r.success ? r.data : null;
}

export const esquemaPendenteNps = z.object({ perguntar: z.boolean() });
