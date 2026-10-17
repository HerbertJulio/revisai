// Entrada no estoque pelo XML da nota de compra (NF-e): ler a nota no próprio navegador
// (nfeProc/NFe/infNFe), achar cada produto no estoque (código de barras, código do fornecedor,
// nome parecido), converter a embalagem para a unidade do estoque (balde de 20 L, caixa com 4)
// e montar as contas a pagar das duplicatas. Nada sai do aparelho.

import { eanDaNota, mesmoCodigo } from './codigo-barras';
import { chaveDeTexto, tituloDeNome } from './placa';
import type { NovoItemExtra } from './registros-oficina';
import type { Categoria, Id, ItemEstoque, MovimentoEstoque, UnidadeEstoque } from './tipos';

export interface ItemNota {
  /** nItem. */
  numero: number;
  /** cProd: o código do produto no fornecedor. */
  codigo: string;
  /** cEAN, só quando é um código de barras de verdade ("SEM GTIN" vira null). */
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  /** uCom, como veio ("UN", "LT", "BD", "CX"). */
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /** vProd. */
  valorTotal: number;
  /** O que custou de verdade: vProd - desconto + frete + seguro + outras + IPI + ICMS-ST (e FCP-ST). */
  custoTotal: number;
}

export interface DuplicataNota {
  numero: string;
  /** AAAA-MM-DD. */
  vencimento: string;
  valor: number;
}

export interface NotaFiscal {
  /** Os 44 números da chave de acesso. */
  chave: string;
  modelo: string;
  numero: string;
  serie: string;
  /** AAAA-MM-DD. */
  emissao: string;
  emitente: { cnpj: string | null; nome: string; razaoSocial: string };
  itens: ItemNota[];
  duplicatas: DuplicataNota[];
  /** vNF. */
  total: number;
}

export type LeituraDaNota = { ok: true; nota: NotaFiscal } | { ok: false; erro: string };

/** O mínimo do DOM que a leitura usa (o do navegador serve). */
interface No {
  readonly localName: string | null;
  readonly textContent: string | null;
  readonly children: ArrayLike<No>;
  getAttribute(nome: string): string | null;
  getElementsByTagNameNS(ns: string, nome: string): ArrayLike<No>;
}

interface Documento {
  readonly documentElement: No | null;
  getElementsByTagName(nome: string): ArrayLike<unknown>;
  getElementsByTagNameNS(ns: string, nome: string): ArrayLike<No>;
}

/** O leitor de XML do navegador. */
export function lerXmlNoNavegador(xml: string): Documento {
  return new DOMParser().parseFromString(xml, 'application/xml') as unknown as Documento;
}

function lista<T>(a: ArrayLike<T>): T[] {
  return Array.from(a);
}

function filho(el: No | null | undefined, nome: string): No | null {
  if (!el) return null;
  for (const c of lista(el.children)) if (c.localName === nome) return c;
  return null;
}

function caminho(el: No | null | undefined, ...nomes: string[]): No | null {
  let atual: No | null = el ?? null;
  for (const n of nomes) atual = filho(atual, n);
  return atual;
}

function txt(el: No | null | undefined, ...nomes: string[]): string {
  return (caminho(el, ...nomes)?.textContent ?? '').trim();
}

function num(t: string): number {
  const n = Number(t.trim());
  return Number.isFinite(n) ? n : 0;
}

