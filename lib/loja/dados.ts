// O que o painel da loja mostra, no formato que as telas usam, e a leitura do que vem do banco.
// Sem nada de servidor aqui, para os componentes do navegador usarem os mesmos tipos.

import { z } from 'zod';
import { CATEGORIAS } from '../catalogo';
import type { LinhaRegional } from '../demanda';
import {
  COLUNAS_IMPULSO,
  COLUNAS_PRODUTO,
  lerImpulsos,
  lerProdutosCompletos,
  type ItemDoPedido,
  type LinhaImpulso,
  type LinhaProduto,
  type SituacaoPagamentoParte,
  type SituacaoParte
} from '../marketplace-dados';
import type { TipoChavePix } from '../pix';
import type { Categoria } from '../tipos';

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const texto = z.string().nullish().transform((v) => v ?? null);

function ler<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

// ---------------------------------------------------------------- loja

const esquemaLoja = z.object({
  id: numero,
  nome: z.string(),
  cidade: texto,
  uf: texto,
  whatsapp: texto,
  descricao: texto,
  email: texto,
  cnpj: texto,
  ativo: z.boolean(),
  destaque: z.boolean(),
  destaque_ate: texto,
  demonstracao: z.boolean(),
  verificacao: z.enum(['pendente', 'aprovada', 'recusada']).catch('aprovada'),
  verificacao_obs: texto,
  prazo_entrega_horas: numeroOuNulo.optional().transform((v) => v ?? null),
  avisar_whatsapp: z.boolean().optional().default(true),
  pedido_minimo: numeroOuNulo.optional().transform((v) => v ?? null),
  criado_em: z.string()
});
export type LinhaLoja = z.infer<typeof esquemaLoja>;
export const COLUNAS_LOJA =
  'id, nome, cidade, uf, whatsapp, descricao, email, cnpj, ativo, destaque, destaque_ate, demonstracao, verificacao, verificacao_obs, prazo_entrega_horas, avisar_whatsapp, pedido_minimo, criado_em';

/** Os prazos de entrega que a loja escolhe (em horas). */
export const PRAZOS_DE_ENTREGA: { horas: number; nome: string }[] = [
  { horas: 2, nome: 'Em até 2 horas' },
  { horas: 4, nome: 'Em até 4 horas' },
  { horas: 8, nome: 'No mesmo dia' },
  { horas: 24, nome: 'Em 1 dia útil' },
  { horas: 48, nome: 'Em até 2 dias' },
  { horas: 72, nome: 'Em até 3 dias' }
];

