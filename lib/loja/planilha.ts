// A planilha de produtos da loja: baixar o que está cadastrado, mexer no Excel (ou no sistema da
// loja) e mandar de volta. A mesma leitura serve à prévia no navegador e à conferência no servidor.
// Sem nada de servidor aqui.

import { z } from 'zod';
import { CATEGORIAS } from '../catalogo';
import { lerNumero } from '../formatos';
import type { Categoria } from '../tipos';
import { lerAplicacoesDoTexto, textoDasAplicacoes } from './aplicacoes';
import { paraBusca } from './comum';
import type { Aplicacao, LinhaProdutoDaLoja } from './dados';

/** As colunas, na ordem da planilha baixada. Só "nome", "categoria" e "preco" são obrigatórias. */
export const COLUNAS_DA_PLANILHA = [
  'id',
  'codigo',
  'nome',
  'marca',
  'categoria',
  'unidade',
  'conteudo',
  'preco',
  'estoque',
  'ativo',
  'viscosidade',
  'base',
  'api',
  'acea',
  'normas',
  'medida',
  'amperagem',
  'tipo',
  'troca_km',
  'troca_meses',
  'aplicacoes',
  'descricao'
] as const;
export type ColunaDaPlanilha = (typeof COLUNAS_DA_PLANILHA)[number];

export const LIMITE_DA_PLANILHA = 1000;

// ---------------------------------------------------------------- CSV

/** Lê CSV com ";" (o padrão do Excel no Brasil), "," ou tabulação, com aspas. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const contar = (c: string) => primeira.split(c).length - 1;
  const separador = [';', '\t', ','].reduce((melhor, c) => (contar(c) > contar(melhor) ? c : melhor), ';');
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"' && campo === '') aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
  return linhas;
}

function celula(v: string): string {
  return /[;"\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV com ";" e BOM, que o Excel abre direto com acentos. */