function primeiro(el: No | null | undefined, nome: string): No | null {
  return el ? (lista(el.getElementsByTagNameNS('*', nome))[0] ?? null) : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

// ---------------------------------------------------------------- chave de acesso

/** A chave tem 44 números e o último confere (módulo 11, pesos de 2 a 9). */
export function chaveValida(chave: string | null | undefined): boolean {
  const c = String(chave ?? '');
  if (!/^\d{44}$/.test(c)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(c[43]);
}

/** O CNPJ de quem emitiu a nota, que está dentro da chave (posições 7 a 20). */
export function cnpjDaChave(chave: string | null | undefined): string | null {
  const c = String(chave ?? '');
  return /^\d{44}$/.test(c) ? c.slice(6, 20) : null;
}

export function formatarChave(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// ---------------------------------------------------------------- leitura

/**
 * Lê o XML da NF-e (com ou sem o nfeProc em volta). `ler` é o leitor de XML (o do navegador,
 * ou outro nos testes). Devolve a nota ou a explicação do que está errado no arquivo.
 */
export function lerNotaFiscal(xml: string, ler: (xml: string) => Documento = lerXmlNoNavegador): LeituraDaNota {
  const texto = String(xml ?? '').replace(/^﻿/, '').trim();
  if (!texto.startsWith('<')) return { ok: false, erro: 'Esse arquivo não é um XML. Use o arquivo .xml da nota (o que o fornecedor manda junto com o boleto).' };
  if (texto.length > 5_000_000) return { ok: false, erro: 'O arquivo é grande demais para uma nota fiscal.' };
  let doc: Documento;
  try {
    doc = ler(texto);
  } catch {
    return { ok: false, erro: 'Não deu para ler esse XML. Ele pode estar cortado ou estragado.' };
  }
  if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) return { ok: false, erro: 'Não deu para ler esse XML. Ele pode estar cortado ou estragado.' };
  const inf = lista(doc.getElementsByTagNameNS('*', 'infNFe'))[0];
  if (!inf) {
    if (lista(doc.getElementsByTagNameNS('*', 'resNFe')).length)
      return { ok: false, erro: 'Esse XML é só o resumo da nota, sem os produtos. Baixe o XML completo no site da Sefaz ou peça ao fornecedor.' };
    return { ok: false, erro: 'Esse XML não é de uma NF-e (nota de produto). Confira se pegou o arquivo certo.' };
  }

  const id = (inf.getAttribute('Id') ?? '').replace(/^NFe/i, '');
  const chave = chaveValida(id) ? id : (primeiro(primeiro(doc.documentElement, 'protNFe'), 'chNFe')?.textContent ?? '').trim();
  if (!chaveValida(chave)) return { ok: false, erro: 'A chave de acesso da nota não confere. O arquivo pode ter sido mexido.' };

  const ide = filho(inf, 'ide');
  const emit = filho(inf, 'emit');
  const razao = txt(emit, 'xNome');
  const fantasia = txt(emit, 'xFant');
  const cnpj = txt(emit, 'CNPJ').replace(/\D/g, '') || null;

  const itens: ItemNota[] = [];
  for (const det of lista(inf.children).filter((c) => c.localName === 'det')) {
    const prod = filho(det, 'prod');
    if (!prod) continue;
    const imposto = filho(det, 'imposto');
    const quantidade = num(txt(prod, 'qCom'));
    const valorTotal = num(txt(prod, 'vProd'));
    const impostos = ['vIPI', 'vICMSST', 'vFCPST'].reduce((s, n) => s + num(primeiro(imposto, n)?.textContent ?? ''), 0);
    const custoTotal = valorTotal - num(txt(prod, 'vDesc')) + num(txt(prod, 'vFrete')) + num(txt(prod, 'vSeg')) + num(txt(prod, 'vOutro')) + impostos;
    itens.push({
      numero: Number(det.getAttribute('nItem')) || itens.length + 1,
      codigo: txt(prod, 'cProd'),
      ean: eanDaNota(txt(prod, 'cEAN')) ?? eanDaNota(txt(prod, 'cEANTrib')),
      descricao: txt(prod, 'xProd').replace(/\s+/g, ' '),
      ncm: /^\d{8}$/.test(txt(prod, 'NCM')) ? txt(prod, 'NCM') : null,
      cfop: txt(prod, 'CFOP') || null,
      unidade: txt(prod, 'uCom').toUpperCase() || 'UN',
      quantidade,
      valorUnitario: num(txt(prod, 'vUnCom')) || (quantidade > 0 ? valorTotal / quantidade : 0),
      valorTotal: r2(valorTotal),
      custoTotal: r2(Math.max(0, custoTotal))
    });
  }
  if (!itens.length) return { ok: false, erro: 'A nota não tem produtos.' };

  const duplicatas: DuplicataNota[] = [];
  for (const dup of lista(filho(inf, 'cobr')?.children ?? []).filter((c) => c.localName === 'dup')) {
    const vencimento = txt(dup, 'dVenc');
    const valor = num(txt(dup, 'vDup'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(vencimento) && valor > 0) duplicatas.push({ numero: txt(dup, 'nDup') || String(duplicatas.length + 1), vencimento, valor: r2(valor) });
  }

  const emissao = (txt(ide, 'dhEmi') || txt(ide, 'dEmi')).slice(0, 10);
  return {
    ok: true,
    nota: {
      chave,
      modelo: txt(ide, 'mod') || chave.slice(20, 22),
      numero: txt(ide, 'nNF') || String(Number(chave.slice(25, 34))),
      serie: txt(ide, 'serie') || String(Number(chave.slice(22, 25))),
      emissao: /^\d{4}-\d{2}-\d{2}$/.test(emissao) ? emissao : '',
      emitente: { cnpj: cnpj && /^\d{14}$/.test(cnpj) ? cnpj : cnpjDaChave(chave), nome: tituloDeNome(fantasia || razao) || 'Fornecedor', razaoSocial: tituloDeNome(razao) },
      itens,
      duplicatas,
      total: r2(num(txt(inf, 'total', 'ICMSTot', 'vNF')) || itens.reduce((s, i) => s + i.custoTotal, 0))
    }
  };
}

// ---------------------------------------------------------------- nome do produto novo

const ACENTOS: Record<string, string> = {
  oleo: 'óleo',
  oleos: 'óleos',
  sintetico: 'sintético',
  semissintetico: 'semissintético',
  ignicao: 'ignição',
  cambio: 'câmbio',
  combustivel: 'combustível',
  agua: 'água',
  valvula: 'válvula',
  suspensao: 'suspensão',
  direcao: 'direção',
  eletrico: 'elétrico',
  lampada: 'lâmpada',
  transmissao: 'transmissão',
  automatico: 'automático',
  automatica: 'automática',
  hidraulico: 'hidráulico'
};

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'p/', 'c/', 'para', 'com']);

/**
 * O nome do produto da nota como a oficina escreve: "OLEO MOTOR LUBRAX 5W30 SINTETICO BALDE 20L"
 * vira "Óleo Motor Lubrax 5W30 Sintético Balde 20L" (código e sigla ficam em maiúsculas).
 */
export function nomeDoProduto(descricao: string): string {
  return String(descricao ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => {
      const baixa = p.toLowerCase();
      if (/\d/.test(p)) return p.toUpperCase();
      if (i > 0 && MINUSCULAS.has(baixa)) return baixa;
      const semAcento = baixa.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const certo = ACENTOS[semAcento] ?? baixa;
      // sigla sem vogal (NGK, KYB, SKF) fica em maiúsculas
      if (p.length <= 4 && !/[aeiouáéíóúâêôãõ]/i.test(p)) return p.toUpperCase();
      return certo.charAt(0).toUpperCase() + certo.slice(1);
    })
    .join(' ');
}

// ---------------------------------------------------------------- achar no estoque

const ABREVIACOES: Record<string, string> = {
  filt: 'filtro',
  flt: 'filtro',
  filtr: 'filtro',
  sint: 'sintetico',
  sintet: 'sintetico',
  semisint: 'semissintetico',
  semissint: 'semissintetico',
  past: 'pastilha',
  pastilh: 'pastilha',
  amort: 'amortecedor',
  comb: 'combustivel',
  combust: 'combustivel',
  lt: 'l',
  lts: 'l',
  litro: 'l',
  litros: 'l',
  oleos: 'oleo',
  filtros: 'filtro',
  velas: 'vela',
  pastilhas: 'pastilha',
  discos: 'disco',
  correias: 'correia',
  dianteira: 'diant',
  dianteiro: 'diant',
  dt: 'diant',
  tras: 'tras',
  traseira: 'tras',
  traseiro: 'tras',
  tr: 'tras'
};

const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'p', 'c', 'com', 'e', 'un', 'und', 'unid', 'pc', 'pca', 'peca', 'cx', 'mod', 'ref', 'cod']);

