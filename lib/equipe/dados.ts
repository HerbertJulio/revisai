import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';
import { z } from 'zod';
import { comDadosPrivados } from '../loja/privados';
import {
  lerCadastros,
  lerFornecedores,
  lerPedidos,
  lerProdutos,
  lerPromocoes,
  type Cadastro,
  type LojaEquipe,
  type Pedido
} from '@/lib/equipe-dados';
import {
  COLUNAS_CONTRATO,
  COLUNAS_IMPULSO,
  COLUNAS_PARTE,
  COLUNAS_REFERENCIA_ADMIN,
  inicioDoMes,
  lerContratos,
  lerImpulsos,
  lerPartes,
  lerReferenciasCompletas,
  type LinhaReferencia
} from '@/lib/marketplace-dados';
import { PRO } from '@/lib/plano';
import { valorDaComissao } from '@/lib/planos-fornecedor';
import { COLUNAS_ASSINATURA, lerAssinaturas, type Assinatura } from '@/lib/pro-dados';
import {
  COLUNAS_CHAMADO,
  COLUNAS_CREDITO,
  COLUNAS_LOJA_EQUIPE,
  COLUNAS_MENSAGEM,
  COLUNAS_OFICINA_DETALHE,
  esquemaParteDoPedido,
  lerChamados,
  lerCompras,
  lerConvites,
  lerCoortes,
  lerCreditos,
  lerEquipe,
  lerEventos,
  lerFunilUso,
  lerLista,
  lerLojasEquipe,
  lerMembros,
  lerMensagens,
  lerMetricasAssinatura,
  lerOficinaDetalhe,
  lerOficinasEquipe,
  lerPainelMarketplace,
  lerSinais,
  lerUsoDeAlertas,
  lerUsoDoMes,
  type Chamado,
  type CompraDaOficina,
  type ConviteEquipe,
  type ConviteEquipeVe,
  type CoorteGmv,
  type CreditoDeAlertas,
  type EventoDoHistorico,
  type FunilUso,
  type ImpulsoEquipe,
  type LinhaLojaEquipe,
  type LojaAdmin,
  type MembroEquipe,
  type MembroEquipeVe,
  type MensagemDoChamado,
  type MetricasAssinatura,
  type OficinaDetalhe,
  type OficinaEquipe,
  type PainelMarketplace,
  type SinalAntifraude,
  type UsoDeAlertasDaOficina,
  type UsoDoMes
} from './tipos';

// O que o painel da equipe lê do banco. Toda leitura usa o cliente de quem entrou: o banco só
// devolve o que o papel da pessoa pode ver (privado.eh_equipe nas políticas e nas funções).

type Cliente = SupabaseClient;

export interface Resultado<T> {
  dados: T;
  erro: string | null;
}

export const ERRO_LEITURA = 'Não deu para carregar agora. Atualize a página em instantes.';

function falhou<T>(onde: string, erro: unknown, vazio: T): Resultado<T> {
  console.error(`[equipe] ${onde}`, erro);
  return { dados: vazio, erro: ERRO_LEITURA };
}

function avisar(onde: string, descartadas: number) {
  if (descartadas) console.warn(`[equipe] ${descartadas} linha(s) de ${onde} fora do formato esperado`);
}

export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** O endereço do app para as oficinas e lojas (o painel da equipe pode ficar em outro endereço). */
export function enderecoDoSite(): string {
  return (process.env.SITE_URL?.trim() || 'https://revisai.howlks.com').replace(/\/+$/, '');
}

// ---------------------------------------------------------------- pedidos e cadastros

const COLUNAS_PEDIDO = 'id, codigo, oficina_id, oficina_nome, oficina_whatsapp, oficina_cidade, oficina_uf, itens, total, observacao, status, criado_em';
const COLUNAS_CADASTRO = 'id, tipo, nome, empresa, whatsapp, email, cidade, uf, plano, mensagem, origem, situacao, criado_em';

