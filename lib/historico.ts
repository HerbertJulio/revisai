// O histórico verificado do carro, para quem vai vender: os serviços que esta oficina fez (data,
// km, serviços, peças e marcas). O link mostra a oficina pelo banco (nome, cidade e CNPJ), nunca
// pelo que veio nos dados do link. Sem nome do dono e sem valores.

import { z } from 'zod';
import { formatarPlaca } from './formatos';
import { servico as infoServico, servicoExiste } from './manutencao';
import type { Atendimento, Documento, ItemEstoque, Veiculo } from './tipos';

export interface ServicoDoHistorico {
  data: string;
  km: number | null;
  os: number | null;
  itens: { servico: string; produto: string | null }[];
  pecas: { descricao: string; marca: string | null }[];
}

/** Os serviços do carro, do mais novo para o mais antigo, com as peças da ordem de onde vieram. */
export function servicosDoHistorico(
  veiculoId: string,
  dados: { atendimentos: Record<string, Atendimento>; documentos: Record<string, Documento>; estoque?: Record<string, ItemEstoque> }
): ServicoDoHistorico[] {
  const ordemDo = new Map<string, Documento>();
  for (const d of Object.values(dados.documentos)) if (d.tipo === 'ordem' && d.atendimentoId) ordemDo.set(d.atendimentoId, d);
  return Object.values(dados.atendimentos)
    .filter((a) => a.veiculoId === veiculoId)
    .sort((a, b) => (a.data !== b.data ? (a.data < b.data ? 1 : -1) : (b.km ?? 0) - (a.km ?? 0)))
    .map((a) => {
      const os = ordemDo.get(a.id);
      const itens = a.itens.map((i) => ({ servico: servicoExiste(i.servico) ? infoServico(i.servico).nome : String(i.servico), produto: i.produto?.nome?.trim().slice(0, 120) || null }));
      // a peça que já aparece como o produto do serviço não se repete na lista de peças (a não ser com a marca)
      const produtos = new Set(itens.map((i) => i.produto?.toLowerCase()).filter(Boolean));
      const pecas = (os?.linhas ?? [])
        .filter((l) => l.tipo === 'peca' && !l.recusada && l.descricao.trim() && !(l.valorUnitario != null && l.valorUnitario < 0))
        .map((l) => ({ descricao: l.descricao.trim().slice(0, 120), marca: (l.estoqueId ? dados.estoque?.[l.estoqueId]?.marca?.trim() : '')?.slice(0, 60) || null }))
        .filter((p) => p.marca || !produtos.has(p.descricao.toLowerCase()));
      return { data: a.data, km: a.km > 0 ? Math.round(a.km) : null, os: os?.numero ?? null, itens, pecas: pecas.slice(0, 30) };
    });
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const esquemaHistoricoLink = z.object({
  v: z.literal(1),
  carro: z.object({ nome: z.string().max(80), placa: z.string().max(8), ano: z.number().int().nullish(), motor: z.string().max(40).nullish() }),
  servicos: z
    .array(
      z.object({
        data: dia,
        km: z.number().int().nullish(),
        os: z.number().int().nullish(),
        itens: z.array(z.object({ servico: z.string().max(80), produto: z.string().max(120).nullish() })).max(40),
        pecas: z.array(z.object({ descricao: z.string().max(120), marca: z.string().max(60).nullish() })).max(30)
      })
    )
    .max(200),
  atualizadoEm: dia
});
export type DadosHistoricoLink = z.infer<typeof esquemaHistoricoLink>;

export function lerHistoricoDoLink(dados: unknown): DadosHistoricoLink | null {
  const r = esquemaHistoricoLink.safeParse(dados);
  return r.success ? r.data : null;
}

export function dadosDoHistorico(veiculo: Veiculo, servicos: ServicoDoHistorico[], hoje: string): DadosHistoricoLink {
  const ano = veiculo.ano && veiculo.ano >= 1900 && veiculo.ano <= 2100 ? Math.round(veiculo.ano) : null;
  return {
    v: 1,
    carro: { nome: [veiculo.marca, veiculo.modelo].filter(Boolean).join(' ').slice(0, 80) || 'Carro', placa: veiculo.placa.slice(0, 8), ano, motor: veiculo.motor?.trim().slice(0, 40) || null },
    servicos: servicos.slice(0, 200).map((s) => ({ ...s, itens: s.itens.slice(0, 40) })),
    atualizadoEm: hoje
  };
}

/** O link do histórico precisa ser publicado de novo (não existe ou tem serviço mais novo que ele). */
export function historicoDesatualizado(veiculo: Pick<Veiculo, 'id' | 'links'>, atendimentos: Record<string, Atendimento>): boolean {
  const publicado = veiculo.links?.historico?.publicadoEm ?? null;
  if (!veiculo.links?.historico?.url || !publicado) return true;
  return Object.values(atendimentos).some((a) => a.veiculoId === veiculo.id && a.criadoEm > publicado);
}

export function mensagemDoHistorico(ctx: { oficina: string; carro: string; placa: string; link: string }): string {
  const carro = [ctx.carro.trim(), ctx.placa ? `placa ${formatarPlaca(ctx.placa)}` : ''].filter(Boolean).join(', ');
  return `Histórico de manutenção do ${carro || 'carro'}, com os serviços confirmados pela ${ctx.oficina.trim() || 'oficina'}: ${ctx.link}`;
}