/** As palavras que identificam o produto ("OLEO 5W-30 SINT 1LT" vira oleo, 5w30, sintetico, 1l). */
export function palavrasDoProduto(t: string): Set<string> {
  const k = chaveDeTexto(t)
    .replace(/\b(\d{1,2}) ?w ?(\d{2})\b/g, '$1w$2')
    .replace(/\b(\d+) (l|lt|lts|ml|kg|g)\b/g, '$1$2')
    .replace(/\b(\d+)(lt|lts)\b/g, '$1l');
  const r = new Set<string>();
  const palavras = k.split(' ').filter(Boolean);
  for (let i = 0; i < palavras.length; i++) {
    const p = ABREVIACOES[palavras[i]] ?? palavras[i];
    if (VAZIAS.has(p)) continue;
    r.add(p);
    // "PSL 55" e "PSL55" são o mesmo código de peça
    const prox = palavras[i + 1];
    if (/^[a-z]{2,4}$/.test(p) && prox && /^\d{2,6}$/.test(prox)) r.add(p + prox);
    const partes = p.match(/^([a-z]{2,4})(\d{2,6})$/);
    if (partes) {
      r.add(partes[1]);
      r.add(partes[2]);
    }
  }
  return r;
}

/** De 0 a 1: quanto os dois nomes de produto se parecem (palavras com número pesam o dobro). */
export function semelhanca(a: string, b: string): number {
  const x = palavrasDoProduto(a);
  const y = palavrasDoProduto(b);
  if (!x.size || !y.size) return 0;
  const peso = (p: string) => (/\d/.test(p) ? 2 : 1);
  let comum = 0;
  let total = 0;
  for (const p of x) {
    total += peso(p);
    if (y.has(p)) comum += peso(p);
  }
  for (const p of y) {
    total += peso(p);
    if (x.has(p)) comum += peso(p);
  }
  return total ? comum / total : 0;
}

