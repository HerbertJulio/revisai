// A comissão de quem fez o serviço: em cada ordem concluída, cada linha é de quem está nela (ou do
// mecânico responsável pela ordem); o profissional ganha a % dele sobre a mão de obra e sobre as
// peças. O desconto da ordem é dividido entre a mão de obra e as peças, na proporção do valor.

import { totais, totalDaLinha } from './documentos';
import type { Profissional } from './registros-oficina';
import type { Documento, Id } from './tipos';

export interface LinhaComissao {
  /** null: as linhas sem profissional (não dão comissão). */
  profissionalId: Id | null;
  nome: string;
  ordens: number;
  maoDeObra: number;
  pecas: number;
  percentualServicos: number;
  percentualPecas: number;
  comissaoServicos: number;
  comissaoPecas: number;
  total: number;
}

function porcentagem(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.min(100, Math.max(0, v));
}

/** Quanto sobra de cada real de mão de obra e de peças depois do desconto da ordem (de 0 a 1). */
export function fatorDoDesconto(d: Pick<Documento, 'linhas' | 'desconto'>): number {
  const t = totais(d);
  const base = t.pecas + t.servicos;
  if (!(base > 0) || !t.desconto) return 1;
  return Math.min(1, Math.max(0, (base - t.desconto) / base));
}

export function comissaoPorProfissional(ordens: Documento[], profissionais: Record<Id, Profissional>): LinhaComissao[] {
  const acc = new Map<string, { id: Id | null; ordens: Set<Id>; servicos: number; pecas: number }>();
  for (const d of ordens) {
    const fator = fatorDoDesconto(d);
    for (const l of d.linhas) {
      if (l.recusada || (l.tipo !== 'servico' && l.tipo !== 'peca')) continue;
      const valor = Math.round(totalDaLinha(l) * fator * 100);
      if (!valor) continue;
      const id = l.profissionalId || d.profissionalId || null;
      const chave = id ?? '';
      const atual = acc.get(chave) ?? { id, ordens: new Set<Id>(), servicos: 0, pecas: 0 };
      atual.ordens.add(d.id);
      if (l.tipo === 'servico') atual.servicos += valor;
      else atual.pecas += valor;
      acc.set(chave, atual);
    }
  }
  const linhas: LinhaComissao[] = [];
  for (const x of acc.values()) {
    const p = x.id ? profissionais[x.id] : undefined;
    const ps = x.id && p ? porcentagem(p.comissaoServicos) : 0;
    const pp = x.id && p ? porcentagem(p.comissaoPecas) : 0;
    const cs = Math.round((x.servicos * ps) / 100);
    const cp = Math.round((x.pecas * pp) / 100);
    linhas.push({
      profissionalId: x.id,
      nome: x.id ? (p?.nome ?? 'Profissional apagado') : 'Sem profissional',
      ordens: x.ordens.size,
      maoDeObra: x.servicos / 100,
      pecas: x.pecas / 100,
      percentualServicos: ps,
      percentualPecas: pp,
      comissaoServicos: cs / 100,
      comissaoPecas: cp / 100,
      total: (cs + cp) / 100
    });
  }
  // quem ganha mais em cima; as linhas sem profissional por último
  return linhas.sort((a, b) => Number(a.profissionalId == null) - Number(b.profissionalId == null) || b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}
