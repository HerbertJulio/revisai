// Dados do painel da equipe: formatos das linhas que vêm do banco e as contas da tela.
// Sem nada de servidor aqui, para dar para testar e usar nos componentes do navegador.

import { z } from 'zod';
import { formatarMoeda, plural, primeiroNome } from './formatos';
import { diaEmBrasilia } from './datas';

export const FUSO = 'America/Sao_Paulo';

export type Tom = 'neutro' | 'oleo' | 'atraso' | 'ok' | 'caneta';

export const SITUACOES_PEDIDO = [
  { id: 'novo', nome: 'Novo', plural: 'Novos', tom: 'oleo' },
  { id: 'em_contato', nome: 'Em contato', plural: 'Em contato', tom: 'caneta' },
  { id: 'confirmado', nome: 'Confirmado', plural: 'Confirmados', tom: 'ok' },
  { id: 'entregue', nome: 'Entregue', plural: 'Entregues', tom: 'neutro' },
  { id: 'cancelado', nome: 'Cancelado', plural: 'Cancelados', tom: 'atraso' }
] as const satisfies readonly { id: string; nome: string; plural: string; tom: Tom }[];

export type SituacaoPedido = (typeof SITUACOES_PEDIDO)[number]['id'];

export const SITUACOES_CADASTRO = [
  { id: 'novo', nome: 'Novo', plural: 'Novos', tom: 'oleo' },
  { id: 'respondido', nome: 'Respondido', plural: 'Respondidos', tom: 'ok' },
  { id: 'arquivado', nome: 'Arquivado', plural: 'Arquivados', tom: 'neutro' }
] as const satisfies readonly { id: string; nome: string; plural: string; tom: Tom }[];

export type SituacaoCadastro = (typeof SITUACOES_CADASTRO)[number]['id'];

export const TIPOS_CADASTRO = [
  { id: 'oficina', nome: 'Oficina', plural: 'Oficinas' },
  { id: 'fornecedor', nome: 'Fornecedor', plural: 'Fornecedores' },
  { id: 'motorista', nome: 'Dono de carro', plural: 'Donos de carro' },
  { id: 'contato', nome: 'Contato', plural: 'Contato' }
] as const;

export type TipoCadastro = (typeof TIPOS_CADASTRO)[number]['id'];

/** 'plus' é como o banco grava o Pro (o nome antigo do plano). */
export const NOMES_PLANO: Record<string, string> = {
  gratis: 'Grátis',
  plus: 'Pro',
  pro: 'Pro',
  vitrine: 'Vitrine',
  destaque: 'Destaque',
  oferta: 'Oferta da semana',
  alertas: 'Pacote de alertas de preço'
};

export const NOMES_ORIGEM: Record<string, string> = {
  planos: 'página de planos',
  fornecedores: 'página de fornecedores',
  motorista: 'calculadora do motorista',
  privacidade: 'página de privacidade',
  app: 'painel da oficina',
  'painel-fornecedor': 'painel do fornecedor'
};

const texto = z.string();
const textoOpcional = z.string().nullish().transform((v) => v ?? null);
const numero = z.coerce.number().refine(Number.isFinite);

const esquemaItem = z.object({
  produto_id: numero,
  nome: texto,
  fornecedor_id: numero.nullish().transform((v) => v ?? null),
  fornecedor: z.string().nullish().transform((v) => v ?? 'Fornecedor'),
  quantidade: numero,
  preco_unitario: numero,
  promocao: z.boolean().nullish().transform((v) => v ?? false)
});

export type ItemPedido = z.infer<typeof esquemaItem>;

const esquemaPedido = z.object({
  id: numero,
  codigo: texto,
  oficina_id: z.string().nullish().transform((v) => v ?? null),
  oficina_nome: texto,
  oficina_whatsapp: texto,
  oficina_cidade: textoOpcional,
  oficina_uf: textoOpcional,
  itens: z.array(esquemaItem),
  total: numero,
  observacao: textoOpcional,
  status: z.enum(SITUACOES_PEDIDO.map((s) => s.id) as [SituacaoPedido, ...SituacaoPedido[]]),
  criado_em: texto
});

export type LinhaPedido = z.infer<typeof esquemaPedido>;

/** A situação de cada loja no pedido (a parte dela). */
export interface ParteDoPedido {
  fornecedorId: number;
  fornecedor: string;
  status: string;
  pagamento: string;
  subtotal: number;
}

export type Pedido = LinhaPedido & { partes?: ParteDoPedido[] };