export type ComoAchou = 'ean' | 'codigo' | 'nome';

export interface Casamento {
  itemId: Id | null;
  como: ComoAchou | null;
  /** 1 nos códigos; a semelhança do nome no resto. */
  confianca: number;
}

/** Abaixo disso, o nome parecido não vale como sugestão. */
export const SEMELHANCA_MINIMA = 0.5;

/** De quais fornecedores (CNPJ) cada item já entrou por nota, pelos movimentos de entrada. */
export function fornecedoresDosItens(movimentos: Iterable<MovimentoEstoque>): Map<Id, Set<string>> {
  const r = new Map<Id, Set<string>>();
  for (const m of movimentos) {
    if (m.origem?.tipo !== 'nota') continue;
    const cnpj = cnpjDaChave(m.origem.id);
    if (!cnpj) continue;
    const s = r.get(m.itemId) ?? new Set<string>();
    s.add(cnpj);
    r.set(m.itemId, s);
  }
  return r;
}

/** O item do estoque que é este produto da nota: pelo código de barras, pelo código do mesmo fornecedor e, por fim, pelo nome parecido. */
export function casarItem(linha: ItemNota, cnpj: string | null, estoque: ItemEstoque[], fornecedores: Map<Id, Set<string>>): Casamento {
  if (linha.ean) {
    const porEan = estoque.find((i) => mesmoCodigo(i.ean, linha.ean) || mesmoCodigo(i.codigo, linha.ean));
    if (porEan) return { itemId: porEan.id, como: 'ean', confianca: 1 };
  }
  if (linha.codigo && cnpj) {
    const porCodigo = estoque.find((i) => i.codigoFornecedor && i.codigoFornecedor === linha.codigo && fornecedores.get(i.id)?.has(cnpj));
    if (porCodigo) return { itemId: porCodigo.id, como: 'codigo', confianca: 1 };
  }
  let melhor: { item: ItemEstoque; s: number } | null = null;
  for (const i of estoque) {
    const s = Math.max(semelhanca(linha.descricao, `${i.marca ?? ''} ${i.nome}`), semelhanca(linha.descricao, i.nome));
    if (!melhor || s > melhor.s) melhor = { item: i, s };
  }
  if (melhor && melhor.s >= SEMELHANCA_MINIMA) return { itemId: melhor.item.id, como: 'nome', confianca: Math.round(melhor.s * 100) / 100 };
  return { itemId: null, como: null, confianca: 0 };
}

export function casarNota(nota: NotaFiscal, estoque: ItemEstoque[], movimentos: Iterable<MovimentoEstoque>): Casamento[] {
  const fornecedores = fornecedoresDosItens(movimentos);
  return nota.itens.map((l) => casarItem(l, nota.emitente.cnpj, estoque, fornecedores));
}

