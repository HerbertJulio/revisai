// Clube de manutenção que a oficina vende: planos com mensalidade, serviços incluídos por ano e
// desconto em peças e mão de obra. A mensalidade é um Pix por mês que o cliente paga pelo código
// (não é débito automático): o app gera as cobranças do mês, a oficina manda pelo WhatsApp e marca
// como paga quando o Pix cai. Os serviços incluídos contam por ano de clube (da data de entrada).

import { z } from 'zod';
import { pixDaCobranca, type RecebedorPix } from './cobranca-cliente';
import { somarMeses } from './datas';
import { totais, totalDaLinha } from './documentos';
import { formatarMoeda, formatarPlaca, primeiroNome } from './formatos';
import { servico as infoServico, servicoExiste } from './manutencao';
import type { ClubeCobranca, ClubeMembro, ClubePlano, NovoItemExtra } from './registros-oficina';
import type { Documento, Id, ServicoId, Veiculo } from './tipos';

const r2 = (n: number) => Math.round(n * 100) / 100;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ---------------------------------------------------------------- meses

/** 'AAAA-MM' de uma data 'AAAA-MM-DD'. */
export function competenciaDe(data: string): string {
  return data.slice(0, 7);
}

export function somarCompetencia(competencia: string, meses: number): string {
  return somarMeses(`${competencia}-01`, meses).slice(0, 7);
}

/** 'outubro de 2026'. */
export function nomeDaCompetencia(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number);
  return `${MESES[(m || 1) - 1]} de ${a}`;
}

/** O dia de vencimento fica entre 1 e 28 (todo mês tem). */
export function diaValido(dia: number): number {
  return Math.min(28, Math.max(1, Math.round(Number.isFinite(dia) ? dia : 10)));
}

/** O vencimento da mensalidade no mês: o dia escolhido (no mês da entrada, nunca antes de entrar). */
export function vencimentoDaMensalidade(membro: Pick<ClubeMembro, 'inicio' | 'diaVencimento'>, competencia: string): string {
  const v = `${competencia}-${String(diaValido(membro.diaVencimento)).padStart(2, '0')}`;
  return competencia === competenciaDe(membro.inicio) && v < membro.inicio ? membro.inicio : v;
}

// ---------------------------------------------------------------- mensalidades

/** Uma mensalidade por membro e mês: o id fixo evita cobrança dobrada quando dois aparelhos geram juntos. */
export function idDaMensalidade(membroId: Id, competencia: string): Id {
  return `${membroId}-${competencia}`;
}

/** As mensalidades do mês que ainda faltam gerar: membros ativos que já tinham entrado no mês. */
export function mensalidadesParaGerar(
  membros: ClubeMembro[],
  planos: Record<Id, ClubePlano>,
  cobrancas: ClubeCobranca[],
  competencia: string
): (NovoItemExtra<'clubeCobrancas'> & { id: Id })[] {
  const existentes = new Set(cobrancas.map((c) => `${c.membroId}|${c.competencia}`));
  const novas: (NovoItemExtra<'clubeCobrancas'> & { id: Id })[] = [];
  for (const m of membros) {
    const plano = planos[m.planoId];
    if (m.situacao !== 'ativo' || !plano || !(plano.preco > 0)) continue;
    if (competenciaDe(m.inicio) > competencia) continue;
    if (existentes.has(`${m.id}|${competencia}`)) continue;
    novas.push({
      id: idDaMensalidade(m.id, competencia),
      membroId: m.id,
      competencia,
      valor: r2(plano.preco),
      vencimento: vencimentoDaMensalidade(m, competencia),
      pagoEm: null,
      forma: null,
      lancamentoId: null
    });
  }
  return novas;
}

export function mensalidadeAtrasada(c: Pick<ClubeCobranca, 'pagoEm' | 'vencimento'>, hoje: string): boolean {
  return !c.pagoEm && c.vencimento < hoje;
}

/** As mensalidades em aberto que já venceram, da mais antiga para a mais nova. */
export function mensalidadesAtrasadas(cobrancas: ClubeCobranca[], hoje: string): ClubeCobranca[] {
  return cobrancas.filter((c) => mensalidadeAtrasada(c, hoje)).sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
}

