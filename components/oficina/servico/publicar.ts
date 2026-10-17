'use client';

// Publica os links do cliente a partir dos dados do aparelho e guarda o endereço onde ele é
// usado: no documento (orçamento, andamento, garantia), no checklist e no carro (histórico).

import { dadosDoAndamento } from '@/lib/andamento';
import { dadosDoChecklist } from '@/lib/checklist';
import { hojeISO, diasEntre } from '@/lib/datas';
import { validoAte } from '@/lib/documentos';
import { dadosDaGarantia, diasDoLinkDaGarantia } from '@/lib/garantia';
import { dadosDoHistorico, historicoDesatualizado, servicosDoHistorico } from '@/lib/historico';
import { DIAS_DO_LINK, dadosDoOrcamento, publicarLink, type LinkGuardado, type ResultadoDaPublicacao } from '@/lib/links-publicos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { contextoDaConta, SEM_CONTA, type ContextoDaConta } from './conta';

type TipoDoDocumento = 'orcamento' | 'andamento' | 'garantia';

const SEM_DOCUMENTO: ResultadoDaPublicacao = { ok: false, erro: 'Documento não encontrado neste aparelho.' };

function origem(): string {
  return window.location.origin;
}

function carroECliente(veiculoId: Id | null | undefined) {
  const s = useOficina.getState();
  const veiculo = veiculoId ? s.veiculos[veiculoId] : undefined;
  const cliente = veiculo ? s.clientes[veiculo.clienteId] : undefined;
  return { veiculo, cliente };
}

/** Guarda o endereço no documento (relido do aparelho: ele pode ter mudado enquanto publicava). */
function guardarNoDocumento(id: Id, tipo: TipoDoDocumento, link: LinkGuardado) {
  const s = useOficina.getState();
  const d = s.documentos[id];
  if (!d) return;
  s.salvarDocumento({ ...d, links: { ...d.links, [tipo]: link } });
}

export async function publicarOrcamento(id: Id, ctx: ContextoDaConta | null = contextoDaConta()): Promise<ResultadoDaPublicacao> {
  if (!ctx) return { ok: false, erro: SEM_CONTA };
  const doc = useOficina.getState().documentos[id];
  if (!doc || doc.tipo !== 'orcamento') return SEM_DOCUMENTO;
  const { veiculo, cliente } = carroECliente(doc.veiculoId);
  const dados = dadosDoOrcamento(doc, cliente, veiculo);
  // vale um pouco além da validade, para o cliente ver que venceu e pedir outro
  const dias = Math.max(DIAS_DO_LINK.orcamento, diasEntre(hojeISO(), validoAte(doc)) + 15);
  const r = await publicarLink(ctx.sb, origem(), { oficinaId: ctx.oficinaId, tipo: 'orcamento', ref: doc.id, dados, dias }, doc.links?.orcamento);
  if (r.ok) guardarNoDocumento(doc.id, 'orcamento', r.link);
  return r;
}

export async function publicarAndamento(id: Id, ctx: ContextoDaConta | null = contextoDaConta()): Promise<ResultadoDaPublicacao> {
  if (!ctx) return { ok: false, erro: SEM_CONTA };
  const doc = useOficina.getState().documentos[id];
  if (!doc || doc.tipo !== 'ordem') return SEM_DOCUMENTO;
  const { veiculo, cliente } = carroECliente(doc.veiculoId);
  const r = await publicarLink(ctx.sb, origem(), { oficinaId: ctx.oficinaId, tipo: 'andamento', ref: doc.id, dados: dadosDoAndamento(doc, cliente, veiculo) }, doc.links?.andamento);
  if (r.ok) guardarNoDocumento(doc.id, 'andamento', r.link);
  return r;
}

export async function publicarGarantia(id: Id, ctx: ContextoDaConta | null = contextoDaConta()): Promise<ResultadoDaPublicacao> {
  if (!ctx) return { ok: false, erro: SEM_CONTA };
  const s = useOficina.getState();
  const doc = s.documentos[id];
  const g = doc?.garantiaId ? s.garantias[doc.garantiaId] : undefined;
  if (!doc || !g) return { ok: false, erro: 'A garantia desta ordem não foi encontrada.' };
  const { veiculo, cliente } = carroECliente(doc.veiculoId ?? g.veiculoId);
  const placa = veiculo?.placa ?? g.placa ?? '';
  if (!/^[A-Z0-9]{7}$/.test(placa)) return { ok: false, erro: 'O carro precisa da placa para a consulta da garantia.' };
  const r = await publicarLink(
    ctx.sb,
    origem(),
    { oficinaId: ctx.oficinaId, tipo: 'garantia', ref: doc.id, dados: dadosDaGarantia(g, { numero: doc.numero, cliente, veiculo }), placa, dias: diasDoLinkDaGarantia(g, hojeISO()) },
    doc.links?.garantia
  );
  if (r.ok) guardarNoDocumento(doc.id, 'garantia', r.link);
  return r;
}

