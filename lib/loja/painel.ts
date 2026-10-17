import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';
import { contaAtual, lojaEscolhida } from '../conta';
import type { LojaDaConta } from '../conta-dados';
import { redirect } from 'next/navigation';
import { COLUNAS_IMPULSO, COLUNAS_PROMOCAO, lerImpulsos, lerPromocoesCompletas, type LinhaImpulso, type LinhaPromocao } from '../marketplace-dados';
import { clienteDoUsuario } from '../supabase-servidor';
import { contarAlertasSemResposta } from './alertas';
import { hojeEmBrasilia } from './comum';
import {
  COLUNAS_CONTRATO_DA_LOJA,
  COLUNAS_LOJA,
  COLUNAS_PARTE_DA_LOJA,
  COLUNAS_PRODUTO_DA_LOJA,
  lerContratoDaLoja,
  lerLoja,
  lerPedidosDaLoja,
  lerProdutosDaLoja,
  type ContratoDaLoja,
  type LinhaLoja,
  type LinhaProdutoDaLoja,
  type PedidoDaLoja
} from './dados';

// O painel da loja, lido como a pessoa que entrou: o banco só devolve o que é da loja dela.

export interface PainelDaLoja {
  loja: LinhaLoja;
  papel: 'dono' | 'vendedor';
  /** Quem entrou (para a equipe da loja mostrar "você"). */
  usuarioId: string;
  email: string;
  /** As outras lojas da mesma pessoa (para trocar). */
  lojas: LojaDaConta[];
  contrato: ContratoDaLoja | null;
  produtos: LinhaProdutoDaLoja[];
  promocoes: LinhaPromocao[];
  impulsos: LinhaImpulso[];
  pedidos: PedidoDaLoja[];
  /** Alertas de preço abertos que a loja ainda não respondeu. */
  alertasNovos: number;
  hoje: string;
}

export type ResultadoPainel =
  | { estado: 'fora' }
  | { estado: 'termos' }
  | { estado: 'sem-loja' }
  | { estado: 'erro'; erro: string }
  | { estado: 'ok'; painel: PainelDaLoja; sb: SupabaseClient };

const ERRO_LEITURA = 'Não deu para carregar agora. Atualize a página em instantes.';

/** O histórico de várias partes, em lotes (o endereço da consulta tem limite de tamanho). */
async function historicoDas(sb: SupabaseClient, ids: number[]): Promise<unknown[]> {
  const todos: unknown[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from('pedidos_historico').select('parte_id, quando, campo, de, para, quem, motivo').in('parte_id', ids.slice(i, i + 100)).order('quando').limit(1000);
    if (error) throw error;
    todos.push(...(data ?? []));
  }
  return todos;
}

export const painelDaLoja = cache(async (): Promise<ResultadoPainel> => {
  const conta = await contaAtual();
  if (!conta) return { estado: 'fora' };
  const escolhida = await lojaEscolhida();
  if (!escolhida) return { estado: 'sem-loja' };
  const sb = await clienteDoUsuario();
  if (!sb) return { estado: 'erro', erro: 'O banco não está configurado.' };
  const id = escolhida.id;
  try {
    const [f, c, p, i, pf, t] = await Promise.all([
      sb.from('fornecedores').select(COLUNAS_LOJA).eq('id', id).maybeSingle(),
      sb.from('fornecedores_contrato').select(COLUNAS_CONTRATO_DA_LOJA).eq('fornecedor_id', id).maybeSingle(),
      sb.from('produtos').select(COLUNAS_PRODUTO_DA_LOJA).eq('fornecedor_id', id).order('categoria').order('nome').limit(5000),
      sb.from('impulsos').select(COLUNAS_IMPULSO).eq('fornecedor_id', id).order('criado_em', { ascending: false }).limit(100),
      sb.from('pedidos_fornecedores').select(COLUNAS_PARTE_DA_LOJA).eq('fornecedor_id', id).order('criado_em', { ascending: false }).limit(200),
      sb.rpc('termos_pendentes')
    ]);
    // o dono aceita o contrato da loja (e todos, os termos) antes de usar o painel
    if (Array.isArray(t.data) && t.data.length) return { estado: 'termos' };
    const erro = f.error ?? c.error ?? p.error ?? i.error ?? pf.error;
    if (erro) {
      console.error('[loja] painel', erro);
      return { estado: 'erro', erro: ERRO_LEITURA };
    }
    const loja = lerLoja(f.data);
    if (!loja) return { estado: 'sem-loja' };
    const produtos = lerProdutosDaLoja(p.data);
    const ids = produtos.map((x) => x.id);
    const promos = ids.length ? await sb.from('promocoes').select(COLUNAS_PROMOCAO).in('produto_id', ids).order('fim', { ascending: false }) : { data: [], error: null };
    if (promos.error) {
      console.error('[loja] promoções', promos.error);
      return { estado: 'erro', erro: ERRO_LEITURA };
    }
    const partes = (pf.data ?? []) as { id: number | string }[];
    const historico = await historicoDas(sb, partes.map((x) => Number(x.id)));
    const categorias = [...new Set(produtos.filter((x) => x.ativo).map((x) => x.categoria))];
    const alertasNovos = loja.ativo && loja.uf ? await contarAlertasSemResposta(sb, id, loja.uf, categorias).catch(() => 0) : 0;
    return {
      estado: 'ok',
      sb,
      painel: {
        loja,
        papel: escolhida.papel,
        usuarioId: conta.usuario.id,
        email: conta.usuario.email,
        lojas: conta.fornecedores,
        contrato: c.data ? lerContratoDaLoja(c.data) : null,
        produtos,
        promocoes: lerPromocoesCompletas(promos.data).itens,
        impulsos: lerImpulsos(i.data).itens,
        pedidos: lerPedidosDaLoja(pf.data, historico, id),
        alertasNovos,
        hoje: hojeEmBrasilia()
      }
    };
  } catch (e) {
    console.error('[loja] painel', e);
    return { estado: 'erro', erro: ERRO_LEITURA };
  }
});

/**
 * Para as páginas: sem conta vai para a entrada (e volta para a mesma página); com termos para
 * aceitar, para a conta. O resto (sem loja, erro, ok) a página mostra.
 */
export async function painelOuEntrada(caminho: string): Promise<Exclude<ResultadoPainel, { estado: 'fora' } | { estado: 'termos' }>> {
  const r = await painelDaLoja();
  if (r.estado === 'fora') redirect(`/entrar?para=${encodeURIComponent(caminho)}`);
  if (r.estado === 'termos') redirect(`/conta?para=${encodeURIComponent(caminho)}`);
  return r;
}
