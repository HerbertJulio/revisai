// O dinheiro da oficina: contas a receber e a pagar, parcelas (maquininha, boleto e fiado), o caixa
// do dia, o fiado com lembrete pelo WhatsApp e o Pix do balcão. Funções puras, sem navegador nem
// banco, para testar; as telas ficam em components/oficina/financeiro.

import { diasEntre, formatarData, somarDias, somarMeses } from './datas';
import { totais } from './documentos';
import { formatarMoeda, lerNumero, primeiroNome } from './formatos';
import { codigoPix, normalizarChavePix, txidPix, type TipoChavePix } from './pix';
import type { FormaPagamento, Lancamento, NovoItemExtra } from './registros-oficina';
import type { Documento, Id, Oficina, PedidoEnviado } from './tipos';

/** Soma em centavos, para não juntar erro de arredondamento. */
export function somaEmReais(valores: number[]): number {
  return valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
}

// ---------------------------------------------------------------- formas e categorias

export const FORMAS: { id: FormaPagamento; nome: string }[] = [
  { id: 'pix', nome: 'Pix' },
  { id: 'dinheiro', nome: 'Dinheiro' },
  { id: 'debito', nome: 'Débito' },
  { id: 'credito', nome: 'Crédito' },
  { id: 'boleto', nome: 'Boleto' },
  { id: 'transferencia', nome: 'Transferência' },
  { id: 'fiado', nome: 'Fiado' },
  { id: 'outro', nome: 'Outro' }
];

/** O dinheiro entra na hora (o débito cai no dia seguinte; para o caixa, conta como hoje). */
export const FORMAS_NA_HORA: FormaPagamento[] = ['pix', 'dinheiro', 'debito', 'transferencia', 'outro'];

export function nomeDaForma(f: FormaPagamento | null | undefined): string {
  if (!f) return 'Sem forma';
  return FORMAS.find((x) => x.id === f)?.nome ?? 'Outro';
}

export const CATEGORIAS: Record<Lancamento['tipo'], { id: string; nome: string }[]> = {
  receber: [
    { id: 'servico', nome: 'Serviço' },
    { id: 'pecas', nome: 'Venda de peças' },
    { id: 'clube', nome: 'Clube' },
    { id: 'outros', nome: 'Outros' }
  ],
  pagar: [
    { id: 'fornecedor', nome: 'Fornecedor' },
    { id: 'pecas', nome: 'Compra de peças' },
    { id: 'aluguel', nome: 'Aluguel' },
    { id: 'salario', nome: 'Salário' },
    { id: 'comissao', nome: 'Comissão' },
    { id: 'imposto', nome: 'Imposto' },
    { id: 'contas', nome: 'Água, luz e internet' },
    { id: 'outros', nome: 'Outros' }
  ]
};

