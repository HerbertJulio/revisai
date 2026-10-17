// O que a sincronização compara, manda e aplica. Funções puras (sem navegador nem banco),
// para testar: o motor (components/oficina/sincronia) cuida da rede, do tempo real e dos aparelhos.

import { ehExemplo } from './exemplo';
import type { DadosGuardados } from './store';
import type { ItemEstoque, MovimentoEstoque, PedidoEnviado, Preferencias } from './tipos';

/** As coleções que são um mapa id -> item no aparelho e uma linha por item no banco. */
export const COLECOES = ['clientes', 'veiculos', 'atendimentos', 'leituras', 'contatos', 'produtosProprios', 'ordens', 'estoque', 'movimentos', 'documentos'] as const;
export type Colecao = (typeof COLECOES)[number];

/** O cadastro, as preferências e a numeração dos documentos (uma linha cada, coleção 'config'). */
export const CONFIG = ['oficina', 'preferencias', 'contadores'] as const;
export type ItemConfig = (typeof CONFIG)[number];

export type Chave = string;

export function chave(colecao: string, id: string): Chave {
  return `${colecao}|${id}`;
}

export function partesDaChave(k: Chave): { colecao: string; id: string } {
  const i = k.indexOf('|');
  return { colecao: k.slice(0, i), id: k.slice(i + 1) };
}

export interface ItemEnviado {
  colecao: string;
  id: string;
  dados: Record<string, unknown>;
  apagado: boolean;
}

export interface ItemRecebido {
  colecao: string;
  id: string;
  dados: Record<string, unknown> | null;
  apagado: boolean;
  versao: number;
  tx: number;
}

