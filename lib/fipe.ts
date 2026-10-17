// Tabela FIPE: o preço médio do carro no mês, pelo código FIPE (que a consulta da placa traz) ou
// escolhendo marca, modelo e ano. Os dados vêm da BrasilAPI (grátis) pelo servidor do app, que
// guarda o que já buscou até o mês virar. Aqui só o que é puro: ler as respostas, escolher o ano
// certo e montar o que fica no carro.

import { z } from 'zod';
import { chaveDeTexto, nomeDaMarca } from './placa';
import type { Combustivel, Veiculo } from './tipos';

export interface PrecoFipe {
  codigo: string;
  marca: string;
  modelo: string;
  /** 32000 na FIPE é "zero km"; aqui vira null com zeroKm = true. */
  anoModelo: number | null;
  zeroKm: boolean;
  combustivel: string;
  valor: number | null;
  /** 'AAAA-MM' da tabela; o texto da FIPE quando não deu para ler. */
  referencia: string;
}

export interface OpcaoFipe {
  codigo: string;
  nome: string;
}

export type FipeDoVeiculo = NonNullable<Veiculo['fipe']>;

export const esquemaPrecoFipe = z.object({
  codigo: z.string(),
  marca: z.string(),
  modelo: z.string(),
  anoModelo: z.number().int().nullable(),
  zeroKm: z.boolean(),
  combustivel: z.string(),
  valor: z.number().nullable(),
  referencia: z.string()
});

export const esquemaOpcaoFipe = z.object({ codigo: z.string(), nome: z.string() });

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function codigoFipeValido(c: string | null | undefined): boolean {
  return /^\d{6}-\d$/.test(String(c ?? '').trim());
}

/** "004478-1" a partir do que a pessoa digitou ("0044781", "004478 1"). */
export function lerCodigoFipe(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length === 7 ? `${d.slice(0, 6)}-${d.slice(6)}` : null;
}

/** O mês de agora no fuso de Brasília, 'AAAA-MM' (a FIPE vira no começo de cada mês). */
export function mesDeBrasilia(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(agora);
  return `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}`;
}

