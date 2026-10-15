import 'server-only';

// Alerta de preço no banco, pelo servidor, com a chave da equipe no cabeçalho. A oficina é
// reconhecida pelo número do aparelho (e pelo código do Pro, para a cota); a loja, pela sessão do
// painel. A loja nunca vê o nome nem o WhatsApp da oficina antes de a oficina fechar com ela.

import { z } from 'zod';
import { formatarMoeda, normalizarTelefone } from './formatos';
import {
  aceiteEquivalente,
  ALERTAS,
  cotaAmostra,
  cotaPro,
  depoisDeGastar,
  embalagemComparavel,
  escolherAte,
  esquemaFechar,
  esquemaNovoAlerta,
  esquemaResposta,
  faixaParaFechar,
  litrosDa,
  mesEmBrasilia,
  pacoteValido,
  resultadoParaLoja,
  type AlertaDaOficina,
  type AlertaParaContar,
  type AlertaParaLoja,
  type CotaAlertas,
  type ProdutoDaResposta,
  type RespostaDoAlerta
} from './alertas-dados';
import { CATEGORIAS, nomeCategoria, type Unidade } from './catalogo';
import { codigoPedido } from './codigo-pedido';
import { clienteEquipe } from './equipe';
import { diaEmBrasilia } from './equipe-dados';
import { codigoPix, normalizarChavePix, type TipoChavePix } from './pix';
import { formatarCodigo } from './plano';
import { chaveDoProduto } from './precos';
import type { Categoria, EspecProduto } from './tipos';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

const SEM_BANCO = 'O servidor ainda não está ligado ao banco.';

function hojeEmBrasilia(): string {
  return diaEmBrasilia(Date.now());
}
const ERRO = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';
const HORA = 3_600_000;

type Cliente = NonNullable<ReturnType<typeof clienteEquipe>>;

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const categoria = z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]);

const esquemaAlerta = z.object({
  id: z.string(),
  aparelho_id: z.string(),
  codigo_pro: textoOuNulo,
  oficina_cidade: textoOuNulo,
  oficina_uf: z.string(),
  categoria,
  titulo: z.string(),
  produto_id: numeroOuNulo,
  chave: textoOuNulo,
  especificacao: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  quantidade: numero,
  preco_alvo: numero,
  preco_pago: numeroOuNulo,
  mensagem: textoOuNulo,
  usou_credito: z.boolean(),
  status: z.enum(['aberto', 'fechado', 'cancelado']),
  resposta_escolhida: textoOuNulo,
  expira_em: z.string(),
  criado_em: z.string()
});
type LinhaAlerta = z.infer<typeof esquemaAlerta>;

const COLUNAS_ALERTA =
  'id, aparelho_id, codigo_pro, oficina_cidade, oficina_uf, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, preco_pago, mensagem, usou_credito, status, resposta_escolhida, expira_em, criado_em';
// a loja não vê quem pediu
const COLUNAS_ALERTA_LOJA = 'id, oficina_cidade, oficina_uf, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, mensagem, status, expira_em, criado_em';

const esquemaResposta_ = z.object({
  id: z.string(),
  alerta_id: z.string(),
  fornecedor_id: numero,
  tipo: z.enum(['aceita', 'contraproposta', 'recusa']),
  produto_id: numeroOuNulo,
  preco: numeroOuNulo,
  quantidade_minima: numeroOuNulo,
  prazo_entrega: textoOuNulo,
  mensagem: textoOuNulo,
  status: z.enum(['enviada', 'escolhida', 'descartada']),
  pedido_id: numeroOuNulo,
  criado_em: z.string()
});
type LinhaResposta = z.infer<typeof esquemaResposta_>;
const COLUNAS_RESPOSTA = 'id, alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima, prazo_entrega, mensagem, status, pedido_id, criado_em';

const esquemaProduto = z.object({
  id: numero,
  fornecedor_id: numero,
  categoria,
  nome: z.string(),
  marca: textoOuNulo,
  unidade: z.enum(['un', 'L', 'kit', 'par', 'jogo']),
  conteudo: numeroOuNulo,
  preco: numero,
  especificacao: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {}),
  ativo: z.boolean(),
  imagem_url: textoOuNulo
});
type LinhaProduto = z.infer<typeof esquemaProduto>;
const COLUNAS_PRODUTO = 'id, fornecedor_id, categoria, nome, marca, unidade, conteudo, preco, especificacao, ativo, imagem_url';

