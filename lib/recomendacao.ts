// Recomenda produtos da loja para um serviço que vai vencer, e soma a demanda dos próximos dias.

import type { ItemAviso } from './avisos';
import { litrosPorUnidade, melhorOferta, precoNaQuantidade, type Catalogo, type Produto, type Promocao } from './catalogo';
import { servico as infoServico } from './manutencao';
import { exigenciaDoCarro, oleoAtende } from './oleos';
import type { EspecOleo, ProdutoUsado, ServicoId, Veiculo } from './tipos';

export const LITROS_PADRAO = 4;

export interface Recomendacao {
  produto: Produto;
  quantidade: number;
  precoUnitario: number;
  total: number;
  /** Promoção que vale nesta quantidade. */
  promocao: Promocao | null;
  /** Melhor promoção do produto, mesmo que peça mais unidades. */
  oferta: Promocao | null;
  motivos: string[];
  aviso?: string;
}

/** Serviços em que a peça costuma ser trocada (entram na soma da demanda). */
const TROCA_PREVISTA: ServicoId[] = [
  'troca_oleo',
  'filtro_oleo',
  'filtro_ar',
  'filtro_cabine',
  'filtro_combustivel',
  'velas',
  'correia_dentada',
  'correia_acessorios',
  'fluido_freio',
  'arrefecimento',
  'higienizacao',
  'palhetas',
  'cambio_automatico'
];

function montar(produto: Produto, quantidade: number, catalogo: Catalogo, hoje: string, motivos: string[], aviso?: string): Recomendacao {
  const { preco, promocao } = precoNaQuantidade(produto, catalogo.promocoes, hoje, quantidade);
  return {
    produto,
    quantidade,
    precoUnitario: preco,
    total: Math.round(preco * quantidade * 100) / 100,
    promocao,
    oferta: melhorOferta(produto, catalogo.promocoes, hoje),
    motivos,
    aviso
  };
}

function ordenar(lista: Recomendacao[]): Recomendacao[] {
  return lista.sort((a, b) => a.total - b.total || b.motivos.length - a.motivos.length);
}

function fornecedorAtivo(catalogo: Catalogo, produto: Produto): boolean {
  return catalogo.fornecedores.some((f) => f.id === produto.fornecedorId);
}

/** Óleos que atendem à exigência, na quantidade para os litros pedidos. */
export function recomendarOleo(exigido: EspecOleo, litros: number, catalogo: Catalogo, hoje: string, aviso?: string): Recomendacao[] {
  const lista: Recomendacao[] = [];
  for (const produto of catalogo.produtos) {
    if (produto.categoria !== 'oleo_motor' || !fornecedorAtivo(catalogo, produto)) continue;
    const compat = oleoAtende(produto.especificacao, exigido);
    if (!compat.atende) continue;
    const porUnidade = litrosPorUnidade(produto) ?? 1;
    const quantidade = Math.max(1, Math.ceil(litros / porUnidade - 1e-9));
    lista.push(montar(produto, quantidade, catalogo, hoje, compat.motivos, aviso));
  }
  return ordenar(lista);
}

function quantidadePadrao(servicoId: ServicoId, produto: Produto): { quantidade: number; aviso?: string } {
  if (produto.categoria === 'pneu') return { quantidade: 4, aviso: 'Quatro pneus. Ajuste se for trocar só um par.' };
  if (produto.categoria === 'vela' && produto.unidade === 'un') return { quantidade: 4, aviso: 'Uma por cilindro. Confira se o motor tem 3 ou 4.' };
  if (servicoId === 'arrefecimento') return { quantidade: 4, aviso: 'Confira a capacidade do sistema no manual.' };
  if (servicoId === 'fluido_freio' && produto.unidade === 'un') return { quantidade: 2, aviso: 'Uma troca completa costuma pedir perto de 1 litro. Confira no manual.' };
  return { quantidade: 1 };
}

/** Produtos para o serviço de um carro. Para óleo, só os que atendem ao manual. */
export function recomendarParaItem(
  servicoId: ServicoId,
  veiculo: Pick<Veiculo, 'oleo'>,
  anterior: ProdutoUsado | null | undefined,
  catalogo: Catalogo,
  hoje: string,
  limite = 3
): Recomendacao[] {
  const categoria = infoServico(servicoId).categoria;
  if (!categoria) return [];

  if (categoria === 'oleo_motor') {
    const exigido = exigenciaDoCarro(veiculo.oleo, anterior?.especificacao);
    if (!exigido) return [];
    const capacidade = exigido.capacidadeL ?? veiculo.oleo?.capacidadeL;
    const aviso = capacidade ? undefined : `Capacidade estimada em ${LITROS_PADRAO} L. Confira no manual.`;
    return recomendarOleo(exigido, capacidade ?? LITROS_PADRAO, catalogo, hoje, aviso).slice(0, limite);
  }

  const espec = anterior?.especificacao;
  const lista: Recomendacao[] = [];
  for (const produto of catalogo.produtos) {
    if (produto.categoria !== categoria || !fornecedorAtivo(catalogo, produto)) continue;
    const motivos: string[] = [];
    if (espec?.medida) {
      if (produto.especificacao.medida !== espec.medida) continue;
      motivos.push(`Mesma medida (${espec.medida})`);
    }
    if (espec?.amperagem) {
      if (produto.especificacao.amperagem !== espec.amperagem) continue;
      motivos.push(`Mesma amperagem (${espec.amperagem} Ah)`);
    }
    if (espec?.tipo && produto.especificacao.tipo && produto.especificacao.tipo !== espec.tipo) continue;
    if (servicoId === 'cambio_automatico' && /manual/i.test(produto.nome)) continue;
    if (servicoId === 'cambio_manual' && /automático|atf/i.test(produto.nome)) continue;
    const { quantidade, aviso } = quantidadePadrao(servicoId, produto);
    lista.push(montar(produto, quantidade, catalogo, hoje, motivos, aviso));
  }
  return ordenar(lista).slice(0, limite);
}

