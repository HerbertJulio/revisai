// O andamento do serviço que o cliente acompanha pelo link: recebido, diagnóstico, aguardando
// aprovação, aguardando peças, em serviço, pronto e entregue. Cada mudança fica na linha do tempo
// da ordem (com nota e fotos) e o link é republicado. Funções puras, para a tela e para os testes.

import { z } from 'zod';
import { formatarPlaca, primeiroNome } from './formatos';
import { gruposDeLinhas, totais } from './documentos';
import type { FotoRegistro } from './registros-oficina';
import type { Cliente, Documento, EtapaServico, Id, Veiculo } from './tipos';

export const ETAPAS: { id: EtapaServico; nome: string; paraCliente: string }[] = [
  { id: 'recebido', nome: 'Recebido', paraCliente: 'O carro chegou na oficina.' },
  { id: 'diagnostico', nome: 'Diagnóstico', paraCliente: 'A oficina está vendo o que o carro precisa.' },
  { id: 'aguardando_aprovacao', nome: 'Aguardando aprovação', paraCliente: 'Esperando você aprovar o orçamento.' },
  { id: 'aguardando_pecas', nome: 'Aguardando peças', paraCliente: 'Esperando as peças chegarem.' },
  { id: 'em_servico', nome: 'Em serviço', paraCliente: 'O serviço está sendo feito.' },
  { id: 'pronto', nome: 'Pronto', paraCliente: 'O carro está pronto para buscar.' },
  { id: 'entregue', nome: 'Entregue', paraCliente: 'O carro foi entregue.' }
];

const ORDEM = new Map(ETAPAS.map((e, i) => [e.id, i]));

export function indiceDaEtapa(e: EtapaServico | null | undefined): number {
  return e ? (ORDEM.get(e) ?? -1) : -1;
}

export function nomeDaEtapa(e: EtapaServico): string {
  return ETAPAS[indiceDaEtapa(e)]?.nome ?? e;
}

export function etapaValida(e: unknown): e is EtapaServico {
  return typeof e === 'string' && ORDEM.has(e as EtapaServico);
}

/**
 * Onde o serviço está. A etapa marcada vale; sem marca, a ordem concluída está pronta, a ordem
 * que veio de um orçamento aprovado está em serviço e a ordem nova acabou de chegar.
 */
export function etapaAtual(doc: Pick<Documento, 'tipo' | 'situacao' | 'etapa' | 'orcamentoId'>): EtapaServico | null {
  if (doc.tipo === 'orcamento') {
    if (doc.etapa) return doc.etapa;
    return doc.situacao === 'rascunho' ? 'diagnostico' : doc.situacao === 'enviado' ? 'aguardando_aprovacao' : null;
  }
  if (doc.situacao === 'cancelada') return null;
  if (doc.etapa) {
    // concluída, a ordem não volta para antes de "pronto"
    if (doc.situacao === 'concluida' && indiceDaEtapa(doc.etapa) < indiceDaEtapa('pronto')) return 'pronto';
    return doc.etapa;
  }
  if (doc.situacao === 'concluida') return 'pronto';
  return doc.orcamentoId ? 'em_servico' : 'recebido';
}

export type Mudanca = { ok: true } | { ok: false; motivo: string };

/**
 * As regras das etapas: só a ordem de serviço anda (o orçamento espera a aprovação), a cancelada
 * não anda, "entregue" só depois de concluir a ordem (o serviço fica registrado antes) e a ordem
 * concluída não volta para antes de "pronto". Voltar uma etapa vale (a peça não chegou).
 */