function ler<T>(esquema: z.ZodType<T>, dados: unknown): T[] {
  return (Array.isArray(dados) ? dados : []).flatMap((x) => {
    const r = esquema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

function litrosDoAlerta(a: Pick<LinhaAlerta, 'categoria' | 'especificacao'>): number | null {
  const e = a.especificacao;
  const unidade = typeof e.unidade === 'string' ? (e.unidade as Unidade) : null;
  if (!unidade) return null;
  return litrosDa({ categoria: a.categoria, unidade, conteudo: typeof e.conteudo === 'number' ? e.conteudo : null });
}

function nomeDoProduto(p: Pick<LinhaProduto, 'marca' | 'nome'>): string {
  return [p.marca, p.nome].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- cota

/** O código do Pro vale hoje. */
async function codigoValeHoje(sb: Cliente, codigo: string | null): Promise<boolean> {
  if (!codigo) return false;
  const { data } = await sb.from('assinaturas').select('ate').eq('codigo', codigo).maybeSingle();
  return !!data && String((data as { ate: string }).ate) >= hojeEmBrasilia();
}

interface Assinante {
  codigo: string;
  oficina_nome: string;
  oficina_whatsapp: string | null;
}

/** Os códigos da mesma oficina (renovar o Pro gera um código novo): pelo WhatsApp ou, sem ele, pelo nome. */
export function codigosDoMesmoDono(codigo: string, assinaturas: Assinante[]): string[] {
  const dono = assinaturas.find((a) => a.codigo === codigo);
  if (!dono) return [codigo];
  const nome = dono.oficina_nome.trim().toLowerCase();
  const mesmos = assinaturas.filter((a) => (dono.oficina_whatsapp ? a.oficina_whatsapp === dono.oficina_whatsapp : !a.oficina_whatsapp && a.oficina_nome.trim().toLowerCase() === nome));
  return [...new Set([codigo, ...mesmos.map((a) => a.codigo)])];
}

async function codigosDaOficina(sb: Cliente, codigo: string): Promise<string[]> {
  const { data } = await sb.from('assinaturas').select('codigo, oficina_nome, oficina_whatsapp').eq('codigo', codigo).maybeSingle();
  const dono = data as Assinante | null;
  if (!dono) return [codigo];
  const outros = dono.oficina_whatsapp
    ? await sb.from('assinaturas').select('codigo, oficina_nome, oficina_whatsapp').eq('oficina_whatsapp', dono.oficina_whatsapp).limit(100)
    : await sb.from('assinaturas').select('codigo, oficina_nome, oficina_whatsapp').eq('oficina_nome', dono.oficina_nome).limit(100);
  return codigosDoMesmoDono(codigo, [dono, ...((outros.data ?? []) as Assinante[])]);
}

interface LinhaParaContar {
  id: string;
  status: LinhaAlerta['status'];
  expira_em: string;
  criado_em: string;
  usou_credito: boolean;
}

const COLUNAS_CONTAR = 'id, status, expira_em, criado_em, usou_credito';

async function paraContar(sb: Cliente, linhas: LinhaParaContar[]): Promise<AlertaParaContar[] | null> {
  const ids = linhas.map((l) => l.id);
  const propostas = new Map<string, number>();
  // poucos alertas por vez: cada consulta volta no máximo 1000 linhas
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await sb.from('alertas_respostas').select('alerta_id').in('alerta_id', ids.slice(i, i + 40)).neq('tipo', 'recusa').limit(1000);
    if (error) return null;
    for (const r of (data ?? []) as { alerta_id: string }[]) propostas.set(r.alerta_id, (propostas.get(r.alerta_id) ?? 0) + 1);
  }
  return linhas.map((l) => ({ status: l.status, expiraEm: l.expira_em, criadoEm: l.criado_em, usouCredito: l.usou_credito, propostas: propostas.get(l.id) ?? 0 }));
}

/** O começo do mês em Brasília, como instante (Brasília é UTC−3, sem horário de verão). */
function inicioDoMesEmBrasilia(agora: number): string {
  return `${mesEmBrasilia(agora)}-01T03:00:00.000Z`;
}

/** Os alertas que entram na cota do Pro: os do mês e os que saíram de pacote (de todos os códigos da oficina). */
async function alertasDaCotaPro(sb: Cliente, codigos: string[], agora: number): Promise<{ alertas: AlertaParaContar[]; creditos: number } | null> {
  const [doMes, dePacote, c] = await Promise.all([
    sb.from('alertas_preco').select(COLUNAS_CONTAR).in('codigo_pro', codigos).eq('usou_credito', false).gte('criado_em', inicioDoMesEmBrasilia(agora)).limit(1000),
    sb.from('alertas_preco').select(COLUNAS_CONTAR).in('codigo_pro', codigos).eq('usou_credito', true).limit(1000),
    sb.from('alertas_creditos').select('quantidade').in('codigo_pro', codigos).limit(1000)
  ]);
  if (doMes.error || dePacote.error || c.error) return null;
  const alertas = await paraContar(sb, [...((doMes.data ?? []) as LinhaParaContar[]), ...((dePacote.data ?? []) as LinhaParaContar[])]);
  if (!alertas) return null;
  return { alertas, creditos: ((c.data ?? []) as { quantidade: number }[]).reduce((s, x) => s + Number(x.quantidade), 0) };
}

/**
 * A cota de quem pede: com um código do Pro que vale hoje, a do mês e os pacotes (somando os códigos da
 * mesma oficina, para a renovação não zerar nada); sem código, a de teste (por aparelho e por WhatsApp).
 * `proValido` diz se o código entrou na conta.
 */
async function calcularCota(sb: Cliente, quem: { aparelhoId: string; codigoPro: string | null; whatsapp: string | null }): Promise<{ cota: CotaAlertas; proValido: boolean } | null> {
  const agora = Date.now();
  if (quem.codigoPro && (await codigoValeHoje(sb, quem.codigoPro))) {
    const r = await alertasDaCotaPro(sb, await codigosDaOficina(sb, quem.codigoPro), agora);
    if (!r) return null;
    return { cota: cotaPro(r.alertas, r.creditos, agora), proValido: true };
  }
  if (!/^[0-9a-f-]{36}$/.test(quem.aparelhoId) || (quem.whatsapp && !/^\d{12,13}$/.test(quem.whatsapp))) return null;
  const desde = new Date(agora - 30 * 24 * HORA).toISOString();
  const filtro = quem.whatsapp ? `aparelho_id.eq.${quem.aparelhoId},oficina_whatsapp.eq.${quem.whatsapp}` : `aparelho_id.eq.${quem.aparelhoId}`;
  const a = await sb.from('alertas_preco').select(COLUNAS_CONTAR).is('codigo_pro', null).gte('criado_em', desde).or(filtro).limit(500);
  if (a.error) return null;
  const alertas = await paraContar(sb, (a.data ?? []) as LinhaParaContar[]);
  return alertas ? { cota: cotaAmostra(alertas, agora), proValido: false } : null;
}

// ---------------------------------------------------------------- oficina

/** Quantas lojas do estado vendem a categoria (são elas que recebem o alerta). */
async function lojasQueRecebem(sb: Cliente, uf: string, cat: Categoria): Promise<number> {
  const f = await sb.from('fornecedores').select('id').eq('uf', uf).eq('ativo', true);
  const ids = ((f.data ?? []) as { id: number }[]).map((x) => Number(x.id));
  if (!ids.length) return 0;
  const p = await sb.from('produtos').select('fornecedor_id').in('fornecedor_id', ids).eq('categoria', cat).eq('ativo', true);
  return new Set(((p.data ?? []) as { fornecedor_id: number }[]).map((x) => Number(x.fornecedor_id))).size;
}

export async function criarAlerta(entrada: unknown): Promise<Gravacao<{ alerta: AlertaDaOficina; lojas: number; cota: CotaAlertas }> & { semCota?: boolean }> {
  const r = esquemaNovoAlerta.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o alerta.' };
  const d = r.data;
  const whatsapp = normalizarTelefone(d.oficina.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Escreva o WhatsApp da oficina em Ajustes, com DDD.' };
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };

  const prod = await sb.from('produtos').select(COLUNAS_PRODUTO).eq('id', d.produtoId).maybeSingle();
  const produto = prod.data ? ler(esquemaProduto, [prod.data])[0] : undefined;
  if (prod.error) return { ok: false, erro: ERRO };
  if (!produto || !produto.ativo) return { ok: false, erro: 'Este produto saiu da loja. Escolha outro.' };
  if (d.precoAlvo >= produto.preco) return { ok: false, erro: `A loja já vende por ${formatarMoeda(produto.preco)}. Para esse preço é só pôr no pedido.` };

  const agora = Date.now();
  const abertos = await sb.from('alertas_preco').select('id, produto_id, chave').eq('aparelho_id', d.aparelhoId).eq('status', 'aberto').gt('expira_em', new Date(agora).toISOString());
  if (abertos.error) return { ok: false, erro: ERRO };
  const chave = chaveDoProduto(produto);
  const lista = (abertos.data ?? []) as { produto_id: number | null; chave: string | null }[];
  if (lista.some((a) => Number(a.produto_id) === produto.id || a.chave === chave)) return { ok: false, erro: 'Você já tem um alerta esperando resposta para este produto.' };
  if (lista.length >= ALERTAS.abertosMax) return { ok: false, erro: `Você já tem ${ALERTAS.abertosMax} alertas esperando resposta. Espere as lojas responderem ou cancele um.` };

  const lojas = await lojasQueRecebem(sb, d.oficina.uf, produto.categoria);
  if (!lojas) return { ok: false, erro: `Ainda não tem loja do ${d.oficina.uf} vendendo ${nomeCategoria(produto.categoria).toLowerCase()} no Revisaí. O alerta não foi gasto.` };

  const calculo = await calcularCota(sb, { aparelhoId: d.aparelhoId, codigoPro: d.codigoPro, whatsapp });
  if (!calculo) return { ok: false, erro: ERRO };
  const { cota, proValido } = calculo;
  if (cota.restantes <= 0)
    return {
      ok: false,
      semCota: true,
      erro: cota.tipo === 'pro' ? 'Os alertas do mês acabaram. Dá para comprar um pacote com mais alertas.' : 'Os alertas de teste acabaram. Com o Pro são 10 alertas por mês.'
    };

  const especificacao: Record<string, unknown> = { ...(produto.especificacao as EspecProduto), unidade: produto.unidade, conteudo: produto.conteudo };
  const ins = await sb
    .from('alertas_preco')
    .insert({
      aparelho_id: d.aparelhoId,
      codigo_pro: proValido ? d.codigoPro : null,
      oficina_nome: d.oficina.nome,
      oficina_whatsapp: whatsapp,
      oficina_cidade: d.oficina.cidade || null,
      oficina_uf: d.oficina.uf,
      categoria: produto.categoria,
      titulo: nomeDoProduto(produto).slice(0, 160),
      produto_id: produto.id,
      chave: chave.slice(0, 200),
      especificacao,
      quantidade: d.quantidade,
      preco_alvo: Math.round(d.precoAlvo * 100) / 100,
      preco_pago: d.precoPago == null ? null : Math.round(d.precoPago * 100) / 100,
      mensagem: d.mensagem || null,
      usou_credito: cota.proximoUsaCredito,
      expira_em: new Date(agora + ALERTAS.horasParaResponder * HORA).toISOString()
    })
    .select(COLUNAS_ALERTA)
    .single();
  if (ins.error || !ins.data) {
    // a trava do banco: muitos alertas seguidos, ou os de teste acabaram
    if (ins.error?.code === 'P0001')
      return /teste/.test(ins.error.message)
        ? { ok: false, semCota: true, erro: 'Os alertas de teste acabaram. Com o Pro são 10 alertas por mês.' }
        : { ok: false, erro: 'Muitos alertas seguidos. Espere um pouco e tente de novo.' };
    console.error('[alertas] criar', ins.error);
    return { ok: false, erro: 'Não deu para mandar o alerta agora. Tente de novo.' };
  }
  const [linha] = ler(esquemaAlerta, [ins.data]);
  if (!linha) return { ok: false, erro: 'O alerta foi enviado. Atualize a página para ver.' };
  return { ok: true, alerta: paraOficina(linha, [], new Map(), new Map(), new Map()), lojas, cota: depoisDeGastar(cota) };
}

function paraOficina(a: LinhaAlerta, respostas: LinhaResposta[], lojas: Map<number, { nome: string; cidade: string | null }>, produtos: Map<number, LinhaProduto>, pedidos: Map<number, string>): AlertaDaOficina {
  const escolhida = respostas.find((r) => r.id === a.resposta_escolhida);
  return {
    id: a.id,
    titulo: a.titulo,
    categoria: a.categoria,
    produtoId: a.produto_id,
    quantidade: a.quantidade,
    precoAlvo: a.preco_alvo,
    precoPago: a.preco_pago,
    litros: litrosDoAlerta(a),
    mensagem: a.mensagem,
    status: a.status,
    expiraEm: a.expira_em,
    criadoEm: a.criado_em,
    respostaEscolhida: a.resposta_escolhida,
    pedido: escolhida?.pedido_id != null ? (pedidos.get(escolhida.pedido_id) ?? null) : null,
    respostas: respostas
      .filter((r) => r.alerta_id === a.id)
      .map((r): RespostaDoAlerta => {
        const p = r.produto_id != null ? produtos.get(r.produto_id) : undefined;
        const produto: ProdutoDaResposta | null = p ? { id: p.id, nome: p.nome, marca: p.marca, categoria: p.categoria, unidade: p.unidade, conteudo: p.conteudo, imagemUrl: p.imagem_url } : null;
        return {
          id: r.id,
          fornecedorId: r.fornecedor_id,
          fornecedor: lojas.get(r.fornecedor_id)?.nome ?? 'Loja',
          cidade: lojas.get(r.fornecedor_id)?.cidade ?? null,
          tipo: r.tipo,
          produto,
          preco: r.preco,
          quantidadeMinima: r.quantidade_minima,
          prazoEntrega: r.prazo_entrega,
          mensagem: r.mensagem,
          status: r.status,
          criadoEm: r.criado_em
        };
      })
  };
}

/** Os alertas deste aparelho com as respostas das lojas, e quantos alertas ainda dá para mandar. */
export async function alertasDaOficina(quem: { aparelhoId: string; codigoPro: string | null; whatsapp: string }): Promise<{ alertas: AlertaDaOficina[]; cota: CotaAlertas | null; erro: string | null }> {
  const sb = clienteEquipe();
  if (!sb) return { alertas: [], cota: null, erro: SEM_BANCO };
  const whatsapp = normalizarTelefone(quem.whatsapp);
  const [a, calculo] = await Promise.all([
    sb.from('alertas_preco').select(COLUNAS_ALERTA).eq('aparelho_id', quem.aparelhoId).order('criado_em', { ascending: false }).limit(30),
    calcularCota(sb, { aparelhoId: quem.aparelhoId, codigoPro: quem.codigoPro, whatsapp })
  ]);
  const cota = calculo?.cota ?? null;
  if (a.error) {
    console.error('[alertas] da oficina', a.error);
    return { alertas: [], cota, erro: ERRO };
  }
  const alertas = ler(esquemaAlerta, a.data);
  if (!alertas.length) return { alertas: [], cota, erro: null };
  const r = await sb.from('alertas_respostas').select(COLUNAS_RESPOSTA).in('alerta_id', alertas.map((x) => x.id)).order('criado_em').limit(1000);
  // sem as respostas, a lista sairia vazia e o app avisaria tudo de novo como novidade
  if (r.error) {
    console.error('[alertas] respostas', r.error);
    return { alertas: [], cota, erro: ERRO };
  }
  const respostas = ler(esquemaResposta_, r.data);
  const idsLojas = [...new Set(respostas.map((x) => x.fornecedor_id))];
  const idsProdutos = [...new Set(respostas.flatMap((x) => (x.produto_id != null ? [x.produto_id] : [])))];
  const idsPedidos = [...new Set(respostas.flatMap((x) => (x.pedido_id != null ? [x.pedido_id] : [])))];
  const [f, p, pe] = await Promise.all([
    idsLojas.length ? sb.from('fornecedores').select('id, nome, cidade').in('id', idsLojas) : Promise.resolve({ data: [] }),
    idsProdutos.length ? sb.from('produtos').select(COLUNAS_PRODUTO).in('id', idsProdutos) : Promise.resolve({ data: [] }),
    idsPedidos.length ? sb.from('pedidos').select('id, codigo').in('id', idsPedidos) : Promise.resolve({ data: [] })
  ]);
  const lojas = new Map(((f.data ?? []) as { id: number; nome: string; cidade: string | null }[]).map((x) => [Number(x.id), { nome: x.nome, cidade: x.cidade }]));
  const produtos = new Map(ler(esquemaProduto, p.data).map((x) => [x.id, x]));
  const pedidos = new Map(((pe.data ?? []) as { id: number; codigo: string }[]).map((x) => [Number(x.id), x.codigo]));
  return { alertas: alertas.map((x) => paraOficina(x, respostas, lojas, produtos, pedidos)), cota, erro: null };
}

export async function cancelarAlerta(aparelhoId: string, alertaId: string): Promise<Gravacao> {
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const { data, error } = await sb
    .from('alertas_preco')
    .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
    .eq('id', alertaId)
    .eq('aparelho_id', aparelhoId)
    .eq('status', 'aberto')
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[alertas] cancelar', error);
    return { ok: false, erro: ERRO };
  }
  return data ? { ok: true } : { ok: false, erro: 'Este alerta já terminou.' };
}

export interface ItemFechado {
  produtoId: number;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  fornecedorId: number;
  fornecedor: string;
  combinado: boolean;
}

const PROPOSTA_MUDOU = 'A loja mudou a proposta. Confira a proposta nova e confirme de novo.';

/** A oficina escolhe uma resposta: o pedido sai com o preço combinado e o alerta fecha. */
export async function fecharAlerta(entrada: unknown): Promise<Gravacao<{ codigo: string; total: number; itens: ItemFechado[] }>> {
  const r = esquemaFechar.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o pedido.' };
  const d = r.data;
  const whatsapp = normalizarTelefone(d.oficina.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Escreva o WhatsApp da oficina, com DDD. É por ele que a loja fala com você.' };
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };

  const a = await sb.from('alertas_preco').select(COLUNAS_ALERTA).eq('id', d.alertaId).eq('aparelho_id', d.aparelhoId).maybeSingle();
  const alerta = a.data ? ler(esquemaAlerta, [a.data])[0] : undefined;
  if (a.error) return { ok: false, erro: ERRO };
  if (!alerta) return { ok: false, erro: 'Alerta não encontrado neste aparelho.' };
  if (alerta.status !== 'aberto') return { ok: false, erro: alerta.status === 'fechado' ? 'Você já fechou este alerta.' : 'Este alerta foi cancelado.' };
  if (Date.now() >= escolherAte(alerta.expira_em)) return { ok: false, erro: 'O prazo deste alerta acabou. Mande um alerta novo.' };

  const rr = await sb.from('alertas_respostas').select(COLUNAS_RESPOSTA).eq('id', d.respostaId).eq('alerta_id', alerta.id).maybeSingle();
  const resposta = rr.data ? ler(esquemaResposta_, [rr.data])[0] : undefined;
  if (!resposta || resposta.tipo === 'recusa' || resposta.produto_id == null || resposta.preco == null) return { ok: false, erro: 'Esta proposta não vale mais.' };
  if (resposta.status !== 'enviada') return { ok: false, erro: 'Esta proposta não vale mais.' };
  if (resposta.produto_id !== d.produtoEsperado || Math.abs(resposta.preco - d.precoEsperado) >= 0.005 || (resposta.quantidade_minima ?? 1) !== d.minimoEsperado)
    return { ok: false, erro: PROPOSTA_MUDOU };
  const produtoDaResposta = (await sb.from('produtos').select(COLUNAS_PRODUTO).eq('id', resposta.produto_id).maybeSingle()).data;
  const embalagem = produtoDaResposta ? ler(esquemaProduto, [produtoDaResposta])[0] : undefined;
  const faixa = faixaParaFechar({ quantidade: alerta.quantidade, litros: litrosDoAlerta(alerta) }, { quantidadeMinima: resposta.quantidade_minima, produto: embalagem ?? null });
  if (d.quantidade < faixa.minimo) return { ok: false, erro: `Por esse preço, a loja pede no mínimo ${faixa.minimo}.` };
  if (d.quantidade > faixa.maximo) return { ok: false, erro: `Por esse preço, a loja vende até ${faixa.maximo}. Para mais, ponha o resto no pedido normal.` };

  let codigo = '';
  let pedido: { id: number; itens: unknown; total: number | string } | null = null;
  for (let tentativa = 0; tentativa < 3 && !pedido; tentativa++) {
    codigo = codigoPedido();
    const ins = await sb
      .from('pedidos')
      .insert({
        codigo,
        oficina_nome: d.oficina.nome,
        oficina_whatsapp: whatsapp,
        oficina_cidade: d.oficina.cidade || null,
        oficina_uf: d.oficina.uf || null,
        oficina_endereco: d.oficina.endereco || null,
        aparelho_id: d.aparelhoId,
        // o banco confere a proposta que a oficina viu (produto, preço e mínimo) e fecha o alerta junto com o pedido
        itens: [{ produto_id: d.produtoEsperado, quantidade: d.quantidade, resposta_id: resposta.id, preco_esperado: d.precoEsperado, minimo_esperado: d.minimoEsperado }],
        observacao: [`Preço combinado no alerta de preço.`, d.observacao].filter(Boolean).join(' ').slice(0, 500)
      })
      .select('id, itens, total')
      .single();
    if (!ins.error) {
      pedido = ins.data as { id: number; itens: unknown; total: number | string };
      break;
    }
    if (ins.error.code === '23505') continue;
    if (ins.error.code === 'RV001') return { ok: false, erro: 'Esta proposta não vale mais. Veja as outras respostas ou mande um alerta novo.' };
    if (ins.error.code === 'RV002') return { ok: false, erro: PROPOSTA_MUDOU };
    if (ins.error.code === 'RV003') return { ok: false, erro: 'A quantidade não bate com a proposta. Confira e tente de novo.' };
    if (ins.error.code === '22023') return { ok: false, erro: 'O produto da proposta saiu da loja.' };
    if (ins.error.code === 'P0001') return { ok: false, erro: 'Recebemos muitos pedidos seguidos deste WhatsApp. Espere um pouco e tente de novo.' };
    console.error('[alertas] fechar', ins.error);
    return { ok: false, erro: 'Não deu para fazer o pedido agora. Tente de novo.' };
  }
  if (!pedido) return { ok: false, erro: 'Não deu para fazer o pedido agora. Tente de novo.' };

  const itens = (Array.isArray(pedido.itens) ? pedido.itens : []) as Record<string, unknown>[];
  return {
    ok: true,
    codigo,
    total: Number(pedido.total),
    itens: itens.map((i) => ({
      produtoId: Number(i.produto_id),
      nome: String(i.nome ?? ''),
      quantidade: Number(i.quantidade),
      precoUnitario: Number(i.preco_unitario),
      fornecedorId: Number(i.fornecedor_id),
      fornecedor: String(i.fornecedor ?? ''),
      combinado: i.combinado === true
    }))
  };
}

// ---------------------------------------------------------------- loja

export interface ProdutoDaLoja {
  id: number;
  nome: string;
  categoria: Categoria;
  unidade: Unidade;
  conteudo: number | null;
  preco: number;
  chave: string;
  especificacao: Record<string, unknown>;
}

async function lojaEProdutos(sb: Cliente, fornecedorId: number): Promise<{ uf: string | null; produtos: LinhaProduto[] } | null> {
  const [f, p] = await Promise.all([
    sb.from('fornecedores').select('uf, ativo').eq('id', fornecedorId).maybeSingle(),
    sb.from('produtos').select(COLUNAS_PRODUTO).eq('fornecedor_id', fornecedorId).eq('ativo', true)
  ]);
  if (f.error || p.error || !f.data) return null;
  const loja = f.data as { uf: string | null; ativo: boolean };
  return { uf: loja.ativo ? loja.uf : null, produtos: ler(esquemaProduto, p.data) };
}

/** Os alertas que a loja pode responder (estado dela, categorias que ela vende) e os que ela já respondeu. */
export async function alertasParaLoja(fornecedorId: number): Promise<{ alertas: AlertaParaLoja[]; produtos: ProdutoDaLoja[]; uf: string | null; erro: string | null }> {
  const sb = clienteEquipe();
  if (!sb) return { alertas: [], produtos: [], uf: null, erro: SEM_BANCO };
  const base = await lojaEProdutos(sb, fornecedorId);
  if (!base) return { alertas: [], produtos: [], uf: null, erro: ERRO };
  const produtos = base.produtos.map((p): ProdutoDaLoja => ({ id: p.id, nome: nomeDoProduto(p), categoria: p.categoria, unidade: p.unidade, conteudo: p.conteudo, preco: p.preco, chave: chaveDoProduto(p), especificacao: p.especificacao }));
  const categorias = [...new Set(produtos.map((p) => p.categoria))];
  const agora = Date.now();
  const minhas = await sb.from('alertas_respostas').select(COLUNAS_RESPOSTA).eq('fornecedor_id', fornecedorId).gte('criado_em', new Date(agora - 30 * 24 * HORA).toISOString()).limit(300);
  const respostas = ler(esquemaResposta_, minhas.data);
  const [abertos, respondidos] = await Promise.all([
    base.uf && categorias.length
      ? sb.from('alertas_preco').select(COLUNAS_ALERTA_LOJA).eq('oficina_uf', base.uf).eq('status', 'aberto').gt('expira_em', new Date(agora).toISOString()).in('categoria', categorias).order('criado_em', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    respostas.length ? sb.from('alertas_preco').select(COLUNAS_ALERTA_LOJA).in('id', respostas.map((r) => r.alerta_id)) : Promise.resolve({ data: [], error: null })
  ]);
  if (abertos.error || respondidos.error) {
    console.error('[alertas] para a loja', abertos.error ?? respondidos.error);
    return { alertas: [], produtos, uf: base.uf, erro: ERRO };
  }
  const esquemaLoja = esquemaAlerta.pick({ id: true, oficina_cidade: true, oficina_uf: true, categoria: true, titulo: true, produto_id: true, chave: true, especificacao: true, quantidade: true, preco_alvo: true, mensagem: true, status: true, expira_em: true, criado_em: true });
  const vistos = new Map<string, z.infer<typeof esquemaLoja>>();
  for (const a of [...ler(esquemaLoja, abertos.data), ...ler(esquemaLoja, respondidos.data)]) vistos.set(a.id, a);
  const idsPedidos = respostas.flatMap((r) => (r.status === 'escolhida' && r.pedido_id != null ? [r.pedido_id] : []));
  const pe = idsPedidos.length ? await sb.from('pedidos').select('id, codigo').in('id', idsPedidos) : { data: [] };
  const pedidos = new Map(((pe.data ?? []) as { id: number; codigo: string }[]).map((x) => [Number(x.id), x.codigo]));
  const alertas = [...vistos.values()]
    .map((a): AlertaParaLoja => {
      const minha = respostas.find((r) => r.alerta_id === a.id) ?? null;
      return {
        id: a.id,
        titulo: a.titulo,
        categoria: a.categoria,
        chave: a.chave,
        especificacao: a.especificacao,
        quantidade: a.quantidade,
        precoAlvo: a.preco_alvo,
        litros: litrosDoAlerta(a),
        cidade: a.oficina_cidade,
        uf: a.oficina_uf,
        mensagem: a.mensagem,
        expiraEm: a.expira_em,
        criadoEm: a.criado_em,
        resultado: resultadoParaLoja({ status: a.status, expiraEm: a.expira_em }, minha, agora),
        minha: minha
          ? { id: minha.id, tipo: minha.tipo, produtoId: minha.produto_id, preco: minha.preco, quantidadeMinima: minha.quantidade_minima, prazoEntrega: minha.prazo_entrega, mensagem: minha.mensagem, status: minha.status }
          : null,
        pedido: minha?.pedido_id != null ? (pedidos.get(minha.pedido_id) ?? null) : null
      };
    })
    .sort((x, y) => (x.criadoEm < y.criadoEm ? 1 : -1));
  return { alertas, produtos, uf: base.uf, erro: null };
}

/** Quantos alertas abertos a loja ainda não respondeu (para o número na aba). */
export async function alertasSemResposta(fornecedorId: number, uf: string | null, categorias: Categoria[]): Promise<number> {
  const sb = clienteEquipe();
  if (!sb || !uf || !categorias.length) return 0;
  const a = await sb.from('alertas_preco').select('id').eq('oficina_uf', uf).eq('status', 'aberto').gt('expira_em', new Date().toISOString()).in('categoria', categorias).limit(200);
  const ids = ((a.data ?? []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return 0;
  const r = await sb.from('alertas_respostas').select('alerta_id').eq('fornecedor_id', fornecedorId).in('alerta_id', ids);
  const respondidos = new Set(((r.data ?? []) as { alerta_id: string }[]).map((x) => x.alerta_id));
  return ids.filter((id) => !respondidos.has(id)).length;
}

export async function responderAlerta(fornecedorId: number, entrada: unknown): Promise<Gravacao> {
  const r = esquemaResposta.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira a resposta.' };
  const d = r.data;
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const base = await lojaEProdutos(sb, fornecedorId);
  if (!base) return { ok: false, erro: ERRO };
  const a = await sb.from('alertas_preco').select(COLUNAS_ALERTA).eq('id', d.alertaId).maybeSingle();
  const alerta = a.data ? ler(esquemaAlerta, [a.data])[0] : undefined;
  if (!alerta || alerta.oficina_uf !== base.uf || !base.produtos.some((p) => p.categoria === alerta.categoria)) return { ok: false, erro: 'Alerta não encontrado.' };
  if (alerta.status !== 'aberto' || Date.parse(alerta.expira_em) <= Date.now()) return { ok: false, erro: 'Este alerta já terminou.' };
  const atual = await sb.from('alertas_respostas').select('status').eq('alerta_id', alerta.id).eq('fornecedor_id', fornecedorId).maybeSingle();
  if (atual.error) return { ok: false, erro: ERRO };
  if (atual.data && (atual.data as { status: string }).status !== 'enviada') return { ok: false, erro: 'Este alerta já terminou.' };

  let linha: Record<string, unknown> = { tipo: 'recusa', produto_id: null, preco: null, quantidade_minima: null, prazo_entrega: null, mensagem: d.mensagem || null };
  if (d.tipo !== 'recusa') {
    const produto = base.produtos.find((p) => p.id === d.produtoId);
    if (!produto || produto.categoria !== alerta.categoria) return { ok: false, erro: 'Escolha um produto seu da mesma categoria do alerta.' };
    let preco: number;
    let minimo: number;
    if (d.tipo === 'aceita') {
      if (!embalagemComparavel({ litros: litrosDoAlerta(alerta), especificacao: alerta.especificacao }, produto))
        return { ok: false, erro: 'A embalagem do seu produto é diferente da que a oficina pediu. Mande uma contraproposta com o seu preço.' };
      ({ preco, quantidadeMinima: minimo } = aceiteEquivalente({ quantidade: alerta.quantidade, precoAlvo: alerta.preco_alvo, litros: litrosDoAlerta(alerta) }, produto));
    } else {
      preco = Math.round(d.preco * 100) / 100;
      minimo = d.quantidadeMinima;
      if (preco >= produto.preco) return { ok: false, erro: `O preço da proposta precisa ser menor que o seu preço na loja (${formatarMoeda(produto.preco)}).` };
    }
    linha = { tipo: d.tipo, produto_id: produto.id, preco, quantidade_minima: minimo, prazo_entrega: d.prazoEntrega || null, mensagem: d.mensagem || null };
  }
  const agora = new Date().toISOString();
  if (atual.data) {
    // muda só a resposta que ainda não foi escolhida (a oficina pode estar fechando agora mesmo)
    const { data, error } = await sb
      .from('alertas_respostas')
      .update({ ...linha, criado_em: agora })
      .eq('alerta_id', alerta.id)
      .eq('fornecedor_id', fornecedorId)
      .eq('status', 'enviada')
      .is('pedido_id', null)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[alertas] mudar resposta', error);
      return { ok: false, erro: 'Não deu para mandar a resposta agora. Tente de novo.' };
    }
    return data ? { ok: true } : { ok: false, erro: 'Este alerta já terminou.' };
  }
  const { error } = await sb.from('alertas_respostas').insert({ alerta_id: alerta.id, fornecedor_id: fornecedorId, ...linha, status: 'enviada', criado_em: agora });
  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'Você já respondeu este alerta. Atualize a página.' };
    console.error('[alertas] responder', error);
    return { ok: false, erro: 'Não deu para mandar a resposta agora. Tente de novo.' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- pacotes e equipe

/** O Pix do Revisaí para o pacote, se a equipe cadastrou a chave (REVISAI_PIX_*). */
function pixDoRevisai(valor: number, txid: string): string | null {
  const tipo = process.env.REVISAI_PIX_TIPO?.trim() as TipoChavePix | undefined;
  const chave = process.env.REVISAI_PIX_CHAVE?.trim();
  const nome = process.env.REVISAI_PIX_NOME?.trim();
  const cidade = process.env.REVISAI_PIX_CIDADE?.trim();
  if (!tipo || !chave || !nome || !cidade || !['cnpj', 'cpf', 'email', 'telefone', 'aleatoria'].includes(tipo)) return null;
  const normal = normalizarChavePix(tipo, chave);
  return normal ? codigoPix({ chave: normal, nome, cidade, valor, txid, descricao: 'Alertas Revisai' }) : null;
}

export async function pedirPacote(entrada: { codigoPro: string; quantidade: number; oficina: { nome: string; whatsapp: string; cidade: string; uf: string } }): Promise<Gravacao<{ pix: string | null; valor: number }>> {
  const pacote = pacoteValido(entrada.quantidade);
  if (!pacote) return { ok: false, erro: 'Escolha um dos pacotes.' };
  if (!/^[0-9A-Z]{16}$/.test(entrada.codigoPro)) return { ok: false, erro: 'Os pacotes são para quem tem o Pro.' };
  const whatsapp = normalizarTelefone(entrada.oficina.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Escreva o WhatsApp da oficina em Ajustes, com DDD.' };
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  if (!(await codigoValeHoje(sb, entrada.codigoPro))) return { ok: false, erro: 'O seu Pro venceu. Renove para comprar alertas.' };
  const nome = entrada.oficina.nome.trim().slice(0, 120) || 'Oficina';
  const { error } = await sb.from('interessados').insert({
    tipo: 'oficina',
    nome,
    empresa: nome,
    whatsapp,
    cidade: entrada.oficina.cidade.trim().slice(0, 80) || null,
    uf: /^[A-Z]{2}$/.test(entrada.oficina.uf) ? entrada.oficina.uf : null,
    plano: 'alertas',
    mensagem: `Quer ${pacote.quantidade} alertas de preço extras (${formatarMoeda(pacote.preco)}). Código do Pro: ${formatarCodigo(entrada.codigoPro)}.`,
    origem: 'app',
    consentimento: true
  });
  if (error?.code === 'P0001') return { ok: false, erro: 'Já recebemos o seu pedido. A equipe fala com você em breve.' };
  if (error) {
    console.error('[alertas] pacote', error);
    return { ok: false, erro: 'Não deu para pedir agora. Tente de novo.' };
  }
  return { ok: true, pix: pixDoRevisai(pacote.preco, `ALR${entrada.codigoPro.slice(0, 8)}${pacote.quantidade}`), valor: pacote.preco };
}

export interface UsoDeAlertas {
  noMes: number;
  creditos: number;
  extrasRestantes: number;
}

/** Para o painel administrativo: o uso de cada código do Pro (somando os códigos da mesma oficina). */
export async function usoDosAlertas(assinaturas: Assinante[]): Promise<Map<string, UsoDeAlertas>> {
  const uso = new Map<string, UsoDeAlertas>();
  const sb = clienteEquipe();
  if (!sb || !assinaturas.length) return uso;
  const agora = Date.now();
  const feitos = new Map<string, UsoDeAlertas>();
  for (const a of assinaturas) {
    const grupo = codigosDoMesmoDono(a.codigo, assinaturas);
    const chave = [...grupo].sort().join(',');
    let u = feitos.get(chave);
    if (!u) {
      const r = await alertasDaCotaPro(sb, grupo, agora);
      if (!r) continue;
      const cota = cotaPro(r.alertas, r.creditos, agora);
      u = { noMes: cota.usados, creditos: r.creditos, extrasRestantes: cota.extras };
      feitos.set(chave, u);
    }
    uso.set(a.codigo, u);
  }
  return uso;
}

export async function liberarAlertas(codigo: string, quantidade: number, valor: number | null, observacao: string): Promise<Gravacao> {
  if (!/^[0-9A-Z]{16}$/.test(codigo)) return { ok: false, erro: 'Código inválido.' };
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 1000) return { ok: false, erro: 'Quantidade inválida.' };
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_BANCO };
  const existe = await sb.from('assinaturas').select('id').eq('codigo', codigo).maybeSingle();
  if (!existe.data) return { ok: false, erro: 'Esse código do Pro não existe.' };
  const { error } = await sb.from('alertas_creditos').insert({ codigo_pro: codigo, quantidade, valor, observacao: observacao.trim().slice(0, 200) || null });
  if (error) {
    console.error('[alertas] liberar', error);
    return { ok: false, erro: 'Não deu para liberar agora. Tente de novo.' };
  }
  return { ok: true };
}