// ---------------------------------------------------------------- unidade e categoria

const UNIDADES_LITRO = new Set(['L', 'LT', 'LTS', 'LITRO', 'LITROS']);
const UNIDADES_DE_PACOTE = new Set(['CX', 'CAIXA', 'JG', 'JOGO', 'KIT', 'KT', 'PCT', 'PACOTE', 'PAR', 'PR', 'DZ', 'DUZIA', 'CJ', 'CONJ', 'CONJUNTO']);

/** Quantos litros tem uma embalagem pelo nome ("BALDE 20L", "500ML", "CX 12X1L"). Null se não disser. */
export function litrosNoNome(descricao: string): number | null {
  const t = descricao.toUpperCase().replace(',', '.');
  const caixa = t.match(/(\d{1,3})\s*X\s*(\d+(?:\.\d+)?)\s*(L|LT|LTS|LITROS?|ML)\b/);
  if (caixa) return r4(Number(caixa[1]) * Number(caixa[2]) * (caixa[3] === 'ML' ? 0.001 : 1));
  const um = t.match(/(\d+(?:\.\d+)?)\s*(L|LT|LTS|LITROS?|ML)\b/);
  if (um) return r4(Number(um[1]) * (um[2] === 'ML' ? 0.001 : 1));
  return null;
}

