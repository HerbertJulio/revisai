// O carro pela placa: a placa no formato certo, a resposta do provedor no jeito do app (marca,
// modelo, ano, cor, combustível, cidade) e as mensagens da cota do mês. Sem nada de servidor
// aqui: a tela usa as mesmas funções para mostrar o que veio e preencher o cadastro.

import { z } from 'zod';
import { normalizarPlaca, placaValida } from './formatos';
import type { Combustivel } from './tipos';

/** O que a consulta da placa devolve, já no jeito do app. */
export interface DadosPlaca {
  placa: string;
  marca: string;
  modelo: string;
  /** O resto do nome do modelo no documento (versão, motor, câmbio). */
  versao: string | null;
  /** '1.0', '1.6', '1.0 turbo' (tirado da versão quando dá). */
  motor: string | null;
  /** Ano de fabricação. */
  ano: number | null;
  anoModelo: number | null;
  cor: string | null;
  combustivel: Combustivel | null;
  municipio: string | null;
  uf: string | null;
  /** Só mascarado (o app não guarda o chassi inteiro que vem da consulta). */
  chassi: string | null;
  /** Código e valor da FIPE quando o provedor manda junto. */
  fipe: { codigo: string; valor: number | null } | null;
}

export const esquemaDadosPlaca = z.object({
  placa: z.string(),
  marca: z.string(),
  modelo: z.string(),
  versao: z.string().nullable(),
  motor: z.string().nullable(),
  ano: z.number().int().nullable(),
  anoModelo: z.number().int().nullable(),
  cor: z.string().nullable(),
  combustivel: z.enum(['flex', 'gasolina', 'etanol', 'diesel', 'gnv', 'hibrido', 'eletrico']).nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  chassi: z.string().nullable(),
  fipe: z.object({ codigo: z.string(), valor: z.number().nullable() }).nullable()
});

/** Quantas consultas de placa a oficina tem por mês (o mesmo número do banco). */
export const LIMITE_PLACAS = { gratis: 20, pro: 200 } as const;

export interface UsoDePlacas {
  plano: 'pro' | 'teste' | 'gratis';
  usado: number;
  limite: number;
}

export const esquemaUsoDePlacas = z.object({
  plano: z.enum(['pro', 'teste', 'gratis']),
  usado: z.number().int().nonnegative(),
  limite: z.number().int().nonnegative()
});

// ---------------------------------------------------------------- placa

/** A placa como ela é consultada: só letras e números, em maiúsculas. Null se não for placa. */
export function placaParaConsulta(texto: string): string | null {
  const p = normalizarPlaca(texto);
  return placaValida(p) ? p : null;
}

const LETRAS_MERCOSUL = 'ABCDEFGHIJ';

/**
 * A mesma placa no padrão Mercosul: na troca, o segundo número virou letra (0 = A ... 9 = J).
 * ABC1234 e ABC1C34 são o mesmo carro; é a chave do que fica guardado.
 */
export function placaCanonica(texto: string): string | null {
  const p = placaParaConsulta(texto);
  if (!p) return null;
  if (/^[A-Z]{3}[0-9]{4}$/.test(p)) return `${p.slice(0, 4)}${LETRAS_MERCOSUL[Number(p[4])]}${p.slice(5)}`;
  return p;
}