export function nomeDaCategoria(id: string, tipo?: Lancamento['tipo']): string {
  const listas = tipo ? [CATEGORIAS[tipo], CATEGORIAS.receber, CATEGORIAS.pagar] : [CATEGORIAS.receber, CATEGORIAS.pagar];
  for (const l of listas) {
    const c = l.find((x) => x.id === id);
    if (c) return c.nome;
  }
  const t = (id ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Outros';
}

// ---------------------------------------------------------------- situação, filtros e totais

export type SituacaoLancamento = 'pago' | 'vencido' | 'hoje' | 'aberto';

export function situacaoDoLancamento(l: Pick<Lancamento, 'pagoEm' | 'vencimento'>, hoje: string): SituacaoLancamento {
  if (l.pagoEm) return 'pago';
  if (l.vencimento < hoje) return 'vencido';
  if (l.vencimento === hoje) return 'hoje';
  return 'aberto';
}

/** "Venceu há 3 dias", "Vence hoje", "Vence em 9 dias", "Recebido em 10/10/2026". */
export function rotuloDoVencimento(l: Pick<Lancamento, 'pagoEm' | 'vencimento' | 'tipo'>, hoje: string): string {
  if (l.pagoEm) return `${l.tipo === 'receber' ? 'Recebido' : 'Pago'} em ${formatarData(l.pagoEm)}`;
  const dias = diasEntre(hoje, l.vencimento);
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  if (dias === -1) return 'Venceu ontem';
  if (dias < 0) return `Venceu há ${-dias} dias`;
  return dias <= 45 ? `Vence em ${dias} dias` : `Vence em ${formatarData(l.vencimento)}`;
}

export type FiltroSituacao = 'abertos' | 'vencidos' | 'pagos' | 'todos';
export type FiltroTipo = 'receber' | 'pagar' | 'todos';

export interface FiltroLancamentos {
  situacao: FiltroSituacao;
  tipo: FiltroTipo;
  /** 'AAAA-MM': o mês do vencimento (do pagamento, para o que já foi pago). */
  mes: string | null;
  busca: string;
}

export const FILTRO_INICIAL: FiltroLancamentos = { situacao: 'abertos', tipo: 'todos', mes: null, busca: '' };

/** A data que conta para o mês: o pagamento, quando já foi pago; senão o vencimento. */
export function dataDeReferencia(l: Pick<Lancamento, 'pagoEm' | 'vencimento'>): string {
  return l.pagoEm ?? l.vencimento;
}

function paraBusca(t: string | null | undefined): string {
  return (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Em aberto primeiro (o que vence antes em cima); depois os pagos, do mais novo ao mais velho. */
export function ordenarLancamentos(lista: Lancamento[]): Lancamento[] {
  return [...lista].sort((a, b) => {
    if (!!a.pagoEm !== !!b.pagoEm) return a.pagoEm ? 1 : -1;
    if (!a.pagoEm || !b.pagoEm) return a.vencimento.localeCompare(b.vencimento) || (a.parcela?.numero ?? 0) - (b.parcela?.numero ?? 0) || a.descricao.localeCompare(b.descricao, 'pt-BR');
    return b.pagoEm.localeCompare(a.pagoEm) || b.atualizadoEm.localeCompare(a.atualizadoEm);
  });
}

export function filtrarLancamentos(lista: Lancamento[], f: FiltroLancamentos, hoje: string, nomeDoCliente: (id: Id) => string = () => ''): Lancamento[] {
  const termo = paraBusca(f.busca.trim());
  const valorBuscado = /\d/.test(f.busca) ? lerNumero(f.busca.replace(/r\$/i, '')) : null;
  const r = lista.filter((l) => {
    if (f.tipo !== 'todos' && l.tipo !== f.tipo) return false;
    const s = situacaoDoLancamento(l, hoje);
    if (f.situacao === 'abertos' && s === 'pago') return false;
    if (f.situacao === 'vencidos' && s !== 'vencido') return false;
    if (f.situacao === 'pagos' && s !== 'pago') return false;
    if (f.mes && dataDeReferencia(l).slice(0, 7) !== f.mes) return false;
    if (termo) {
      if (valorBuscado != null && Math.abs(l.valor - valorBuscado) < 0.005) return true;
      const texto = paraBusca(
        [l.descricao, l.favorecido, l.observacao, l.clienteId ? nomeDoCliente(l.clienteId) : '', l.pedidoCodigo, nomeDaCategoria(l.categoria, l.tipo), nomeDaForma(l.forma)].filter(Boolean).join(' ')
      );
      if (!texto.includes(termo)) return false;
    }
    return true;
  });
  return ordenarLancamentos(r);
}

export interface SomaLancamentos {
  receber: number;
  pagar: number;
  /** Receber menos pagar. */
  saldo: number;
  quantidade: number;
}

export function somarLancamentos(lista: Pick<Lancamento, 'tipo' | 'valor'>[]): SomaLancamentos {
  const receber = somaEmReais(lista.filter((l) => l.tipo === 'receber').map((l) => l.valor));
  const pagar = somaEmReais(lista.filter((l) => l.tipo === 'pagar').map((l) => l.valor));
  return { receber, pagar, saldo: somaEmReais([receber, -pagar]), quantidade: lista.length };
}

export interface ResumoFinanceiro {
  aReceber: number;
  receberVencido: number;
  aPagar: number;
  pagarVencido: number;
  /** Recebido e pago no mês de hoje. */
  recebidoNoMes: number;
  pagoNoMes: number;
}

export function resumoFinanceiro(lista: Lancamento[], hoje: string): ResumoFinanceiro {
  const mes = hoje.slice(0, 7);
  const soma = (fn: (l: Lancamento) => boolean) => somaEmReais(lista.filter(fn).map((l) => l.valor));
  return {
    aReceber: soma((l) => l.tipo === 'receber' && !l.pagoEm),
    receberVencido: soma((l) => l.tipo === 'receber' && !l.pagoEm && l.vencimento < hoje),
    aPagar: soma((l) => l.tipo === 'pagar' && !l.pagoEm),
    pagarVencido: soma((l) => l.tipo === 'pagar' && !l.pagoEm && l.vencimento < hoje),
    recebidoNoMes: soma((l) => l.tipo === 'receber' && !!l.pagoEm && l.pagoEm.slice(0, 7) === mes),
    pagoNoMes: soma((l) => l.tipo === 'pagar' && !!l.pagoEm && l.pagoEm.slice(0, 7) === mes)
  };
}

// ---------------------------------------------------------------- parcelas

/** Divide o valor em n parcelas, em centavos: a sobra do arredondamento vai na primeira. */
export function dividirEmParcelas(valor: number, n: number): number[] {
  const total = Math.round(valor * 100);
  const vezes = Math.max(1, Math.floor(n) || 1);
  if (!(total > 0)) return [];
  const base = Math.floor(total / vezes);
  const sobra = total - base * vezes;
  return Array.from({ length: vezes }, (_, i) => (base + (i === 0 ? sobra : 0)) / 100);
}

/** 'mensal': todo mês no mesmo dia (31/01, 28/02, 31/03); '30dias': de 30 em 30 dias, como a maquininha paga. */
export type IntervaloParcelas = 'mensal' | '30dias';

export function vencimentosDasParcelas(primeiro: string, n: number, intervalo: IntervaloParcelas = 'mensal'): string[] {
  const vezes = Math.max(1, Math.floor(n) || 1);
  // sempre a partir da primeira data, para o dia não escorregar depois de um fevereiro
  return Array.from({ length: vezes }, (_, i) => (intervalo === 'mensal' ? somarMeses(primeiro, i) : somarDias(primeiro, 30 * i)));
}

export const MAX_PARCELAS = 24;

export interface NovaConta {
  tipo: Lancamento['tipo'];
  descricao: string;
  /** O total; com parcelas, é dividido entre elas. */
  valor: number;
  parcelas?: number;
  /** O vencimento da primeira parcela. */
  vencimento: string;
  intervalo?: IntervaloParcelas;
  forma: FormaPagamento | null;
  categoria: string;
  clienteId?: Id | null;
  documentoId?: Id | null;
  favorecido?: string;
  pedidoCodigo?: string | null;
  observacao?: string;
  /** Já pago nesta data (só vale para a conta de uma parcela). */
  pagoEm?: string | null;
}

/** Os lançamentos de uma conta nova: um só, ou um por parcela (todas com o mesmo grupo). */
export function montarLancamentos(c: NovaConta, novoId: () => Id): NovoItemExtra<'lancamentos'>[] {
  const n = Math.min(MAX_PARCELAS, Math.max(1, Math.floor(c.parcelas ?? 1) || 1));
  const valores = dividirEmParcelas(c.valor, n);
  if (!valores.length) return [];
  const datas = vencimentosDasParcelas(c.vencimento, n, c.intervalo ?? 'mensal');
  const grupo = n > 1 ? novoId() : null;
  const favorecido = c.favorecido?.trim();
  const observacao = c.observacao?.trim();
  return valores.map((valor, i) => ({
    id: novoId(),
    tipo: c.tipo,
    descricao: c.descricao.trim() || (c.tipo === 'receber' ? 'Conta a receber' : 'Conta a pagar'),
    valor,
    vencimento: datas[i],
    pagoEm: n === 1 ? (c.pagoEm ?? null) : null,
    forma: c.forma,
    categoria: c.categoria || 'outros',
    parcela: grupo ? { numero: i + 1, total: n, grupo } : null,
    clienteId: c.clienteId ?? null,
    documentoId: c.documentoId ?? null,
    ...(favorecido ? { favorecido } : {}),
    ...(c.pedidoCodigo ? { pedidoCodigo: c.pedidoCodigo } : {}),
    ...(observacao ? { observacao } : {})
  }));
}

export type ErrosDaConta = Partial<Record<'descricao' | 'valor' | 'vencimento' | 'parcelas', string>>;

export function errosDaConta(c: Pick<NovaConta, 'descricao' | 'valor' | 'vencimento' | 'parcelas'>): ErrosDaConta {
  const e: ErrosDaConta = {};
  if (c.descricao.trim().length < 2) e.descricao = 'Escreva do que é a conta.';
  if (!(c.valor > 0)) e.valor = 'Escreva o valor.';
  else if (c.valor > 10_000_000) e.valor = 'Confira o valor.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) e.vencimento = 'Escolha a data.';
  const n = c.parcelas ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) e.parcelas = `De 1 a ${MAX_PARCELAS} vezes.`;
  else if (c.valor > 0 && c.valor * 100 < n) e.parcelas = 'O valor é pequeno demais para tantas parcelas.';
  return e;
}

/** O lançamento recebido (ou pago) num dia, numa forma de pagamento. */
export function marcarPago(l: Lancamento, dia: string, forma: FormaPagamento | null): Lancamento {
  return { ...l, pagoEm: dia, forma: forma ?? l.forma };
}

/** Desfaz o recebimento (ou o pagamento): volta a ficar em aberto. */
export function desfazerPagamento(l: Lancamento): Lancamento {
  return { ...l, pagoEm: null };
}

// ---------------------------------------------------------------- recebimento (OS e balcão)

export interface Recebimento {
  valor: number;
  forma: FormaPagamento;
  /** Em quantas vezes: crédito na maquininha, boleto ou fiado. */
  parcelas: number;
  /** Primeiro vencimento do fiado ou do boleto (padrão: daqui a 30 dias). */
  vencimento?: string | null;
  /** A maquininha antecipa: o crédito, mesmo parcelado, cai todo hoje. */
  antecipado?: boolean;
  hoje: string;
  descricao: string;
  categoria?: string;
  clienteId?: Id | null;
  documentoId?: Id | null;
  observacao?: string;
}

/**
 * Como o dinheiro do cliente entra: Pix, dinheiro e débito entram hoje; o crédito vira as parcelas
 * que a maquininha paga de 30 em 30 dias (ou entra todo hoje, se ela antecipa); boleto e fiado
 * ficam em aberto, todo mês no mesmo dia.
 */
export function montarRecebimento(r: Recebimento, novoId: () => Id): NovoItemExtra<'lancamentos'>[] {
  const n = Math.min(MAX_PARCELAS, Math.max(1, Math.floor(r.parcelas) || 1));
  const base = {
    tipo: 'receber' as const,
    descricao: r.descricao,
    valor: r.valor,
    forma: r.forma,
    categoria: r.categoria ?? 'servico',
    clienteId: r.clienteId ?? null,
    documentoId: r.documentoId ?? null,
    observacao: r.observacao
  };
  if (FORMAS_NA_HORA.includes(r.forma)) return montarLancamentos({ ...base, parcelas: 1, vencimento: r.hoje, pagoEm: r.hoje }, novoId);
  if (r.forma === 'credito') {
    if (r.antecipado || n === 1) {
      // à vista no crédito: a maquininha paga em 30 dias, a não ser que antecipe
      if (r.antecipado) return montarLancamentos({ ...base, parcelas: 1, vencimento: r.hoje, pagoEm: r.hoje, observacao: juntar(r.observacao, n > 1 ? `Crédito em ${n}x, antecipado` : 'Crédito, antecipado') }, novoId);
      return montarLancamentos({ ...base, parcelas: 1, vencimento: somarDias(r.hoje, 30), observacao: juntar(r.observacao, 'A maquininha paga') }, novoId);
    }
    return montarLancamentos({ ...base, parcelas: n, vencimento: somarDias(r.hoje, 30), intervalo: '30dias', observacao: juntar(r.observacao, `Crédito em ${n}x, a maquininha paga`) }, novoId);
  }
  return montarLancamentos({ ...base, parcelas: n, vencimento: r.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(r.vencimento) ? r.vencimento : somarDias(r.hoje, 30), intervalo: 'mensal' }, novoId);
}

function juntar(...partes: (string | undefined | null)[]): string {
  return partes
    .map((p) => p?.trim())
    .filter(Boolean)
    .join('. ');
}

export interface PagamentoDaOrdem {
  total: number;
  /** Já entrou no caixa. */
  recebido: number;
  /** Lançado, mas ainda não entrou (fiado, boleto, parcelas da maquininha). */
  aReceber: number;
  /** O que ainda não foi lançado (negativo: lançou a mais). */
  falta: number;
  lancamentos: Lancamento[];
}

export function pagamentoDaOrdem(doc: Pick<Documento, 'id' | 'linhas' | 'desconto'>, lancamentos: Lancamento[]): PagamentoDaOrdem {
  const daOrdem = ordenarLancamentos(lancamentos.filter((l) => l.documentoId === doc.id && l.tipo === 'receber'));
  const total = totais(doc).total;
  const recebido = somaEmReais(daOrdem.filter((l) => l.pagoEm).map((l) => l.valor));
  const aReceber = somaEmReais(daOrdem.filter((l) => !l.pagoEm).map((l) => l.valor));
  return { total, recebido, aReceber, falta: somaEmReais([total, -recebido, -aReceber]), lancamentos: daOrdem };
}

// ---------------------------------------------------------------- caixa do dia

export interface LinhaDoCaixa {
  forma: FormaPagamento | null;
  nome: string;
  total: number;
  quantidade: number;
}

export interface CaixaDoDia {
  dia: string;
  entradas: LinhaDoCaixa[];
  saidas: LinhaDoCaixa[];
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  lancamentos: Lancamento[];
}

function porForma(lista: Lancamento[]): LinhaDoCaixa[] {
  const ordem: (FormaPagamento | null)[] = [...FORMAS.map((f) => f.id), null];
  const grupos = new Map<FormaPagamento | null, Lancamento[]>();
  for (const l of lista) {
    const f = l.forma ?? null;
    grupos.set(f, [...(grupos.get(f) ?? []), l]);
  }
  return [...grupos.entries()]
    .sort((a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0]))
    .map(([forma, ls]) => ({ forma, nome: nomeDaForma(forma), total: somaEmReais(ls.map((l) => l.valor)), quantidade: ls.length }));
}

/** O que entrou e saiu num dia (os lançamentos pagos naquele dia), por forma de pagamento. */
export function caixaDoDia(lancamentos: Lancamento[], dia: string): CaixaDoDia {
  const doDia = lancamentos.filter((l) => l.pagoEm === dia).sort((a, b) => (a.tipo === b.tipo ? b.atualizadoEm.localeCompare(a.atualizadoEm) : a.tipo === 'receber' ? -1 : 1));
  const entradas = doDia.filter((l) => l.tipo === 'receber');
  const saidas = doDia.filter((l) => l.tipo === 'pagar');
  const totalEntradas = somaEmReais(entradas.map((l) => l.valor));
  const totalSaidas = somaEmReais(saidas.map((l) => l.valor));
  return { dia, entradas: porForma(entradas), saidas: porForma(saidas), totalEntradas, totalSaidas, saldo: somaEmReais([totalEntradas, -totalSaidas]), lancamentos: doDia };
}

// ---------------------------------------------------------------- fiado

export function ehFiadoEmAberto(l: Pick<Lancamento, 'tipo' | 'forma' | 'pagoEm'>): boolean {
  return l.tipo === 'receber' && l.forma === 'fiado' && !l.pagoEm;
}

export interface FiadoDoCliente {
  /** O cliente, ou o próprio lançamento quando não tem cliente. */
  chave: string;
  clienteId: Id | null;
  lancamentos: Lancamento[];
  total: number;
  vencido: number;
  /** O vencimento mais antigo em aberto. */
  primeiroVencimento: string;
  /** O último lembrete mandado. */
  lembradoEm: string | null;
}

/** O fiado em aberto, junto por cliente: quem tem coisa vencida primeiro (a mais antiga em cima). */
export function fiadosPorCliente(lancamentos: Lancamento[], hoje: string, soVencidos = false): FiadoDoCliente[] {
  const grupos = new Map<string, Lancamento[]>();
  for (const l of lancamentos) {
    if (!ehFiadoEmAberto(l) || (soVencidos && !(l.vencimento < hoje))) continue;
    const chave = l.clienteId ? `c:${l.clienteId}` : `l:${l.id}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), l]);
  }
  const r: FiadoDoCliente[] = [];
  for (const [chave, ls] of grupos) {
    const ordenados = ordenarLancamentos(ls);
    const lembretes = ls.map((l) => l.lembradoEm).filter((x): x is string => !!x).sort();
    r.push({
      chave,
      clienteId: ordenados[0].clienteId ?? null,
      lancamentos: ordenados,
      total: somaEmReais(ls.map((l) => l.valor)),
      vencido: somaEmReais(ls.filter((l) => l.vencimento < hoje).map((l) => l.valor)),
      primeiroVencimento: ordenados[0].vencimento,
      lembradoEm: lembretes.at(-1) ?? null
    });
  }
  return r.sort((a, b) => Number(b.vencido > 0) - Number(a.vencido > 0) || a.primeiroVencimento.localeCompare(b.primeiroVencimento));
}

function quandoVence(vencimento: string, hoje: string): string {
  if (vencimento < hoje) return `que venceu em ${formatarData(vencimento)}`;
  if (vencimento === hoje) return 'que vence hoje';
  return `com vencimento em ${formatarData(vencimento)}`;
}

function listaEmTexto(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

export interface ContextoDoLembrete {
  oficina: string;
  cliente: string;
  itens: Pick<Lancamento, 'valor' | 'vencimento' | 'parcela'>[];
  hoje: string;
  /** O Pix copia e cola com o valor (quando a oficina tem chave). */
  pix?: string | null;
}

/** A mensagem do lembrete do fiado para o WhatsApp do cliente: valor, vencimento e o Pix. */
export function mensagemDoFiado(c: ContextoDoLembrete): string {
  const nome = primeiroNome(c.cliente);
  const itens = [...c.itens].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const parcela = (i: (typeof itens)[number]) => (i.parcela && i.parcela.total > 1 ? ` (parcela ${i.parcela.numero} de ${i.parcela.total})` : '');
  const partes = [`Oi${nome ? `, ${nome}` : ''}! Aqui é da ${c.oficina.trim() || 'oficina'}.`];
  if (itens.length === 1) {
    const i = itens[0];
    partes.push(` Passando para lembrar do valor de ${formatarMoeda(i.valor)}${parcela(i)} ${quandoVence(i.vencimento, c.hoje)}.`);
  } else {
    const total = somaEmReais(itens.map((i) => i.valor));
    partes.push(` Passando para lembrar dos valores em aberto: ${listaEmTexto(itens.map((i) => `${formatarMoeda(i.valor)}${parcela(i)} ${quandoVence(i.vencimento, c.hoje)}`))}. Ao todo, ${formatarMoeda(total)}.`);
  }
  if (c.pix) partes.push(`\n\nPara pagar pelo Pix, copie o código abaixo e cole no app do banco, em Pix Copia e Cola:\n${c.pix}`);
  partes.push(`\n\nQualquer dúvida, é só responder esta mensagem. Obrigado!`);
  return partes.join('');
}

// ---------------------------------------------------------------- Pix da oficina

/** O tipo da chave já normalizada (como fica guardada em oficina.chavePix). */
export function tipoDaChavePix(chave: string | null | undefined): TipoChavePix | null {
  const c = (chave ?? '').trim();
  if (!c) return null;
  if (/^\+55\d{10,11}$/.test(c)) return 'telefone';
  if (c.includes('@')) return normalizarChavePix('email', c) === c ? 'email' : null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c)) return 'aleatoria';
  if (/^\d{11}$/.test(c)) return 'cpf';
  if (/^[0-9A-Z]{12}\d{2}$/.test(c)) return 'cnpj';
  return null;
}

/** O tipo mais provável do que a pessoa digitou (11 números pode ser CPF ou celular: escolhe CPF). */
export function adivinharTipoDaChave(texto: string): TipoChavePix {
  const t = texto.trim();
  if (t.includes('@')) return 'email';
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(t)) return 'aleatoria';
  if (/^\+|\(/.test(t)) return 'telefone';
  const d = t.replace(/\D/g, '');
  const alfa = t.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (alfa.length === 14 && /[A-Z]/.test(alfa)) return 'cnpj';
  if (d.length === 14) return 'cnpj';
  if (d.length === 10 || d.length === 12 || d.length === 13) return 'telefone';
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(t)) return 'cpf';
  if (d.length === 11 && /^\d{2}9/.test(d) && /\s|-/.test(t) && !/\./.test(t)) return 'telefone';
  return 'cpf';
}

export const NOMES_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  telefone: 'Celular',
  email: 'E-mail',
  aleatoria: 'Chave aleatória'
};

/** A chave da oficina, se for válida. */
export function chavePixDaOficina(o: Pick<Oficina, 'chavePix'>): string | null {
  const c = o.chavePix?.trim() ?? '';
  return tipoDaChavePix(c) ? c : null;
}

/** O Pix copia e cola da oficina com o valor (estático: a pessoa paga direto na conta da oficina). */
export function pixDaOficina(o: Pick<Oficina, 'chavePix' | 'nome' | 'razaoSocial' | 'cidade'>, valor: number | null, txid?: string): string | null {
  const chave = chavePixDaOficina(o);
  if (!chave) return null;
  return codigoPix({ chave, nome: o.razaoSocial?.trim() || o.nome || 'Oficina', cidade: o.cidade || 'Brasil', valor: valor && valor > 0 ? valor : null, txid: txid ? txidPix(txid) : undefined });
}

/** O identificador do Pix do fiado (aparece no comprovante e no extrato de muitos bancos). */
export function txidDoFiado(lancamentoId: Id): string {
  return txidPix(`FIADO${lancamentoId.replace(/[^0-9a-zA-Z]/g, '').slice(0, 10)}`).toUpperCase();
}

// ---------------------------------------------------------------- pedidos da loja

/** Os pedidos da loja dos últimos `dias` que ainda não viraram conta a pagar. */
export function pedidosSemConta(pedidos: PedidoEnviado[], lancamentos: Pick<Lancamento, 'pedidoCodigo'>[], hoje: string, dias = 60): PedidoEnviado[] {
  const lancados = new Set(lancamentos.map((l) => l.pedidoCodigo).filter(Boolean));
  const desde = somarDias(hoje, -dias);
  return pedidos.filter((p) => !lancados.has(p.codigo) && p.total > 0 && p.quando.slice(0, 10) >= desde).sort((a, b) => b.quando.localeCompare(a.quando));
}

/** As lojas do pedido ("Auto Peças Sul e Lubrificantes Norte"). */
export function lojasDoPedido(p: PedidoEnviado): string {
  const nomes: string[] = [];
  for (const i of p.itens) {
    const n = i.fornecedor?.trim();
    if (n && !nomes.includes(n)) nomes.push(n);
  }
  return listaEmTexto(nomes) || 'Loja do Revisaí';
}

/** A conta a pagar de um pedido da loja. */
export function contaDoPedido(p: PedidoEnviado, hoje: string): NovaConta {
  return {
    tipo: 'pagar',
    descricao: `Pedido ${p.codigo} da loja`,
    valor: p.total,
    vencimento: hoje,
    forma: null,
    categoria: 'pecas',
    favorecido: lojasDoPedido(p),
    pedidoCodigo: p.codigo,
    observacao: `${p.itens.length} ${p.itens.length === 1 ? 'item' : 'itens'}`
  };
}
