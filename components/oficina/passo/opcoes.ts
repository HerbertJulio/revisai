'use client';

// As opções de peça de um serviço, como cartões com foto: a usada da última vez neste carro,
// o que tem no estoque, as indicadas da loja para o carro, os produtos da oficina e as marcas
// da base de prazos. O preço sugerido sai do estoque (ou do custo com a margem da oficina).
// As peças da loja que, pela lista de aplicações da loja, servem no carro do orçamento vêm antes e
// ganham o selo "Serve no Gol 1.6 2015"; as sem a informação ficam, depois; as que a loja diz que
// não servem vão para o fim, com o aviso.

import { useMemo } from 'react';
import { nomeCategoria, precoNaQuantidade, type Produto } from '@/lib/catalogo';
import { fatorDoProduto, precoSugerido, situacaoDoItem, type SituacaoEstoque } from '@/lib/estoque';
import { LITROS_PADRAO, recomendarParaItem } from '@/lib/recomendacao';
import { servico as infoServico } from '@/lib/manutencao';
import { exigenciaDoCarro, oleoAtende } from '@/lib/oleos';
import { nomeDaReferencia, referenciasDaCategoria } from '@/lib/referencias';
import { useOficina } from '@/lib/store';
import type { Categoria, EspecOleo, ItemEstoque, ProdutoUsado, ServicoId, UnidadeLinha, Veiculo } from '@/lib/tipos';
import { rotuloDoCarro, serveNoCarroDaVitrine, type ExtrasDaVitrine } from '@/lib/vitrine';
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
  /** A peça da loja serve no carro do orçamento, pela lista de aplicações da loja (sem a lista, vazio). */
  serve?: 'sim' | 'nao';
  /** Algo que o mecânico precisa saber ("não é o óleo do manual"). */
  alerta?: string;
  unidade: UnidadeLinha;
  /** O texto que a fala compara (marca, linha, viscosidade). */
  textoFala: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** O carro do orçamento: o cadastrado ou o novo que está sendo escrito (o ano vem em texto). */
export type CarroDoOrcamento = Partial<Pick<Veiculo, 'marca' | 'modelo' | 'motor' | 'ano'>> | { marca?: string | null; modelo?: string | null; ano?: string | number | null } | null | undefined;

function carroParaComparar(c: CarroDoOrcamento): { marca: string | null; modelo: string | null; motor: string | null; ano: number | null } | null {
  if (!c?.modelo?.trim()) return null;
  const ano = c.ano == null || c.ano === '' ? null : Number.parseInt(String(c.ano), 10);
  return { marca: c.marca?.trim() || null, modelo: c.modelo.trim(), motor: 'motor' in c ? (c.motor ?? null) : null, ano: Number.isFinite(ano) ? ano : null };
}

/**
 * A ordem dos cartões: a da última vez, o estoque, e as peças da loja (as que servem no carro, as
 * sem informação e, por último, as que a loja diz que não servem). Dentro de cada grupo, a ordem que
 * já vinha.
 */
export function ordenarOpcoes<T extends Pick<OpcaoPeca, 'anterior' | 'origem' | 'serve'>>(opcoes: T[]): T[] {
  const peso = (o: T) => (o.anterior ? 0 : o.origem === 'estoque' ? 1 : o.serve === 'sim' ? 2 : o.serve === 'nao' ? 4 : 3);
  return opcoes
    .map((o, i) => ({ o, i }))
    .sort((a, b) => peso(a.o) - peso(b.o) || a.i - b.i)
    .map((x) => x.o);
}

/** A peça da loja no carro: 'sim', 'nao' ou nada (sem a lista de aplicações ou sem o modelo do carro). */
function serveNoCarroDoOrcamento(produtoId: number | undefined, extras: ExtrasDaVitrine, carro: ReturnType<typeof carroParaComparar>): 'sim' | 'nao' | undefined {
  if (produtoId == null || !carro) return undefined;
  const r = serveNoCarroDaVitrine(produtoId, extras, carro);
  return r === 'sem-informacao' ? undefined : r;
}

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
 * (o que serve no carro primeiro), as indicadas da loja e as que servem no carro e, por último, as
 * outras marcas. `carroNovo`: o carro ainda não cadastrado do orçamento (marca, modelo e ano).
 */
