import { describe, expect, it } from 'vitest';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import {
  calcularFacetas,
  combinaBusca,
  destaquesDaVitrine,
  filtrarProdutos,
  filtrosAtivos,
  FILTROS_VAZIOS,
  lojaDoDia,
  ordenarProdutos,
  precoDeVitrine,
  quantosFiltros,
  textoDoProduto,
  type ContextoVitrine
} from '@/lib/vitrine';

const HOJE = '2026-10-14';
const ctx: ContextoVitrine = { catalogo: CATALOGO_EXEMPLO, uf: 'RJ', hoje: HOJE };
const produtos = CATALOGO_EXEMPLO.produtos;
const ids = (l: { id: number }[]) => l.map((p) => p.id);

describe('busca da vitrine', () => {
  it('ignora acento, maiúscula e traço', () => {
    const t = textoDoProduto(produtos.find((p) => p.id === 101)!);
    expect(combinaBusca(t, 'OLEO 5w30')).toBe(true);
    expect(combinaBusca(t, 'dexos sintético')).toBe(true);
    expect(combinaBusca(t, 'dexos mineral')).toBe(false);
    expect(combinaBusca(t, '   ')).toBe(true);
  });

  it('acha pela loja também', () => {
    const r = filtrarProdutos(produtos, { ...FILTROS_VAZIOS, busca: 'central filtros' }, ctx);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.fornecedorId === 2)).toBe(true);
  });
});

describe('filtros da vitrine', () => {
  it('combina categoria, viscosidade e promoção', () => {
    const r = filtrarProdutos(produtos, { ...FILTROS_VAZIOS, categoria: 'oleo_motor', viscosidades: ['5W-30'], promocao: true }, ctx);
    expect(ids(r).sort()).toEqual([101, 111]);
  });

  it('filtra pelo preço que aparece no cartão (o da promoção)', () => {
    const r = filtrarProdutos(produtos, { ...FILTROS_VAZIOS, categoria: 'oleo_motor', precoMax: 40 }, ctx);
    expect(ids(r)).toContain(101);
    expect(r.every((p) => precoDeVitrine(p, CATALOGO_EXEMPLO.promocoes, HOJE) <= 40)).toBe(true);
  });

  it('conta as opções de cada filtro sem a própria escolha', () => {
    const f = { ...FILTROS_VAZIOS, categoria: 'oleo_motor' as const, viscosidades: ['5W-30'] };
    const fac = calcularFacetas(produtos, f, ctx);
    expect(fac.viscosidades.map((v) => v.valor)).toEqual(['0W-20', '0W-30', '5W-30', '5W-40', '10W-40', '15W-40', '20W-50']);
    expect(fac.viscosidades.find((v) => v.valor === '5W-30')?.n).toBe(4);
    expect(fac.categorias.find((c) => c.valor === 'oleo_motor')?.n).toBe(4);
    expect(fac.normas.find((n) => n.valor === 'GM dexos1 Gen 3')?.n).toBe(3);
    expect(fac.faixa).not.toBeNull();
  });

  it('mostra os filtros ligados e desliga um por um', () => {
    const f = { ...FILTROS_VAZIOS, categoria: 'oleo_motor' as const, viscosidades: ['5W-30'], fornecedores: [1], precoMax: 50 };
    const ativos = filtrosAtivos(f, ctx);
    expect(ativos.map((a) => a.rotulo)).toEqual(['Óleo de motor', 'Distribuidora de Lubrificantes', '5W-30', 'Até R$ 50']);
    expect(ativos[0].sem.viscosidades).toEqual([]);
    expect(quantosFiltros(f)).toBe(3);
  });
});

describe('ordem e destaques', () => {
  it('ordena pelo menor preço e pelo maior desconto', () => {
    const oleo = filtrarProdutos(produtos, { ...FILTROS_VAZIOS, categoria: 'oleo_motor' }, ctx);
    const menor = ordenarProdutos(oleo, 'menor_preco', ctx);
    expect(menor[0].id).toBe(109);
    const desconto = ordenarProdutos(produtos, 'maior_desconto', ctx);
    expect(desconto[0].id).toBe(201);
  });

  it('a relevância põe os patrocinados e as lojas destaque na frente', () => {
    const r = ordenarProdutos(produtos, 'relevancia', ctx);
    expect(ids(r.slice(0, 2)).sort()).toEqual([204, 406]);
    expect(r[2].fornecedorId).toBe(1);
  });

  it('o carrossel começa pelos patrocinados e completa com as maiores promoções', () => {
    const d = destaquesDaVitrine(produtos, ctx, 4);
    expect(d.map((x) => x.motivo)).toEqual(['patrocinado', 'patrocinado', 'oferta', 'oferta']);
    expect(d[2].produto.id).toBe(201);
    expect(destaquesDaVitrine(produtos, { ...ctx, uf: 'SP' }).filter((x) => x.motivo === 'patrocinado').length).toBe(1);
  });

  it('a loja do dia só vem das lojas destaque com produto', () => {
    expect(lojaDoDia(CATALOGO_EXEMPLO.fornecedores, produtos, HOJE)?.id).toBe(1);
    expect(lojaDoDia(CATALOGO_EXEMPLO.fornecedores, produtos.filter((p) => p.fornecedorId !== 1), HOJE)).toBeNull();
  });
});