const esquemaCadastro = z.object({
  id: numero,
  tipo: z.enum(TIPOS_CADASTRO.map((t) => t.id) as [TipoCadastro, ...TipoCadastro[]]),
  nome: texto,
  empresa: textoOpcional,
  whatsapp: textoOpcional,
  email: textoOpcional,
  cidade: textoOpcional,
  uf: textoOpcional,
  plano: textoOpcional,
  mensagem: textoOpcional,
  origem: textoOpcional,
  situacao: z.enum(SITUACOES_CADASTRO.map((s) => s.id) as [SituacaoCadastro, ...SituacaoCadastro[]]),
  criado_em: texto
});

export type Cadastro = z.infer<typeof esquemaCadastro>;

const esquemaFornecedor = z.object({
  id: numero,
  nome: texto,
  cidade: textoOpcional,
  uf: textoOpcional,
  whatsapp: textoOpcional,
  demonstracao: z.boolean(),
  ativo: z.boolean()
});

const esquemaProduto = z.object({
  id: numero,
  fornecedor_id: numero,
  categoria: texto,
  nome: texto,
  marca: textoOpcional,
  unidade: texto,
  preco: numero,
  ativo: z.boolean()
});

const esquemaPromocao = z.object({
  id: numero,
  produto_id: numero,
  titulo: texto,
  preco_promocional: numero,
  quantidade_minima: numero,
  inicio: texto,
  fim: texto,
  ativo: z.boolean()
});

export type FornecedorLoja = z.infer<typeof esquemaFornecedor>;
export type ProdutoLoja = z.infer<typeof esquemaProduto>;
export type PromocaoLoja = z.infer<typeof esquemaPromocao>;

export interface LojaEquipe {
  fornecedores: FornecedorLoja[];
  produtos: ProdutoLoja[];
  promocoes: PromocaoLoja[];
}

/** Lê as linhas do banco, deixando de fora (e contando) as que vierem fora do formato. */
function lerLinhas<T>(esquema: z.ZodType<T>, linhas: unknown): { itens: T[]; descartadas: number } {
  const itens: T[] = [];
  let descartadas = 0;
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    const r = esquema.safeParse(linha);
    if (r.success) itens.push(r.data);
    else descartadas++;
  }
  return { itens, descartadas };
}

export const lerPedidos = (linhas: unknown) => lerLinhas(esquemaPedido, linhas);
export const lerCadastros = (linhas: unknown) => lerLinhas(esquemaCadastro, linhas);
export const lerFornecedores = (linhas: unknown) => lerLinhas(esquemaFornecedor, linhas);
export const lerProdutos = (linhas: unknown) => lerLinhas(esquemaProduto, linhas);
export const lerPromocoes = (linhas: unknown) => lerLinhas(esquemaPromocao, linhas);

export function situacaoPedidoValida(s: unknown): s is SituacaoPedido {
  return SITUACOES_PEDIDO.some((x) => x.id === s);
}

export function situacaoCadastroValida(s: unknown): s is SituacaoCadastro {
  return SITUACOES_CADASTRO.some((x) => x.id === s);
}

export function contarPor<T, K extends string>(lista: T[], chave: (item: T) => K): Partial<Record<K, number>> {
  const r: Partial<Record<K, number>> = {};
  for (const item of lista) {
    const k = chave(item);
    r[k] = (r[k] ?? 0) + 1;
  }
  return r;
}

// ---------- datas ----------

const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });

/** O dia no horário de Brasília, como 'AAAA-MM-DD' (o mesmo de lib/datas). */
export { diaEmBrasilia };

/** 'hoje às 21:17', 'ontem às 09:05', '12/10 às 14:30' ou '12/10/2025 às 14:30'. */
export function quandoFoi(iso: string, agora: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = diaEmBrasilia(d);
  const hoje = diaEmBrasilia(agora);
  const hora = formatoHora.format(d);
  if (dia === hoje) return `hoje às ${hora}`;
  if (dia === diaEmBrasilia(agora - 86_400_000)) return `ontem às ${hora}`;
  const [a, m, dd] = dia.split('-');
  return a === hoje.slice(0, 4) ? `${dd}/${m} às ${hora}` : `${dd}/${m}/${a} às ${hora}`;
}