/** Os pedidos da loja com a situação da parte de cada loja. */
export async function buscarPedidos(sb: Cliente, limite = 500): Promise<Resultado<Pedido[]>> {
  const { data, error } = await sb
    .from('pedidos')
    .select(`${COLUNAS_PEDIDO}, partes:pedidos_fornecedores(fornecedor_id, status, pagamento, subtotal, loja:fornecedores(nome))`)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) return falhou('pedidos', error, []);
  const linhas = (data ?? []) as { id: unknown; partes?: unknown }[];
  const { itens, descartadas } = lerPedidos(linhas);
  avisar('pedidos', descartadas);
  const partes = new Map(
    linhas.map((l) => [
      Number(l.id),
      lerLista(esquemaParteDoPedido, l.partes).itens.map((p) => ({
        fornecedorId: p.fornecedor_id,
        fornecedor: p.loja?.nome ?? `Loja ${p.fornecedor_id}`,
        status: p.status,
        pagamento: p.pagamento,
        subtotal: p.subtotal
      }))
    ])
  );
  return { dados: itens.map((p) => ({ ...p, partes: partes.get(p.id) ?? [] })), erro: null };
}

export async function buscarCadastros(sb: Cliente): Promise<Resultado<Cadastro[]>> {
  const { data, error } = await sb.from('interessados').select(COLUNAS_CADASTRO).order('criado_em', { ascending: false }).limit(500);
  if (error) return falhou('interessados', error, []);
  const { itens, descartadas } = lerCadastros(data);
  avisar('interessados', descartadas);
  return { dados: itens, erro: null };
}

/** Lojas, produtos e promoções, para a tela das promoções. */
export async function buscarLoja(sb: Cliente): Promise<Resultado<LojaEquipe>> {
  const vazio: LojaEquipe = { fornecedores: [], produtos: [], promocoes: [] };
  const [f, p, pr] = await Promise.all([
    sb.from('fornecedores').select('id, nome, cidade, uf, whatsapp, demonstracao, ativo').order('nome'),
    sb.from('produtos').select('id, fornecedor_id, categoria, nome, marca, unidade, preco, ativo').order('nome'),
    sb.from('promocoes').select('id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim, ativo').order('fim', { ascending: false })
  ]);
  const erro = f.error ?? p.error ?? pr.error;
  if (erro) return falhou('loja', erro, vazio);
  const fornecedores = lerFornecedores(f.data);
  const produtos = lerProdutos(p.data);
  const promocoes = lerPromocoes(pr.data);
  avisar('fornecedores', fornecedores.descartadas);
  avisar('produtos', produtos.descartadas);
  avisar('promocoes', promocoes.descartadas);
  return { dados: { fornecedores: fornecedores.itens, produtos: produtos.itens, promocoes: promocoes.itens }, erro: null };
}

export interface Novos {
  pedidos: number;
  cadastros: number;
  impulsos: number;
  sugestoes: number;
  lojas: number;
  chamados: number;
}

/** O que espera resposta, para os números das abas (o que o papel não vê conta zero). Uma vez por requisição. */
export const contarNovos = cache(async (sb: Cliente): Promise<Novos> => {
  const contar = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0, () => 0);
  const [pedidos, cadastros, impulsos, sugestoes, lojas, chamados] = await Promise.all([
    // cada loja cuida da sua parte: conta as partes que a loja ainda não respondeu
    contar(sb.from('pedidos_fornecedores').select('id', { count: 'exact', head: true }).eq('status', 'novo')),
    contar(sb.from('interessados').select('id', { count: 'exact', head: true }).eq('situacao', 'novo')),
    contar(sb.from('impulsos').select('id', { count: 'exact', head: true }).eq('status', 'pedido')),
    contar(sb.from('produtos_referencia').select('id', { count: 'exact', head: true }).eq('aprovado', false).eq('ativo', true)),
    contar(sb.from('fornecedores').select('id', { count: 'exact', head: true }).eq('verificacao', 'pendente')),
    contar(sb.from('suporte_chamados').select('id', { count: 'exact', head: true }).eq('situacao', 'novo'))
  ]);
  return { pedidos, cadastros, impulsos, sugestoes, lojas, chamados };
});