/** A mensalidade paga (por Pix, hoje), ligada à conta recebida do financeiro. */
export function mensalidadePaga(c: ClubeCobranca, hoje: string, lancamentoId: Id): ClubeCobranca {
  return { ...c, pagoEm: c.pagoEm ?? hoje, forma: c.forma ?? 'pix', lancamentoId };
}

/** Até quando o membro está em dia: o próximo vencimento depois do último mês pago. */
export function pagoAte(membro: Pick<ClubeMembro, 'id' | 'inicio' | 'diaVencimento'>, cobrancas: ClubeCobranca[]): string | null {
  const pagos = cobrancas.filter((c) => c.membroId === membro.id && c.pagoEm).map((c) => c.competencia).sort();
  const ultimo = pagos.at(-1);
  return ultimo ? vencimentoDaMensalidade(membro, somarCompetencia(ultimo, 1)) : null;
}

/** A mensalidade em aberto mais antiga do membro (a que o cartão mostra para pagar). */
export function mensalidadeEmAberto(membroId: Id, cobrancas: ClubeCobranca[]): ClubeCobranca | null {
  return cobrancas.filter((c) => c.membroId === membroId && !c.pagoEm).sort((a, b) => (a.competencia < b.competencia ? -1 : 1))[0] ?? null;
}

// ---------------------------------------------------------------- benefícios

export function nomeDoServico(id: string): string {
  return servicoExiste(id) ? infoServico(id).nome : id;
}

/** O ano de clube em que a data cai, contado da entrada: [inicio, fim). */
export function anoDoClube(membro: Pick<ClubeMembro, 'inicio'>, hoje: string): { inicio: string; fim: string } {
  let inicio = membro.inicio;
  if (hoje >= inicio) {
    let k = Math.max(0, Number(hoje.slice(0, 4)) - Number(inicio.slice(0, 4)) - 1);
    while (somarMeses(membro.inicio, 12 * (k + 1)) <= hoje) k++;
    inicio = somarMeses(membro.inicio, 12 * k);
  }
  return { inicio, fim: somarMeses(inicio, 12) };
}

export interface BeneficioDoMembro {
  servico: string;
  nome: string;
  quantidadePorAno: number;
  usados: number;
  restantes: number;
}

/** Cada serviço incluído do plano com quantos já foram usados no ano de clube (fora os desta ordem). */
export function beneficiosDoMembro(membro: Pick<ClubeMembro, 'inicio' | 'usos'>, plano: Pick<ClubePlano, 'beneficios'>, hoje: string, foraDoDocumento?: Id): BeneficioDoMembro[] {
  const ano = anoDoClube(membro, hoje);
  return plano.beneficios
    .filter((b) => b.servico && b.quantidadePorAno > 0)
    .map((b) => {
      const usados = membro.usos.filter((u) => u.servico === b.servico && u.data >= ano.inicio && u.data < ano.fim && (!foraDoDocumento || u.documentoId !== foraDoDocumento)).length;
      return { servico: b.servico, nome: nomeDoServico(b.servico), quantidadePorAno: b.quantidadePorAno, usados, restantes: Math.max(0, b.quantidadePorAno - usados) };
    });
}

/** O membro ativo do carro (ou do dono do carro, quando o plano não é de um carro só). */
export function membroDoCarro(membros: ClubeMembro[], veiculo: Pick<Veiculo, 'id' | 'clienteId'> | null | undefined): ClubeMembro | null {
  if (!veiculo) return null;
  const ativos = membros.filter((m) => m.situacao === 'ativo');
  return ativos.find((m) => m.veiculoId === veiculo.id) ?? ativos.find((m) => !m.veiculoId && m.clienteId === veiculo.clienteId) ?? null;
}

/** Os serviços do plano que esta ordem tem e que ainda cabem no ano (os desta ordem contam como dela). */
export function servicosIncluidosNaOrdem(doc: Pick<Documento, 'id' | 'linhas'>, membro: Pick<ClubeMembro, 'inicio' | 'usos'>, plano: Pick<ClubePlano, 'beneficios'>, hoje: string): ServicoId[] {
  const restantes = new Map(beneficiosDoMembro(membro, plano, hoje, doc.id).map((b) => [b.servico, b.restantes]));
  const lista: ServicoId[] = [];
  for (const l of doc.linhas) {
    if (l.recusada || !l.servico || lista.includes(l.servico)) continue;
    if ((restantes.get(l.servico) ?? 0) > 0) lista.push(l.servico);
  }
  return lista;
}

