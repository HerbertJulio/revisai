// Programa de pontos da oficina: o cliente ganha pontos em cada ordem de serviço concluída e usa
// os pontos como desconto numa próxima. Os pontos são os movimentos da coleção `fidelidade`
// (ganho, resgate, ajuste) e o saldo é a soma. Cada documento tem no máximo um ganho e um
// resgate, com id fixo: dois aparelhos fazendo a mesma coisa não contam duas vezes.

import { totais } from './documentos';
import { formatarMoeda, formatarNumero, primeiroNome } from './formatos';
import type { MovimentoFidelidade, NovoItemExtra } from './registros-oficina';
import type { Cliente, Documento, Id, Preferencias } from './tipos';

export type ConfigFidelidade = NonNullable<Preferencias['fidelidade']>;

/** Um ponto por real gasto; 100 pontos valem R$ 5,00 (5% de volta); usa a partir de 100 pontos. */
export const FIDELIDADE_PADRAO: ConfigFidelidade = { ativo: false, pontosPorReal: 1, reaisPorPonto: 0.05, minimoResgate: 100 };

const r2 = (n: number) => Math.round(n * 100) / 100;

function positivo(v: unknown, padrao: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/** A configuração com os padrões no que faltar (as preferências antigas não têm a fidelidade). */
export function configDaFidelidade(p?: Partial<ConfigFidelidade> | null): ConfigFidelidade {
  const c = { ...FIDELIDADE_PADRAO, ...(p ?? {}) };
  return {
    ativo: !!c.ativo,
    pontosPorReal: positivo(c.pontosPorReal, FIDELIDADE_PADRAO.pontosPorReal),
    reaisPorPonto: positivo(c.reaisPorPonto, FIDELIDADE_PADRAO.reaisPorPonto),
    minimoResgate: Math.max(0, Math.round(Number(c.minimoResgate) || 0))
  };
}

/** O que está errado na configuração digitada (null quando está certa). */
export function erroDaConfig(c: { pontosPorReal: number | null; reaisPorPonto: number | null; minimoResgate: number | null }): string | null {
  if (c.pontosPorReal == null || !(c.pontosPorReal > 0) || c.pontosPorReal > 100) return 'Os pontos por real vão de 0,01 a 100.';
  if (c.reaisPorPonto == null || !(c.reaisPorPonto > 0) || c.reaisPorPonto > 100) return 'O valor de cada ponto vai de R$ 0,01 a R$ 100,00.';
  if (c.minimoResgate == null || c.minimoResgate < 0 || !Number.isInteger(c.minimoResgate)) return 'O mínimo para usar é um número inteiro de pontos.';
  // devolver mais do que o cliente gastou não fecha a conta
  if (c.pontosPorReal * c.reaisPorPonto > 0.5) return 'Assim a oficina devolveria mais da metade do que o cliente gasta. Diminua os pontos por real ou o valor do ponto.';
  return null;
}

export function pontosDoValor(valor: number, c: Pick<ConfigFidelidade, 'pontosPorReal'>): number {
  return valor > 0 ? Math.floor(r2(valor * c.pontosPorReal) + 1e-9) : 0;
}

export function valorDosPontos(pontos: number, c: Pick<ConfigFidelidade, 'reaisPorPonto'>): number {
  return r2(Math.max(0, pontos) * c.reaisPorPonto);
}

/** Quanto do que o cliente gasta volta em desconto (0,05 = 5%). */
export function percentualDeVolta(c: Pick<ConfigFidelidade, 'pontosPorReal' | 'reaisPorPonto'>): number {
  return c.pontosPorReal * c.reaisPorPonto;
}

/** "Cada R$ 1,00 gasto vale 1 ponto. 100 pontos valem R$ 5,00 de desconto. Dá para usar a partir de 100 pontos." */
export function textoDaRegra(c: ConfigFidelidade): string {
  const porReal = c.pontosPorReal === 1 ? 'Cada R$ 1,00 gasto vale 1 ponto.' : `Cada R$ 1,00 gasto vale ${formatarNumero(c.pontosPorReal, 2)} ${c.pontosPorReal === 1 ? 'ponto' : 'pontos'}.`;
  const cem = `100 pontos valem ${formatarMoeda(valorDosPontos(100, c))} de desconto.`;
  const minimo = c.minimoResgate > 0 ? ` Dá para usar a partir de ${formatarNumero(c.minimoResgate)} pontos.` : '';
  return `${porReal} ${cem}${minimo}`;
}

export function idDoGanho(documentoId: Id): Id {
  return `fid-ganho-${documentoId}`;
}

export function idDoResgate(documentoId: Id): Id {
  return `fid-resgate-${documentoId}`;
}

type Docs = Record<Id, Pick<Documento, 'situacao'>>;

/** O movimento conta no saldo? O resgate numa ordem cancelada devolve os pontos. */
export function movimentoConta(m: Pick<MovimentoFidelidade, 'tipo' | 'documentoId'>, documentos: Docs): boolean {
  if (m.tipo !== 'resgate' || !m.documentoId) return true;
  return documentos[m.documentoId]?.situacao !== 'cancelada';
}

export interface SaldoCliente {
  clienteId: Id;
  saldo: number;
  /** Pontos ganhos nas ordens (sem os ajustes). */
  ganhos: number;
  /** Pontos usados em descontos. */
  usados: number;
  /** A data do último movimento. */
  ultimo: string | null;
}

export function saldosPorCliente(movimentos: Iterable<MovimentoFidelidade>, documentos: Docs): Map<Id, SaldoCliente> {
  const r = new Map<Id, SaldoCliente>();
  for (const m of movimentos) {
    if (!m.clienteId || !Number.isFinite(m.pontos) || !movimentoConta(m, documentos)) continue;
    const s = r.get(m.clienteId) ?? { clienteId: m.clienteId, saldo: 0, ganhos: 0, usados: 0, ultimo: null };
    s.saldo += m.pontos;
    if (m.tipo === 'ganho') s.ganhos += m.pontos;
    if (m.tipo === 'resgate') s.usados += -m.pontos;
    if (!s.ultimo || m.data > s.ultimo) s.ultimo = m.data;
    r.set(m.clienteId, s);
  }
  for (const s of r.values()) s.saldo = Math.max(0, Math.round(s.saldo));
  return r;
}

export function saldoDoCliente(movimentos: Iterable<MovimentoFidelidade>, clienteId: Id, documentos: Docs): number {
  return saldosPorCliente([...movimentos].filter((m) => m.clienteId === clienteId), documentos).get(clienteId)?.saldo ?? 0;
}

/** Os movimentos de um cliente, do mais novo para o mais velho. */
export function historicoDoCliente(movimentos: Iterable<MovimentoFidelidade>, clienteId: Id): MovimentoFidelidade[] {
  return [...movimentos].filter((m) => m.clienteId === clienteId).sort((a, b) => (a.data === b.data ? (a.criadoEm < b.criadoEm ? 1 : -1) : a.data < b.data ? 1 : -1));
}

/** Os pontos que a ordem concluída dá ao cliente (null quando não dá nenhum). */
export function ganhoDaOrdem(doc: Documento, clienteId: Id, c: ConfigFidelidade, hoje: string): NovoItemExtra<'fidelidade'> | null {
  if (!c.ativo || doc.tipo !== 'ordem' || doc.situacao !== 'concluida') return null;
  const pontos = pontosDoValor(totais(doc).total, c);
  if (pontos <= 0) return null;
  return { id: idDoGanho(doc.id), clienteId, tipo: 'ganho', pontos, documentoId: doc.id, descricao: `OS nº ${doc.numero}`, valor: null, data: hoje };
}

/** O resgate que já está no documento (para trocar ou desfazer). */
export function resgateDoDocumento(movimentos: Record<Id, MovimentoFidelidade>, documentoId: Id): MovimentoFidelidade | null {
  return movimentos[idDoResgate(documentoId)] ?? null;
}

export interface LimiteDoResgate {
  maxPontos: number;
  maxValor: number;
  /** Por que não dá para usar agora (null quando dá). */
  motivo: string | null;
}

/**
 * Quantos pontos o cliente pode usar neste documento: o saldo (mais o que já usou nele, que volta
 * se trocar), até o total do documento sem esse desconto, e só a partir do mínimo.
 */
export function limiteDoResgate(saldo: number, doc: Pick<Documento, 'linhas' | 'desconto'>, anterior: Pick<MovimentoFidelidade, 'pontos' | 'valor'> | null, c: ConfigFidelidade): LimiteDoResgate & { totalSemResgate: number; disponivel: number } {
  const usadoAqui = anterior ? Math.max(0, -anterior.pontos) : 0;
  const disponivel = saldo + usadoAqui;
  const totalSemResgate = totais({ linhas: doc.linhas, desconto: Math.max(0, (doc.desconto ?? 0) - (anterior?.valor ?? 0)) }).total;
  const base = { totalSemResgate, disponivel };
  if (!c.ativo) return { ...base, maxPontos: 0, maxValor: 0, motivo: 'O programa de pontos está desligado.' };
  if (disponivel < Math.max(1, c.minimoResgate)) return { ...base, maxPontos: 0, maxValor: 0, motivo: `Dá para usar a partir de ${formatarNumero(Math.max(1, c.minimoResgate))} pontos.` };
  const peloTotal = Math.floor(totalSemResgate / c.reaisPorPonto + 1e-9);
  const maxPontos = Math.max(0, Math.min(disponivel, peloTotal));
  if (maxPontos <= 0) return { ...base, maxPontos: 0, maxValor: 0, motivo: 'O documento ainda não tem valor para descontar.' };
  return { ...base, maxPontos, maxValor: valorDosPontos(maxPontos, c), motivo: null };
}

/** O resgate de `pontos` no documento e o desconto que o documento fica tendo. */
export function resgateNoDocumento(
  doc: Pick<Documento, 'id' | 'numero' | 'tipo' | 'desconto'>,
  clienteId: Id,
  pontos: number,
  anterior: Pick<MovimentoFidelidade, 'valor'> | null,
  c: ConfigFidelidade,
  hoje: string
): { movimento: NovoItemExtra<'fidelidade'>; desconto: number } {
  const n = Math.max(0, Math.floor(pontos));
  const valor = valorDosPontos(n, c);
  const desconto = r2(Math.max(0, (doc.desconto ?? 0) - (anterior?.valor ?? 0)) + valor);
  return {
    movimento: { id: idDoResgate(doc.id), clienteId, tipo: 'resgate', pontos: -n, documentoId: doc.id, descricao: `Desconto na ${doc.tipo === 'ordem' ? 'OS' : 'orçamento'} nº ${doc.numero}`, valor, data: hoje },
    desconto
  };
}

/** O desconto do documento depois de desfazer o resgate. */
export function descontoSemResgate(doc: Pick<Documento, 'desconto'>, anterior: Pick<MovimentoFidelidade, 'valor'>): number | null {
  const d = r2(Math.max(0, (doc.desconto ?? 0) - (anterior.valor ?? 0)));
  return d > 0 ? d : null;
}

/** Os clientes com pontos, do maior saldo para o menor (empate: quem mais ganhou). */
export function ranking(saldos: Map<Id, SaldoCliente>, clientes: Record<Id, Cliente>): (SaldoCliente & { cliente: Cliente })[] {
  return [...saldos.values()]
    .filter((s) => clientes[s.clienteId] && (s.saldo > 0 || s.ganhos > 0))
    .map((s) => ({ ...s, cliente: clientes[s.clienteId] }))
    .sort((a, b) => b.saldo - a.saldo || b.ganhos - a.ganhos || a.cliente.nome.localeCompare(b.cliente.nome, 'pt-BR'));
}

/** A mensagem do WhatsApp com o saldo do cliente. */
export function mensagemDoSaldo(ctx: { cliente: string; oficina: string; saldo: number; config: ConfigFidelidade }): string {
  const nome = primeiroNome(ctx.cliente);
  const valor = valorDosPontos(ctx.saldo, ctx.config);
  const oi = `Oi${nome ? `, ${nome}` : ''}! Aqui é da ${ctx.oficina.trim() || 'oficina'}.`;
  const saldo = `Você tem ${formatarNumero(ctx.saldo)} ${ctx.saldo === 1 ? 'ponto' : 'pontos'} no nosso programa de fidelidade, que ${ctx.saldo === 1 ? 'vale' : 'valem'} ${formatarMoeda(valor)} de desconto no próximo serviço.`;
  const falta = ctx.config.minimoResgate - ctx.saldo;
  const fim = falta > 0 ? ` Juntando ${formatarNumero(ctx.config.minimoResgate)} pontos, já dá para usar.` : ' É só pedir na hora de fechar a conta.';
  return `${oi} ${saldo}${fim}`;
}