// ---------------------------------------------------------------- lojas

const esquemaMembroLoja = z.object({
  fornecedor_id: z.coerce.number(),
  user_id: z.string(),
  papel: z.string(),
  email: z.string().nullish().transform((v) => v ?? null),
  nome: z.string().nullish().transform((v) => v ?? null),
  criado_em: z.string()
});

const esquemaConviteLoja = z.object({
  id: z.string(),
  fornecedor_id: z.coerce.number(),
  email: z.string(),
  papel: z.string(),
  expira_em: z.string()
});

/** As lojas com contrato, quem entra em cada uma, convites abertos e as vendas do mês. */
export async function listarLojas(sb: Cliente): Promise<Resultado<LojaAdmin[]>> {
  const desde = inicioDoMes(hojeEmBrasilia());
  const [f, c, p, pf, m, cv] = await Promise.all([
    sb.from('fornecedores').select(COLUNAS_LOJA_EQUIPE).order('nome'),
    sb.from('fornecedores_contrato').select(COLUNAS_CONTRATO),
    sb.from('produtos').select('fornecedor_id').eq('ativo', true),
    sb.from('pedidos_fornecedores').select(COLUNAS_PARTE).gte('criado_em', `${desde}T03:00:00Z`),
    sb.from('fornecedor_membros').select('fornecedor_id, user_id, papel, email, nome, criado_em'),
    sb.from('convites').select('id, fornecedor_id, email, papel, expira_em').eq('tipo', 'fornecedor').is('aceito_em', null).gt('expira_em', new Date().toISOString())
  ]);
  const erro = f.error ?? c.error ?? p.error ?? pf.error ?? m.error ?? cv.error;
  if (erro) return falhou('lojas', erro, []);
  const lojas = lerLojasEquipe((await comDadosPrivados(sb, f.data as { id: unknown }[] | null)).linhas);
  const contratos = lerContratos(c.data);
  const partes = lerPartes(pf.data);
  const membros = lerLista(esquemaMembroLoja, m.data).itens;
  const convites = lerLista(esquemaConviteLoja, cv.data).itens;
  avisar('fornecedores', lojas.descartadas);
  avisar('fornecedores_contrato', contratos.descartadas);
  const produtos = new Map<number, number>();
  for (const x of (p.data ?? []) as { fornecedor_id: number }[]) produtos.set(Number(x.fornecedor_id), (produtos.get(Number(x.fornecedor_id)) ?? 0) + 1);
  const dados = lojas.itens.map((loja): LojaAdmin => {
    const suas = partes.itens.filter((x) => x.fornecedor_id === loja.id && x.status !== 'cancelado');
    return {
      ...loja,
      contrato: contratos.itens.find((x) => x.fornecedor_id === loja.id) ?? null,
      produtosAtivos: produtos.get(loja.id) ?? 0,
      vendasMes: Math.round(suas.reduce((s, x) => s + x.subtotal, 0) * 100) / 100,
      comissaoMes: Math.round(suas.reduce((s, x) => s + valorDaComissao(x.subtotal, x.comissao_percentual), 0) * 100) / 100,
      pedidosMes: suas.length,
      membros: membros
        .filter((x) => x.fornecedor_id === loja.id)
        .map((x) => ({ userId: x.user_id, email: x.email, nome: x.nome, papel: x.papel, criadoEm: x.criado_em })),
      convites: convites.filter((x) => x.fornecedor_id === loja.id).map((x) => ({ id: x.id, email: x.email, papel: x.papel, expiraEm: x.expira_em }))
    };
  });
  return { dados, erro: null };
}