export async function publicarChecklist(checklistId: Id, ctx: ContextoDaConta | null = contextoDaConta()): Promise<ResultadoDaPublicacao> {
  if (!ctx) return { ok: false, erro: SEM_CONTA };
  const s = useOficina.getState();
  const c = s.checklists[checklistId];
  if (!c) return { ok: false, erro: 'Checklist não encontrado neste aparelho.' };
  const doc = c.documentoId ? s.documentos[c.documentoId] : undefined;
  const { veiculo, cliente } = carroECliente(c.veiculoId ?? doc?.veiculoId);
  const r = await publicarLink(ctx.sb, origem(), { oficinaId: ctx.oficinaId, tipo: 'checklist', ref: c.id, dados: dadosDoChecklist(c, { cliente, veiculo, numero: doc?.numero ?? null }) }, c.link);
  if (r.ok) {
    const atual = useOficina.getState().checklists[checklistId];
    if (atual) useOficina.getState().salvarRegistro('checklists', { ...atual, link: r.link });
  }
  return r;
}

export async function publicarHistorico(veiculoId: Id, ctx: ContextoDaConta | null = contextoDaConta()): Promise<ResultadoDaPublicacao> {
  if (!ctx) return { ok: false, erro: SEM_CONTA };
  const s = useOficina.getState();
  const veiculo = s.veiculos[veiculoId];
  if (!veiculo) return { ok: false, erro: 'Carro não encontrado neste aparelho.' };
  if (!/^[A-Z0-9]{7}$/.test(veiculo.placa)) return { ok: false, erro: 'O carro precisa da placa para o histórico.' };
  const servicos = servicosDoHistorico(veiculoId, { atendimentos: s.atendimentos, documentos: s.documentos, estoque: s.estoque });
  const r = await publicarLink(
    ctx.sb,
    origem(),
    { oficinaId: ctx.oficinaId, tipo: 'historico', ref: veiculo.id, dados: dadosDoHistorico(veiculo, servicos, hojeISO()), placa: veiculo.placa },
    veiculo.links?.historico
  );
  if (r.ok) {
    const atual = useOficina.getState().veiculos[veiculoId];
    if (atual) useOficina.getState().salvarVeiculo({ ...atual, links: { ...atual.links, historico: r.link } });
  }
  return r;
}

/** Depois de concluir a ordem: a garantia, o andamento (pronto, com o total) e o histórico do carro. */
export async function publicarDepoisDeConcluir(documentoId: Id, ctx: ContextoDaConta | null = contextoDaConta()): Promise<void> {
  if (!ctx) return;
  const doc = useOficina.getState().documentos[documentoId];
  if (!doc) return;
  const tarefas: Promise<unknown>[] = [];
  if (doc.garantiaId) tarefas.push(publicarGarantia(documentoId, ctx));
  if (doc.links?.andamento) tarefas.push(publicarAndamento(documentoId, ctx));
  if (doc.veiculoId) tarefas.push(publicarHistorico(doc.veiculoId, ctx));
  const r = await Promise.allSettled(tarefas);
  for (const x of r) if (x.status === 'rejected') console.error('[links] depois de concluir', x.reason);
}

let pendenciasFeitas: string | null = null;

/**
 * O que ficou sem publicar (a ordem foi concluída sem a conta à mão): garantias sem link e
 * históricos de carros com serviço novo. Uma vez por sessão, só das ordens dos últimos 60 dias.
 */
export async function publicarPendencias(ctx: ContextoDaConta | null = contextoDaConta()): Promise<number> {
  if (!ctx || pendenciasFeitas === ctx.oficinaId) return 0;
  pendenciasFeitas = ctx.oficinaId;
  const s = useOficina.getState();
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const recentes = Object.values(s.documentos).filter((d) => d.tipo === 'ordem' && d.situacao === 'concluida' && (d.concluidoEm ?? d.atualizadoEm) >= desde);
  let n = 0;
  for (const d of recentes.slice(0, 20)) {
    if (d.garantiaId && s.garantias[d.garantiaId] && !d.links?.garantia?.url) {
      if ((await publicarGarantia(d.id, ctx)).ok) n++;
    }
  }
  const carros = [...new Set(recentes.map((d) => d.veiculoId).filter((v): v is Id => !!v))];
  for (const v of carros.slice(0, 20)) {
    const veiculo = useOficina.getState().veiculos[v];
    if (veiculo && historicoDesatualizado(veiculo, useOficina.getState().atendimentos)) {
      if ((await publicarHistorico(v, ctx)).ok) n++;
    }
  }
  return n;
}