/** Mesmo conteúdo (o que veio do banco é uma cópia nova do mesmo objeto). */
export function iguais(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** O tema é de cada aparelho (um celular escuro, o computador claro): não sincroniza. */
function semTema(p: Preferencias): Omit<Preferencias, 'tema'> {
  const { tema: _tema, ...resto } = p;
  return resto;
}

function preferenciasMudaram(a: Preferencias, b: Preferencias): boolean {
  if (a === b) return false;
  return JSON.stringify(semTema(a)) !== JSON.stringify(semTema(b));
}

type CONFIG_KEYS = 'oficina' | 'preferencias' | 'contadores';
export type Estado = Pick<DadosGuardados, Colecao | 'pedidos' | CONFIG_KEYS>;

/** As chaves que mudaram entre dois estados do aparelho (o que precisa subir). */
export function mudancas(antes: Estado, depois: Estado): Chave[] {
  const r: Chave[] = [];
  for (const c of COLECOES) {
    const a = antes[c] as Record<string, unknown>;
    const d = depois[c] as Record<string, unknown>;
    if (a === d) continue;
    for (const id of new Set([...Object.keys(a ?? {}), ...Object.keys(d ?? {})])) {
      if (ehExemplo(id)) continue;
      if (a?.[id] !== d?.[id]) r.push(chave(c, id));
    }
  }
  if (antes.pedidos !== depois.pedidos) {
    const a = new Map((antes.pedidos ?? []).map((p) => [p.codigo, p]));
    const d = new Map((depois.pedidos ?? []).map((p) => [p.codigo, p]));
    for (const codigo of new Set([...a.keys(), ...d.keys()])) if (a.get(codigo) !== d.get(codigo)) r.push(chave('pedidos', codigo));
  }
  if (antes.oficina !== depois.oficina) r.push(chave('config', 'oficina'));
  if (preferenciasMudaram(antes.preferencias, depois.preferencias)) r.push(chave('config', 'preferencias'));
  if (antes.contadores !== depois.contadores) r.push(chave('config', 'contadores'));
  return r;
}

/** Tudo o que o aparelho tem (para levar os dados dele para a conta na primeira vez). */
export function todasAsChaves(e: Estado): Chave[] {
  const r: Chave[] = [];
  for (const c of COLECOES) for (const id of Object.keys(e[c] ?? {})) if (!ehExemplo(id)) r.push(chave(c, id));
  for (const p of e.pedidos ?? []) r.push(chave('pedidos', p.codigo));
  r.push(chave('config', 'oficina'), chave('config', 'preferencias'), chave('config', 'contadores'));
  return r;
}

/** O item como ele está agora no aparelho (sumiu = apagado). */
export function itemParaEnviar(e: Estado, k: Chave): ItemEnviado {
  const { colecao, id } = partesDaChave(k);
  if (colecao === 'config') {
    const dados = id === 'oficina' ? e.oficina : id === 'preferencias' ? semTema(e.preferencias) : e.contadores;
    return { colecao, id, dados: (dados ?? {}) as Record<string, unknown>, apagado: false };
  }
  if (colecao === 'pedidos') {
    const p = (e.pedidos ?? []).find((x) => x.codigo === id);
    return p ? { colecao, id, dados: p as unknown as Record<string, unknown>, apagado: false } : { colecao, id, dados: {}, apagado: true };
  }
  const item = (e[colecao as Colecao] as Record<string, unknown> | undefined)?.[id];
  return item ? { colecao, id, dados: item as Record<string, unknown>, apagado: false } : { colecao, id, dados: {}, apagado: true };
}

/** O valor atual do item no aparelho (para saber se mudou de novo enquanto subia). */
export function valorAtual(e: Estado, k: Chave): unknown {
  const { colecao, id } = partesDaChave(k);
  if (colecao === 'config') return id === 'oficina' ? e.oficina : id === 'preferencias' ? semTema(e.preferencias) : e.contadores;
  if (colecao === 'pedidos') return (e.pedidos ?? []).find((x) => x.codigo === id);
  return (e[colecao as Colecao] as Record<string, unknown> | undefined)?.[id];
}

// ---------------------------------------------------------------- estoque que converge

/**
 * O ponto de partida da quantidade do item: a quantidade e o custo num instante. A quantidade
 * de verdade é essa base mais os movimentos depois dela, em ordem de tempo. Assim dois aparelhos
 * mexendo no mesmo item sem internet chegam à mesma quantidade quando tudo sobe (o item em si
 * vale o último que gravou; os movimentos somam todos).
 * `ate` desempata movimentos no mesmo milissegundo: contam os de id maior que ele.
 */
export interface BaseEstoque {
  quantidade: number;
  custo: number | null;
  em: string;
  ate: string;
}

export type ItemComBase = ItemEstoque & { base?: BaseEstoque };

/** Maior que qualquer id: a base inclui todos os movimentos daquele instante. */
export const ATE_TUDO = '￿';

const r2 = (n: number) => Math.round(n * 100) / 100;

function depoisDaBase(m: Pick<MovimentoEstoque, 'quando' | 'id'>, b: BaseEstoque): boolean {
  return m.quando > b.em || (m.quando === b.em && m.id > b.ate);
}

/** A base de um item antigo (de antes desta regra): o que ele tem agora já inclui os movimentos. */
export function baseDoItem(item: ItemComBase): BaseEstoque {
  return item.base ?? { quantidade: item.quantidade, custo: item.custo, em: item.atualizadoEm, ate: ATE_TUDO };
}

/** A quantidade, o custo e a última mudança do item, pela base e pelos movimentos. */
export function recalcularItem(item: ItemComBase, movimentos: Iterable<MovimentoEstoque>): ItemComBase {
  const b = item.base;
  if (!b) return item;
  const depois: MovimentoEstoque[] = [];
  for (const m of movimentos) if (m.itemId === item.id && Number.isFinite(m.quantidade) && depoisDaBase(m, b)) depois.push(m);
  depois.sort((x, y) => (x.quando < y.quando ? -1 : x.quando > y.quando ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  let quantidade = b.quantidade;
  let custo = b.custo;
  let ultima = b.em;
  for (const m of depois) {
    quantidade = Math.max(0, r2(quantidade + m.quantidade));
    if (m.tipo === 'entrada' && m.custoUnitario != null && m.custoUnitario > 0) custo = r2(m.custoUnitario);
    if (m.quando > ultima) ultima = m.quando;
  }
  const atualizadoEm = ultima > item.atualizadoEm ? ultima : item.atualizadoEm;
  if (quantidade === item.quantidade && custo === item.custo && atualizadoEm === item.atualizadoEm) return item;
  return { ...item, quantidade, custo, atualizadoEm };
}

/** Os itens de estoque que precisam ser recalculados depois de receber estes registros. */
export function itensAfetados(itens: ItemRecebido[], movimentosAntes: Record<string, MovimentoEstoque>): Set<string> {
  const r = new Set<string>();
  for (const it of itens) {
    if (it.colecao === 'estoque') r.add(it.id);
    else if (it.colecao === 'movimentos') {
      const novo = it.dados as unknown as MovimentoEstoque | null;
      if (novo?.itemId) r.add(novo.itemId);
      const velho = movimentosAntes[it.id];
      if (velho?.itemId) r.add(velho.itemId);
    }
  }
  return r;
}

// ---------------------------------------------------------------- aplicar o que veio do banco

/**
 * Aplica no aparelho o que veio do banco. O que tem mudança local esperando para subir fica
 * como está (vai subir e vencer). O que veio igual ao que já está aqui não muda (as telas não
 * redesenham à toa). Os itens de estoque tocados são recalculados pelos movimentos.
 * Devolve só as partes do estado que mudaram.
 */
export function aplicarRecebidos(e: Estado, itens: ItemRecebido[], pendentes: Record<Chave, true>): Partial<Estado> {
  const novo: Partial<Record<Colecao, Record<string, unknown>>> = {};
  let pedidos: PedidoEnviado[] | null = null;
  const parte: Partial<Estado> = {};
  const aplicados: ItemRecebido[] = [];
  for (const it of itens) {
    const k = chave(it.colecao, it.id);
    if (pendentes[k]) continue;
    if (it.colecao === 'config') {
      if (it.apagado || !it.dados) continue;
      if (it.id === 'oficina') {
        const v = { ...e.oficina, ...(it.dados as object) } as Estado['oficina'];
        if (!iguais(v, e.oficina)) parte.oficina = v;
      } else if (it.id === 'preferencias') {
        const v = { ...e.preferencias, ...(it.dados as object), tema: e.preferencias.tema } as Preferencias;
        if (!iguais(v, e.preferencias)) parte.preferencias = v;
      } else if (it.id === 'contadores') {
        const v = { ...(it.dados as object) } as Estado['contadores'];
        if (!iguais(v, e.contadores)) parte.contadores = v;
      }
      continue;
    }
    if (it.colecao === 'pedidos') {
      const atual: PedidoEnviado[] = pedidos ?? e.pedidos ?? [];
      const i = atual.findIndex((p: PedidoEnviado) => p.codigo === it.id);
      if (it.apagado || !it.dados) {
        if (i < 0) continue;
        pedidos ??= [...atual];
        pedidos.splice(pedidos.findIndex((p) => p.codigo === it.id), 1);
      } else {
        if (i >= 0 && iguais(atual[i], it.dados)) continue;
        pedidos ??= [...atual];
        const j = pedidos.findIndex((p) => p.codigo === it.id);
        if (j >= 0) pedidos[j] = it.dados as unknown as PedidoEnviado;
        else pedidos.push(it.dados as unknown as PedidoEnviado);
      }
      continue;
    }
    if (!(COLECOES as readonly string[]).includes(it.colecao)) continue;
    const c = it.colecao as Colecao;
    const atual = (novo[c] ?? e[c]) as Record<string, unknown>;
    if (it.apagado || !it.dados) {
      if (!(it.id in atual)) continue;
      novo[c] ??= { ...(e[c] as Record<string, unknown>) };
      delete novo[c]![it.id];
    } else {
      if (iguais(atual[it.id], it.dados)) continue;
      novo[c] ??= { ...(e[c] as Record<string, unknown>) };
      novo[c]![it.id] = it.dados;
    }
    aplicados.push(it);
  }

  // o estoque converge: a quantidade sai da base e dos movimentos de todos os aparelhos
  const afetados = itensAfetados(aplicados, e.movimentos);
  if (afetados.size) {
    const estoque = (novo.estoque ?? e.estoque) as Record<string, ItemComBase>;
    const porItem = new Map<string, MovimentoEstoque[]>();
    for (const m of Object.values((novo.movimentos ?? e.movimentos) as Record<string, MovimentoEstoque>)) {
      if (!afetados.has(m.itemId)) continue;
      const lista = porItem.get(m.itemId);
      if (lista) lista.push(m);
      else porItem.set(m.itemId, [m]);
    }
    for (const id of afetados) {
      // mesmo com mudança local esperando: a quantidade é a soma, e a versão certa sobe depois
      const item = estoque[id];
      if (!item) continue;
      const certo = recalcularItem(item, porItem.get(id) ?? []);
      if (certo === item) continue;
      novo.estoque ??= { ...(e.estoque as Record<string, unknown>) };
      novo.estoque![id] = certo;
    }
  }

  for (const [c, v] of Object.entries(novo)) (parte as Record<string, unknown>)[c] = v;
  if (pedidos) parte.pedidos = pedidos.sort((a, b) => (a.quando < b.quando ? 1 : -1)).slice(0, 200);
  return parte;
}

/** O aparelho tem dados de oficina guardados (fora os de exemplo)? */
export function temDadosLocais(e: Estado & { configurado?: boolean }): boolean {
  if (COLECOES.some((c) => Object.keys(e[c] ?? {}).some((id) => !ehExemplo(id)))) return true;
  return !!(e.pedidos?.length || (e.configurado && e.oficina?.nome));
}

/** Quantos itens de cada tipo o aparelho tem (para a pergunta "levar para a conta?"). */
export function resumoLocal(e: Estado): { clientes: number; carros: number; servicos: number; documentos: number; estoque: number } {
  const n = (c: Colecao) => Object.keys(e[c] ?? {}).filter((id) => !ehExemplo(id)).length;
  return { clientes: n('clientes'), carros: n('veiculos'), servicos: n('atendimentos'), documentos: n('documentos'), estoque: n('estoque') };
}
