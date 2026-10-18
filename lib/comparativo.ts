// "Sua oficina contra a média": os números da oficina nos últimos 90 dias contra a faixa das
// oficinas com conta da mesma cidade (ou do estado), que o banco soma sem mostrar nenhuma oficina
// (comparativo_da_regiao). As contas daqui são as mesmas do banco, para comparar igual com igual.

import { z } from 'zod';
import { dataLocal, somarDias } from './datas';
import { totais, totalDaLinha } from './documentos';
import { formatarMoeda, formatarNumero } from './formatos';
import type { Documento } from './tipos';

export const DIAS_DO_COMPARATIVO = 90;

export type Metrica = 'ticket' | 'trocaOleo' | 'carrosMes' | 'aprovacao';

export const METRICAS: { id: Metrica; nome: string; explica: string }[] = [
  { id: 'ticket', nome: 'Ticket médio', explica: 'Quanto fica, em média, cada ordem de serviço concluída.' },
  { id: 'trocaOleo', nome: 'Troca de óleo', explica: 'O que a oficina cobra pela troca de óleo (óleo e mão de obra da troca).' },
  { id: 'carrosMes', nome: 'Carros por mês', explica: 'Carros diferentes atendidos por mês.' },
  { id: 'aprovacao', nome: 'Orçamentos aprovados', explica: 'De cada 100 orçamentos mostrados ao cliente, quantos ele aprovou.' }
];

export function formatarMetrica(m: Metrica, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (m === 'ticket' || m === 'trocaOleo') return formatarMoeda(v);
  if (m === 'aprovacao') return `${formatarNumero(v)}%`;
  return formatarNumero(v, v < 10 ? 1 : 0);
}

const faixa = z.object({ p25: z.number(), mediana: z.number(), p75: z.number(), oficinas: z.number() });
export type Faixa = z.infer<typeof faixa>;

const esquema = z.object({
  nivel: z.enum(['cidade', 'uf']),
  uf: z.string(),
  cidade: z.string().nullish().transform((v) => v ?? null),
  /** Quantas oficinas entraram na conta (arredondado para baixo, de 5 em 5). */
  oficinas: z.number(),
  dias: z.number(),
  ticket: faixa.nullish().transform((v) => v ?? null),
  trocaOleo: faixa.nullish().transform((v) => v ?? null),
  carrosMes: faixa.nullish().transform((v) => v ?? null),
  aprovacao: faixa.nullish().transform((v) => v ?? null)
});
export type Comparativo = z.infer<typeof esquema>;