/** Data de calendário 'AAAA-MM-DD' como '31/10' (ano atual) ou '31/10/2027'. */
export function dataCurta(dia: string, hoje: string): string {
  const [a, m, d] = diaEmBrasilia(dia).split('-');
  return a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

// ---------- pedidos ----------

export interface GrupoFornecedor {
  fornecedor: string;
  itens: ItemPedido[];
  subtotal: number;
}

export function porFornecedor(itens: ItemPedido[]): GrupoFornecedor[] {
  const grupos = new Map<string, GrupoFornecedor>();
  for (const item of itens) {
    const g = grupos.get(item.fornecedor) ?? { fornecedor: item.fornecedor, itens: [], subtotal: 0 };
    g.itens.push(item);
    g.subtotal = Math.round((g.subtotal + item.preco_unitario * item.quantidade) * 100) / 100;
    grupos.set(item.fornecedor, g);
  }
  return [...grupos.values()];
}

export function quantidadeDeItens(p: Pick<Pedido, 'itens'>): string {
  return plural(p.itens.length, 'item', 'itens');
}

export function mensagemPedido(p: Pick<Pedido, 'codigo' | 'oficina_nome' | 'itens' | 'total'>): string {
  return `Olá! Aqui é da equipe do Revisaí. Recebemos o pedido ${p.codigo} da ${p.oficina_nome}, com ${quantidadeDeItens(p)}, no total de ${formatarMoeda(p.total)}. Vamos combinar o pagamento e a entrega?`;
}

/**
 * A situação do pedido para a equipe. Com cada loja cuidando da sua parte, vale o andamento delas:
 * novo enquanto nenhuma loja mexeu, entregue quando todas entregaram (ou cancelaram), cancelado quando
 * todas cancelaram. O pedido antigo, sem partes, fica com a situação que a equipe deu.
 */
export function situacaoDoPedido(p: Pick<Pedido, 'status' | 'partes'>): SituacaoPedido {
  const partes = (p.partes ?? []).map((x) => x.status);
  if (!partes.length) return p.status;
  if (partes.every((x) => x === 'cancelado')) return 'cancelado';
  if (partes.every((x) => x === 'entregue' || x === 'cancelado')) return 'entregue';
  if (partes.some((x) => x === 'confirmado' || x === 'saiu_entrega' || x === 'entregue')) return 'confirmado';
  if (partes.some((x) => x === 'em_contato')) return 'em_contato';
  return 'novo';
}

export function somaDosPedidos(pedidos: Pick<Pedido, 'total'>[]): number {
  return Math.round(pedidos.reduce((s, p) => s + p.total, 0) * 100) / 100;
}

// ---------- cadastros ----------

export function nomeDoTipo(tipo: TipoCadastro): string {
  return TIPOS_CADASTRO.find((t) => t.id === tipo)?.nome ?? tipo;
}

export function mensagemCadastro(c: Pick<Cadastro, 'tipo' | 'nome' | 'empresa' | 'plano'>): string {
  const nome = primeiroNome(c.nome);
  const inicio = `Oi, ${nome}! Aqui é da equipe do Revisaí.`;
  const empresa = c.empresa?.trim();
  switch (c.tipo) {
    case 'oficina':
      return c.plano === 'plus' || c.plano === 'pro'
        ? `${inicio} Vi que você quer o Revisaí Pro${empresa ? ` para a ${empresa}` : ''}. Posso te explicar como funciona e liberar o seu acesso?`
        : `${inicio} Recebemos o seu contato${empresa ? ` da ${empresa}` : ''}. Como podemos ajudar a sua oficina?`;
    case 'fornecedor':
      return `${inicio} Recebemos o interesse${empresa ? ` da ${empresa}` : ''} em vender para as oficinas pelo Revisaí. Podemos conversar sobre como funciona?`;
    case 'motorista':
      return `${inicio} Recebemos o seu cadastro. Quer que a gente indique uma oficina parceira perto de você?`;
    default:
      return `${inicio} Recebemos a sua mensagem e já vamos te ajudar.`;
  }
}

export function assuntoEmail(c: Pick<Cadastro, 'tipo'>): string {
  return c.tipo === 'fornecedor' ? 'Revisaí: vender para as oficinas' : 'Revisaí: o seu contato';
}

// ---------- loja ----------

export type SituacaoPromocao = 'em_vigor' | 'programada' | 'encerrada' | 'pausada';

export const SITUACOES_PROMOCAO: { id: SituacaoPromocao; nome: string; plural: string; tom: Tom }[] = [
  { id: 'em_vigor', nome: 'Em vigor', plural: 'Em vigor', tom: 'ok' },
  { id: 'programada', nome: 'Programada', plural: 'Programadas', tom: 'caneta' },
  { id: 'encerrada', nome: 'Encerrada', plural: 'Encerradas', tom: 'neutro' },
  { id: 'pausada', nome: 'Pausada', plural: 'Pausadas', tom: 'atraso' }
];

export function situacaoPromocao(p: Pick<PromocaoLoja, 'ativo' | 'inicio' | 'fim'>, hoje: string): SituacaoPromocao {
  if (!p.ativo) return 'pausada';
  if (p.fim < hoje) return 'encerrada';
  if (p.inicio > hoje) return 'programada';
  return 'em_vigor';
}

/** Desconto em % (arredondado), ou 0 se a promoção não baixar o preço. */
export function descontoPercentual(preco: number, promocional: number): number {
  if (!(preco > 0) || !(promocional < preco)) return 0;
  return Math.round((1 - promocional / preco) * 100);
}

/** Dias que faltam para a promoção acabar (0 = acaba hoje). */
export function diasParaAcabar(fim: string, hoje: string): number {
  return Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
}