export function escreverCsv(linhas: string[][]): string {
  return `﻿${linhas.map((l) => l.map(celula).join(';')).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- baixar

function numeroBr(n: number | null | undefined): string {
  return n == null ? '' : String(n).replace('.', ',');
}

function lista(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'string' ? v : '';
}

export function planilhaDosProdutos(produtos: LinhaProdutoDaLoja[]): string {
  const linhas: string[][] = [[...COLUNAS_DA_PLANILHA]];
  for (const p of produtos) {
    const e = p.especificacao as Record<string, unknown>;
    const valores: Record<ColunaDaPlanilha, string> = {
      id: String(p.id),
      codigo: p.codigo ?? '',
      nome: p.nome,
      marca: p.marca ?? '',
      categoria: CATEGORIAS.find((c) => c.id === p.categoria)?.nome ?? p.categoria,
      unidade: p.unidade,
      conteudo: numeroBr(p.conteudo),
      preco: numeroBr(p.preco),
      estoque: p.estoque == null ? '' : String(p.estoque),
      ativo: p.ativo ? 'sim' : 'não',
      viscosidade: lista(e.viscosidade),
      base: lista(e.base),
      api: lista(e.api),
      acea: lista(e.acea),
      normas: lista(e.normas),
      medida: lista(e.medida),
      amperagem: e.amperagem == null ? '' : String(e.amperagem),
      tipo: lista(e.tipo),
      troca_km: p.intervalo_km == null ? '' : String(p.intervalo_km),
      troca_meses: p.intervalo_meses == null ? '' : String(p.intervalo_meses),
      aplicacoes: textoDasAplicacoes(p.aplicacoes, ' | '),
      descricao: p.descricao ?? ''
    };
    linhas.push(COLUNAS_DA_PLANILHA.map((c) => valores[c]));
  }
  return escreverCsv(linhas);
}

// ---------------------------------------------------------------- mandar de volta

/** O produto como a importação grava (as colunas do banco). */
export const esquemaProdutoDaPlanilha = z
  .object({
    id: z.number().int().positive().nullable(),
    codigo: z.string().trim().max(60, 'O código tem até 60 letras.').nullable(),
    categoria: z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]),
    nome: z.string().trim().min(2, 'Falta o nome.').max(160, 'O nome tem até 160 letras.'),
    marca: z.string().trim().max(80).nullable(),
    descricao: z.string().trim().max(600).nullable(),
    unidade: z.enum(['un', 'L', 'kit', 'par', 'jogo']),
    conteudo: z.number().positive().max(1000).nullable(),
    preco: z.number({ message: 'Falta o preço.' }).positive('O preço precisa ser maior que zero.').max(100000),
    estoque: z.number().int('O estoque é um número inteiro.').min(0).max(1_000_000).nullable(),
    ativo: z.boolean(),
    especificacao: z.record(z.string(), z.unknown()),
    aplicacoes: z.array(z.object({ texto: z.string().max(80), marca: z.string().nullable(), modelo: z.string().nullable(), anoDe: z.number().nullable(), anoAte: z.number().nullable() })).max(100),
    intervalo_km: z.number().int().min(1).max(300000).nullable(),
    intervalo_meses: z.number().int().min(1).max(180).nullable()
  })
  .refine((x) => x.unidade !== 'L' || x.conteudo != null, { message: 'Produto em litros precisa do conteúdo (litros na embalagem).' });
export type ProdutoDaPlanilha = z.infer<typeof esquemaProdutoDaPlanilha>;

export interface LinhaDaPlanilha {
  /** A linha no arquivo (a 1 é o cabeçalho). */
  numero: number;
  acao: 'novo' | 'mudar';
  produto: ProdutoDaPlanilha;
}

export interface LeituraDaPlanilha {
  linhas: LinhaDaPlanilha[];
  erros: { numero: number; erro: string }[];
  /** Colunas do arquivo que o app não conhece (ficam de fora). */
  ignoradas: string[];
}

const NOMES_DAS_COLUNAS: Record<string, ColunaDaPlanilha> = {
  id: 'id',
  codigo: 'codigo',
  sku: 'codigo',
  referencia: 'codigo',
  nome: 'nome',
  produto: 'nome',
  descricao: 'descricao',
  marca: 'marca',
  categoria: 'categoria',
  unidade: 'unidade',
  conteudo: 'conteudo',
  litros: 'conteudo',
  preco: 'preco',
  valor: 'preco',
  estoque: 'estoque',
  quantidade: 'estoque',
  ativo: 'ativo',
  a_venda: 'ativo',
  viscosidade: 'viscosidade',
  base: 'base',
  api: 'api',
  acea: 'acea',
  normas: 'normas',
  medida: 'medida',
  amperagem: 'amperagem',
  tipo: 'tipo',
  troca_km: 'troca_km',
  troca_meses: 'troca_meses',
  aplicacoes: 'aplicacoes',
  aplicacao: 'aplicacoes',
  serve_em: 'aplicacoes'
};

function nomeDaColuna(c: string): ColunaDaPlanilha | null {
  const chave = paraBusca(c).trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return NOMES_DAS_COLUNAS[chave] ?? null;
}

function categoriaDe(v: string): Categoria | null {
  const t = paraBusca(v).trim();
  if (!t) return null;
  return (CATEGORIAS.find((c) => c.id === t.replace(/\s+/g, '_') || paraBusca(c.nome) === t) ?? null)?.id ?? null;
}

function unidadeDe(v: string): ProdutoDaPlanilha['unidade'] | null {
  const t = paraBusca(v).trim();
  if (!t || ['un', 'und', 'unid', 'unidade', 'pc', 'peca'].includes(t)) return 'un';
  if (['l', 'lt', 'litro', 'litros'].includes(t)) return 'L';
  if (['kit', 'par', 'jogo'].includes(t)) return t as 'kit' | 'par' | 'jogo';
  return null;
}

function simOuNao(v: string): boolean | null {
  const t = paraBusca(v).trim();
  if (['sim', 's', '1', 'x', 'true', 'ativo', 'a venda', 'na loja'].includes(t)) return true;
  if (['nao', 'n', '0', 'false', 'inativo', 'fora', 'fora da loja'].includes(t)) return false;
  return null;
}

function listaDe(v: string): string[] | undefined {
  const l = v
    .split(/[,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return l.length ? l : undefined;
}

/**
 * Lê a planilha contra os produtos que a loja já tem. A linha com "id" (ou com o "codigo" de um
 * produto da loja) muda aquele produto; as outras viram produtos novos. Coluna que não veio fica
 * como está; coluna que veio vazia apaga o valor (menos nome, categoria, unidade e preço).
 */
export function lerPlanilha(texto: string, atuais: LinhaProdutoDaLoja[]): LeituraDaPlanilha {
  const tabela = lerCsv(texto);
  const erros: { numero: number; erro: string }[] = [];
  if (tabela.length < 2) return { linhas: [], erros: [{ numero: 1, erro: 'A planilha está vazia. A primeira linha tem os nomes das colunas.' }], ignoradas: [] };
  const cabecalho = tabela[0].map(nomeDaColuna);
  const ignoradas = tabela[0].filter((_, i) => cabecalho[i] == null && tabela[0][i].trim() !== '');
  if (!cabecalho.includes('nome') && !cabecalho.includes('id') && !cabecalho.includes('codigo'))
    return { linhas: [], erros: [{ numero: 1, erro: 'Falta a coluna "nome" (ou "id" ou "codigo" para mudar produtos que já existem).' }], ignoradas };
  if (tabela.length - 1 > LIMITE_DA_PLANILHA) return { linhas: [], erros: [{ numero: 1, erro: `Mande até ${LIMITE_DA_PLANILHA} produtos por vez.` }], ignoradas };
  const porId = new Map(atuais.map((p) => [p.id, p]));
  const porCodigo = new Map(atuais.filter((p) => p.codigo).map((p) => [paraBusca(p.codigo ?? ''), p]));
  const linhas: LinhaDaPlanilha[] = [];
  const codigosVistos = new Map<string, number>();

  tabela.slice(1).forEach((celulas, indice) => {
    const numero = indice + 2;
    const v: Partial<Record<ColunaDaPlanilha, string>> = {};
    cabecalho.forEach((c, i) => {
      if (c) v[c] = (celulas[i] ?? '').trim();
    });
    const tem = (c: ColunaDaPlanilha) => v[c] !== undefined;
    const idTexto = v.id ?? '';
    let atual: LinhaProdutoDaLoja | undefined;
    if (idTexto) {
      atual = porId.get(Number(idTexto));
      if (!atual) return erros.push({ numero, erro: `O produto ${idTexto} não é desta loja. Apague o id para cadastrar como novo.` });
    } else if (v.codigo) atual = porCodigo.get(paraBusca(v.codigo));

    const e = { ...((atual?.especificacao as Record<string, unknown>) ?? {}) };
    const espec = (campo: string, valor: unknown) => {
      if (valor === undefined || valor === '' || (Array.isArray(valor) && !valor.length)) delete e[campo];
      else e[campo] = valor;
    };
    if (tem('viscosidade')) espec('viscosidade', v.viscosidade?.toUpperCase());
    if (tem('base')) {
      const b = paraBusca(v.base ?? '').replace(/[^a-z]/g, '');
      espec('base', b.startsWith('semi') ? 'semissintetico' : b.startsWith('sint') ? 'sintetico' : b.startsWith('min') ? 'mineral' : undefined);
    }
    if (tem('api')) espec('api', v.api?.toUpperCase());
    if (tem('acea')) espec('acea', listaDe((v.acea ?? '').toUpperCase()));
    if (tem('normas')) espec('normas', listaDe(v.normas ?? ''));
    if (tem('medida')) espec('medida', v.medida);
    if (tem('amperagem')) espec('amperagem', v.amperagem ? Math.round(lerNumero(v.amperagem) ?? 0) || undefined : undefined);
    if (tem('tipo')) espec('tipo', v.tipo);

    // nome, categoria, unidade e preço vazios ficam como estavam (não dá para apagar)
    const categoria = v.categoria ? categoriaDe(v.categoria) : (atual?.categoria ?? null);
    if (!categoria) return erros.push({ numero, erro: v.categoria ? `Categoria "${v.categoria}" não existe.` : 'Falta a categoria.' });
    const unidade = v.unidade ? unidadeDe(v.unidade) : (atual?.unidade ?? 'un');
    if (!unidade) return erros.push({ numero, erro: `Unidade "${v.unidade}" não existe. Use un, L, kit, par ou jogo.` });
    const ativo = tem('ativo') && v.ativo ? simOuNao(v.ativo) : (atual?.ativo ?? true);
    if (ativo == null) return erros.push({ numero, erro: `Na coluna "ativo", use sim ou não.` });
    const numeroDe = (c: ColunaDaPlanilha, padrao: number | null) => (tem(c) ? (v[c] ? lerNumero(v[c]) : null) : padrao);
    const aplicacoes: Aplicacao[] = tem('aplicacoes') ? lerAplicacoesDoTexto(v.aplicacoes ?? '') : (atual?.aplicacoes ?? []);
    const conteudo = numeroDe('conteudo', atual?.conteudo ?? null);
    const preco = v.preco ? lerNumero(v.preco) : (atual?.preco ?? null);
    const estoque = numeroDe('estoque', atual?.estoque ?? null);
    const km = numeroDe('troca_km', atual?.intervalo_km ?? null);
    const meses = numeroDe('troca_meses', atual?.intervalo_meses ?? null);

    const candidato = {
      id: atual?.id ?? null,
      codigo: tem('codigo') ? v.codigo || null : (atual?.codigo ?? null),
      categoria,
      nome: v.nome ? v.nome : (atual?.nome ?? ''),
      marca: tem('marca') ? v.marca || null : (atual?.marca ?? null),
      descricao: tem('descricao') ? v.descricao || null : (atual?.descricao ?? null),
      unidade,
      conteudo,
      preco: preco ?? undefined,
      estoque: estoque == null ? null : estoque,
      ativo,
      especificacao: e,
      aplicacoes,
      intervalo_km: km == null ? null : Math.round(km),
      intervalo_meses: meses == null ? null : Math.round(meses)
    };
    const r = esquemaProdutoDaPlanilha.safeParse(candidato);
    if (!r.success) return erros.push({ numero, erro: r.error.issues[0]?.message ?? 'Confira a linha.' });
    if (r.data.codigo) {
      const chave = paraBusca(r.data.codigo);
      const antes = codigosVistos.get(chave);
      if (antes) return erros.push({ numero, erro: `O código ${r.data.codigo} já apareceu na linha ${antes}.` });
      codigosVistos.set(chave, numero);
      const dono = porCodigo.get(chave);
      if (dono && dono.id !== r.data.id) return erros.push({ numero, erro: `O código ${r.data.codigo} já é de outro produto da loja (id ${dono.id}).` });
    }
    linhas.push({ numero, acao: atual ? 'mudar' : 'novo', produto: r.data });
  });
  return { linhas, erros, ignoradas };
}