/** "R$ 58.123,00" vira 58123. */
export function lerValorFipe(t: unknown): number | null {
  if (typeof t === 'number') return Number.isFinite(t) && t > 0 ? Math.round(t * 100) / 100 : null;
  const s = String(t ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "outubro de 2026 " vira '2026-10' (o texto fica como veio quando não é um mês). */
export function lerMesReferencia(t: unknown): string {
  const s = String(t ?? '').trim().toLowerCase();
  const m = s.match(/^([a-zç]+)\s+(?:de\s+)?(\d{4})$/);
  if (m) {
    const i = MESES.indexOf(m[1].replace('marco', 'março'));
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return String(t ?? '').trim();
}

/** '2026-10' vira "outubro de 2026". */
export function nomeDaReferencia(ref: string): string {
  const m = ref.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ref;
  const i = Number(m[2]) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]} de ${m[1]}` : ref;
}

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

/** Uma linha do preço da BrasilAPI (/fipe/preco/v1/{codigo} e /fipe/detalhes/v1/...). */
export function lerPrecoBrasilApi(x: unknown): PrecoFipe | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const codigo = texto(o.codigoFipe);
  if (!codigoFipeValido(codigo)) return null;
  const ano = Number(o.anoModelo);
  const zeroKm = ano === 32000;
  return {
    codigo,
    marca: texto(o.marca),
    modelo: texto(o.modelo),
    anoModelo: !zeroKm && Number.isInteger(ano) && ano > 1900 && ano < 2100 ? ano : null,
    zeroKm,
    combustivel: texto(o.combustivel),
    valor: lerValorFipe(o.valor),
    referencia: lerMesReferencia(o.mesReferencia)
  };
}

/** A lista de preços de um código FIPE (um por ano e combustível). */
export function lerPrecosBrasilApi(json: unknown): PrecoFipe[] {
  const lista = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : [];
  return lista.map(lerPrecoBrasilApi).filter((p): p is PrecoFipe => !!p);
}

/** Marcas, modelos e anos da BrasilAPI: {nome, valor} (marcas e anos) ou {modelo, valor/codigo} (modelos). */
export function lerOpcoesBrasilApi(json: unknown): OpcaoFipe[] {
  if (!Array.isArray(json)) return [];
  const r: OpcaoFipe[] = [];
  for (const x of json) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const nome = texto(o.nome ?? o.modelo ?? o.label);
    const codigo = texto(o.valor ?? o.codigo ?? o.value);
    if (nome && codigo) r.push({ codigo, nome });
  }
  return r;
}

const FIPE_DO_COMBUSTIVEL: Record<Combustivel, string[]> = {
  flex: ['flex'],
  gasolina: ['gasolina'],
  etanol: ['alcool', 'etanol'],
  diesel: ['diesel'],
  gnv: ['gasolina', 'flex'],
  hibrido: ['hibrido', 'gasolina'],
  eletrico: ['eletrico']
};

/**
 * O preço que vale para o carro: o do ano do modelo (ou do ano de fabricação, e o seguinte, quando
 * o carro não tem o ano do modelo) e, empatando, o do combustível. Sem como escolher, devolve as
 * opções para a pessoa escolher.
 */
export function escolherPreco(precos: PrecoFipe[], carro: { ano?: number | null; anoModelo?: number | null; combustivel?: Combustivel | null }): { escolhido: PrecoFipe | null; opcoes: PrecoFipe[] } {
  const opcoes = [...precos].sort((a, b) => (b.anoModelo ?? 9999) - (a.anoModelo ?? 9999) || a.combustivel.localeCompare(b.combustivel));
  const anos = carro.anoModelo ? [carro.anoModelo] : carro.ano ? [carro.ano, carro.ano + 1] : [];
  for (const ano of anos) {
    const doAno = opcoes.filter((p) => p.anoModelo === ano);
    if (!doAno.length) continue;
    if (doAno.length === 1) return { escolhido: doAno[0], opcoes };
    const nomes = carro.combustivel ? FIPE_DO_COMBUSTIVEL[carro.combustivel] : [];
    for (const n of nomes) {
      const achou = doAno.find((p) => chaveDeTexto(p.combustivel).startsWith(n));
      if (achou) return { escolhido: achou, opcoes };
    }
    return { escolhido: null, opcoes: doAno };
  }
  if (opcoes.length === 1) return { escolhido: opcoes[0], opcoes };
  return { escolhido: null, opcoes };
}

/** "2020 Flex", "Zero km Gasolina". */
export function nomeDoAnoFipe(p: Pick<PrecoFipe, 'anoModelo' | 'zeroKm' | 'combustivel'>): string {
  return `${p.zeroKm ? 'Zero km' : (p.anoModelo ?? '')} ${p.combustivel}`.trim();
}

/** O que fica no carro (veiculo.fipe). */
export function fipeDoPreco(p: Pick<PrecoFipe, 'codigo' | 'valor' | 'referencia'>, agora: Date = new Date()): FipeDoVeiculo {
  return { codigo: p.codigo, valor: p.valor, referencia: p.referencia, consultadoEm: agora.toISOString() };
}

/** A tabela guardada no carro é de um mês que já passou? */
export function fipeDesatualizada(f: Pick<FipeDoVeiculo, 'referencia'> | null | undefined, agora: Date = new Date()): boolean {
  if (!f) return false;
  return /^\d{4}-\d{2}$/.test(f.referencia) && f.referencia < mesDeBrasilia(agora);
}

/** A marca da FIPE ("GM - Chevrolet", "VW - VolksWagen") que é a do carro. */
export function marcaFipeDoCarro(marcas: OpcaoFipe[], marcaDoCarro: string): OpcaoFipe | null {
  const alvo = nomeDaMarca(marcaDoCarro);
  if (!alvo) return null;
  return marcas.find((m) => nomeDaMarca(m.nome) === alvo) ?? null;
}

/** Os modelos que combinam com o que a pessoa (ou o cadastro) escreveu, os mais parecidos primeiro. */
export function filtrarModelos(modelos: OpcaoFipe[], busca: string): OpcaoFipe[] {
  const termos = chaveDeTexto(busca).split(' ').filter(Boolean);
  if (!termos.length) return modelos;
  const pontos = (m: OpcaoFipe) => {
    const k = ` ${chaveDeTexto(m.nome)} `;
    let n = 0;
    for (const t of termos) if (k.includes(` ${t} `)) n += 2;
      else if (k.includes(t)) n += 1;
    return n;
  };
  return modelos
    .map((m) => ({ m, p: pontos(m) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.m.nome.localeCompare(b.m.nome, 'pt-BR'))
    .map((x) => x.m);
}
