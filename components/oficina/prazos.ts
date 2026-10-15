'use client';

// O prazo da próxima troca de um serviço, a partir do produto usado: o do fabricante (base de
// prazos), o da loja, o que a oficina cadastrou, ou o do item do estoque ligado a um deles.

import { useCallback } from 'react';
import type { Produto } from '@/lib/catalogo';
import { intervaloSugerido, usaUsoSevero, type ProdutoComPrazo, type Sugestao } from '@/lib/manutencao';
import { origemDaReferencia, prazoDaReferencia, type ProdutoProprio, type Referencia } from '@/lib/referencias';
import { useOficina } from '@/lib/store';
import type { Id, ItemEstoque, Preferencias, ProdutoUsado, ServicoId, Veiculo } from '@/lib/tipos';
import { useCatalogo } from './catalogo';
import { useReferencias } from './referencias';

interface Fontes {
  produto: (id: number) => Produto | undefined;
  referencias: Referencia[];
  proprios: Record<Id, ProdutoProprio>;
  estoque: Record<Id, ItemEstoque>;
}

export function prazoDoProdutoUsado(p: ProdutoUsado | null | undefined, f: Fontes, severo: boolean): ProdutoComPrazo | null {
  if (!p) return null;
  const daReferencia = (id: number | null | undefined, especificacao?: ProdutoUsado['especificacao']): ProdutoComPrazo | null => {
    const r = id != null ? f.referencias.find((x) => x.id === id) : undefined;
    const prazo = r ? prazoDaReferencia(r, severo) : null;
    return r && prazo ? { intervaloKm: prazo.km, intervaloMeses: prazo.meses, especificacao, origem: origemDaReferencia(r) } : null;
  };
  const daLoja = (id: number | null | undefined): ProdutoComPrazo | null => {
    const produto = id != null ? f.produto(id) : undefined;
    if (!produto) return null;
    if (produto.intervaloKm == null && produto.intervaloMeses == null) return daReferencia(produto.referenciaId, produto.especificacao) ?? { especificacao: produto.especificacao };
    return produto;
  };
  if (p.proprioId && f.proprios[p.proprioId]) {
    const m = f.proprios[p.proprioId];
    return { intervaloKm: m.intervaloKm, intervaloMeses: m.intervaloMeses, origem: 'Prazo do seu produto' };
  }
  if (p.referenciaId != null) {
    const r = daReferencia(p.referenciaId, p.especificacao);
    if (r) return r;
  }
  if (p.id != null) {
    const l = daLoja(p.id);
    if (l) return l;
  }
  const item = p.estoqueId ? f.estoque[p.estoqueId] : undefined;
  if (item) {
    if (item.proprioId && f.proprios[item.proprioId]) {
      const m = f.proprios[item.proprioId];
      return { intervaloKm: m.intervaloKm, intervaloMeses: m.intervaloMeses, especificacao: item.especificacao, origem: 'Prazo do seu produto' };
    }
    return daLoja(item.produtoLojaId) ?? daReferencia(item.referenciaId, item.especificacao) ?? (item.especificacao ? { especificacao: item.especificacao } : null);
  }
  return p.especificacao ? { especificacao: p.especificacao } : null;
}

/** O prazo sugerido para cada serviço, com o produto que foi usado. */
export function usePrazoDoServico() {
  const { produto } = useCatalogo();
  const { referencias } = useReferencias();
  const proprios = useOficina((s) => s.produtosProprios);
  const estoque = useOficina((s) => s.estoque);
  const prefs = useOficina((s) => s.preferencias);
  return useCallback(
    (s: ServicoId, p: ProdutoUsado | null | undefined, veiculo: Pick<Veiculo, 'usoSevero' | 'intervaloOleo'> | undefined, preferencias: Preferencias = prefs): Sugestao => {
      const severo = usaUsoSevero(veiculo, preferencias);
      return intervaloSugerido(s, { veiculo, prefs: preferencias, produto: prazoDoProdutoUsado(p, { produto, referencias, proprios, estoque }, severo) });
    },
    [produto, referencias, proprios, estoque, prefs]
  );
}