/** As lojas que pediram para vender e esperam a equipe conferir o CNPJ (e as recusadas). */
export async function lojasEmAnalise(sb: Cliente): Promise<Resultado<{ pendentes: LinhaLojaEquipe[]; recusadas: LinhaLojaEquipe[]; donos: Record<number, string[]> }>> {
  const vazio = { pendentes: [], recusadas: [], donos: {} };
  const { data, error } = await sb.from('fornecedores').select(COLUNAS_LOJA_EQUIPE).in('verificacao', ['pendente', 'recusada']).order('criado_em', { ascending: true }).limit(200);
  if (error) return falhou('lojas em análise', error, vazio);
  const lojas = lerLojasEquipe((await comDadosPrivados(sb, data as { id: unknown }[] | null)).linhas);
  avisar('fornecedores', lojas.descartadas);
  const ids = lojas.itens.map((l) => l.id);
  const donos: Record<number, string[]> = {};
  if (ids.length) {
    const m = await sb.from('fornecedor_membros').select('fornecedor_id, email').in('fornecedor_id', ids).eq('papel', 'dono');
    for (const x of (m.data ?? []) as { fornecedor_id: number; email: string | null }[]) if (x.email) (donos[Number(x.fornecedor_id)] ??= []).push(x.email);
  }
  return {
    dados: { pendentes: lojas.itens.filter((l) => l.verificacao === 'pendente'), recusadas: lojas.itens.filter((l) => l.verificacao === 'recusada').reverse(), donos },
    erro: null
  };
}

export async function listarImpulsos(sb: Cliente): Promise<Resultado<ImpulsoEquipe[]>> {
  const [i, p, f] = await Promise.all([
    sb.from('impulsos').select(COLUNAS_IMPULSO).order('criado_em', { ascending: false }).limit(300),
    sb.from('produtos').select('id, nome, marca'),
    sb.from('fornecedores').select('id, nome')
  ]);
  const erro = i.error ?? p.error ?? f.error;
  if (erro) return falhou('impulsos', erro, []);
  const impulsos = lerImpulsos(i.data);
  avisar('impulsos', impulsos.descartadas);
  const produtos = new Map((p.data ?? []).map((x: { id: number; nome: string; marca: string | null }) => [Number(x.id), [x.marca, x.nome].filter(Boolean).join(' ')]));
  const fornecedores = new Map((f.data ?? []).map((x: { id: number; nome: string }) => [Number(x.id), x.nome]));
  return {
    dados: impulsos.itens.map((x) => ({ ...x, produtoNome: produtos.get(x.produto_id) ?? `Produto ${x.produto_id}`, fornecedorNome: fornecedores.get(x.fornecedor_id) ?? '' })),
    erro: null
  };
}

export async function listarBase(sb: Cliente): Promise<Resultado<LinhaReferencia[]>> {
  const { data, error } = await sb.from('produtos_referencia').select(COLUNAS_REFERENCIA_ADMIN).order('criado_em', { ascending: false }).limit(1000);
  if (error) return falhou('base', error, []);
  const r = lerReferenciasCompletas(data);
  avisar('produtos_referencia', r.descartadas);
  return { dados: r.itens, erro: null };
}

// ---------------------------------------------------------------- oficinas e Pro

export async function listarOficinas(sb: Cliente, busca = ''): Promise<Resultado<OficinaEquipe[]>> {
  const { data, error } = await sb.rpc('equipe_oficinas', { p_busca: busca.trim().slice(0, 80) || null, p_limite: 500 });
  if (error) return falhou('oficinas', error, []);
  const r = lerOficinasEquipe(data);
  avisar('oficinas', r.descartadas);
  return { dados: r.itens, erro: null };
}

/** O uso dos alertas de preço por oficina (todas, ou só as da lista). */
export async function usoDosAlertas(sb: Cliente, oficinas?: string[]): Promise<Record<string, UsoDeAlertasDaOficina>> {
  if (oficinas && !oficinas.length) return {};
  const { data, error } = await sb.rpc('equipe_alertas_uso', oficinas ? { p_oficinas: oficinas } : {});
  if (error) {
    console.error('[equipe] uso dos alertas', error);
    return {};
  }
  return lerUsoDeAlertas(data);
}

