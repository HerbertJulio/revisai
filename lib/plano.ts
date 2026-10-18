// Planos da oficina. O grátis tem limite de avisos e de ordens por voz no mês; o Pro libera tudo.
// O plano fica na conta da oficina (o banco confere em cada uso da IA): o teste de 30 dias começa
// com um toque e o Pro pago entra pela assinatura ou pelo código que a equipe manda.

import { dataLocal, diasEntre, somarDias } from './datas';
import type { Contato, Id } from './tipos';

export const PRO = {
  preco: 39.9,
  precoFundador: 29.9,
  vagasFundador: 100,
  diasTeste: 30,
  avisosGratis: 20,
  ordensGratis: 5,
  /** Uso justo: ninguém da oficina dita mais que isso num mês. */
  ordensPro: 300,
  /** Áudios que viram texto no mês (cada gravação conta uma). */
  transcricoesGratis: 30,
  transcricoesPro: 1500
} as const;

/** O plano como a conta traz (minha_conta). */
export interface PlanoDaConta {
  plano: TipoPlano;
  proAte: string | null;
  testeAte: string | null;
}

/** O plano de hoje pelo que está na conta da oficina. */
export function planoDaConta(o: PlanoDaConta, hoje: string): PlanoAtual {
  if (o.proAte && o.proAte >= hoje) return { tipo: 'pro', ate: o.proAte, diasRestantes: diasEntre(hoje, o.proAte), podeTestar: false };
  if (o.testeAte && o.testeAte >= hoje) return { tipo: 'teste', ate: o.testeAte, diasRestantes: diasEntre(hoje, o.testeAte), podeTestar: false };
  return { tipo: 'gratis', ate: null, diasRestantes: null, podeTestar: !o.testeAte };
}

/**
 * Beta: enquanto o Revisaí está em demonstração, o Pro fica liberado para todo mundo — com conta
 * ou só no aparelho, sem precisar entrar nem pagar. Deixe `false` para voltar aos planos normais.
 */
export const BETA_PRO = true;

/** O plano que o beta entrega: Pro, válido por muito tempo e sem oferta de teste. */
export function planoBeta(hoje: string): PlanoAtual {
  const ate = somarDias(hoje, 3650);
  return { tipo: 'pro', ate, diasRestantes: diasEntre(hoje, ate), podeTestar: false };
}

/** O uso do mês que o banco devolve (uso_do_mes). */
export interface UsoDoMes {
  plano: TipoPlano;
  mes: string;
  montagem: { usado: number; limite: number };
  transcricao: { usado: number; limite: number };
}

export function lerUsoDoMes(v: unknown): UsoDoMes | null {
  const o = v as Partial<UsoDoMes> | null;
  if (!o || typeof o !== 'object' || !o.montagem || !o.transcricao) return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const plano = o.plano === 'pro' || o.plano === 'teste' ? o.plano : 'gratis';
  return {
    plano,
    mes: typeof o.mes === 'string' ? o.mes : '',
    montagem: { usado: n(o.montagem.usado), limite: n(o.montagem.limite) },
    transcricao: { usado: n(o.transcricao.usado), limite: n(o.transcricao.limite) }
  };
}

/** O que vem no erro RV040 do banco (o plano e o limite que acabou). */
export interface InfoCota {
  plano?: string;
  limite?: number;
}

export function mensagemDaCota(recurso: 'montagem' | 'transcricao', info: InfoCota | null): string {
  const pro = info?.plano === 'pro' || info?.plano === 'teste';
  const limite = info?.limite ?? (recurso === 'montagem' ? (pro ? PRO.ordensPro : PRO.ordensGratis) : pro ? PRO.transcricoesPro : PRO.transcricoesGratis);
  if (recurso === 'montagem')
    return pro
      ? `A oficina chegou a ${limite} ordens por voz neste mês, o uso justo do Pro. Fale com a equipe do Revisaí para liberar mais.`
      : `As ${limite} ordens por voz do plano grátis acabaram neste mês. Com o Pro, são ${PRO.ordensPro} por mês.`;
  return pro
    ? `A oficina chegou a ${limite} áudios transcritos neste mês, o uso justo do Pro. Fale com a equipe do Revisaí para liberar mais.`
    : `Os ${limite} áudios do plano grátis acabaram neste mês. Escreva o que foi feito, ou teste o Pro.`;
}

export interface EstadoPlano {
  /** Quando começou o teste do Pro (só um por aparelho). */
  testeDesde: string | null;
  /** Até quando vale o Pro pago (código ativado). */
  proAte: string | null;
  codigo: string | null;
  /** Quantas vezes a IA montou uma ordem no mês ('AAAA-MM'). */
  montagens: { mes: string; n: number } | null;
}

export const PLANO_INICIAL: EstadoPlano = { testeDesde: null, proAte: null, codigo: null, montagens: null };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function dia(v: unknown): string | null {
  return typeof v === 'string' && DIA.test(v) ? v : null;
}

/**
 * Plano depois de restaurar um backup: o Pro que vale por mais tempo continua e o teste conta
 * desde o começo mais antigo (restaurar um backup não reinicia o teste).
 */