export function podeMudarPara(doc: Pick<Documento, 'tipo' | 'situacao' | 'etapa' | 'orcamentoId'>, nova: EtapaServico): Mudanca {
  if (!etapaValida(nova)) return { ok: false, motivo: 'Etapa desconhecida.' };
  if (doc.tipo !== 'ordem') return { ok: false, motivo: 'O andamento é da ordem de serviço.' };
  if (doc.situacao === 'cancelada') return { ok: false, motivo: 'A ordem foi cancelada.' };
  if (nova === 'entregue' && doc.situacao !== 'concluida') return { ok: false, motivo: 'Conclua a ordem antes de marcar como entregue.' };
  if (doc.situacao === 'concluida' && indiceDaEtapa(nova) < indiceDaEtapa('pronto')) return { ok: false, motivo: 'A ordem já foi concluída.' };
  return { ok: true };
}

/** A próxima etapa para o botão principal (a aprovação já passou numa ordem de serviço). */
export function proximaEtapa(doc: Pick<Documento, 'tipo' | 'situacao' | 'etapa' | 'orcamentoId'>): EtapaServico | null {
  const atual = etapaAtual(doc);
  if (!atual) return null;
  for (let i = indiceDaEtapa(atual) + 1; i < ETAPAS.length; i++) {
    const e = ETAPAS[i].id;
    if (e === 'aguardando_aprovacao' && doc.tipo === 'ordem') continue;
    if (podeMudarPara(doc, e).ok) return e;
    return null;
  }
  return null;
}

export type EntradaDoAndamento = NonNullable<Documento['andamento']>[number];

/**
 * A mudança de etapa (ou uma nota e fotos na etapa atual). Devolve a etapa e a linha do tempo
 * novas, ou null quando não muda nada (a mesma etapa, sem nota e sem foto).
 */
export function registrarEtapa(
  doc: Pick<Documento, 'tipo' | 'situacao' | 'etapa' | 'orcamentoId' | 'andamento'>,
  nova: EtapaServico,
  quando: string,
  extra: { nota?: string; fotoIds?: Id[] } = {}
): { etapa: EtapaServico; andamento: EntradaDoAndamento[] } | null {
  if (!podeMudarPara(doc, nova).ok) return null;
  const nota = extra.nota?.trim().slice(0, 300) || undefined;
  const fotoIds = extra.fotoIds?.length ? extra.fotoIds.slice(0, 6) : undefined;
  if (etapaAtual(doc) === nova && doc.etapa === nova && !nota && !fotoIds) return null;
  const entrada: EntradaDoAndamento = { etapa: nova, quando, ...(nota ? { nota } : {}), ...(fotoIds ? { fotoIds } : {}) };
  return { etapa: nova, andamento: [...(doc.andamento ?? []), entrada].slice(-60) };
}

export interface PassoDaLinha {
  etapa: EtapaServico;
  nome: string;
  /** Feita (antes da atual), a atual ou ainda por vir. */
  estado: 'feita' | 'atual' | 'falta';
  /** A última vez que a ordem entrou nesta etapa. */
  quando: string | null;
}

/** As etapas para o desenho (sem "aguardando aprovação" na ordem que não passou por orçamento). */
export function passosDoAndamento(doc: Pick<Documento, 'tipo' | 'situacao' | 'etapa' | 'orcamentoId' | 'andamento'>): PassoDaLinha[] {
  const atual = etapaAtual(doc);
  const iAtual = indiceDaEtapa(atual);
  const ultima = new Map<EtapaServico, string>();
  for (const a of doc.andamento ?? []) ultima.set(a.etapa, a.quando);
  return ETAPAS.filter((e) => !(e.id === 'aguardando_aprovacao' && doc.tipo === 'ordem' && !doc.orcamentoId && !ultima.has(e.id))).map((e) => {
    const i = indiceDaEtapa(e.id);
    return { etapa: e.id, nome: e.nome, estado: i < iAtual ? 'feita' : i === iAtual ? 'atual' : 'falta', quando: ultima.get(e.id) ?? null };
  });
}

// ---------------------------------------------------------------- o link do andamento

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CAMINHO_FOTO = /^[0-9a-f-]{36}\/(andamento|checklist)\/[A-Za-z0-9_-]{6,80}\.(jpg|jpeg|webp|png)$/;