export interface DetalheDaOficina {
  oficina: OficinaDetalhe;
  membros: MembroEquipeVe[];
  convites: ConviteEquipeVe[];
  assinaturas: Assinatura[];
  creditos: CreditoDeAlertas[];
  uso: UsoDoMes | null;
  alertas: UsoDeAlertasDaOficina | null;
  compras: CompraDaOficina[];
  chamados: Chamado[];
}

/** Tudo o que a equipe vê de uma oficina (nunca os clientes, carros e ordens dela). */
export async function detalheDaOficina(sb: Cliente, id: string): Promise<Resultado<DetalheDaOficina | null>> {
  const [o, m, c, a, cr, uso, alertas, compras, chamados] = await Promise.all([
    sb.from('oficinas').select(COLUNAS_OFICINA_DETALHE).eq('id', id).maybeSingle(),
    sb.from('oficina_membros').select('user_id, papel, email, nome, criado_em').eq('oficina_id', id).order('criado_em'),
    sb.from('convites').select('id, email, papel, criado_em, expira_em, aceito_em, oficina_id, fornecedor_id').eq('oficina_id', id).is('aceito_em', null),
    sb.from('assinaturas').select(COLUNAS_ASSINATURA).eq('oficina_id', id).order('criado_em', { ascending: false }),
    sb.from('alertas_creditos').select(COLUNAS_CREDITO).eq('oficina_id', id).order('criado_em', { ascending: false }),
    sb.rpc('uso_do_mes', { p_oficina: id }),
    usoDosAlertas(sb, [id]),
    sb.from('pedidos_fornecedores').select('id, pedido_id, codigo, fornecedor_id, subtotal, status, criado_em, loja:fornecedores(nome)').eq('oficina_id', id).order('criado_em', { ascending: false }).limit(20),
    sb.from('suporte_chamados').select(COLUNAS_CHAMADO).eq('oficina_id', id).order('atualizado_em', { ascending: false }).limit(20)
  ]);
  const erro = o.error ?? m.error ?? c.error ?? cr.error ?? compras.error;
  if (erro) return falhou('detalhe da oficina', erro, null);
  const oficina = lerOficinaDetalhe(o.data);
  if (!oficina) return { dados: null, erro: null };
  if (uso.error) console.error('[equipe] uso do mês', uso.error);
  return {
    dados: {
      oficina,
      membros: lerMembros(m.data).itens,
      convites: lerConvites(c.data).itens,
      // assinaturas e chamados: o papel pode não ver (fica vazio)
      assinaturas: a.error ? [] : lerAssinaturas(a.data).itens,
      creditos: lerCreditos(cr.data).itens,
      uso: uso.error ? null : lerUsoDoMes(uso.data),
      alertas: alertas[id] ?? null,
      compras: lerCompras(compras.data).itens,
      chamados: chamados.error ? [] : lerChamados(chamados.data).itens
    },
    erro: null
  };
}

// ---------------------------------------------------------------- números do negócio

export async function metricasDeAssinatura(sb: Cliente): Promise<Resultado<MetricasAssinatura | null>> {
  const { data, error } = await sb.rpc('equipe_metricas_assinatura', { p_preco: PRO.preco, p_preco_fundador: PRO.precoFundador });
  if (error) return falhou('métricas de assinatura', error, null);
  return { dados: lerMetricasAssinatura(data), erro: null };
}

export async function coortesDeGmv(sb: Cliente, meses = 6): Promise<Resultado<CoorteGmv[]>> {
  const { data, error } = await sb.rpc('equipe_coortes_gmv', { p_meses: meses });
  if (error) return falhou('coortes', error, []);
  return { dados: lerCoortes(data).itens, erro: null };
}

export async function painelDoMarketplace(sb: Cliente, dias = 30): Promise<Resultado<PainelMarketplace | null>> {
  const { data, error } = await sb.rpc('equipe_painel_marketplace', { p_dias: dias });
  if (error) return falhou('marketplace', error, null);
  return { dados: lerPainelMarketplace(data), erro: null };
}