/** Os usos que a ordem concluída registra (um por serviço incluído, sem repetir a mesma ordem). */
export function usosDaOrdem(doc: Pick<Documento, 'id' | 'linhas'>, membro: ClubeMembro, plano: ClubePlano, hoje: string): ClubeMembro['usos'] {
  const jaTem = new Set(membro.usos.filter((u) => u.documentoId === doc.id).map((u) => u.servico));
  return servicosIncluidosNaOrdem(doc, membro, plano, hoje)
    .filter((s) => !jaTem.has(s))
    .map((s) => ({ data: hoje, servico: s, documentoId: doc.id }));
}

export interface DescontoDoClube {
  /** A mão de obra dos serviços incluídos (sai de graça). */
  incluidos: number;
  pecas: number;
  servicos: number;
  total: number;
}

/**
 * O desconto do clube na ordem: a mão de obra dos serviços incluídos sai de graça, e o resto da
 * mão de obra e as peças têm o desconto do plano. Linhas "outro" (vistoria abatida, taxa) ficam fora.
 */
export function descontoDoClube(doc: Pick<Documento, 'id' | 'linhas' | 'desconto'>, membro: Pick<ClubeMembro, 'inicio' | 'usos'>, plano: ClubePlano, hoje: string): DescontoDoClube {
  const incluidos = new Set(servicosIncluidosNaOrdem(doc, membro, plano, hoje));
  let maoDeObraIncluida = 0;
  let pecas = 0;
  let servicos = 0;
  for (const l of doc.linhas) {
    if (l.recusada) continue;
    const v = totalDaLinha(l);
    if (v <= 0) continue;
    if (l.tipo === 'servico' && l.servico && incluidos.has(l.servico)) maoDeObraIncluida += v;
    else if (l.tipo === 'peca') pecas += v;
    else if (l.tipo === 'servico') servicos += v;
  }
  const dPecas = r2((pecas * Math.max(0, Math.min(100, plano.descontoPecas))) / 100);
  const dServicos = r2((servicos * Math.max(0, Math.min(100, plano.descontoServicos))) / 100);
  const subtotal = totais({ linhas: doc.linhas, desconto: 0 }).subtotal;
  const total = Math.min(Math.max(0, subtotal), r2(maoDeObraIncluida + dPecas + dServicos));
  return { incluidos: r2(maoDeObraIncluida), pecas: dPecas, servicos: dServicos, total };
}

// ---------------------------------------------------------------- cartão do membro (link público)

export const esquemaDadosDoCartao = z.object({
  cliente: z.string().max(80).default(''),
  oficina: z.string().max(120).default(''),
  carro: z.object({ modelo: z.string().max(80).default(''), placa: z.string().max(10).default('') }).nullish().transform((v) => v ?? null),
  plano: z.object({
    nome: z.string().max(80),
    preco: z.number().min(0),
    descricao: z.string().max(400).default(''),
    descontoPecas: z.number().min(0).max(100).default(0),
    descontoServicos: z.number().min(0).max(100).default(0)
  }),
  beneficios: z.array(z.object({ nome: z.string().max(80), quantidadePorAno: z.number().int().min(0), restantes: z.number().int().min(0) })).max(30).default([]),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  situacao: z.enum(['ativo', 'pausado', 'cancelado']),
  pagoAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform((v) => v ?? null),
  aberta: z
    .object({
      competencia: z.string().regex(/^\d{4}-\d{2}$/),
      valor: z.number().positive(),
      vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      pix: z.string().min(20).max(600)
    })
    .nullish()
    .transform((v) => v ?? null),
  /** A oficina conferiu e o Pix ainda não tinha caído (o cliente pode avisar de novo). */
  naoCaiuEm: z.string().max(40).nullish().transform((v) => v ?? null)
});
export type DadosDoCartao = z.infer<typeof esquemaDadosDoCartao>;

export function lerDadosDoCartao(v: unknown): DadosDoCartao | null {
  const r = esquemaDadosDoCartao.safeParse(v);
  return r.success ? r.data : null;
}

/** O txid do Pix da mensalidade: 'CL' + mês + parte do id do membro. */
export function txidDaMensalidade(c: Pick<ClubeCobranca, 'membroId' | 'competencia'>): string {
  return `CL${c.competencia.replace('-', '')}${c.membroId.replace(/[^0-9A-Za-z]/g, '').slice(0, 15)}`.toUpperCase().slice(0, 25);
}

