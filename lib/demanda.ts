// Demanda das oficinas para os fornecedores: o que os carros vão precisar nos próximos 30 dias,
// sem nome de cliente, placa ou oficina. O fornecedor só vê a soma da região, e só quando
// pelo menos MINIMO_OFICINAS oficinas entram na conta (para ninguém ser identificado).

import type { LinhaDemanda } from './recomendacao';
import { servico as infoServico } from './manutencao';
import type { Categoria } from './tipos';

export const MINIMO_OFICINAS = 3;

export interface ItemDemanda {
  categoria: Categoria;
  /** "Óleo 5W-30 dexos1", "Filtro de ar". */
  titulo: string;
  quantidade: number;
  unidade: 'L' | 'un';
  carros: number;
}

/** O que a oficina manda: as linhas da soma dos próximos 30 dias, já sem nada de cliente. */
export function itensDaDemanda(linhas: LinhaDemanda[]): ItemDemanda[] {
  const itens: ItemDemanda[] = [];
  for (const l of linhas) {
    if (l.semEspecificacao) continue;
    const categoria = infoServico(l.servico).categoria;
    if (!categoria) continue;
    itens.push({ categoria, titulo: l.titulo.slice(0, 120), quantidade: Math.round(l.volume * 100) / 100, unidade: l.unidadeVolume, carros: l.carros });
  }
  return itens.slice(0, 200);
}

export interface DemandaRecebida {
  uf: string | null;
  cidade: string | null;
  itens: ItemDemanda[];
  atualizadoEm: string;
}

export interface LinhaRegional {
  categoria: Categoria;
  titulo: string;
  unidade: 'L' | 'un';
  quantidade: number;
  carros: number;
  oficinas: number;
}

export interface DemandaRegional {
  uf: string;
  /** Oficinas que mandaram a previsão (dos últimos dias). */
  oficinas: number;
  linhas: LinhaRegional[];
  /** Linhas escondidas por terem menos de MINIMO_OFICINAS oficinas. */
  escondidas: number;
}

function normalizarTitulo(t: string): string {
  return t.trim().replace(/\s+/g, ' ');
}

/**
 * Soma a demanda de um estado. Considera só previsões atualizadas nos últimos `dias` dias
 * e esconde as linhas com poucas oficinas.
 */
export function somarDemanda(lista: DemandaRecebida[], uf: string, hoje: Date, dias = 10): DemandaRegional {
  const limite = hoje.getTime() - dias * 86_400_000;
  const recentes = lista.filter((d) => d.uf === uf && new Date(d.atualizadoEm).getTime() >= limite);
  const mapa = new Map<string, LinhaRegional & { quem: Set<number> }>();
  recentes.forEach((d, i) => {
    for (const item of d.itens) {
      const chave = `${item.categoria}|${normalizarTitulo(item.titulo).toLowerCase()}|${item.unidade}`;
      const atual = mapa.get(chave);
      if (atual) {
        atual.quantidade += item.quantidade;
        atual.carros += item.carros;
        atual.quem.add(i);
      } else {
        mapa.set(chave, { categoria: item.categoria, titulo: normalizarTitulo(item.titulo), unidade: item.unidade, quantidade: item.quantidade, carros: item.carros, oficinas: 0, quem: new Set([i]) });
      }
    }
  });
  const linhas: LinhaRegional[] = [];
  let escondidas = 0;
  for (const l of mapa.values()) {
    if (l.quem.size < MINIMO_OFICINAS) {
      escondidas++;
      continue;
    }
    const { quem, ...resto } = l;
    linhas.push({ ...resto, quantidade: Math.round(resto.quantidade * 100) / 100, oficinas: quem.size });
  }
  linhas.sort((a, b) => b.carros - a.carros || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  return { uf, oficinas: recentes.length, linhas, escondidas };
}

/** "48 L" ou "20 unidades". */
export function quantidadeDaLinha(l: Pick<LinhaRegional, 'quantidade' | 'unidade'>): string {
  if (l.unidade === 'L') return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(l.quantidade)} L`;
  const n = Math.round(l.quantidade);
  return `${n} ${n === 1 ? 'unidade' : 'unidades'}`;
}
