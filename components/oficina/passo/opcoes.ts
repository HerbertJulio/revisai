'use client';

// As opções de peça de um serviço, como cartões com foto: a usada da última vez neste carro,
// o que tem no estoque, as indicadas da loja para o carro, os produtos da oficina e as marcas
// da base de prazos. O preço sugerido sai do estoque (ou do custo com a margem da oficina).

import { useMemo } from 'react';
import { nomeCategoria, precoNaQuantidade, type Produto } from '@/lib/catalogo';
import { fatorDoProduto, precoSugerido, situacaoDoItem, type SituacaoEstoque } from '@/lib/estoque';
import { LITROS_PADRAO, recomendarParaItem } from '@/lib/recomendacao';
import { servico as infoServico } from '@/lib/manutencao';
import { exigenciaDoCarro, oleoAtende } from '@/lib/oleos';
import { nomeDaReferencia, referenciasDaCategoria } from '@/lib/referencias';
import { useOficina } from '@/lib/store';
import type { Categoria, EspecOleo, ItemEstoque, ProdutoUsado, ServicoId, UnidadeLinha, Veiculo } from '@/lib/tipos';
import { nomeComMarca } from '../loja/comum';
import { useCatalogo } from '../catalogo';
import { useReferencias } from '../referencias';

export type OrigemOpcao = 'anterior' | 'estoque' | 'loja' | 'meu' | 'ref';

