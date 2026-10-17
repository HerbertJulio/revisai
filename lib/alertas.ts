import 'server-only';

// Alerta de preço no banco. A oficina fala com o banco como a pessoa que entrou: o banco só mostra
// os alertas e as respostas da oficina dela, confere a cota (limitar_alertas) e fecha o alerta
// junto com o pedido. A loja nunca vê o nome nem o WhatsApp da oficina antes de a oficina fechar
// com ela.

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { formatarMoeda, normalizarTelefone } from './formatos';
import {
  ALERTAS,
  cotaDaOficina,
  escolherAte,
  esquemaFechar,
  esquemaNovoAlerta,
  faixaParaFechar,
  inicioDoMesEmBrasilia,
  litrosDa,
  mensagemDoAlerta,
  pacoteValido,
  SEM_ESTADO,
  ufDoAlerta,
  type AlertaDaOficina,
  type AlertaParaContar,
  type CotaAlertas,
  type ProdutoDaResposta,
  type RespostaDoAlerta
} from './alertas-dados';
import { CATEGORIAS, nomeCategoria, type Unidade } from './catalogo';
import { codigoPedido } from './codigo-pedido';
import type { Conta, OficinaDaConta } from './conta-dados';
import { mensagemDoPedido, PROPOSTA_MUDOU } from './marketplace-dados';
import { codigoPix, normalizarChavePix, type TipoChavePix } from './pix';
import { chaveDoProduto } from './precos';
import type { Categoria, EspecProduto } from './tipos';

export type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

interface AcessoDaOficina {
  sb: SupabaseClient;
  oficina: OficinaDaConta;
}
const ERRO = 'Não deu para falar com o servidor agora. Tente de novo em instantes.';
const HORA = 3_600_000;

type Cliente = SupabaseClient;

const numero = z.union([z.number(), z.string()]).transform(Number);
const numeroOuNulo = z.union([z.number(), z.string(), z.null()]).transform((v) => (v == null ? null : Number(v)));
const textoOuNulo = z.string().nullish().transform((v) => v ?? null);
const categoria = z.enum(CATEGORIAS.map((c) => c.id) as [Categoria, ...Categoria[]]);