export interface LinhaDemanda {
  chave: string;
  servico: ServicoId;
  titulo: string;
  carros: number;
  /** Litros (óleo) ou unidades. */
  volume: number;
  unidadeVolume: 'L' | 'un';
  recomendacao: Recomendacao | null;
  /** Óleo sem cadastro: não dá para recomendar. */
  semEspecificacao?: boolean;
}

/** O produto da categoria que sai mais barato para vários carros juntos (promoção pela soma). */
export function melhorParaVarios(servicoId: ServicoId, carros: number, catalogo: Catalogo, hoje: string): Recomendacao | null {
  const categoria = infoServico(servicoId).categoria;
  if (!categoria || carros < 1) return null;
  const opcoes: Recomendacao[] = [];
  for (const produto of catalogo.produtos) {
    if (produto.categoria !== categoria || !fornecedorAtivo(catalogo, produto)) continue;
    if (servicoId === 'cambio_automatico' && /manual/i.test(produto.nome)) continue;
    if (servicoId === 'cambio_manual' && /automático|atf/i.test(produto.nome)) continue;
    const { quantidade, aviso } = quantidadePadrao(servicoId, produto);
    opcoes.push(montar(produto, quantidade * carros, catalogo, hoje, [], aviso));
  }
  return ordenar(opcoes)[0] ?? null;
}

/**
 * Soma o que os carros vão precisar nos próximos dias, para a oficina comprar de uma vez
 * (e aproveitar as promoções por quantidade). O óleo é separado pela especificação.
 */
export function calcularDemanda(carros: { veiculo: Pick<Veiculo, 'oleo'>; itens: ItemAviso[] }[], catalogo: Catalogo, hoje: string, dias = 30): LinhaDemanda[] {
  const linhas = new Map<string, LinhaDemanda & { exigido?: EspecOleo }>();
  for (const { veiculo, itens } of carros) {
    for (const item of itens) {
      if (!TROCA_PREVISTA.includes(item.servico)) continue;
      if (item.venc.diasRestantes == null || item.venc.diasRestantes > dias) continue;
      const s = infoServico(item.servico);
      if (!s.categoria) continue;
      if (item.servico === 'troca_oleo') {
        const exigido = exigenciaDoCarro(veiculo.oleo, item.produto?.especificacao);
        const chave = exigido
          ? `oleo:${exigido.viscosidades.join('/')}:${exigido.norma ?? ''}:${exigido.acea ?? ''}:${exigido.api ?? ''}:${exigido.base ?? ''}`
          : 'oleo:?';
        const litros = exigido?.capacidadeL ?? veiculo.oleo?.capacidadeL ?? LITROS_PADRAO;
        const atual = linhas.get(chave);
        if (atual) {
          atual.carros++;
          atual.volume += litros;
        } else {
          linhas.set(chave, {
            chave,
            servico: 'troca_oleo',
            titulo: exigido ? `Óleo ${exigido.viscosidades.join(' ou ')}${exigido.norma ? ` ${exigido.norma.replace(/^GM /, '')}` : ''}` : 'Óleo de carros sem cadastro do óleo',
            carros: 1,
            volume: litros,
            unidadeVolume: 'L',
            recomendacao: null,
            semEspecificacao: !exigido,
            exigido: exigido ?? undefined
          });
        }
        continue;
      }
      const atual = linhas.get(item.servico);
      if (atual) {
        atual.carros++;
        atual.volume++;
      } else {
        linhas.set(item.servico, { chave: item.servico, servico: item.servico, titulo: s.nome, carros: 1, volume: 1, unidadeVolume: 'un', recomendacao: null });
      }
    }
  }

  const resultado: LinhaDemanda[] = [];
  for (const linha of linhas.values()) {
    const recomendacao =
      linha.servico === 'troca_oleo'
        ? linha.exigido
          ? recomendarOleo(linha.exigido, Math.ceil(linha.volume * 100) / 100, catalogo, hoje)[0] ?? null
          : null
        : melhorParaVarios(linha.servico, linha.carros, catalogo, hoje);
    const { exigido: _e, ...resto } = linha;
    resultado.push({ ...resto, volume: Math.round(linha.volume * 100) / 100, recomendacao });
  }
  return resultado.sort((a, b) => b.carros - a.carros || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}