export function useOpcoesDePeca(
  s: ServicoId,
  veiculo: (Pick<Veiculo, 'oleo' | 'id'> & Partial<Pick<Veiculo, 'marca' | 'modelo' | 'motor' | 'ano'>>) | undefined,
  tipo: 'ordem' | 'orcamento',
  hoje: string,
  carroNovo?: { marca: string; modelo: string; ano: string } | null
): { principais: OpcaoPeca[]; outras: OpcaoPeca[]; exigido: EspecOleo | null; carro: string | null } {
  const { catalogo, extras, produto: acharProduto } = useCatalogo();
  const { referencias } = useReferencias();
  const estoque = useOficina((x) => x.estoque);
  const proprios = useOficina((x) => x.produtosProprios);
  const atendimentos = useOficina((x) => x.atendimentos);
  const margem = useOficina((x) => x.preferencias.margemPecas);

  const marca = veiculo?.marca ?? carroNovo?.marca;
  const modelo = veiculo?.modelo ?? carroNovo?.modelo;
  const motor = veiculo?.motor;
  const ano = veiculo ? veiculo.ano : carroNovo?.ano;

  return useMemo(() => {
    const carro = carroParaComparar({ marca, modelo, motor, ano });
    const rotulo = carro ? rotuloDoCarro(carro) : null;
    const categoria = infoServico(s).categoria;
    if (!categoria) return { principais: [], outras: [], exigido: null, carro: rotulo };
    const unidadeLinha: UnidadeLinha = categoria === 'oleo_motor' ? 'L' : 'un';
    const naoServe = rotulo ? `A loja diz que não serve no ${rotulo}` : undefined;

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
      const serveNoCarro = serveNoCarroDoOrcamento(produtoLoja?.id, extras, carro);
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
        serve: serveNoCarro,
        alerta: exigido && !serve ? 'Não é o óleo que o manual pede' : serveNoCarro === 'nao' ? naoServe : undefined,
        unidade: i.unidade === 'L' ? 'L' : 'un',
        textoFala: `${nomeDoItem(i)} ${textoDaEspec(i.especificacao)}`
      });
    }

    // a da última vez, quando não veio do estoque
    if (anterior && !opcoes.some((o) => o.anterior)) {
      const p = anterior.id != null ? acharProduto(anterior.id) : undefined;
      const preco = p ? precoDaLoja(p) : null;
      const serveNoCarro = serveNoCarroDoOrcamento(p?.id, extras, carro);
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
        serve: serveNoCarro,
        alerta: serveNoCarro === 'nao' ? naoServe : undefined,
        unidade: unidadeLinha,
        textoFala: `${anterior.nome} ${textoDaEspec(anterior.especificacao)}`
      });
    }

    // indicadas da loja para este carro, e as peças da loja que servem nele pela lista de aplicações
    const indicadas = recomendarParaItem(s, veiculo ?? {}, anterior, catalogo, hoje, 6);
    const ativas = new Set(catalogo.fornecedores.map((f) => f.id));
    const queServem = carro
      ? catalogo.produtos.filter((p) => p.categoria === categoria && ativas.has(p.fornecedorId) && !indicadas.some((r) => r.produto.id === p.id) && serveNoCarroDoOrcamento(p.id, extras, carro) === 'sim').slice(0, 4)
      : [];
    for (const r of [...indicadas, ...queServem.map((produto) => ({ produto, motivos: [] as string[] }))]) {
      const p = r.produto;
      const preco = precoDaLoja(p);
      const serveNoCarro = serveNoCarroDoOrcamento(p.id, extras, carro);
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
        indicado: serveNoCarro !== 'nao' && (!!exigido || r.motivos.length > 0),
        serve: serveNoCarro,
        alerta: serveNoCarro === 'nao' ? naoServe : undefined,
        unidade: unidadeLinha,
        textoFala: `${nomeComMarca(p)} ${textoDaEspec(p.especificacao)}`
      });
    }
    const principais = ordenarOpcoes(opcoes);

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
    const daLoja: OpcaoPeca[] = [];
    for (const p of catalogo.produtos) {
      if (p.categoria !== categoria || !ativas.has(p.fornecedorId) || vistas.has(`loja:${p.id}`)) continue;
      const preco = precoDaLoja(p);
      const serve = !exigido || oleoAtende(p.especificacao, exigido).atende;
      const serveNoCarro = serveNoCarroDoOrcamento(p.id, extras, carro);
      daLoja.push({
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
        serve: serveNoCarro,
        alerta: serve ? (serveNoCarro === 'nao' ? naoServe : undefined) : 'Não é o óleo que o manual pede',
        unidade: unidadeLinha,
        textoFala: `${nomeComMarca(p)} ${textoDaEspec(p.especificacao)}`
      });
    }
    // da loja: as que servem no carro primeiro, as que a loja diz que não servem por último
    outras.push(...ordenarOpcoes(daLoja));
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
    return { principais, outras, exigido, carro: rotulo };
  }, [s, veiculo, tipo, hoje, catalogo, extras, acharProduto, referencias, estoque, proprios, atendimentos, margem, marca, modelo, motor, ano]);
}

/** Quantas embalagens da loja cobrem a quantidade da linha (litros no óleo). */
export function embalagensPara(p: Produto, quantidade: number): number {
  return Math.max(1, Math.ceil(quantidade / fatorDoProduto(p) - 1e-9));
}