// ---------------------------------------------------------------- textos do documento

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Chave para comparar textos: sem acento, sem maiúsculas, só letras, números e espaços. */
export function chaveDeTexto(t: string | null | undefined): string {
  return semAcento(String(t ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MARCAS: [string, string[]][] = [
  ['Chevrolet', ['chevrolet', 'gm', 'chev', 'gm chevrolet', 'chevrolet gm']],
  ['Volkswagen', ['volkswagen', 'vw', 'volks', 'vw volkswagen', 'volkswagem']],
  ['Fiat', ['fiat']],
  ['Ford', ['ford']],
  ['Toyota', ['toyota']],
  ['Honda', ['honda']],
  ['Hyundai', ['hyundai', 'hyunday', 'hyundai caoa']],
  ['Renault', ['renault']],
  ['Jeep', ['jeep']],
  ['Nissan', ['nissan']],
  ['Peugeot', ['peugeot']],
  ['Citroën', ['citroen']],
  ['Caoa Chery', ['caoa chery', 'chery', 'caoa', 'chery caoa']],
  ['BYD', ['byd']],
  ['Mitsubishi', ['mitsubishi', 'mmc']],
  ['Kia', ['kia', 'kia motors']],
  ['Mercedes-Benz', ['mercedes benz', 'mercedes', 'm benz', 'mbenz', 'mb']],
  ['BMW', ['bmw']],
  ['Audi', ['audi']],
  ['Volvo', ['volvo']],
  ['Land Rover', ['land rover', 'lr', 'landrover']],
  ['Jaguar', ['jaguar']],
  ['Suzuki', ['suzuki']],
  ['Subaru', ['subaru']],
  ['RAM', ['ram', 'dodge ram']],
  ['Dodge', ['dodge']],
  ['Chrysler', ['chrysler']],
  ['JAC', ['jac', 'jac motors']],
  ['GWM', ['gwm', 'great wall', 'haval']],
  ['Lexus', ['lexus']],
  ['Porsche', ['porsche']],
  ['Mini', ['mini']],
  ['Troller', ['troller']],
  ['Iveco', ['iveco']],
  ['Lifan', ['lifan']],
  ['Effa', ['effa']],
  ['SsangYong', ['ssangyong', 'ssang yong']],
  ['Smart', ['smart']],
  ['Yamaha', ['yamaha']],
  ['Kawasaki', ['kawasaki']]
];

const POR_APELIDO = new Map<string, string>();
for (const [nome, apelidos] of MARCAS) for (const a of apelidos) POR_APELIDO.set(a, nome);

const PEQUENAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** "RIO DE JANEIRO" vira "Rio de Janeiro"; "PRATA" vira "Prata". */
export function tituloDeNome(t: string | null | undefined): string {
  return String(t ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/** O nome da marca do jeito que a oficina escreve ("GM - CHEVROLET", "CHEV" e "gm" viram "Chevrolet"). */
export function nomeDaMarca(t: string | null | undefined): string {
  const k = chaveDeTexto(t);
  if (!k) return '';
  const direto = POR_APELIDO.get(k);
  if (direto) return direto;
  // "GM - Chevrolet", "VW - VolksWagen": vale a parte que é marca conhecida
  for (const parte of k.split(' ')) {
    const p = POR_APELIDO.get(parte);
    if (p && parte.length > 2) return p;
  }
  const doisPrimeiros = k.split(' ').slice(0, 2).join(' ');
  return POR_APELIDO.get(doisPrimeiros) ?? tituloDeNome(String(t));
}

/** Nomes curtos de modelo que viram "Gol", "Up", "Ka" (o resto com até 3 letras é sigla: LT, LTZ, GTS). */
const MODELOS_CURTOS = new Set(['gol', 'up', 'ka', 'fox', 'uno', 'ix', 'cr', 'hr', 'qq', 'kwid']);

function tituloDePalavra(p: string): string {
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) return p; // já veio com maiúsculas e minúsculas
  const baixa = p.toLowerCase();
  if (p.includes('-')) return p.split('-').map(tituloDePalavra).join('-');
  if (/\d/.test(p)) return p.toUpperCase();
  if (baixa.length >= 4 || MODELOS_CURTOS.has(baixa)) return baixa.charAt(0).toUpperCase() + baixa.slice(1);
  return p.toUpperCase();
}

function tituloDeVersao(t: string): string {
  return t.split(/\s+/).filter(Boolean).map(tituloDePalavra).join(' ');
}

/** Siglas e números que começam a versão (o que vem depois do nome do modelo). */
const COMECO_DA_VERSAO = /^(\d+[.,]\d.*|\d{3}|\d{2,3}v|16v|8v|12v|flex|turbo|tsi|mpi|aut|at|mt|cvt|ltz?|lt|ls|lx|ex|exl|gl|gls|glx|sport|premier)$/i;

/** Separa o nome do modelo ("ONIX PLUS") do resto ("1.0 TURBO LTZ AT"). Tira a marca do começo ("CHEV/ONIX", "VW GOL"). */
export function separarModelo(texto: string, marca = ''): { modelo: string; versao: string | null } {
  let t = String(texto ?? '').trim().replace(/\s+/g, ' ').replace(/^I\//i, '');
  const barra = t.indexOf('/');
  if (barra > 0 && barra <= 12 && POR_APELIDO.has(chaveDeTexto(t.slice(0, barra)))) t = t.slice(barra + 1).trim();
  const palavras = t.split(' ').filter(Boolean);
  if (palavras.length > 1 && marca && POR_APELIDO.get(chaveDeTexto(palavras[0])) === nomeDaMarca(marca)) palavras.shift();
  const corte = palavras.findIndex((p, i) => i > 0 && COMECO_DA_VERSAO.test(p));
  // sem sigla de versão, o nome do modelo é no máximo as duas primeiras palavras
  const fim = corte > 0 ? corte : Math.min(2, palavras.length);
  const resto = palavras.slice(fim).join(' ');
  return { modelo: tituloDeVersao(palavras.slice(0, fim).join(' ')), versao: resto ? tituloDeVersao(resto) : null };
}

/** Junta a versão que veio no nome do modelo com a que veio separada, sem repetir. */
function juntarVersoes(a: string | null, b: string | null): string | null {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x || !y) return x || y || null;
  if (chaveDeTexto(x).includes(chaveDeTexto(y))) return x;
  if (chaveDeTexto(y).includes(chaveDeTexto(x))) return y;
  return `${x} ${y}`;
}

/** O motor tirado da versão: "1.0 MT LT" vira "1.0"; "1.0 TURBO" e "200 TSI" viram "1.0 turbo". */
export function motorDaVersao(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').toUpperCase();
  const cilindrada = t.match(/(?:^|[^\d])(\d)[.,](\d)(?!\d)/);
  const turbo = /\bTURBO\b|\bTSI\b|\bTB\b|\bTFSI\b|\bTHP\b|\bT200\b|\bT270\b|\bTJET\b|\bECOBOOST\b|\b\d\.\dT\b/.test(t) || /\b(170|200|250)\s?TSI\b/.test(t);
  if (cilindrada) return `${cilindrada[1]}.${cilindrada[2]}${turbo ? ' turbo' : ''}`;
  if (/\b200\s?TSI\b|\b170\s?TSI\b/.test(t)) return '1.0 turbo';
  if (/\b250\s?TSI\b/.test(t)) return '1.4 turbo';
  return null;
}

/** O combustível do documento ("ALCOOL/GASOLINA", "FLEX", "GASOLINA/GNV") no tipo do app. */
export function combustivelDoTexto(t: string | null | undefined): Combustivel | null {
  const k = chaveDeTexto(t);
  if (!k) return null;
  if (/eletric/.test(k) && /gasolina|alcool|etanol|flex|hibrid/.test(k)) return 'hibrido';
  if (/hibrid/.test(k)) return 'hibrido';
  if (/eletric/.test(k)) return 'eletrico';
  if (/gas natural|gnv|\bgas\b/.test(k)) return 'gnv';
  if (/diesel/.test(k)) return 'diesel';
  if (/flex|alcool gasolina|gasolina alcool|etanol gasolina|gasolina etanol/.test(k)) return 'flex';
  if (/alcool|etanol/.test(k)) return 'etanol';
  if (/gasolina/.test(k)) return 'gasolina';
  return null;
}

/** O chassi com só os 6 últimos à mostra (se já vier mascarado, fica como veio). */
export function mascararChassi(t: string | null | undefined): string | null {
  const c = String(t ?? '').toUpperCase().replace(/\s+/g, '');
  if (!c) return null;
  if (/[*X•]{3,}/.test(c) && /[A-Z0-9]{3,}$/.test(c)) return c.slice(-17);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(c)) return null;
  return `${'*'.repeat(11)}${c.slice(-6)}`;
}

function ano(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
}

function dinheiro(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v && 'amount' in v) return dinheiro((v as { amount: unknown }).amount);
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const CODIGO_FIPE = /^\d{6}-\d$/;

// ---------------------------------------------------------------- respostas dos provedores

export type RespostaDaPlaca = { tipo: 'achou'; dados: DadosPlaca } | { tipo: 'nao_achou' };

/** O carro no jeito do app a partir dos campos soltos (de qualquer provedor). */
export function montarDados(placa: string, c: {
  marca?: unknown;
  modelo?: unknown;
  versao?: unknown;
  ano?: unknown;
  anoModelo?: unknown;
  cor?: unknown;
  combustivel?: unknown;
  municipio?: unknown;
  uf?: unknown;
  chassi?: unknown;
  fipeCodigo?: unknown;
  fipeValor?: unknown;
}): DadosPlaca {
  const marca = nomeDaMarca(String(c.marca ?? ''));
  const separado = separarModelo(String(c.modelo ?? ''), marca);
  const versaoDoProvedor = String(c.versao ?? '').trim();
  const versao = juntarVersoes(separado.versao, versaoDoProvedor ? tituloDeVersao(versaoDoProvedor) : null);
  const uf = String(c.uf ?? '').trim().toUpperCase();
  const codigo = String(c.fipeCodigo ?? '').trim();
  return {
    placa: placaParaConsulta(placa) ?? normalizarPlaca(placa),
    marca,
    modelo: separado.modelo,
    versao,
    motor: motorDaVersao(`${String(c.modelo ?? '')} ${versaoDoProvedor}`),
    ano: ano(c.ano),
    anoModelo: ano(c.anoModelo),
    cor: c.cor ? tituloDeNome(String(c.cor)) || null : null,
    combustivel: combustivelDoTexto(String(c.combustivel ?? '')),
    municipio: c.municipio ? tituloDeNome(String(c.municipio)) || null : null,
    uf: /^[A-Z]{2}$/.test(uf) ? uf : null,
    chassi: mascararChassi(c.chassi as string | null),
    fipe: CODIGO_FIPE.test(codigo) ? { codigo, valor: dinheiro(c.fipeValor) } : null
  };
}

/**
 * A resposta do POST /lookups da consultadeplaca.net (API v1): `result` = found | not_found e o
 * carro em `vehicle` (brand, model, version, manufacture_year, model_year, color, fuel, city,
 * state, fipe {code, amount}). Null quando a resposta não tem esse formato.
 */
export function lerConsultaDePlaca(json: unknown, placa: string): RespostaDaPlaca | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { result?: unknown; vehicle?: Record<string, unknown> | null };
  if (r.result === 'not_found') return { tipo: 'nao_achou' };
  if (r.result !== 'found' || !r.vehicle || typeof r.vehicle !== 'object') return null;
  const v = r.vehicle;
  const fipe = (v.fipe && typeof v.fipe === 'object' ? v.fipe : null) as { code?: unknown; amount?: unknown } | null;
  const dados = montarDados(String(v.plate ?? placa), {
    marca: v.brand,
    modelo: v.model,
    versao: v.version,
    ano: v.manufacture_year,
    anoModelo: v.model_year,
    cor: v.color,
    combustivel: v.fuel,
    municipio: v.city,
    uf: v.state,
    chassi: v.chassis ?? v.vin ?? null,
    fipeCodigo: fipe?.code,
    fipeValor: fipe?.amount
  });
  if (!dados.marca && !dados.modelo) return { tipo: 'nao_achou' };
  return { tipo: 'achou', dados };
}

// ---------------------------------------------------------------- o que vai para o cadastro

/** Os campos do cadastro do carro que a consulta preenche (só os que vieram). */
export function camposDaPlaca(d: DadosPlaca): {
  marca?: string;
  modelo?: string;
  motor?: string;
  ano?: string;
  anoModelo?: string;
  cor?: string;
  combustivel?: Combustivel;
  chassi?: string;
} {
  const r: ReturnType<typeof camposDaPlaca> = {};
  if (d.marca) r.marca = d.marca;
  if (d.modelo) r.modelo = d.modelo;
  if (d.motor) r.motor = d.motor;
  if (d.ano ?? d.anoModelo) r.ano = String(d.ano ?? d.anoModelo);
  if (d.anoModelo) r.anoModelo = String(d.anoModelo);
  if (d.cor) r.cor = d.cor;
  if (d.combustivel) r.combustivel = d.combustivel;
  if (d.chassi) r.chassi = d.chassi;
  return r;
}

/** "Chevrolet Onix 1.0 MT LT, 2019/2020, prata, flex. Emplacado em Guapimirim/RJ." */
export function resumoDaPlaca(d: DadosPlaca): { titulo: string; detalhe: string } {
  const anos = d.ano && d.anoModelo && d.ano !== d.anoModelo ? `${d.ano}/${d.anoModelo}` : String(d.anoModelo ?? d.ano ?? '');
  const combustivel = d.combustivel ? NOMES_COMBUSTIVEL[d.combustivel] : '';
  const partes = [anos, d.cor?.toLowerCase() ?? '', combustivel].filter(Boolean);
  const lugar = d.municipio && d.uf ? `Emplacado em ${d.municipio}/${d.uf}.` : d.uf ? `Emplacado em ${d.uf}.` : '';
  return {
    titulo: [d.marca, d.modelo, d.versao].filter(Boolean).join(' '),
    detalhe: [partes.length ? `${partes.join(', ')}.` : '', lugar].filter(Boolean).join(' ')
  };
}

export const NOMES_COMBUSTIVEL: Record<Combustivel, string> = {
  flex: 'flex',
  gasolina: 'gasolina',
  etanol: 'etanol',
  diesel: 'diesel',
  gnv: 'com GNV',
  hibrido: 'híbrido',
  eletrico: 'elétrico'
};

// ---------------------------------------------------------------- cota

/** A mensagem quando as consultas do mês acabaram. */
export function mensagemDaCota(u: Pick<UsoDePlacas, 'plano' | 'limite'>): string {
  if (u.plano === 'gratis') return `As ${u.limite} consultas de placa deste mês acabaram. No Pro são ${LIMITE_PLACAS.pro} por mês. Dá para preencher à mão.`;
  return `As ${u.limite} consultas de placa deste mês acabaram. Elas voltam no dia 1º; até lá, preencha à mão.`;
}

/** "Restam 15 consultas este mês." */
export function textoDoUso(u: UsoDePlacas): string {
  const restam = Math.max(0, u.limite - u.usado);
  if (restam === 0) return 'Acabaram as consultas de placa deste mês.';
  return restam === 1 ? 'Resta 1 consulta de placa este mês.' : `Restam ${restam} consultas de placa este mês.`;
}
