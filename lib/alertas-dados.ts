// Alerta de preço: a oficina pede um produto por um preço às lojas do estado dela; cada loja aceita,
// faz uma contraproposta (outro preço, outra quantidade mínima) ou diz que não dá, e a oficina escolhe.
// O pedido sai com o preço combinado (o banco confere a resposta). Aqui ficam as regras e os formatos,
// sem servidor, para dar para testar e usar nas telas.

import { z } from 'zod';
import { litrosPorUnidade, type Unidade } from './catalogo';
import { formatarMoeda, plural } from './formatos';
import type { Categoria } from './tipos';

export const ALERTAS = {
  /** Alertas por mês no Pro. */
  porMesPro: 10,
  /** Sem o código do Pro (no teste de 30 dias): alertas a cada 30 dias por aparelho e WhatsApp. */
  amostra: 3,
  /** Alertas esperando resposta ao mesmo tempo. */
  abertosMax: 5,
  /** Horas que as lojas têm para responder. */
  horasParaResponder: 48,
  /** Horas a mais para a oficina escolher depois que o prazo das lojas acaba. */
  horasParaEscolher: 24
} as const;

/** Pacotes de alertas extras (valem enquanto o Pro valer, sem prazo para usar). */
export const PACOTES_ALERTAS = [
  { quantidade: 10, preco: 9.9 },
  { quantidade: 30, preco: 24.9 }
] as const;

export type SituacaoAlerta = 'aberto' | 'fechado' | 'cancelado';
export type TipoResposta = 'aceita' | 'contraproposta' | 'recusa';
export type SituacaoResposta = 'enviada' | 'escolhida' | 'descartada';

const HORA = 3_600_000;

/** Até quando a oficina pode escolher uma resposta. */
export function escolherAte(expiraEm: string): number {
  return Date.parse(expiraEm) + ALERTAS.horasParaEscolher * HORA;
}

/** Em que pé está o alerta, como a oficina vê. */
export type FaseAlerta = 'esperando' | 'escolher' | 'fechado' | 'cancelado' | 'vencido';

export function faseDoAlerta(a: { status: SituacaoAlerta; expiraEm: string }, propostas: number, agora: number): FaseAlerta {
  if (a.status === 'fechado') return 'fechado';
  if (a.status === 'cancelado') return 'cancelado';
  if (agora >= escolherAte(a.expiraEm)) return 'vencido';
  if (agora >= Date.parse(a.expiraEm)) return propostas ? 'escolher' : 'vencido';
  return 'esperando';
}

export interface AlertaParaContar {
  status: SituacaoAlerta;
  expiraEm: string;
  criadoEm: string;
  usouCredito: boolean;
  /** Respostas com preço (aceita ou contraproposta). */
  propostas: number;
}

/**
 * O alerta gasta da cota se fechou negócio, se alguma loja mandou proposta ou se ainda está esperando
 * resposta. Cancelado ou vencido sem nenhuma proposta não conta: a oficina não paga por alerta vazio.
 */
export function alertaConta(a: AlertaParaContar, agora: number): boolean {
  if (a.status === 'fechado' || a.propostas > 0) return true;
  if (a.status === 'cancelado') return false;
  return Date.parse(a.expiraEm) > agora;
}

/** O mês de um instante em Brasília ('AAAA-MM'). */
export function mesEmBrasilia(instante: string | number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date(instante)).slice(0, 7);
}

export interface CotaAlertas {
  tipo: 'pro' | 'amostra';
  /** Alertas do mês (Pro) ou dos últimos 30 dias (sem código). */
  limite: number;
  usados: number;
  /** Alertas de pacotes comprados que ainda dá para usar. */
  extras: number;
  restantes: number;
  /** O próximo alerta sai de um pacote comprado. */
  proximoUsaCredito: boolean;
}

/**
 * A cota do Pro: os alertas do mês (sem contar os que saíram de pacote) e o que sobrou dos pacotes.
 * `creditos` é a soma dos pacotes liberados para o código.
 */