const esquemaAlerta = z.object({
  id: z.string(),
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
  'id, oficina_cidade, oficina_uf, categoria, titulo, produto_id, chave, especificacao, quantidade, preco_alvo, preco_pago, mensagem, usou_credito, status, resposta_escolhida, expira_em, criado_em';

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

/**
 * A cota da oficina, com as mesmas regras do banco: com o Pro em dia, a do mês mais o que sobrou
 * dos pacotes; no teste e no grátis, a de 30 dias. O banco é quem decide na hora de mandar.
 */
export async function calcularCota(sb: Cliente, oficina: Pick<OficinaDaConta, 'id' | 'plano'>, agora = Date.now()): Promise<CotaAlertas | null> {
  if (oficina.plano === 'pro') {
    const [doMes, dePacote, c] = await Promise.all([
      sb.from('alertas_preco').select(COLUNAS_CONTAR).eq('oficina_id', oficina.id).eq('usou_credito', false).gte('criado_em', inicioDoMesEmBrasilia(agora)).limit(1000),
      sb.from('alertas_preco').select(COLUNAS_CONTAR).eq('oficina_id', oficina.id).eq('usou_credito', true).limit(1000),
      sb.from('alertas_creditos').select('quantidade').eq('oficina_id', oficina.id).limit(1000)
    ]);
    if (doMes.error || dePacote.error || c.error) {
      console.error('[alertas] cota do Pro', doMes.error ?? dePacote.error ?? c.error);
      return null;
    }
    const alertas = await paraContar(sb, [...((doMes.data ?? []) as LinhaParaContar[]), ...((dePacote.data ?? []) as LinhaParaContar[])]);
    if (!alertas) return null;
    const creditos = ((c.data ?? []) as { quantidade: number | string }[]).reduce((s, x) => s + Number(x.quantidade), 0);
    return cotaDaOficina('pro', alertas, creditos, agora);
  }
  const desde = new Date(agora - 30 * 24 * HORA).toISOString();
  const a = await sb.from('alertas_preco').select(COLUNAS_CONTAR).eq('oficina_id', oficina.id).gte('criado_em', desde).limit(500);
  if (a.error) {
    console.error('[alertas] cota', a.error);
    return null;
  }
  const alertas = await paraContar(sb, (a.data ?? []) as LinhaParaContar[]);
  return alertas ? cotaDaOficina(oficina.plano, alertas, 0, agora) : null;
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

export async function criarAlerta(
  a: AcessoDaOficina,
  entrada: unknown
): Promise<Gravacao<{ alerta: AlertaDaOficina; lojas: number; cota: CotaAlertas | null }> & { semCota?: boolean }> {
  const r = esquemaNovoAlerta.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o alerta.' };
  const d = r.data;
  const { sb, oficina } = a;
  const uf = ufDoAlerta(d.uf, oficina.uf);
  if (!uf) return { ok: false, erro: SEM_ESTADO };

  const prod = await sb.from('produtos').select(COLUNAS_PRODUTO).eq('id', d.produtoId).maybeSingle();
  if (prod.error) {
    console.error('[alertas] produto', prod.error);
    return { ok: false, erro: ERRO };
  }
  const produto = prod.data ? ler(esquemaProduto, [prod.data])[0] : undefined;
  if (!produto || !produto.ativo) return { ok: false, erro: 'Este produto saiu da loja. Escolha outro.' };
  if (d.precoAlvo >= produto.preco) return { ok: false, erro: `A loja já vende por ${formatarMoeda(produto.preco)}. Para esse preço é só pôr no pedido.` };

  const lojas = await lojasQueRecebem(sb, uf, produto.categoria);
  if (!lojas) return { ok: false, erro: `Ainda não tem loja do ${uf} vendendo ${nomeCategoria(produto.categoria).toLowerCase()} no Revisaí. O alerta não foi gasto.` };

  // a trava do banco (limitar_alertas) confere a cota, os repetidos e os abertos, e decide se sai de pacote
  const especificacao: Record<string, unknown> = { ...(produto.especificacao as EspecProduto), unidade: produto.unidade, conteudo: produto.conteudo };
  const ins = await sb
    .from('alertas_preco')
    .insert({
      oficina_id: oficina.id,
      oficina_uf: uf,
      oficina_cidade: (d.cidade || oficina.cidade || '').slice(0, 80) || null,
      categoria: produto.categoria,
      titulo: nomeDoProduto(produto).slice(0, 160),
      produto_id: produto.id,
      chave: chaveDoProduto(produto).slice(0, 200),
      especificacao,
      quantidade: d.quantidade,
      preco_alvo: Math.round(d.precoAlvo * 100) / 100,
      preco_pago: d.precoPago == null ? null : Math.round(d.precoPago * 100) / 100,
      mensagem: d.mensagem || null,
      expira_em: new Date(Date.now() + ALERTAS.horasParaResponder * HORA).toISOString()
    })
    .select(COLUNAS_ALERTA)
    .single();
  if (ins.error || !ins.data) {
    const m = mensagemDoAlerta(ins.error);
    if (m) return { ok: false, ...m };
    console.error('[alertas] criar', ins.error);
    return { ok: false, erro: 'Não deu para mandar o alerta agora. Tente de novo.' };
  }
  const [linha] = ler(esquemaAlerta, [ins.data]);
  if (!linha) return { ok: false, erro: 'O alerta foi enviado. Atualize a página para ver.' };
  const cota = await calcularCota(sb, oficina).catch(() => null);
  return { ok: true, alerta: paraOficina(linha, [], new Map(), new Map(), new Map()), lojas, cota };
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

/** Os alertas da oficina com as respostas das lojas, e quantos alertas ainda dá para mandar. */
export async function alertasDaOficina(a: AcessoDaOficina): Promise<{ alertas: AlertaDaOficina[]; cota: CotaAlertas | null; erro: string | null }> {
  const { sb, oficina } = a;
  const [al, cota] = await Promise.all([
    sb.from('alertas_preco').select(COLUNAS_ALERTA).eq('oficina_id', oficina.id).order('criado_em', { ascending: false }).limit(30),
    calcularCota(sb, oficina).catch(() => null)
  ]);
  if (al.error) {
    console.error('[alertas] da oficina', al.error);
    return { alertas: [], cota, erro: ERRO };
  }
  const alertas = ler(esquemaAlerta, al.data);
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

/** A oficina desiste do alerta (o banco só deixa a oficina cancelar; o resto muda pelo pedido). */
export async function cancelarAlerta(a: AcessoDaOficina, alertaId: string): Promise<Gravacao> {
  const { data, error } = await a.sb
    .from('alertas_preco')
    .update({ status: 'cancelado' })
    .eq('id', alertaId)
    .eq('oficina_id', a.oficina.id)
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

/** Os itens como o banco calculou (o gatilho calcular_pedido põe nome, loja e preço de cada um). */
export function itensFechados(dados: unknown): ItemFechado[] {
  const itens = (Array.isArray(dados) ? dados : []) as Record<string, unknown>[];
  return itens.map((i) => ({
    produtoId: Number(i.produto_id),
    nome: String(i.nome ?? ''),
    quantidade: Number(i.quantidade),
    precoUnitario: Number(i.preco_unitario),
    fornecedorId: Number(i.fornecedor_id),
    fornecedor: String(i.fornecedor ?? ''),
    combinado: i.combinado === true
  }));
}

/** A oficina escolhe uma resposta: o pedido sai com o preço combinado e o banco fecha o alerta junto. */
export async function fecharAlerta(a: AcessoDaOficina, entrada: unknown): Promise<Gravacao<{ codigo: string; total: number; itens: ItemFechado[] }>> {
  const r = esquemaFechar.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? 'Confira o pedido.' };
  const d = r.data;
  const { sb, oficina } = a;
  const whatsapp = normalizarTelefone(oficina.whatsapp ?? '') ?? normalizarTelefone(d.contato.whatsapp);
  if (!whatsapp) return { ok: false, erro: 'Escreva o WhatsApp da oficina, com DDD. É por ele que a loja fala com você.' };

  const al = await sb.from('alertas_preco').select(COLUNAS_ALERTA).eq('id', d.alertaId).eq('oficina_id', oficina.id).maybeSingle();
  if (al.error) return { ok: false, erro: ERRO };
  const alerta = al.data ? ler(esquemaAlerta, [al.data])[0] : undefined;
  if (!alerta) return { ok: false, erro: 'Alerta não encontrado nesta oficina.' };
  if (alerta.status !== 'aberto') return { ok: false, erro: alerta.status === 'fechado' ? 'Você já fechou este alerta.' : 'Este alerta foi cancelado.' };
  if (Date.now() >= escolherAte(alerta.expira_em)) return { ok: false, erro: 'O prazo deste alerta acabou. Mande um alerta novo.' };

  const rr = await sb.from('alertas_respostas').select(COLUNAS_RESPOSTA).eq('id', d.respostaId).eq('alerta_id', alerta.id).maybeSingle();
  const resposta = rr.data ? ler(esquemaResposta_, [rr.data])[0] : undefined;
  if (!resposta || resposta.tipo === 'recusa' || resposta.produto_id == null || resposta.preco == null || resposta.status !== 'enviada') return { ok: false, erro: 'Esta proposta não vale mais.' };
  if (resposta.produto_id !== d.produtoEsperado || Math.abs(resposta.preco - d.precoEsperado) >= 0.005 || (resposta.quantidade_minima ?? 1) !== d.minimoEsperado)
    return { ok: false, erro: PROPOSTA_MUDOU };
  const doProduto = await sb.from('produtos').select(COLUNAS_PRODUTO).eq('id', resposta.produto_id).maybeSingle();
  const embalagem = doProduto.data ? ler(esquemaProduto, [doProduto.data])[0] : undefined;
  const faixa = faixaParaFechar({ quantidade: alerta.quantidade, litros: litrosDoAlerta(alerta) }, { quantidadeMinima: resposta.quantidade_minima, produto: embalagem ?? null });
  if (d.quantidade < faixa.minimo) return { ok: false, erro: `Por esse preço, a loja pede no mínimo ${faixa.minimo}.` };
  if (d.quantidade > faixa.maximo) return { ok: false, erro: `Por esse preço, a loja vende até ${faixa.maximo}. Para mais, ponha o resto no pedido normal.` };

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = codigoPedido();
    const ins = await sb
      .from('pedidos')
      .insert({
        codigo,
        oficina_id: oficina.id,
        // o banco põe o nome e o WhatsApp do cadastro da oficina; este só vale se a conta não tiver
        oficina_nome: oficina.nome,
        oficina_whatsapp: whatsapp,
        oficina_cidade: d.contato.cidade || null,
        oficina_uf: d.contato.uf || null,
        oficina_endereco: d.contato.endereco || null,
        // o banco confere a proposta que a oficina viu (produto, preço e mínimo) e fecha o alerta junto com o pedido
        itens: [{ produto_id: d.produtoEsperado, quantidade: d.quantidade, resposta_id: resposta.id, preco_esperado: d.precoEsperado, minimo_esperado: d.minimoEsperado }],
        observacao: ['Preço combinado no alerta de preço.', d.observacao].filter(Boolean).join(' ').slice(0, 500)
      })
      .select('itens, total')
      .single();
    if (!ins.error && ins.data) {
      const pedido = ins.data as { itens: unknown; total: number | string };
      return { ok: true, codigo, total: Number(pedido.total), itens: itensFechados(pedido.itens) };
    }
    if (ins.error?.code === '23505') continue;
    const m = mensagemDoPedido(ins.error);
    if (m) return { ok: false, erro: m };
    console.error('[alertas] fechar', ins.error);
    return { ok: false, erro: 'Não deu para fazer o pedido agora. Tente de novo.' };
  }
  return { ok: false, erro: 'Não deu para fazer o pedido agora. Tente de novo.' };
}

// ---------------------------------------------------------------- pacotes

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

/**
 * A oficina com o Pro em dia pede um pacote de alertas: vira um cadastro para a equipe cobrar e
 * liberar (a equipe acha a oficina pelo "Oficina: <id>" da mensagem).
 */
export async function pedirPacote(a: AcessoDaOficina & { conta: Pick<Conta, 'usuario'> }, entrada: { quantidade: number; whatsapp?: string }): Promise<Gravacao<{ pix: string | null; valor: number }>> {
  const pacote = pacoteValido(entrada.quantidade);
  if (!pacote) return { ok: false, erro: 'Escolha um dos pacotes.' };
  const { sb, oficina } = a;
  if (oficina.plano !== 'pro') return { ok: false, erro: 'Os pacotes são para quem tem o Pro em dia.' };
  const whatsapp = normalizarTelefone(oficina.whatsapp ?? '') ?? normalizarTelefone(entrada.whatsapp ?? '');
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.conta.usuario.email) ? a.conta.usuario.email.slice(0, 160) : null;
  if (!whatsapp && !email) return { ok: false, erro: 'Escreva o WhatsApp da oficina em Ajustes, com DDD.' };
  const nome = oficina.nome.trim().slice(0, 120) || 'Oficina';
  const { error } = await sb.from('interessados').insert({
    tipo: 'oficina',
    nome: nome.length >= 2 ? nome : 'Oficina',
    empresa: nome,
    whatsapp,
    email,
    cidade: oficina.cidade?.trim().slice(0, 80) || null,
    uf: oficina.uf && /^[A-Z]{2}$/.test(oficina.uf) ? oficina.uf : null,
    plano: 'alertas',
    mensagem: `Quer ${pacote.quantidade} alertas de preço extras (${formatarMoeda(pacote.preco)}). Oficina: ${oficina.id}.`,
    origem: 'app',
    consentimento: true
  });
  if (error?.code === 'P0001') return { ok: false, erro: 'Já recebemos o seu pedido. A equipe fala com você em breve.' };
  if (error) {
    console.error('[alertas] pacote', error);
    return { ok: false, erro: 'Não deu para pedir agora. Tente de novo.' };
  }
  return { ok: true, pix: pixDoRevisai(pacote.preco, `ALR${oficina.id.replace(/-/g, '').slice(0, 12).toUpperCase()}${pacote.quantidade}`), valor: pacote.preco };
}