/** O que o banco devolveu, conferido (null: ainda não há oficinas suficientes na região). */
export function lerComparativo(dados: unknown): Comparativo | null {
  if (dados == null) return null;
  const r = esquema.safeParse(dados);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- os números da oficina

export interface NumerosDaOficina {
  ticket: number | null;
  trocaOleo: number | null;
  carrosMes: number | null;
  aprovacao: number | null;
  /** Ordens concluídas na janela (para dizer quando ainda é cedo para comparar). */
  ordens: number;
  orcamentos: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Os mesmos números que o banco calcula para cada oficina, com os dados do aparelho. */
export function numerosDaOficina(documentos: Documento[], hoje: string, dias = DIAS_DO_COMPARATIVO): NumerosDaOficina {
  const desde = somarDias(hoje, -dias);
  const naJanela = (dia: string) => dia >= desde && dia <= hoje;
  const ordens = documentos.filter((d) => d.tipo === 'ordem' && d.situacao === 'concluida' && naJanela(d.concluidoEm ? dataLocal(d.concluidoEm) : d.data));
  const totaisOs = ordens.map((d) => totais(d).total);
  const oleo = ordens
    .map((d) => d.linhas.filter((l) => !l.recusada && l.servico === 'troca_oleo').reduce((s, l) => s + Math.round(totalDaLinha(l) * 100), 0) / 100)
    .filter((v) => v > 0);
  const orcamentos = documentos.filter((d) => d.tipo === 'orcamento' && ['enviado', 'aprovado', 'recusado'].includes(d.situacao) && naJanela(d.enviadoEm ? dataLocal(d.enviadoEm) : d.data));
  const aprovados = orcamentos.filter((d) => d.situacao === 'aprovado').length;
  const carros = new Set(ordens.map((d) => d.veiculoId).filter(Boolean)).size;
  return {
    ticket: totaisOs.length ? r2(totaisOs.reduce((s, v) => s + v, 0) / totaisOs.length) : null,
    trocaOleo: oleo.length ? r2(oleo.reduce((s, v) => s + v, 0) / oleo.length) : null,
    carrosMes: ordens.length ? Math.round((carros / (dias / 30)) * 10) / 10 : null,
    aprovacao: orcamentos.length ? Math.round((aprovados / orcamentos.length) * 100) : null,
    ordens: ordens.length,
    orcamentos: orcamentos.length
  };
}

// ---------------------------------------------------------------- onde a oficina fica

/** Abaixo do primeiro quarto, entre o primeiro quarto e o meio, entre o meio e o último quarto, acima. */
export type Posicao = 'abaixo' | 'baixo' | 'alto' | 'acima';

export function posicaoNaFaixa(valor: number, f: Pick<Faixa, 'p25' | 'mediana' | 'p75'>): Posicao {
  if (valor < f.p25) return 'abaixo';
  if (valor < f.mediana) return 'baixo';
  if (valor <= f.p75) return 'alto';
  return 'acima';
}

const ONDE: Record<Posicao, string> = {
  abaixo: 'Abaixo de 3 em cada 4 oficinas',
  baixo: 'Abaixo da metade das oficinas',
  alto: 'Acima da metade das oficinas',
  acima: 'Acima de 3 em cada 4 oficinas'
};

const DICA: Record<Metrica, Partial<Record<Posicao, string>>> = {
  ticket: {
    abaixo: 'Vale conferir se a mão de obra está sendo cobrada em todos os serviços e oferecer o que o carro já precisa.',
    acima: 'Os clientes gastam mais por visita aqui. Mostre o porquê: fotos, garantia e o orçamento detalhado.'
  },
  trocaOleo: {
    abaixo: 'Seu preço está entre os mais baixos. Dá para cobrar um pouco mais sem sair da média.',
    acima: 'Seu preço está entre os mais altos. Capriche no atendimento e mostre a marca do óleo.'
  },
  carrosMes: {
    abaixo: 'Os avisos de troca pelo WhatsApp trazem o cliente de volta na hora certa.',
    baixo: 'Os avisos de troca pelo WhatsApp trazem o cliente de volta na hora certa.'
  },
  aprovacao: {
    abaixo: 'Orçamento com fotos e itens separados (o cliente escolhe o que fazer) costuma ser mais aprovado.',
    baixo: 'Orçamento com fotos e itens separados (o cliente escolhe o que fazer) costuma ser mais aprovado.'
  }
};

export function textoDaPosicao(m: Metrica, valor: number | null | undefined, f: Faixa | null): { onde: string; dica: string | null; posicao: Posicao } | null {
  if (valor == null || !Number.isFinite(valor) || !f) return null;
  const posicao = posicaoNaFaixa(valor, f);
  return { onde: `${ONDE[posicao]} da região.`, dica: DICA[m][posicao] ?? null, posicao };
}

/** Onde o valor cai na régua de 0 a 100% (para o marcador): entre a metade do primeiro quarto e um pouco depois do último. */
export function marcadorNaRegua(valor: number, f: Pick<Faixa, 'p25' | 'mediana' | 'p75'>): { inicio: number; fim: number; meio: number; ponto: number } {
  const largura = Math.max(f.p75 - f.p25, Math.abs(f.mediana) * 0.2, 1);
  const min = Math.min(f.p25 - largura * 0.75, valor);
  const max = Math.max(f.p75 + largura * 0.75, valor);
  const pos = (v: number) => Math.round(((v - min) / (max - min)) * 1000) / 10;
  return { inicio: pos(f.p25), fim: pos(f.p75), meio: pos(f.mediana), ponto: pos(valor) };
}