/** "Entrega em até 4 horas", "Entrega no mesmo dia"... (ou null sem prazo). */
export function textoDoPrazoDeEntrega(horas: number | null | undefined): string | null {
  if (!horas || horas < 1) return null;
  const conhecido = PRAZOS_DE_ENTREGA.find((p) => p.horas === horas);
  if (conhecido) return `Entrega ${conhecido.nome.charAt(0).toLowerCase()}${conhecido.nome.slice(1)}`;
  if (horas < 24) return `Entrega em até ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.round(horas / 24);
  return `Entrega em até ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

export function lerLoja(d: unknown): LinhaLoja | null {
  const r = esquemaLoja.safeParse(d);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- produtos

/** Em que carro a peça serve: o texto que a loja escreveu e o que o app entendeu dele. */
export interface Aplicacao {
  texto: string;
  marca: string | null;
  modelo: string | null;
  anoDe: number | null;
  anoAte: number | null;
}

const esquemaAplicacao = z.object({
  texto: z.string(),
  marca: texto,
  modelo: texto,
  anoDe: numeroOuNulo.optional().transform((v) => v ?? null),
  anoAte: numeroOuNulo.optional().transform((v) => v ?? null)
});

export function lerAplicacoes(d: unknown): Aplicacao[] {
  return ler(esquemaAplicacao, d);
}

/** O produto como o painel da loja usa: o do catálogo mais o código, o estoque e as aplicações. */
export type LinhaProdutoDaLoja = LinhaProduto & { codigo: string | null; estoque: number | null; aplicacoes: Aplicacao[] };

export const COLUNAS_PRODUTO_DA_LOJA = `${COLUNAS_PRODUTO}, codigo, estoque, aplicacoes`;

export function lerProdutosDaLoja(d: unknown): LinhaProdutoDaLoja[] {
  const linhas = Array.isArray(d) ? d : [];
  const base = lerProdutosCompletos(linhas).itens;
  const extras = new Map(
    linhas.flatMap((x) => {
      const r = z.object({ id: numero, codigo: texto, estoque: numeroOuNulo.optional().transform((v) => v ?? null), aplicacoes: z.unknown() }).safeParse(x);
      return r.success ? [[r.data.id, r.data] as const] : [];
    })
  );
  return base.map((p) => {
    const e = extras.get(p.id);
    return { ...p, codigo: e?.codigo ?? null, estoque: e?.estoque ?? null, aplicacoes: lerAplicacoes(e?.aplicacoes) };
  });
}

// ---------------------------------------------------------------- impulsos e anúncios por clique

/** O impulso com o modelo por clique (cpc e teto do dia; vazios = impulso por período). */
export type LinhaImpulsoDaLoja = LinhaImpulso & { cpc: number | null; orcamentoDiario: number | null };

export const COLUNAS_IMPULSO_DA_LOJA = `${COLUNAS_IMPULSO}, cpc, orcamento_diario`;

export function lerImpulsosDaLoja(d: unknown): LinhaImpulsoDaLoja[] {
  const linhas = Array.isArray(d) ? d : [];
  const extras = new Map(
    linhas.flatMap((x) => {
      const r = z.object({ id: numero, cpc: numeroOuNulo.optional(), orcamento_diario: numeroOuNulo.optional() }).safeParse(x);
      return r.success ? [[r.data.id, r.data] as const] : [];
    })
  );
  return lerImpulsos(linhas).itens.map((i) => ({ ...i, cpc: extras.get(i.id)?.cpc ?? null, orcamentoDiario: extras.get(i.id)?.orcamento_diario ?? null }));
}

export interface MetricaDoAnuncio {
  impulsoId: number;
  impressoes: number;
  cliques: number;
  custo: number;
  impressoesHoje: number;
  cliquesHoje: number;
  custoHoje: number;
}

export function lerMetricasDosAnuncios(d: unknown): Map<number, MetricaDoAnuncio> {
  const lista = ler(
    z.object({ impulsoId: numero, impressoes: numero, cliques: numero, custo: numero, impressoesHoje: numero, cliquesHoje: numero, custoHoje: numero }),
    d
  );
  return new Map(lista.map((m) => [m.impulsoId, m]));
}

// ---------------------------------------------------------------- pedidos

const esquemaItem = z.object({
  produto_id: numero,
  nome: z.string(),
  fornecedor_id: numero,
  quantidade: numero,
  preco_unitario: numero,
  combinado: z.boolean().nullish().transform((v) => v ?? false)
});

const esquemaParte = z.object({
  id: numero,
  pedido_id: numero,
  codigo: z.string().nullish().transform((v) => v ?? '------'),
  status: z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']),
  subtotal: numero,
  comissao_percentual: numero,
  criado_em: z.string(),
  oficina_nome: z.string().nullish().transform((v) => v ?? 'Oficina'),
  oficina_whatsapp: z.string().nullish().transform((v) => v ?? ''),
  oficina_cidade: texto,
  oficina_uf: texto,
  oficina_endereco: texto,
  observacao: texto,
  itens: z.unknown(),
  pagamento: z.enum(['pendente', 'informado', 'confirmado']).catch('pendente'),
  pagamento_em: texto,
  entrega_previsao: texto,
  entrega_saiu_em: texto,
  entrega_posicao_em: texto,
  entregue_em: texto,
  cancelado_motivo: texto,
  cancelado_por: z.enum(['loja', 'oficina', 'equipe']).nullish().transform((v) => v ?? null)
});

export const COLUNAS_PARTE_DA_LOJA =
  'id, pedido_id, codigo, status, subtotal, comissao_percentual, criado_em, oficina_nome, oficina_whatsapp, oficina_cidade, oficina_uf, oficina_endereco, observacao, itens, pagamento, pagamento_em, entrega_previsao, entrega_saiu_em, entrega_posicao_em, entregue_em, cancelado_motivo, cancelado_por';

const esquemaHistorico = z.object({
  parte_id: numero,
  quando: z.string(),
  campo: z.enum(['status', 'pagamento']),
  de: texto,
  para: texto,
  quem: z.enum(['loja', 'oficina', 'equipe', 'entregador', 'sistema']),
  motivo: texto
});

export interface MudancaDoPedido {
  quando: string;
  campo: 'status' | 'pagamento';
  de: string | null;
  para: string | null;
  quem: 'loja' | 'oficina' | 'equipe' | 'entregador' | 'sistema';
  motivo: string | null;
}

/** A parte de um pedido que cabe à loja, com a oficina para ela chamar no WhatsApp. */
export interface PedidoDaLoja {
  id: number;
  codigo: string;
  criadoEm: string;
  status: SituacaoParte;
  subtotal: number;
  comissaoPercentual: number;
  oficina: { nome: string; whatsapp: string; cidade: string | null; uf: string | null; endereco: string | null };
  observacao: string | null;
  itens: ItemDoPedido[];
  pagamento: SituacaoPagamentoParte;
  pagamentoEm: string | null;
  entrega: { previsao: string | null; saiuEm: string | null; posicaoEm: string | null; entregueEm: string | null };
  cancelamento: { motivo: string | null; por: 'loja' | 'oficina' | 'equipe' | null } | null;
  historico: MudancaDoPedido[];
}

export function lerPedidosDaLoja(partes: unknown, historico: unknown, fornecedorId: number): PedidoDaLoja[] {
  const mudancas = ler(esquemaHistorico, historico);
  return ler(esquemaParte, partes).map((p) => ({
    id: p.id,
    codigo: p.codigo,
    criadoEm: p.criado_em,
    status: p.status,
    subtotal: p.subtotal,
    comissaoPercentual: p.comissao_percentual,
    oficina: { nome: p.oficina_nome, whatsapp: p.oficina_whatsapp, cidade: p.oficina_cidade, uf: p.oficina_uf, endereco: p.oficina_endereco },
    observacao: p.observacao,
    itens: ler(esquemaItem, p.itens)
      .filter((i) => i.fornecedor_id === fornecedorId)
      .map((i) => ({ produto_id: i.produto_id, nome: i.nome, fornecedor_id: i.fornecedor_id, quantidade: i.quantidade, preco_unitario: i.preco_unitario, combinado: i.combinado })),
    pagamento: p.pagamento,
    pagamentoEm: p.pagamento_em,
    entrega: { previsao: p.entrega_previsao, saiuEm: p.entrega_saiu_em, posicaoEm: p.entrega_posicao_em, entregueEm: p.entregue_em },
    cancelamento: p.status === 'cancelado' ? { motivo: p.cancelado_motivo, por: p.cancelado_por } : null,
    historico: mudancas
      .filter((m) => m.parte_id === p.id)
      .sort((a, b) => (a.quando < b.quando ? -1 : 1))
      .map(({ parte_id: _p, ...m }) => m)
  }));
}

// ---------------------------------------------------------------- reputação

export interface Reputacao {
  nova: boolean;
  pedidos: number;
  canceladosPct: number | null;
  atrasoPct: number | null;
  horasParaConfirmar: number | null;
}

const esquemaReputacao = z.object({
  nova: z.boolean(),
  pedidos: numero,
  canceladosPct: numeroOuNulo.optional().transform((v) => v ?? null),
  atrasoPct: numeroOuNulo.optional().transform((v) => v ?? null),
  horasParaConfirmar: numeroOuNulo.optional().transform((v) => v ?? null)
});

export function lerReputacoes(d: unknown): Map<number, Reputacao> {
  const r = new Map<number, Reputacao>();
  if (!d || typeof d !== 'object') return r;
  for (const [id, v] of Object.entries(d as Record<string, unknown>)) {
    const x = esquemaReputacao.safeParse(v);
    if (x.success && /^\d+$/.test(id)) r.set(Number(id), x.data);
  }
  return r;
}

/**
 * A régua da reputação, como a do Mercado Livre: verde com até 2% de cancelamento e 10% de
 * atraso; amarelo até 5% e 20%; acima disso, vermelho.
 */
export function corDaReputacao(r: Reputacao): 'nova' | 'boa' | 'atencao' | 'ruim' {
  if (r.nova) return 'nova';
  const cancel = r.canceladosPct ?? 0;
  const atraso = r.atrasoPct ?? 0;
  if (cancel <= 2 && atraso <= 10) return 'boa';
  if (cancel <= 5 && atraso <= 20) return 'atencao';
  return 'ruim';
}

// ---------------------------------------------------------------- Pix

export interface PixDaLoja {
  tipo: TipoChavePix;
  chave: string;
  nome: string;
  cidade: string;
  desde: string | null;
}

export interface TrocaDePix {
  tipo: TipoChavePix;
  chave: string;
  nome: string;
  cidade: string;
  pedidaEm: string;
  valeEm: string;
  /** O e-mail de quem pediu a troca (para outro dono conferir). */
  pedidaPor: string | null;
}

export interface PixAntigo {
  tipo: string;
  chave: string;
  nome: string;
  usadaAte: string;
}

/** O Pix como o painel mostra: o dono vê tudo; o vendedor só sabe se a loja recebe por Pix. */
export type ResumoPix = { dono: false; tem: boolean } | { dono: true; tem: boolean; atual: PixDaLoja | null; troca: TrocaDePix | null; antigas: PixAntigo[] };

const tipoPix = z.enum(['cnpj', 'cpf', 'email', 'telefone', 'aleatoria']);

const esquemaResumoPix = z.object({
  tem: z.boolean().catch(false),
  dono: z.boolean().catch(false),
  atual: z.object({ tipo: tipoPix, chave: z.string(), nome: z.string(), cidade: z.string(), desde: texto }).nullish().catch(null),
  troca: z
    .object({ tipo: tipoPix, chave: z.string(), nome: z.string(), cidade: z.string(), pedidaEm: z.string(), valeEm: z.string(), pedidaPor: texto })
    .nullish()
    .catch(null),
  antigas: z.array(z.unknown()).nullish().catch([])
});

export function lerResumoPix(d: unknown): ResumoPix | null {
  const r = esquemaResumoPix.safeParse(d);
  if (!r.success) return null;
  if (!r.data.dono) return { dono: false, tem: r.data.tem };
  return {
    dono: true,
    tem: r.data.tem,
    atual: r.data.atual ?? null,
    troca: r.data.troca ? { ...r.data.troca, pedidaPor: r.data.troca.pedidaPor ?? null } : null,
    antigas: ler(z.object({ tipo: z.string(), chave: z.string(), nome: z.string(), usadaAte: z.string() }), r.data.antigas ?? [])
  };
}

// ---------------------------------------------------------------- contrato

/** O que a loja vê do contrato (as anotações da equipe ficam de fora). */
export interface ContratoDaLoja {
  plano: 'vitrine' | 'destaque';
  comissaoPercentual: number;
  mensalidade: number;
}

export const COLUNAS_CONTRATO_DA_LOJA = 'plano, comissao_percentual, mensalidade';

export function lerContratoDaLoja(d: unknown): ContratoDaLoja | null {
  const r = z.object({ plano: z.enum(['vitrine', 'destaque']).catch('vitrine'), comissao_percentual: numero, mensalidade: numero }).safeParse(d);
  return r.success ? { plano: r.data.plano, comissaoPercentual: r.data.comissao_percentual, mensalidade: r.data.mensalidade } : null;
}

// ---------------------------------------------------------------- extrato (base da cobrança)

export interface ParteDoExtrato {
  parteId: number;
  codigo: string;
  /** Quando a oficina fez o pedido. */
  data: string;
  situacao: SituacaoParte;
  subtotal: number;
  comissaoPercentual: number;
  comissao: number;
}

export interface ExtratoDaLoja {
  fornecedorId: number;
  nome: string;
  /** 'AAAA-MM' */
  mes: string;
  partes: ParteDoExtrato[];
  totalVendas: number;
  totalComissao: number;
  mensalidade: number;
  destaqueAte: string | null;
  total: number;
}

const situacao = z.enum(['novo', 'em_contato', 'confirmado', 'saiu_entrega', 'entregue', 'cancelado']);

export function lerExtratoDaLoja(d: unknown): ExtratoDaLoja | null {
  const r = z
    .object({
      fornecedorId: numero,
      nome: z.string(),
      mes: z.string(),
      partes: z.array(z.unknown()).catch([]),
      totalVendas: numero,
      totalComissao: numero,
      mensalidade: numero,
      destaqueAte: texto,
      total: numero
    })
    .safeParse(d);
  if (!r.success) return null;
  const partes = ler(
    z.object({
      parteId: numero,
      codigo: z.string().nullish().transform((v) => v ?? '------'),
      data: z.string(),
      situacao,
      subtotal: numero,
      comissaoPercentual: numero,
      comissao: numero
    }),
    r.data.partes
  );
  return { ...r.data, partes };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** '2026-10' vira 'outubro de 2026'. */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${a}` : mes;
}

export function mesValido(mes: string | null | undefined): mes is string {
  return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** Os últimos n meses ('AAAA-MM'), do mais novo ao mais velho, a partir de hoje ('AAAA-MM-DD'). */
export function ultimosMeses(hoje: string, n = 12): string[] {
  let a = Number(hoje.slice(0, 4));
  let m = Number(hoje.slice(5, 7));
  const lista: string[] = [];
  for (let i = 0; i < n; i++) {
    lista.push(`${a}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      a -= 1;
    }
  }
  return lista;
}