export function cotaPro(alertas: AlertaParaContar[], creditos: number, agora: number): CotaAlertas {
  const mes = mesEmBrasilia(agora);
  const contam = alertas.filter((a) => alertaConta(a, agora));
  const usados = contam.filter((a) => !a.usouCredito && mesEmBrasilia(a.criadoEm) === mes).length;
  const gastosDePacote = contam.filter((a) => a.usouCredito).length;
  const extras = Math.max(0, creditos - gastosDePacote);
  const doMes = Math.max(0, ALERTAS.porMesPro - usados);
  return { tipo: 'pro', limite: ALERTAS.porMesPro, usados, extras, restantes: doMes + extras, proximoUsaCredito: doMes === 0 && extras > 0 };
}

/** Sem código do Pro: alguns alertas a cada 30 dias, para conhecer. */
export function cotaAmostra(alertas: AlertaParaContar[], agora: number): CotaAlertas {
  const desde = agora - 30 * 24 * HORA;
  const usados = alertas.filter((a) => Date.parse(a.criadoEm) >= desde && alertaConta(a, agora)).length;
  return { tipo: 'amostra', limite: ALERTAS.amostra, usados, extras: 0, restantes: Math.max(0, ALERTAS.amostra - usados), proximoUsaCredito: false };
}

/** A cota depois de mandar um alerta. */
export function depoisDeGastar(c: CotaAlertas): CotaAlertas {
  if (c.tipo === 'amostra') {
    const usados = c.usados + 1;
    return { ...c, usados, restantes: Math.max(0, c.limite - usados) };
  }
  const usouPacote = c.proximoUsaCredito;
  const usados = usouPacote ? c.usados : c.usados + 1;
  const extras = Math.max(0, usouPacote ? c.extras - 1 : c.extras);
  const doMes = Math.max(0, c.limite - usados);
  return { ...c, usados, extras, restantes: doMes + extras, proximoUsaCredito: doMes === 0 && extras > 0 };
}

// ---------------------------------------------------------------- embalagem e preço

export interface Embalagem {
  categoria: Categoria;
  unidade: Unidade;
  conteudo: number | null;
}