export function caminhoDeFotoValido(c: string | null | undefined): c is string {
  return !!c && CAMINHO_FOTO.test(c);
}

/** A foto pelo próprio site (as páginas só carregam imagens dele): /l/foto/<caminho no Storage>. */
export function enderecoDaFoto(caminho: string): string {
  return `/l/foto/${caminho}`;
}

export const esquemaAndamentoLink = z.object({
  v: z.literal(1),
  numero: z.number().int().min(1),
  data: dia,
  cliente: z.string().max(60),
  carro: z.object({ nome: z.string().max(80), placa: z.string().max(8) }),
  etapa: z.enum(['recebido', 'diagnostico', 'aguardando_aprovacao', 'aguardando_pecas', 'em_servico', 'pronto', 'entregue']).nullable(),
  servicos: z.array(z.string().max(80)).max(30),
  linha: z
    .array(
      z.object({
        etapa: z.enum(['recebido', 'diagnostico', 'aguardando_aprovacao', 'aguardando_pecas', 'em_servico', 'pronto', 'entregue']),
        quando: z.string(),
        nota: z.string().max(300).nullish(),
        fotos: z.array(z.string().refine(caminhoDeFotoValido)).max(6).nullish()
      })
    )
    .max(60),
  prazo: z.string().max(80).nullish(),
  /** Só quando o carro está pronto. */
  total: z.number().nullish()
});
export type DadosAndamentoLink = z.infer<typeof esquemaAndamentoLink>;

export function lerAndamentoDoLink(dados: unknown): DadosAndamentoLink | null {
  const r = esquemaAndamentoLink.safeParse(dados);
  return r.success ? r.data : null;
}

/** O que o cliente vê no link do andamento (as fotos só com caminho no Storage; o total só quando ficar pronto). */
export function dadosDoAndamento(doc: Documento, cliente: Cliente | undefined, veiculo: Veiculo | undefined): DadosAndamentoLink {
  const fotos = new Map<Id, FotoRegistro>((doc.fotos ?? []).map((f) => [f.id, f]));
  const etapa = etapaAtual(doc);
  const pronto = indiceDaEtapa(etapa) >= indiceDaEtapa('pronto');
  const t = totais(doc);
  return {
    v: 1,
    numero: doc.numero,
    data: doc.data,
    cliente: primeiroNome(cliente?.nome ?? '').slice(0, 60),
    carro: { nome: [veiculo?.marca, veiculo?.modelo].filter(Boolean).join(' ').slice(0, 80) || 'Carro', placa: (veiculo?.placa ?? '').slice(0, 8) },
    etapa,
    servicos: gruposDeLinhas(doc.linhas.filter((l) => !l.recusada && l.descricao.trim()))
      .flatMap((g) => (g.servico ? [g.titulo] : g.linhas.map((l) => l.descricao.trim())))
      .map((s) => s.slice(0, 80))
      .slice(0, 30),
    linha: (doc.andamento ?? []).slice(-60).map((a) => {
      const caminhos = (a.fotoIds ?? []).map((id) => fotos.get(id)?.caminho).filter(caminhoDeFotoValido).slice(0, 6);
      return { etapa: a.etapa, quando: a.quando, nota: a.nota?.slice(0, 300) || null, fotos: caminhos.length ? caminhos : null };
    }),
    prazo: doc.prazo?.trim().slice(0, 80) || null,
    total: pronto && t.total > 0 ? t.total : null
  };
}

/** A mensagem que leva o link do andamento ao cliente na primeira vez. */
export function mensagemDoAndamento(ctx: { oficina: string; cliente: string; carro: string; placa: string; link: string }): string {
  const nome = primeiroNome(ctx.cliente);
  const carro = [ctx.carro.trim(), ctx.placa ? `placa ${formatarPlaca(ctx.placa)}` : ''].filter(Boolean).join(', ');
  return `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}. Por este link você acompanha o serviço do seu ${carro || 'carro'}, com as fotos, até ficar pronto: ${ctx.link}`;
}