export interface OpcaoPeca {
  /** 'estoque:<id>', 'loja:<id>', 'meu:<id>', 'ref:<id>', 'anterior'. */
  chave: string;
  origem: OrigemOpcao;
  titulo: string;
  detalhe?: string;
  categoria: Categoria;
  imagemUrl?: string | null;
  produto: ProdutoUsado;
  estoqueId?: string;
  estoque?: { quantidade: number; unidade: 'un' | 'L'; situacao: SituacaoEstoque };
  /** Produto da loja para comprar (o do próprio cartão, ou o ligado ao item do estoque). */
  produtoLoja?: Produto;
  /** Preço por unidade (ou litro) para cobrar do cliente. */
  preco: number | null;
  /** Quanto a loja cobra pela embalagem, para mostrar. */
  precoLoja?: number;
  indicado?: boolean;
  anterior?: boolean;
  /** Algo que o mecânico precisa saber ("não é o óleo do manual"). */
  alerta?: string;
  unidade: UnidadeLinha;
  /** O texto que a fala compara (marca, linha, viscosidade). */
  textoFala: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function quantidadePadraoDaPeca(s: ServicoId, unidade: UnidadeLinha, veiculo: Pick<Veiculo, 'oleo'> | undefined): number {
  if (unidade === 'L') return veiculo?.oleo?.capacidadeL ?? LITROS_PADRAO;
  if (s === 'velas' || s === 'pneus') return 4;
  if (s === 'fluido_freio') return 2;
  return 1;
}

function textoDaEspec(e: ProdutoUsado['especificacao']): string {
  if (!e) return '';
  return [e.viscosidade, e.api ? `API ${e.api}` : '', ...(e.normas ?? []), e.medida ?? '', e.amperagem ? `${e.amperagem} Ah` : '', e.tipo ?? ''].filter(Boolean).join(', ');
}

function nomeDoItem(i: ItemEstoque): string {
  return i.marca && !i.nome.toLowerCase().includes(i.marca.toLowerCase()) ? `${i.marca} ${i.nome}` : i.nome;
}

/**
 * As opções de peça para o serviço, na ordem em que aparecem: a da última vez, o estoque
 * (o que serve no carro primeiro), as indicadas da loja e, por último, as outras marcas.
 */
export function useOpcoesDePeca(s: ServicoId, veiculo: Pick<Veiculo, 'oleo' | 'id'> | undefined, tipo: 'ordem' | 'orcamento', hoje: string): { principais: OpcaoPeca[]; outras: OpcaoPeca[]; exigido: EspecOleo | null } {
  const { catalogo, produto: acharProduto } = useCatalogo();
  const { referencias } = useReferencias();
  const estoque = useOficina((x) => x.estoque);
  const proprios = useOficina((x) => x.produtosProprios);
  const atendimentos = useOficina((x) => x.atendimentos);
  const margem = useOficina((x) => x.preferencias.margemPecas);

  return useMemo(() => {
    const categoria = infoServico(s).categoria;
    if (!categoria) return { principais: [], outras: [], exigido: null };
    const unidadeLinha: UnidadeLinha = categoria === 'oleo_motor' ? 'L' : 'un';

    // o produto da última vez que este carro fez o serviço
    let anterior: ProdutoUsado | null = null;
    if (veiculo?.id) {
      const doCarro = Object.values(atendimentos)
        .filter((a) => a.veiculoId === veiculo.id)
        .sort((a, b) => (a.data < b.data ? 1 : -1));
      for (const a of doCarro) {
        const i = a.itens.find((x) => x.servico === s && x.produto?.nome);
        if (i?.produto) {
          anterior = i.produto;
          break;
        }
      }
    }
    const exigido = categoria === 'oleo_motor' ? exigenciaDoCarro(veiculo?.oleo, anterior?.especificacao) : null;
    const quantidade = quantidadePadraoDaPeca(s, unidadeLinha, veiculo);

    const precoDaLoja = (p: Produto) => {
      // sem conta, o catálogo vem sem preço: não sugere peça a R$ 0
      if (!(p.preco > 0)) return { porUnidade: null, embalagem: undefined };
      const fator = fatorDoProduto(p);
      const embalagens = Math.max(1, Math.ceil(quantidade / fator - 1e-9));
      const { preco } = precoNaQuantidade(p, catalogo.promocoes, hoje, embalagens);
      return { porUnidade: r2((preco / fator) * (1 + Math.max(0, margem) / 100)), embalagem: preco };
    };

    const opcoes: OpcaoPeca[] = [];
    const vistas = new Set<string>();
    const juntar = (o: OpcaoPeca) => {
      if (vistas.has(o.chave)) return;
      vistas.add(o.chave);
      opcoes.push(o);
    };

    // estoque
    const doEstoque = Object.values(estoque)
      .filter((i) => i.categoria === categoria)
      .map((i) => ({ i, serve: !exigido || oleoAtende(i.especificacao ?? {}, exigido).atende }))
      .sort((a, b) => Number(b.serve) - Number(a.serve) || Number(b.i.quantidade > 0) - Number(a.i.quantidade > 0) || a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
    for (const { i, serve } of doEstoque) {
      const produtoLoja = i.produtoLojaId != null ? acharProduto(i.produtoLojaId) : undefined;
      const usado: ProdutoUsado = {
        nome: nomeDoItem(i),
        categoria: i.categoria,
        ...(i.especificacao ? { especificacao: i.especificacao } : {}),
        ...(i.produtoLojaId != null ? { id: i.produtoLojaId } : {}),
        ...(i.referenciaId != null ? { referenciaId: i.referenciaId } : {}),
        ...(i.proprioId ? { proprioId: i.proprioId } : {}),
        estoqueId: i.id
      };
      const ehAnterior = !!anterior && (anterior.estoqueId === i.id || (anterior.id != null && anterior.id === i.produtoLojaId));
      juntar({
        chave: `estoque:${i.id}`,
        origem: 'estoque',
        titulo: nomeDoItem(i),
        detalhe: textoDaEspec(i.especificacao),
        categoria,
        imagemUrl: i.imagemUrl ?? produtoLoja?.imagemUrl ?? null,
        produto: usado,
        estoqueId: i.id,
        estoque: { quantidade: i.quantidade, unidade: i.unidade, situacao: situacaoDoItem(i) },
        produtoLoja,
        preco: precoSugerido(i, margem),
        anterior: ehAnterior,
        indicado: !!exigido && serve,
        alerta: exigido && !serve ? 'Não é o óleo que o manual pede' : undefined,
        unidade: i.unidade === 'L' ? 'L' : 'un',
        textoFala: `${nomeDoItem(i)} ${textoDaEspec(i.especificacao)}`
      });
    }

    // a da última vez, quando não veio do estoque
    if (anterior && !opcoes.some((o) => o.anterior)) {
      const p = anterior.id != null ? acharProduto(anterior.id) : undefined;
      const preco = p ? precoDaLoja(p) : null;
      juntar({
        chave: p ? `loja:${p.id}` : 'anterior',
        origem: p ? 'loja' : 'anterior',
        titulo: p ? nomeComMarca(p) : anterior.nome,
        detalhe: textoDaEspec(anterior.especificacao),
        categoria,
        imagemUrl: p?.imagemUrl ?? null,
        produto: anterior,
        produtoLoja: p,
        preco: preco?.porUnidade ?? null,
        precoLoja: preco?.embalagem,
        anterior: true,
        unidade: unidadeLinha,
        textoFala: `${anterior.nome} ${textoDaEspec(anterior.especificacao)}`
      });
    }

    // indicadas da loja para este carro
    const indicadas = recomendarParaItem(s, veiculo ?? {}, anterior, catalogo, hoje, 6);
    for (const r of indicadas) {
      const p = r.produto;
      const preco = precoDaLoja(p);
      juntar({
        chave: `loja:${p.id}`,
        origem: 'loja',
        titulo: nomeComMarca(p),
        detalhe: textoDaEspec(p.especificacao) || undefined,
        categoria,
        imagemUrl: p.imagemUrl,
        produto: { id: p.id, nome: nomeComMarca(p), categoria: p.categoria, especificacao: p.especificacao, ...(p.referenciaId != null ? { referenciaId: p.referenciaId } : {}) },
        produtoLoja: p,
        preco: preco.porUnidade,
        precoLoja: preco.embalagem,
        indicado: !!exigido || r.motivos.length > 0,
        unidade: unidadeLinha,
        textoFala: `${nomeComMarca(p)} ${textoDaEspec(p.especificacao)}`
      });
    }
    const principais = opcoes.sort((a, b) => Number(!!b.anterior) - Number(!!a.anterior));

    // outras marcas: produtos da oficina, o resto da loja e a base de prazos
    const outras: OpcaoPeca[] = [];
    for (const m of Object.values(proprios).filter((x) => x.categoria === categoria)) {
      if (vistas.has(`meu:${m.id}`)) continue;
      outras.push({
        chave: `meu:${m.id}`,
        origem: 'meu',
        titulo: [m.marca, m.nome].filter(Boolean).join(' '),
        detalhe: 'Seu produto',
        categoria,
        produto: { nome: [m.marca, m.nome].filter(Boolean).join(' '), categoria, proprioId: m.id },
        preco: null,
        unidade: unidadeLinha,
        textoFala: `${m.marca} ${m.nome}`
      });
    }
    const ativos = new Set(catalogo.fornecedores.map((f) => f.id));
    for (const p of catalogo.produtos) {
      if (p.categoria !== categoria || !ativos.has(p.fornecedorId) || vistas.has(`loja:${p.id}`)) continue;
      const preco = precoDaLoja(p);
      const serve = !exigido || oleoAtende(p.especificacao, exigido).atende;
      outras.push({
        chave: `loja:${p.id}`,
        origem: 'loja',
        titulo: nomeComMarca(p),
        detalhe: textoDaEspec(p.especificacao) || undefined,
        categoria,
        imagemUrl: p.imagemUrl,
        produto: { id: p.id, nome: nomeComMarca(p), categoria: p.categoria, especificacao: p.especificacao, ...(p.referenciaId != null ? { referenciaId: p.referenciaId } : {}) },
        produtoLoja: p,
        preco: preco.porUnidade,
        precoLoja: preco.embalagem,
        alerta: serve ? undefined : 'Não é o óleo que o manual pede',
        unidade: unidadeLinha,
        textoFala: `${nomeComMarca(p)} ${textoDaEspec(p.especificacao)}`
      });
    }
    for (const r of referenciasDaCategoria(referencias, categoria)) {
      outras.push({
        chave: `ref:${r.id}`,
        origem: 'ref',
        titulo: nomeDaReferencia(r),
        detalhe: r.tipo ?? nomeCategoria(categoria),
        categoria,
        produto: { nome: nomeDaReferencia(r), categoria, referenciaId: r.id, ...(r.tipo ? { especificacao: { tipo: r.tipo } } : {}) },
        preco: null,
        unidade: unidadeLinha,
        textoFala: nomeDaReferencia(r)
      });
    }
    return { principais, outras, exigido };
  }, [s, veiculo, tipo, hoje, catalogo, acharProduto, referencias, estoque, proprios, atendimentos, margem]);
}

/** Quantas embalagens da loja cobrem a quantidade da linha (litros no óleo). */
export function embalagensPara(p: Produto, quantidade: number): number {
  return Math.max(1, Math.ceil(quantidade / fatorDoProduto(p) - 1e-9));
}