// ---------------------------------------------------------------- clientes e condições

export interface ClienteDaLoja {
  oficinaId: string;
  nome: string;
  cidade: string | null;
  uf: string | null;
  pedidos: number;
  total: number;
  ultimo: string;
}

export interface CondicaoDaOficina {
  id: number;
  oficinaId: string;
  /** null = a loja toda */
  produtoId: number | null;
  descontoPercentual: number | null;
  preco: number | null;
  atualizadoEm: string;
}

export function lerClientes(d: unknown): ClienteDaLoja[] {
  return ler(
    z.object({
      oficinaId: z.string(),
      nome: z.string().nullish().transform((v) => v ?? 'Oficina'),
      cidade: texto,
      uf: texto,
      pedidos: numero,
      total: numero,
      ultimo: z.string()
    }),
    d
  );
}

export const COLUNAS_CONDICAO = 'id, oficina_id, produto_id, desconto_percentual, preco, atualizado_em';

export function lerCondicoes(d: unknown): CondicaoDaOficina[] {
  return ler(
    z.object({ id: numero, oficina_id: z.string(), produto_id: numeroOuNulo, desconto_percentual: numeroOuNulo, preco: numeroOuNulo, atualizado_em: z.string() }),
    d
  ).map((c) => ({ id: c.id, oficinaId: c.oficina_id, produtoId: c.produto_id, descontoPercentual: c.desconto_percentual, preco: c.preco, atualizadoEm: c.atualizado_em }));
}