export function juntarPlanos(atual: EstadoPlano | undefined, vindo: unknown): EstadoPlano {
  const a = atual ?? PLANO_INICIAL;
  const v = (vindo && typeof vindo === 'object' ? vindo : {}) as Record<string, unknown>;
  const testes = [a.testeDesde, dia(v.testeDesde)].filter((x): x is string => !!x).sort();
  const proVindo = dia(v.proAte);
  const codigoVindo = typeof v.codigo === 'string' && /^[0-9A-Z]{16}$/.test(v.codigo) ? v.codigo : null;
  const usarVindo = !!proVindo && (!a.proAte || proVindo > a.proAte);
  return {
    testeDesde: testes[0] ?? null,
    proAte: usarVindo ? proVindo : a.proAte,
    codigo: usarVindo ? codigoVindo : a.codigo,
    montagens: a.montagens ?? null
  };
}

export type TipoPlano = 'pro' | 'teste' | 'gratis';

export interface PlanoAtual {
  tipo: TipoPlano;
  ate: string | null;
  diasRestantes: number | null;
  /** Ainda pode começar o teste. */
  podeTestar: boolean;
}

export function planoAtual(p: EstadoPlano | undefined, hoje: string): PlanoAtual {
  const e = p ?? PLANO_INICIAL;
  if (e.proAte && e.proAte >= hoje) return { tipo: 'pro', ate: e.proAte, diasRestantes: diasEntre(hoje, e.proAte), podeTestar: false };
  if (e.testeDesde) {
    const fim = somarDias(e.testeDesde, PRO.diasTeste - 1);
    if (fim >= hoje) return { tipo: 'teste', ate: fim, diasRestantes: diasEntre(hoje, fim), podeTestar: false };
  }
  return { tipo: 'gratis', ate: null, diasRestantes: null, podeTestar: !e.testeDesde };
}

export function liberado(p: PlanoAtual): boolean {
  return p.tipo !== 'gratis';
}

/** O mês de um instante no fuso do aparelho ('AAAA-MM'). */
function mesDe(instante: string): string {
  return dataLocal(instante).slice(0, 7);
}

/**
 * Avisos mandados no mês: cada toque no WhatsApp registra um contato por item do carro,
 * todos com o mesmo instante; conta uma vez por carro e instante.
 */
export function avisosNoMes(contatos: Pick<Contato, 'veiculoId' | 'quando' | 'resultado'>[], hoje: string): number {
  const mes = hoje.slice(0, 7);
  const vistos = new Set<string>();
  for (const c of contatos) if (c.resultado === 'avisado' && mesDe(c.quando) === mes) vistos.add(`${c.veiculoId}|${c.quando}`);
  return vistos.size;
}

/** Ordens que a IA montou no mês de hoje. */
export function montagensNoMes(e: EstadoPlano | undefined, hoje: string): number {
  const m = e?.montagens;
  return m && m.mes === hoje.slice(0, 7) ? m.n : 0;
}

export function contarMontagem(e: EstadoPlano, hoje: string): EstadoPlano {
  const mes = hoje.slice(0, 7);
  return { ...e, montagens: { mes, n: montagensNoMes(e, hoje) + 1 } };
}

export function podeAvisar(p: PlanoAtual, usados: number): boolean {
  return liberado(p) || usados < PRO.avisosGratis;
}

export function podeDitar(p: PlanoAtual, usadas: number): boolean {
  return usadas < (liberado(p) ? PRO.ordensPro : PRO.ordensGratis);
}

/** Código do Pro como a equipe manda: 16 letras e números, em grupos de 4. */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatarCodigo(codigo: string): string {
  return normalizarCodigo(codigo).replace(/(.{4})(?=.)/g, '$1-');
}

export interface RetornoDosAvisos {
  avisados: number;
  voltaram: number;
  valor: number;
}

/**
 * Dos carros avisados nos últimos `dias` dias, quantos voltaram para fazer serviço depois do aviso
 * (até 60 dias depois) e quanto esses serviços somaram.
 */
export function retornoDosAvisos(
  contatos: Pick<Contato, 'veiculoId' | 'quando' | 'resultado'>[],
  atendimentos: { veiculoId: Id; data: string; valor?: number | null }[],
  hoje: string,
  dias = 90
): RetornoDosAvisos {
  const desde = somarDias(hoje, -dias);
  const primeiroAviso = new Map<Id, string>();
  for (const c of contatos) {
    if (c.resultado !== 'avisado') continue;
    const dia = dataLocal(c.quando);
    if (dia < desde) continue;
    const atual = primeiroAviso.get(c.veiculoId);
    if (!atual || dia < atual) primeiroAviso.set(c.veiculoId, dia);
  }
  let voltaram = 0;
  let valor = 0;
  for (const [veiculoId, dia] of primeiroAviso) {
    const limite = somarDias(dia, 60);
    const depois = atendimentos.filter((a) => a.veiculoId === veiculoId && a.data >= dia && a.data <= limite);
    if (depois.length) {
      voltaram++;
      valor += depois.reduce((s, a) => s + (a.valor ?? 0), 0);
    }
  }
  return { avisados: primeiroAviso.size, voltaram, valor: Math.round(valor * 100) / 100 };
}
