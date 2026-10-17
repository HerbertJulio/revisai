// O que o banco devolve para o painel da equipe (tabelas e funções equipe_*), lido com zod.
// Sem nada de servidor aqui: as páginas e os componentes do navegador usam os mesmos tipos.

import { z } from 'zod';
import type { LinhaContrato, LinhaImpulso } from '@/lib/marketplace-dados';
import type { Tom } from '@/lib/equipe-dados';

const numero = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().refine(Number.isFinite));
const numeroOuNulo = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? null : Number(v)))
  .pipe(z.number().nullable());
const texto = z.string();
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const papelEquipe = z.enum(['admin', 'suporte', 'financeiro']);

/** Lê uma lista, deixando de fora (e contando) o que vier fora do formato. */
export function lerLista<T>(esquema: z.ZodType<T>, dados: unknown): { itens: T[]; descartadas: number } {
  const itens: T[] = [];
  let descartadas = 0;
  for (const linha of Array.isArray(dados) ? dados : []) {
    const r = esquema.safeParse(linha);
    if (r.success) itens.push(r.data);
    else descartadas++;
  }
  return { itens, descartadas };
}

function lerUm<T>(esquema: z.ZodType<T>, dados: unknown): T | null {
  const r = esquema.safeParse(dados);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------- oficinas

export const PLANOS_DA_OFICINA = [
  { id: 'pro', nome: 'Pro', plural: 'Pro', tom: 'ok' },
  { id: 'teste', nome: 'Teste', plural: 'Em teste', tom: 'caneta' },
  { id: 'gratis', nome: 'Grátis', plural: 'Grátis', tom: 'neutro' }
] as const satisfies readonly { id: string; nome: string; plural: string; tom: Tom }[];
export type PlanoDaOficina = (typeof PLANOS_DA_OFICINA)[number]['id'];
const plano = z.enum(['pro', 'teste', 'gratis']).catch('gratis');

export const esquemaOficinaEquipe = z.object({
  id: z.string(),
  nome: texto,
  cidade: textoOuNulo,
  uf: textoOuNulo,
  whatsapp: textoOuNulo,
  cnpj: textoOuNulo,
  proAte: textoOuNulo,
  testeAte: textoOuNulo,
  fundador: z.boolean().catch(false),
  ativa: z.boolean().catch(true),
  excluirEm: textoOuNulo,
  criado_em: texto,
  plano,
  membros: numero,
  dono: textoOuNulo,
  clientes: numero,
  documentos: numero,
  ultimoUso: textoOuNulo,
  montagensMes: numero,
  compras: numero
});
export type OficinaEquipe = z.infer<typeof esquemaOficinaEquipe>;
export const lerOficinasEquipe = (d: unknown) => lerLista(esquemaOficinaEquipe, d);

/** A oficina como a equipe vê no detalhe (a linha da tabela). */
export const COLUNAS_OFICINA_DETALHE = 'id, nome, whatsapp, cidade, uf, endereco, cnpj, pro_ate, teste_ate, fundador, ativa, criado_em, excluir_em';
export const esquemaOficinaDetalhe = z.object({
  id: z.string(),
  nome: texto,
  whatsapp: textoOuNulo,
  cidade: textoOuNulo,
  uf: textoOuNulo,
  endereco: textoOuNulo,
  cnpj: textoOuNulo,
  pro_ate: textoOuNulo,
  teste_ate: textoOuNulo,
  fundador: z.boolean(),
  ativa: z.boolean(),
  criado_em: texto,
  excluir_em: textoOuNulo
});
export type OficinaDetalhe = z.infer<typeof esquemaOficinaDetalhe>;
export const lerOficinaDetalhe = (d: unknown) => lerUm(esquemaOficinaDetalhe, d);

/** O plano da oficina hoje (as mesmas regras de privado.plano_da_oficina). */
export function planoNoDia(o: { pro_ate: string | null; teste_ate: string | null }, hoje: string): PlanoDaOficina {
  if (o.pro_ate && o.pro_ate >= hoje) return 'pro';
  if (o.teste_ate && o.teste_ate >= hoje) return 'teste';
  return 'gratis';
}

export const esquemaMembro = z.object({
  user_id: z.string(),
  papel: texto,
  email: textoOuNulo,
  nome: textoOuNulo,
  criado_em: texto
});
export type MembroEquipeVe = z.infer<typeof esquemaMembro>;
export const lerMembros = (d: unknown) => lerLista(esquemaMembro, d);

export const esquemaConvite = z.object({
  id: z.string(),
  email: texto,
  papel: texto,
  criado_em: texto,
  expira_em: texto,
  aceito_em: textoOuNulo,
  oficina_id: textoOuNulo,
  fornecedor_id: numeroOuNulo
});
export type ConviteEquipeVe = z.infer<typeof esquemaConvite>;
export const lerConvites = (d: unknown) => lerLista(esquemaConvite, d);

/** O uso do mês (uso_do_mes): montagens de ordem pela IA e transcrições de voz. */
export const esquemaUsoDoMes = z.object({
  plano,
  mes: texto,
  montagem: z.object({ usado: numero, limite: numeroOuNulo }),
  transcricao: z.object({ usado: numero, limite: numeroOuNulo })
});
export type UsoDoMes = z.infer<typeof esquemaUsoDoMes>;
export const lerUsoDoMes = (d: unknown) => lerUm(esquemaUsoDoMes, d);

export const COLUNAS_CREDITO = 'id, oficina_id, codigo_pro, quantidade, valor, observacao, criado_em';
export const esquemaCredito = z.object({
  id: numero,
  oficina_id: textoOuNulo,
  codigo_pro: textoOuNulo,
  quantidade: numero,
  valor: numeroOuNulo,
  observacao: textoOuNulo,
  criado_em: texto
});
export type CreditoDeAlertas = z.infer<typeof esquemaCredito>;
export const lerCreditos = (d: unknown) => lerLista(esquemaCredito, d);

// ---------------------------------------------------------------- alertas de preço por oficina

const esquemaUsoAlertas = z.object({ oficinaId: z.string(), noMes: numero, creditos: numero, gastos: numero });

export interface UsoDeAlertasDaOficina {
  noMes: number;
  creditos: number;
  gastos: number;
  /** Pacotes extras que ainda sobram. */
  extras: number;
}

export function lerUsoDeAlertas(d: unknown): Record<string, UsoDeAlertasDaOficina> {
  const r: Record<string, UsoDeAlertasDaOficina> = {};
  for (const u of lerLista(esquemaUsoAlertas, d).itens) r[u.oficinaId] = { noMes: u.noMes, creditos: u.creditos, gastos: u.gastos, extras: Math.max(0, u.creditos - u.gastos) };
  return r;
}

/**
 * O pedido de pacote de alertas vem como cadastro do site. A oficina vem no texto ("Oficina:
 * <id>") quando o app manda; nos pedidos antigos, pelo código do Pro ("Código do Pro: XXXX-…").
 */
export function oficinaDoPedidoDeAlertas(mensagem: string | null, codigos: { codigo: string; oficina_id: string | null }[]): string | null {
  if (!mensagem) return null;
  const id = mensagem.match(/Oficina:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  if (id) return id.toLowerCase();
  const codigo = (mensagem.match(/Código do Pro:\s*([0-9A-Z-]{16,19})/)?.[1] ?? '').replace(/[^0-9A-Z]/g, '');
  return codigo.length === 16 ? (codigos.find((c) => c.codigo === codigo)?.oficina_id ?? null) : null;
}

/** Quantos alertas o pedido de pacote pediu ("Quer 20 alertas…"), ou 0. */
export function quantidadeDoPedidoDeAlertas(mensagem: string | null): number {
  return Number(mensagem?.match(/Quer (\d+) alertas/)?.[1] ?? 0);
}

// ---------------------------------------------------------------- números do negócio

export const esquemaMetricasAssinatura = z.object({
  pagantes: numero,
  comAssinatura: numero,
  mrr: numero,
  receitaMedia: numero,
  teste: numero,
  gratis: numero,
  receitaMes: numero,
  churnMes: z.object({ sairam: numero, base: numero }),
  conversao: z.object({ cadastradas: numero, testaram: numero, pro: numero }),
  serie: z.array(z.object({ mes: texto, receita: numero, assinaturas: numero, oficinasNovas: numero }))
});
export type MetricasAssinatura = z.infer<typeof esquemaMetricasAssinatura>;
export const lerMetricasAssinatura = (d: unknown) => lerUm(esquemaMetricasAssinatura, d);

export const esquemaCoorte = z.object({
  coorte: texto,
  oficinas: numero,
  meses: z
    .array(z.object({ idade: numero, gmv: numero, ativas: numero }))
    .nullish()
    .transform((v) => v ?? [])
});
export type CoorteGmv = z.infer<typeof esquemaCoorte>;
export const lerCoortes = (d: unknown) => lerLista(esquemaCoorte, d);

export const esquemaPainelMarketplace = z.object({
  dias: numero,
  gmv: numero,
  gmvAnterior: numero,
  comissao: numero,
  takeRate: numero,
  pedidos: numero,
  compradoras: numero,
  ticket: numero,
  cancelamento: z.object({ partes: numero, canceladas: numero, pelaLoja: numero }),
  recompra: z.record(z.string(), z.object({ base: numero, voltaram: numero })).catch({}),
  diasAtePrimeiraCompra: numeroOuNulo,
  horasConfirmacaoEntrega: numeroOuNulo,
  lojas: z.array(z.object({ id: numero, nome: texto, gmv: numero, partes: numero, canceladas: numero }))
});
export type PainelMarketplace = z.infer<typeof esquemaPainelMarketplace>;
export const lerPainelMarketplace = (d: unknown) => lerUm(esquemaPainelMarketplace, d);

export const esquemaUsoDaOficina = z.object({
  id: z.string(),
  nome: texto,
  cidade: textoOuNulo,
  uf: textoOuNulo,
  criadoEm: texto,
  plano,
  clientes: numero,
  carros: numero,
  servicos: numero,
  documentos: numero,
  avisos: numero,
  montagens: numero,
  transcricoes: numero,
  ultimoUso: textoOuNulo
});
export type UsoDaOficina = z.infer<typeof esquemaUsoDaOficina>;

export const esquemaFunilUso = z.object({
  funil: z.object({ cadastradas: numero, comDados: numero, com10Clientes: numero, testaram: numero, pro: numero }),
  oficinas: z.array(esquemaUsoDaOficina)
});
export type FunilUso = z.infer<typeof esquemaFunilUso>;
export const lerFunilUso = (d: unknown) => lerUm(esquemaFunilUso, d);

export const NOMES_SINAL: Record<string, string> = {
  compras_conta_nova: 'Conta nova comprando muito',
  vendas_loja_nova: 'Loja nova vendendo muito',
  cancelados: 'Muitos pedidos cancelados',
  loja_cancelando: 'Loja cancelando pedidos',
  alertas: 'Alertas de preço em série'
};

export const esquemaSinal = z.object({
  tipo: z.enum(['oficina', 'loja']),
  id: texto,
  nome: texto,
  criado: texto,
  sinal: texto,
  motivo: texto,
  valor: numero
});
export type SinalAntifraude = z.infer<typeof esquemaSinal>;
export const lerSinais = (d: unknown) => lerLista(esquemaSinal, d);

/** Sinais em reais (o resto é contagem). */
export function sinalEmReais(sinal: string): boolean {
  return sinal === 'compras_conta_nova' || sinal === 'vendas_loja_nova';
}

/** Variação em % entre dois valores (null quando não dá para comparar). */
export function variacao(atual: number, anterior: number): number | null {
  if (!(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

/** Parte de um todo em % com uma casa (0 quando o todo é zero). */
export function porcento(parte: number, todo: number): number {
  return todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0;
}

// ---------------------------------------------------------------- equipe

export const esquemaMembroEquipe = z.object({
  userId: z.string(),
  email: texto,
  nome: textoOuNulo,
  papel: papelEquipe,
  ativo: z.boolean(),
  criadoEm: texto,
  ultimoAcesso: textoOuNulo
});
export type MembroEquipe = z.infer<typeof esquemaMembroEquipe>;

export const esquemaConviteEquipe = z.object({ email: texto, papel: papelEquipe, nome: textoOuNulo, criadoEm: texto });
export type ConviteEquipe = z.infer<typeof esquemaConviteEquipe>;

export function lerEquipe(d: unknown): { membros: MembroEquipe[]; convites: ConviteEquipe[] } {
  const o = (d && typeof d === 'object' ? d : {}) as { membros?: unknown; convites?: unknown };
  return { membros: lerLista(esquemaMembroEquipe, o.membros).itens, convites: lerLista(esquemaConviteEquipe, o.convites).itens };
}

// ---------------------------------------------------------------- histórico e acessos

const objetoOuNulo = z
  .record(z.string(), z.unknown())
  .nullish()
  .transform((v) => v ?? null);

export const esquemaEvento = z.object({
  id: numero,
  quando: texto,
  email: textoOuNulo,
  papel: textoOuNulo,
  acao: texto,
  tabela: textoOuNulo,
  registro: textoOuNulo,
  antes: objetoOuNulo,
  depois: objetoOuNulo,
  ip: textoOuNulo
});
export type EventoDoHistorico = z.infer<typeof esquemaEvento>;
export const lerEventos = (d: unknown) => lerLista(esquemaEvento, d);

export const esquemaAcesso = z.object({
  quando: texto,
  userId: textoOuNulo,
  ip: texto,
  porta: numeroOuNulo,
  rota: textoOuNulo,
  agente: textoOuNulo
});
export type RegistroDeAcesso = z.infer<typeof esquemaAcesso>;
export const lerAcessos = (d: unknown) => lerLista(esquemaAcesso, d);

// ---------------------------------------------------------------- suporte

export const SITUACOES_CHAMADO = [
  { id: 'novo', nome: 'Esperando a equipe', plural: 'Esperando', tom: 'oleo' },
  { id: 'respondido', nome: 'Respondido', plural: 'Respondidos', tom: 'ok' },
  { id: 'fechado', nome: 'Fechado', plural: 'Fechados', tom: 'neutro' }
] as const satisfies readonly { id: string; nome: string; plural: string; tom: Tom }[];
export type SituacaoChamado = (typeof SITUACOES_CHAMADO)[number]['id'];

export const COLUNAS_CHAMADO = 'id, user_id, email, oficina_id, fornecedor_id, assunto, situacao, criado_em, atualizado_em, respondido_em';
export const esquemaChamado = z.object({
  id: z.string(),
  user_id: textoOuNulo,
  email: textoOuNulo,
  oficina_id: textoOuNulo,
  fornecedor_id: numeroOuNulo,
  assunto: texto,
  situacao: z.enum(['novo', 'respondido', 'fechado']),
  criado_em: texto,
  atualizado_em: texto,
  respondido_em: textoOuNulo
});
export type Chamado = z.infer<typeof esquemaChamado> & { origem?: string | null };
export const lerChamados = (d: unknown) => lerLista(esquemaChamado, d);

export const COLUNAS_MENSAGEM = 'id, chamado_id, autor, email, texto, criado_em';
export const esquemaMensagem = z.object({
  id: numero,
  chamado_id: z.string(),
  autor: z.enum(['cliente', 'equipe']),
  email: textoOuNulo,
  texto: texto,
  criado_em: texto
});
export type MensagemDoChamado = z.infer<typeof esquemaMensagem>;
export const lerMensagens = (d: unknown) => lerLista(esquemaMensagem, d);

// ---------------------------------------------------------------- lojas

export const VERIFICACOES_LOJA = [
  { id: 'pendente', nome: 'Em análise', tom: 'oleo' },
  { id: 'aprovada', nome: 'Aprovada', tom: 'ok' },
  { id: 'recusada', nome: 'Recusada', tom: 'atraso' }
] as const satisfies readonly { id: string; nome: string; tom: Tom }[];
export type VerificacaoLoja = (typeof VERIFICACOES_LOJA)[number]['id'];

/** O CNPJ, o e-mail e a observação da verificação vêm à parte (lib/loja/privados.ts). */
export const COLUNAS_LOJA_EQUIPE = 'id, nome, cidade, uf, whatsapp, demonstracao, ativo, destaque, destaque_ate, descricao, criado_em, verificacao';
export const esquemaLojaEquipe = z.object({
  id: numero,
  nome: texto,
  cidade: textoOuNulo,
  uf: textoOuNulo,
  whatsapp: textoOuNulo,
  demonstracao: z.boolean(),
  ativo: z.boolean(),
  destaque: z.boolean(),
  destaque_ate: textoOuNulo,
  descricao: textoOuNulo,
  criado_em: texto,
  cnpj: textoOuNulo,
  verificacao: z.enum(['pendente', 'aprovada', 'recusada']).catch('aprovada'),
  verificacao_obs: textoOuNulo,
  email: textoOuNulo
});
export type LinhaLojaEquipe = z.infer<typeof esquemaLojaEquipe>;
export const lerLojasEquipe = (d: unknown) => lerLista(esquemaLojaEquipe, d);

export interface MembroDaLoja {
  userId: string;
  email: string | null;
  nome: string | null;
  papel: string;
  criadoEm: string;
}

export interface ConviteDaLoja {
  id: string;
  email: string;
  papel: string;
  expiraEm: string;
}

/** A loja como o painel da equipe mostra: cadastro, contrato, quem entra nela e as vendas do mês. */
export interface LojaAdmin extends LinhaLojaEquipe {
  contrato: LinhaContrato | null;
  produtosAtivos: number;
  vendasMes: number;
  comissaoMes: number;
  pedidosMes: number;
  membros: MembroDaLoja[];
  convites: ConviteDaLoja[];
}

export interface ImpulsoEquipe extends LinhaImpulso {
  produtoNome: string;
  fornecedorNome: string;
}

// ---------------------------------------------------------------- pedidos

/** A parte de cada loja num pedido, como vem junto do pedido (pedidos_fornecedores). */
export const esquemaParteDoPedido = z.object({
  fornecedor_id: numero,
  status: texto,
  pagamento: z.string().nullish().transform((v) => v ?? 'pendente'),
  subtotal: numero,
  loja: z
    .object({ nome: texto })
    .nullish()
    .transform((v) => v ?? null)
});

/** Uma compra da oficina (a parte de uma loja num pedido), para o detalhe da oficina. */
export const esquemaCompra = z.object({
  id: numero,
  pedido_id: numero,
  codigo: textoOuNulo,
  fornecedor_id: numero,
  subtotal: numero,
  status: texto,
  criado_em: texto,
  loja: z
    .object({ nome: texto })
    .nullish()
    .transform((v) => v ?? null)
});
export type CompraDaOficina = z.infer<typeof esquemaCompra>;
export const lerCompras = (d: unknown) => lerLista(esquemaCompra, d);
