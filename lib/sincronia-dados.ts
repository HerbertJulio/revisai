// O que a sincronização compara, manda e aplica. Funções puras (sem navegador nem banco),
// para testar: o motor (components/oficina/sincronia) cuida da rede, do tempo real e dos aparelhos.

import { ehExemplo } from './exemplo';
import { COLECOES_EXTRAS } from './registros-oficina';
import type { DadosGuardados } from './store';
import type { PedidoEnviado, Preferencias } from './tipos';

/** As coleções que são um mapa id -> item no aparelho e uma linha por item no banco. */
export const COLECOES = ['clientes', 'veiculos', 'atendimentos', 'leituras', 'contatos', 'produtosProprios', 'ordens', 'estoque', 'movimentos', 'documentos', ...COLECOES_EXTRAS] as const;
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

/** O tema é de cada aparelho (um celular escuro, o computador claro): não sincroniza. */
function semTema(p: Preferencias): Omit<Preferencias, 'tema'> {
  const { tema: _tema, ...resto } = p;
  return resto;
}

function preferenciasMudaram(a: Preferencias, b: Preferencias): boolean {
  if (a === b) return false;
  return JSON.stringify(semTema(a)) !== JSON.stringify(semTema(b));
}

type Estado = Pick<DadosGuardados, Colecao | 'pedidos' | CONFIG_KEYS>;
type CONFIG_KEYS = 'oficina' | 'preferencias' | 'contadores';

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
  if (colecao === 'config') return id === 'oficina' ? e.oficina : id === 'preferencias' ? e.preferencias : e.contadores;
  if (colecao === 'pedidos') return (e.pedidos ?? []).find((x) => x.codigo === id);
  return (e[colecao as Colecao] as Record<string, unknown> | undefined)?.[id];
}

/**
 * Aplica no aparelho o que veio do banco. O que tem mudança local esperando para subir fica
 * como está (vai subir e vencer). Devolve só as partes do estado que mudaram.
 */
export function aplicarRecebidos(e: Estado, itens: ItemRecebido[], pendentes: Record<Chave, true>): Partial<Estado> {
  const novo: Partial<Record<Colecao, Record<string, unknown>>> = {};
  let pedidos: PedidoEnviado[] | null = null;
  const parte: Partial<Estado> = {};
  for (const it of itens) {
    const k = chave(it.colecao, it.id);
    if (pendentes[k]) continue;
    if (it.colecao === 'config') {
      if (it.apagado || !it.dados) continue;
      if (it.id === 'oficina') parte.oficina = { ...e.oficina, ...(it.dados as object) } as Estado['oficina'];
      else if (it.id === 'preferencias') parte.preferencias = { ...e.preferencias, ...(it.dados as object), tema: e.preferencias.tema } as Preferencias;
      else if (it.id === 'contadores') parte.contadores = { ...(it.dados as object) } as Estado['contadores'];
      continue;
    }
    if (it.colecao === 'pedidos') {
      pedidos ??= [...(e.pedidos ?? [])];
      const i = pedidos.findIndex((p) => p.codigo === it.id);
      if (it.apagado || !it.dados) {
        if (i >= 0) pedidos.splice(i, 1);
      } else if (i >= 0) pedidos[i] = it.dados as unknown as PedidoEnviado;
      else pedidos.push(it.dados as unknown as PedidoEnviado);
      continue;
    }
    if (!(COLECOES as readonly string[]).includes(it.colecao)) continue;
    const c = it.colecao as Colecao;
    novo[c] ??= { ...(e[c] as Record<string, unknown>) };
    if (it.apagado || !it.dados) delete novo[c]![it.id];
    else novo[c]![it.id] = it.dados;
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