export async function funilEUso(sb: Cliente): Promise<Resultado<FunilUso | null>> {
  const { data, error } = await sb.rpc('equipe_funil_uso', { p_limite: 500 });
  if (error) return falhou('uso e funil', error, null);
  return { dados: lerFunilUso(data), erro: null };
}

export async function sinaisDeFraude(sb: Cliente): Promise<Resultado<SinalAntifraude[]>> {
  const { data, error } = await sb.rpc('equipe_antifraude');
  if (error) return falhou('antifraude', error, []);
  return { dados: lerSinais(data).itens, erro: null };
}

// ---------------------------------------------------------------- equipe, histórico e suporte

export async function listarEquipe(sb: Cliente): Promise<Resultado<{ membros: MembroEquipe[]; convites: ConviteEquipe[] }>> {
  const { data, error } = await sb.rpc('equipe_listar');
  if (error) return falhou('equipe', error, { membros: [], convites: [] });
  return { dados: lerEquipe(data), erro: null };
}

export async function historico(sb: Cliente, antes: number | null, limite = 50): Promise<Resultado<EventoDoHistorico[]>> {
  const { data, error } = await sb.rpc('auditoria_listar', { p_antes: antes, p_limite: limite });
  if (error) return falhou('histórico', error, []);
  return { dados: lerEventos(data).itens, erro: null };
}

/** Os nomes das oficinas e lojas de onde vieram os chamados. */
async function origens(sb: Cliente, chamados: Chamado[]): Promise<Chamado[]> {
  const oficinas = [...new Set(chamados.flatMap((c) => (c.oficina_id ? [c.oficina_id] : [])))];
  const lojas = [...new Set(chamados.flatMap((c) => (c.fornecedor_id != null ? [c.fornecedor_id] : [])))];
  const [o, f] = await Promise.all([
    oficinas.length ? sb.from('oficinas').select('id, nome').in('id', oficinas) : Promise.resolve({ data: [] }),
    lojas.length ? sb.from('fornecedores').select('id, nome').in('id', lojas) : Promise.resolve({ data: [] })
  ]);
  const nomesO = new Map(((o.data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]));
  const nomesF = new Map(((f.data ?? []) as { id: number; nome: string }[]).map((x) => [Number(x.id), x.nome]));
  return chamados.map((c) => ({
    ...c,
    origem: c.oficina_id ? (nomesO.get(c.oficina_id) ?? 'Oficina') : c.fornecedor_id != null ? (nomesF.get(c.fornecedor_id) ?? 'Loja') : null
  }));
}

export async function listarChamados(sb: Cliente): Promise<Resultado<Chamado[]>> {
  const { data, error } = await sb.from('suporte_chamados').select(COLUNAS_CHAMADO).order('atualizado_em', { ascending: false }).limit(300);
  if (error) return falhou('chamados', error, []);
  const r = lerChamados(data);
  avisar('suporte_chamados', r.descartadas);
  return { dados: await origens(sb, r.itens), erro: null };
}

export async function abrirChamado(sb: Cliente, id: string): Promise<Resultado<{ chamado: Chamado; mensagens: MensagemDoChamado[] } | null>> {
  const [c, m] = await Promise.all([
    sb.from('suporte_chamados').select(COLUNAS_CHAMADO).eq('id', id).maybeSingle(),
    sb.from('suporte_mensagens').select(COLUNAS_MENSAGEM).eq('chamado_id', id).order('id').limit(500)
  ]);
  const erro = c.error ?? m.error;
  if (erro) return falhou('chamado', erro, null);
  const [chamado] = lerChamados(c.data ? [c.data] : []).itens;
  if (!chamado) return { dados: null, erro: null };
  const [comOrigem] = await origens(sb, [chamado]);
  return { dados: { chamado: comOrigem, mensagens: lerMensagens(m.data).itens }, erro: null };
}
