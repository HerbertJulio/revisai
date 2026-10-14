import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  lerCadastros,
  lerFornecedores,
  lerPedidos,
  lerProdutos,
  lerPromocoes,
  type Cadastro,
  type LojaEquipe,
  type Pedido,
  type SituacaoCadastro,
  type SituacaoPedido
} from './equipe-dados';
import { COOKIE_EQUIPE, sessaoValida } from './sessao-equipe';

// Acesso do painel da equipe ao banco. O servidor manda a chave do painel no cabeçalho
// x-revisai-equipe e as políticas do Supabase (RLS) liberam só o que a equipe pode ver e mudar.

export interface ConfigEquipe {
  senha: string;
  chave: string;
  url: string;
  chavePublica: string;
}

export function configEquipe(): ConfigEquipe | null {
  const senha = process.env.EQUIPE_SENHA?.trim() ?? '';
  const chave = process.env.EQUIPE_CHAVE?.trim() ?? '';
  const url = process.env.SUPABASE_URL ?? '';
  const chavePublica = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
  if (senha.length < 8 || chave.length < 32 || !url || !chavePublica) return null;
  return { senha, chave, url, chavePublica };
}

export type Acesso = 'sem-configuracao' | 'fora' | 'dentro';

export async function acessoDaEquipe(): Promise<Acesso> {
  const c = configEquipe();
  if (!c) return 'sem-configuracao';
  const jar = await cookies();
  return sessaoValida(jar.get(COOKIE_EQUIPE)?.value, c.chave, c.senha) ? 'dentro' : 'fora';
}

let cliente: SupabaseClient | null = null;

export function clienteEquipe(): SupabaseClient | null {
  const c = configEquipe();
  if (!c) return null;
  cliente ??= createClient(c.url, c.chavePublica, {
    global: { headers: { 'x-revisai-equipe': c.chave } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return cliente;
}

export interface Resultado<T> {
  dados: T;
  erro: string | null;
}

const ERRO_LEITURA = 'Não deu para carregar agora. Atualize a página em instantes.';
const SEM_CONFIGURACAO = 'O painel administrativo não está configurado.';

function avisarDescartes(tabela: string, descartadas: number) {
  if (descartadas) console.warn(`[equipe] ${descartadas} linha(s) de ${tabela} fora do formato esperado`);
}

const COLUNAS_PEDIDO = 'id, codigo, oficina_nome, oficina_whatsapp, oficina_cidade, oficina_uf, itens, total, observacao, status, criado_em';
const COLUNAS_CADASTRO = 'id, tipo, nome, empresa, whatsapp, email, cidade, uf, plano, mensagem, origem, situacao, criado_em';

export async function buscarPedidos(): Promise<Resultado<Pedido[]>> {
  const sb = clienteEquipe();
  if (!sb) return { dados: [], erro: SEM_CONFIGURACAO };
  const { data, error } = await sb.from('pedidos').select(COLUNAS_PEDIDO).order('criado_em', { ascending: false }).limit(500);
  if (error) {
    console.error('[equipe] pedidos', error);
    return { dados: [], erro: ERRO_LEITURA };
  }
  const { itens, descartadas } = lerPedidos(data);
  avisarDescartes('pedidos', descartadas);
  return { dados: itens, erro: null };
}

export async function buscarCadastros(): Promise<Resultado<Cadastro[]>> {
  const sb = clienteEquipe();
  if (!sb) return { dados: [], erro: SEM_CONFIGURACAO };
  const { data, error } = await sb.from('interessados').select(COLUNAS_CADASTRO).order('criado_em', { ascending: false }).limit(500);
  if (error) {
    console.error('[equipe] interessados', error);
    return { dados: [], erro: ERRO_LEITURA };
  }
  const { itens, descartadas } = lerCadastros(data);
  avisarDescartes('interessados', descartadas);
  return { dados: itens, erro: null };
}

export async function buscarLoja(): Promise<Resultado<LojaEquipe>> {
  const vazio: LojaEquipe = { fornecedores: [], produtos: [], promocoes: [] };
  const sb = clienteEquipe();
  if (!sb) return { dados: vazio, erro: SEM_CONFIGURACAO };
  const [f, p, pr] = await Promise.all([
    sb.from('fornecedores').select('id, nome, cidade, uf, whatsapp, demonstracao, ativo').order('nome'),
    sb.from('produtos').select('id, fornecedor_id, categoria, nome, marca, unidade, preco, ativo').order('nome'),
    sb.from('promocoes').select('id, produto_id, titulo, preco_promocional, quantidade_minima, inicio, fim, ativo').order('fim', { ascending: false })
  ]);
  const erro = f.error ?? p.error ?? pr.error;
  if (erro) {
    console.error('[equipe] loja', erro);
    return { dados: vazio, erro: ERRO_LEITURA };
  }
  const fornecedores = lerFornecedores(f.data);
  const produtos = lerProdutos(p.data);
  const promocoes = lerPromocoes(pr.data);
  avisarDescartes('fornecedores', fornecedores.descartadas);
  avisarDescartes('produtos', produtos.descartadas);
  avisarDescartes('promocoes', promocoes.descartadas);
  return { dados: { fornecedores: fornecedores.itens, produtos: produtos.itens, promocoes: promocoes.itens }, erro: null };
}

/** Quantos pedidos, cadastros, impulsos e sugestões estão esperando resposta (para as abas). */
export async function contarNovos(): Promise<{ pedidos: number; cadastros: number; impulsos: number; sugestoes: number }> {
  const sb = clienteEquipe();
  if (!sb) return { pedidos: 0, cadastros: 0, impulsos: 0, sugestoes: 0 };
  const [p, c, i, s] = await Promise.all([
    sb.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'novo'),
    sb.from('interessados').select('id', { count: 'exact', head: true }).eq('situacao', 'novo'),
    sb.from('impulsos').select('id', { count: 'exact', head: true }).eq('status', 'pedido'),
    sb.from('produtos_referencia').select('id', { count: 'exact', head: true }).eq('aprovado', false).eq('ativo', true)
  ]);
  return { pedidos: p.count ?? 0, cadastros: c.count ?? 0, impulsos: i.count ?? 0, sugestoes: s.count ?? 0 };
}

export type Gravacao = { ok: true } | { ok: false; erro: string };

export async function salvarSituacaoPedido(id: number, status: SituacaoPedido): Promise<Gravacao> {
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_CONFIGURACAO };
  const { data, error } = await sb.from('pedidos').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('[equipe] situação do pedido', error);
    return { ok: false, erro: 'Não deu para salvar a situação. Tente de novo.' };
  }
  return data ? { ok: true } : { ok: false, erro: 'Esse pedido não foi encontrado.' };
}

export async function salvarSituacaoCadastro(id: number, situacao: SituacaoCadastro): Promise<Gravacao> {
  const sb = clienteEquipe();
  if (!sb) return { ok: false, erro: SEM_CONFIGURACAO };
  const { data, error } = await sb.from('interessados').update({ situacao }).eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('[equipe] situação do cadastro', error);
    return { ok: false, erro: 'Não deu para salvar a situação. Tente de novo.' };
  }
  return data ? { ok: true } : { ok: false, erro: 'Esse cadastro não foi encontrado.' };
}