export function pixDaMensalidade(recebedor: RecebedorPix, c: Pick<ClubeCobranca, 'membroId' | 'competencia' | 'valor'>, plano: Pick<ClubePlano, 'nome'>): string {
  return pixDaCobranca(recebedor, c.valor, txidDaMensalidade(c), `Clube ${plano.nome} ${c.competencia}`);
}

/** O que o cartão do membro mostra (vai nos dados do link 'clube'). */
export function dadosDoCartao(ctx: {
  membro: ClubeMembro;
  plano: ClubePlano;
  cliente: string;
  oficina: string;
  veiculo?: Pick<Veiculo, 'modelo' | 'placa'> | null;
  cobrancas: ClubeCobranca[];
  recebedor: RecebedorPix | null;
  hoje: string;
}): DadosDoCartao {
  const { membro, plano } = ctx;
  const aberta = mensalidadeEmAberto(membro.id, ctx.cobrancas);
  return {
    cliente: primeiroNome(ctx.cliente).slice(0, 80),
    oficina: ctx.oficina.trim().slice(0, 120),
    carro: ctx.veiculo ? { modelo: (ctx.veiculo.modelo ?? '').slice(0, 80), placa: formatarPlaca(ctx.veiculo.placa ?? '').slice(0, 10) } : null,
    plano: {
      nome: plano.nome.slice(0, 80),
      preco: r2(plano.preco),
      descricao: (plano.descricao ?? '').slice(0, 400),
      descontoPecas: plano.descontoPecas,
      descontoServicos: plano.descontoServicos
    },
    beneficios: beneficiosDoMembro(membro, plano, ctx.hoje).map((b) => ({ nome: b.nome.slice(0, 80), quantidadePorAno: b.quantidadePorAno, restantes: b.restantes })),
    desde: membro.inicio,
    anoAte: anoDoClube(membro, ctx.hoje).fim,
    situacao: membro.situacao,
    pagoAte: pagoAte(membro, ctx.cobrancas),
    aberta:
      aberta && ctx.recebedor && membro.situacao === 'ativo'
        ? { competencia: aberta.competencia, valor: aberta.valor, vencimento: aberta.vencimento, pix: pixDaMensalidade(ctx.recebedor, aberta, plano) }
        : null,
    naoCaiuEm: null
  };
}

// ---------------------------------------------------------------- mensagens

export function mensagemDoCartao(ctx: { oficina: string; cliente: string; plano: string; link: string }): string {
  const nome = primeiroNome(ctx.cliente);
  return [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`,
    `Este é o seu cartão do clube ${ctx.plano}: os serviços incluídos, os descontos e a mensalidade do mês. Guarde o link: ${ctx.link}`
  ].join('\n');
}

export function mensagemDaMensalidade(ctx: { oficina: string; cliente: string; plano: string; competencia: string; valor: number; vencimento: string; link: string | null; pix: string }): string {
  const nome = primeiroNome(ctx.cliente);
  const [a, m, d] = ctx.vencimento.split('-');
  const partes = [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`,
    `A mensalidade de ${nomeDaCompetencia(ctx.competencia)} do clube ${ctx.plano} é de ${formatarMoeda(ctx.valor)} e vence em ${d}/${m}/${a}.`
  ];
  if (ctx.link) partes.push(`Para pagar, abra o link: ${ctx.link}`, 'Depois de pagar, toque em "Já paguei" na página.');
  partes.push('Pix copia e cola (copie a linha abaixo e cole no app do seu banco):', ctx.pix);
  return partes.join('\n');
}

export function mensagemDeLembrete(ctx: { oficina: string; cliente: string; plano: string; competencia: string; valor: number; link: string | null; pix: string }): string {
  const nome = primeiroNome(ctx.cliente);
  const partes = [
    `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`,
    `Passando para lembrar da mensalidade de ${nomeDaCompetencia(ctx.competencia)} do clube ${ctx.plano}, de ${formatarMoeda(ctx.valor)}, que ainda está em aberto. Se já pagou, desconsidere.`
  ];
  if (ctx.link) partes.push(`Link para pagar: ${ctx.link}`);
  partes.push('Pix copia e cola:', ctx.pix);
  return partes.join('\n');
}