// ---------------------------------------------------------------- equipe

export interface MembroDaLoja {
  userId: string;
  email: string | null;
  nome: string | null;
  papel: 'dono' | 'vendedor';
  desde: string;
}

export interface ConviteDaLoja {
  id: string;
  email: string;
  papel: 'dono' | 'vendedor';
  criadoEm: string;
  expiraEm: string;
}

export function lerMembros(d: unknown): MembroDaLoja[] {
  return ler(z.object({ user_id: z.string(), email: texto, nome: texto, papel: z.enum(['dono', 'vendedor']), criado_em: z.string() }), d).map((m) => ({
    userId: m.user_id,
    email: m.email,
    nome: m.nome,
    papel: m.papel,
    desde: m.criado_em
  }));
}

export function lerConvites(d: unknown): ConviteDaLoja[] {
  return ler(z.object({ id: z.string(), email: z.string(), papel: z.enum(['dono', 'vendedor']), criado_em: z.string(), expira_em: z.string(), aceito_em: texto }), d)
    .filter((c) => !c.aceito_em && Date.parse(c.expira_em) > Date.now())
    .map((c) => ({ id: c.id, email: c.email, papel: c.papel, criadoEm: c.criado_em, expiraEm: c.expira_em }));
}

// ---------------------------------------------------------------- demanda da região

export interface DemandaDaRegiao {
  uf: string;
  oficinas: number;
  /** Oficinas que uma linha precisa ter para aparecer (para ninguém ser identificado). */
  minimo: number;
  linhas: LinhaRegional[];
  escondidas: number;
}

const categoria = z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]);

export function lerDemanda(d: unknown): DemandaDaRegiao | null {
  const r = z
    .object({
      uf: z.string(),
      oficinas: numero,
      minimo: numero.catch(5),
      linhas: z.array(z.unknown()).catch([]),
      escondidas: numero.catch(0)
    })
    .safeParse(d);
  if (!r.success) return null;
  const linhas = ler(z.object({ categoria, titulo: z.string(), unidade: z.enum(['L', 'un']), quantidade: numero, carros: numero, oficinas: numero }), r.data.linhas);
  return { uf: r.data.uf, oficinas: r.data.oficinas, minimo: r.data.minimo, linhas, escondidas: r.data.escondidas };
}