/** Quantas unidades vêm no pacote pelo nome ("JOGO C/4", "KIT 2 PCS", "CX C/ 10"). Null se não disser. */
export function unidadesNoNome(descricao: string): number | null {
  const t = descricao.toUpperCase();
  const m = t.match(/\bC\s*\/\s*(\d{1,3})\b/) ?? t.match(/\b(\d{1,3})\s*(?:UN|UNID|UNIDADES|PCS|PC|PECAS|PÇS)\b/) ?? t.match(/\b(?:JOGO|JG|KIT|CX|CAIXA)\s+(?:COM\s+)?(\d{1,3})\b/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 1 ? n : null;
}

/**
 * Quantas unidades do estoque (litros ou peças) vêm em cada unidade da nota. O óleo conta em
 * litros: frasco de 1 L, galão de 4 L, balde de 20 L. Peça vendida em jogo ou caixa conta cada uma.
 */
export function fatorSugerido(linha: Pick<ItemNota, 'unidade' | 'descricao'>, unidadeDoEstoque: UnidadeEstoque): number {
  const u = linha.unidade.toUpperCase().replace(/[^A-Z]/g, '');
  if (unidadeDoEstoque === 'L') {
    if (UNIDADES_LITRO.has(u)) return 1;
    if (u === 'ML') return 0.001;
    return litrosNoNome(linha.descricao) ?? 1;
  }
  if (u === 'PAR' || u === 'PR') return 2;
  if (u === 'DZ' || u === 'DUZIA') return 12;
  if (UNIDADES_DE_PACOTE.has(u)) return unidadesNoNome(linha.descricao) ?? 1;
  return 1;
}

const POR_PALAVRA: [RegExp, Categoria][] = [
  [/\boleo\b.*\b(motor|\d{1,2}w\d{2}|sint|mineral|semi)|\b\d{1,2}w ?\d{2}\b/, 'oleo_motor'],
  [/filtro.*\b(ar condicionado|cabine|antipolen|polen|habitaculo)\b/, 'filtro_cabine'],
  [/filtro.*\b(combustivel|comb|gasolina|diesel)\b/, 'filtro_combustivel'],
  [/filtro.*\boleo\b|filtro lubrificante/, 'filtro_oleo'],
  [/filtro.*\bar\b|filtro de ar/, 'filtro_ar'],
  [/\bvela/, 'vela'],
  [/correia.*dentada|kit correia/, 'correia_dentada'],
  [/correia/, 'correia_acessorios'],
  [/pastilha/, 'pastilha_freio'],
  [/disco.*freio|disco (diant|tras)/, 'disco_freio'],
  [/fluido.*freio|\bdot ?[345]\b/, 'fluido_freio'],
  [/aditivo|arrefec|radiador|liquido.*arref/, 'arrefecimento'],
  [/\bpneu/, 'pneu'],
  [/bateria/, 'bateria'],
  [/amortecedor/, 'amortecedor'],
  [/oleo.*(cambio|transmiss|atf)|\batf\b|fluido.*cambio/, 'fluido_cambio'],
  [/higieniz|limpa ar|bactericida/, 'higienizacao_ar'],
  [/palheta|limpador/, 'palheta']
];

const POR_NCM: [string, Categoria][] = [
  ['27101932', 'oleo_motor'],
  ['27101931', 'oleo_motor'],
  ['27101991', 'oleo_motor'],
  ['842123', 'filtro_oleo'],
  ['842131', 'filtro_ar'],
  ['851110', 'vela'],
  ['401031', 'correia_acessorios'],
  ['401032', 'correia_acessorios'],
  ['401033', 'correia_acessorios'],
  ['401034', 'correia_acessorios'],
  ['401035', 'correia_dentada'],
  ['401036', 'correia_dentada'],
  ['681381', 'pastilha_freio'],
  ['38190000', 'fluido_freio'],
  ['38200000', 'arrefecimento'],
  ['401110', 'pneu'],
  ['850710', 'bateria'],
  ['870880', 'amortecedor'],
  ['851240', 'palheta']
];

/** A categoria do produto novo, pelo nome e pelo NCM (a pessoa confere). */
export function categoriaSugerida(descricao: string, ncm: string | null): Categoria {
  const k = chaveDeTexto(descricao).replace(/\b(\d{1,2}) ?w ?(\d{2})\b/g, '$1w$2');
  // câmbio antes do óleo de motor: "OLEO CAMBIO ATF" não é de motor
  if (/oleo.*(cambio|transmiss|atf)|\batf\b/.test(k)) return 'fluido_cambio';
  for (const [re, c] of POR_PALAVRA) if (re.test(k)) return c;
  const n = (ncm ?? '').replace(/\D/g, '');
  for (const [prefixo, c] of POR_NCM) if (n.startsWith(prefixo)) return c;
  return 'outros';
}

// ---------------------------------------------------------------- contas a pagar e repetição

/** O id da conta a pagar de cada duplicata (o mesmo em qualquer aparelho). */
export function idDaParcela(chave: string, i: number): Id {
  return `nfe-${chave}-${i + 1}`;
}

/** As contas a pagar das duplicatas da nota (uma por parcela). */
export function contasDaNota(nota: NotaFiscal, agora: Date = new Date()): NovoItemExtra<'lancamentos'>[] {
  const total = nota.duplicatas.length;
  return nota.duplicatas.map((d, i) => ({
    id: idDaParcela(nota.chave, i),
    tipo: 'pagar' as const,
    descricao: `NF-e nº ${nota.numero} de ${nota.emitente.nome}${total > 1 ? ` (parcela ${i + 1} de ${total})` : ''}`,
    valor: d.valor,
    vencimento: d.vencimento,
    pagoEm: null,
    forma: null,
    categoria: 'fornecedor',
    parcela: total > 1 ? { numero: i + 1, total, grupo: `nfe-${nota.chave}` } : null,
    favorecido: nota.emitente.nome,
    observacao: `Duplicata ${d.numero}. Chave da nota: ${nota.chave}.`,
    criadoEm: agora.toISOString()
  }));
}

/** A nota já entrou no estoque (ou já virou contas a pagar)? Devolve quando. */
export function notaJaLancada(chave: string, movimentos: Iterable<MovimentoEstoque>, lancamentos: Iterable<{ id: Id; criadoEm: string }> = []): string | null {
  for (const m of movimentos) if (m.origem?.tipo === 'nota' && m.origem.id === chave) return m.quando;
  for (const l of lancamentos) if (l.id.startsWith(`nfe-${chave}-`)) return l.criadoEm;
  return null;
}

/** O custo por unidade do estoque (o que pagou de verdade, dividido pelo que entra). */
export function custoPorUnidade(linha: Pick<ItemNota, 'custoTotal' | 'quantidade'>, fator: number): number | null {
  const q = linha.quantidade * fator;
  // a conta em centavos: 199,25 / 10 dá 19,93 (em reais o computador arredondaria para 19,92)
  return q > 0 && linha.custoTotal > 0 ? Math.round(Math.round(linha.custoTotal * 100) / q) / 100 : null;
}