/** Litros por embalagem (só no óleo), para comparar galão com frasco. */
export function litrosDa(e: Embalagem): number | null {
  return litrosPorUnidade(e);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * "Aceito o seu preço" com outro produto da loja: no óleo, o mesmo preço do litro (um galão de 4 L
 * pelo preço de 4 frascos de 1 L) e a quantidade que dá os mesmos litros; no resto, o mesmo preço e a
 * mesma quantidade.
 */
export function aceiteEquivalente(alerta: { quantidade: number; precoAlvo: number; litros: number | null }, produto: Embalagem): { preco: number; quantidadeMinima: number } {
  const litros = litrosDa(produto);
  if (alerta.litros && litros) {
    const porLitro = alerta.precoAlvo / alerta.litros;
    return { preco: r2(porLitro * litros), quantidadeMinima: Math.max(1, Math.ceil((alerta.quantidade * alerta.litros) / litros - 1e-9)) };
  }
  return { preco: r2(alerta.precoAlvo), quantidadeMinima: alerta.quantidade };
}

/**
 * A quantidade que a oficina pede ao fechar: a do alerta (em litros, no óleo), nunca abaixo do mínimo.
 * É também o máximo pelo preço combinado: a loja negociou essa quantidade, não um estoque inteiro.
 */
export function quantidadeParaFechar(alerta: { quantidade: number; litros: number | null }, resposta: { quantidadeMinima: number | null; produto: Embalagem | null }): number {
  const minimo = resposta.quantidadeMinima ?? 1;
  const litros = resposta.produto ? litrosDa(resposta.produto) : null;
  const pedida = alerta.litros && litros ? Math.ceil((alerta.quantidade * alerta.litros) / litros - 1e-9) : alerta.quantidade;
  return Math.min(999, Math.max(minimo, pedida));
}

/** De quanto a quanto a oficina pode pedir pelo preço combinado. */
export function faixaParaFechar(alerta: { quantidade: number; litros: number | null }, resposta: { quantidadeMinima: number | null; produto: Embalagem | null }): { minimo: number; maximo: number } {
  const minimo = Math.max(1, resposta.quantidadeMinima ?? 1);
  return { minimo, maximo: Math.max(minimo, quantidadeParaFechar(alerta, resposta)) };
}

/**
 * "Aceito o seu preço" só faz sentido com a mesma embalagem: óleo com óleo (pelo litro) ou a mesma
 * unidade (filtro com filtro, jogo com jogo). Com embalagens diferentes, a loja faz uma contraproposta.
 */
export function embalagemComparavel(alerta: { litros: number | null; especificacao: Record<string, unknown> }, produto: Embalagem): boolean {
  const litros = litrosDa(produto);
  if (alerta.litros || litros) return !!alerta.litros && !!litros;
  const unidade = typeof alerta.especificacao.unidade === 'string' ? alerta.especificacao.unidade : null;
  const conteudo = typeof alerta.especificacao.conteudo === 'number' ? alerta.especificacao.conteudo : null;
  return !unidade || (unidade === produto.unidade && (conteudo ?? null) === (produto.conteudo ?? null));
}

/** "R$ 24,00 cada" ou "R$ 30,00 o litro (R$ 120,00 o galão de 4 L)". */
export function textoDoPreco(preco: number, e: Embalagem | null): string {
  const litros = e ? litrosDa(e) : null;
  if (litros && litros !== 1) return `${formatarMoeda(r2(preco / litros))} o litro (${formatarMoeda(preco)} a embalagem de ${String(litros).replace('.', ',')} L)`;
  if (litros === 1) return `${formatarMoeda(preco)} o litro`;
  return `${formatarMoeda(preco)} cada`;
}

/** A resposta em uma frase: "Aceitou: 5 por R$ 24,00 cada" / "Contraproposta: R$ 23,50 cada, a partir de 10". */
export function resumoDaResposta(r: { tipo: TipoResposta; preco: number | null; quantidadeMinima: number | null }, e: Embalagem | null): string {
  if (r.tipo === 'recusa' || r.preco == null) return 'Não tem esse preço agora';
  const preco = textoDoPreco(r.preco, e);
  const minimo = r.quantidadeMinima ?? 1;
  if (r.tipo === 'aceita') return `Aceitou: ${preco}${minimo > 1 ? `, levando ${minimo}` : ''}`;
  return `Contraproposta: ${preco}${minimo > 1 ? `, a partir de ${minimo}` : ''}`;
}

/** O que a oficina pediu, numa frase para a loja: "5 unidades por R$ 24,00 cada". */
export function textoDoPedidoDeAlerta(a: { quantidade: number; precoAlvo: number; litros: number | null }): string {
  if (a.litros) {
    const litros = a.quantidade * a.litros;
    return `${String(r2(litros)).replace('.', ',')} litros por ${formatarMoeda(r2(a.precoAlvo / a.litros))} o litro`;
  }
  return `${plural(a.quantidade, 'unidade', 'unidades')} por ${formatarMoeda(a.precoAlvo)} cada`;
}

// ---------------------------------------------------------------- o que a oficina vê

export interface ProdutoDaResposta extends Embalagem {
  id: number;
  nome: string;
  marca: string | null;
  imagemUrl: string | null;
}

export interface RespostaDoAlerta {
  id: string;
  fornecedorId: number;
  fornecedor: string;
  cidade: string | null;
  tipo: TipoResposta;
  produto: ProdutoDaResposta | null;
  preco: number | null;
  quantidadeMinima: number | null;
  prazoEntrega: string | null;
  mensagem: string | null;
  status: SituacaoResposta;
  criadoEm: string;
}

export interface AlertaDaOficina {
  id: string;
  titulo: string;
  categoria: Categoria;
  produtoId: number | null;
  quantidade: number;
  precoAlvo: number;
  precoPago: number | null;
  litros: number | null;
  mensagem: string | null;
  status: SituacaoAlerta;
  expiraEm: string;
  criadoEm: string;
  respostaEscolhida: string | null;
  /** O código do pedido que saiu do alerta. */
  pedido: string | null;
  respostas: RespostaDoAlerta[];
}

/** As propostas do alerta, da mais barata (pelo preço do litro, no óleo) para a mais cara. */
export function propostasEmOrdem(a: Pick<AlertaDaOficina, 'respostas'>): RespostaDoAlerta[] {
  const comparavel = (r: RespostaDoAlerta) => {
    const l = r.produto ? litrosDa(r.produto) : null;
    return r.preco == null ? Infinity : l ? r.preco / l : r.preco;
  };
  return a.respostas.filter((r) => r.tipo !== 'recusa' && r.preco != null).sort((x, y) => comparavel(x) - comparavel(y));
}

// ---------------------------------------------------------------- o que a loja vê

export interface RespostaDaLoja {
  id: string;
  tipo: TipoResposta;
  produtoId: number | null;
  preco: number | null;
  quantidadeMinima: number | null;
  prazoEntrega: string | null;
  mensagem: string | null;
  status: SituacaoResposta;
}

export type ResultadoParaLoja = 'aberto' | 'voce' | 'outra' | 'cancelado' | 'vencido';

export interface AlertaParaLoja {
  id: string;
  titulo: string;
  categoria: Categoria;
  chave: string | null;
  especificacao: Record<string, unknown>;
  quantidade: number;
  precoAlvo: number;
  litros: number | null;
  cidade: string | null;
  uf: string;
  mensagem: string | null;
  expiraEm: string;
  criadoEm: string;
  resultado: ResultadoParaLoja;
  minha: RespostaDaLoja | null;
  /** O pedido, quando a oficina fechou com esta loja. */
  pedido: string | null;
}

export function resultadoParaLoja(a: { status: SituacaoAlerta; expiraEm: string }, minha: { status: SituacaoResposta } | null, agora: number): ResultadoParaLoja {
  if (minha?.status === 'escolhida') return 'voce';
  if (a.status === 'fechado') return 'outra';
  if (a.status === 'cancelado') return 'cancelado';
  if (Date.parse(a.expiraEm) <= agora) return 'vencido';
  return 'aberto';
}

// ---------------------------------------------------------------- entradas

const uuid = z.uuid();
const preco = z.number().positive().max(100_000);

export const esquemaNovoAlerta = z.object({
  aparelhoId: uuid,
  codigoPro: z
    .string()
    .regex(/^[0-9A-Z]{16}$/)
    .nullable()
    .default(null),
  oficina: z.object({
    nome: z.string().trim().min(2, 'Escreva o nome da oficina em Ajustes.').max(120),
    whatsapp: z.string().trim().max(30),
    cidade: z.string().trim().max(80).optional().default(''),
    uf: z.string().trim().regex(/^[A-Z]{2}$/, 'Escolha o estado da oficina em Ajustes: o alerta vai para as lojas do seu estado.')
  }),
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().min(1, 'Quantas unidades você quer?').max(999),
  precoAlvo: preco,
  precoPago: preco.nullable().default(null),
  mensagem: z.string().trim().max(300).optional().default('')
});

export type NovoAlerta = z.infer<typeof esquemaNovoAlerta>;

const prazoEntrega = z.string().trim().max(60).optional().default('');
const mensagem = z.string().trim().max(300).optional().default('');

export const esquemaResposta = z.discriminatedUnion('tipo', [
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

export type EntradaResposta = z.infer<typeof esquemaResposta>;

export const esquemaFechar = z.object({
  aparelhoId: uuid,
  alertaId: uuid,
  respostaId: uuid,
  quantidade: z.number().int().min(1).max(999),
  /** A proposta que a oficina viu (produto, preço e mínimo): se a loja mudou depois, o pedido não sai. */
  precoEsperado: preco,
  produtoEsperado: z.number().int().positive(),
  minimoEsperado: z.number().int().min(1).max(999),
  oficina: z.object({
    nome: z.string().trim().min(2).max(120),
    whatsapp: z.string().trim().max(30),
    cidade: z.string().trim().max(80).optional().default(''),
    uf: z
      .string()
      .trim()
      .regex(/^([A-Z]{2})?$/)
      .optional()
      .default(''),
    endereco: z.string().trim().max(160).optional().default('')
  }),
  observacao: z.string().trim().max(500).optional().default('')
});

/** O pacote existe na lista (o navegador manda só a quantidade). */
export function pacoteValido(quantidade: number): (typeof PACOTES_ALERTAS)[number] | null {
  return PACOTES_ALERTAS.find((p) => p.quantidade === quantidade) ?? null;
}
