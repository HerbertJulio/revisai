import { describe, expect, it } from 'vitest';
import { normalizarCatalogo, ordenarVitrine, patrocinado, type Catalogo } from '@/lib/catalogo';
import { CATALOGO_EXEMPLO } from '@/lib/catalogo-demo';
import { itensDaDemanda, MINIMO_OFICINAS, quantidadeDaLinha, somarDemanda, type DemandaRecebida } from '@/lib/demanda';
import { fotoDoProduto, urlDaFoto, FOTOS_CATEGORIA } from '@/lib/fotos';
import { fimDoImpulso, valorDaComissao } from '@/lib/planos-fornecedor';
import { nomeDaReferencia, origemDaReferencia, prazoDaReferencia, referenciasDaCategoria, textoDoPrazo, type Referencia } from '@/lib/referencias';
import { atende, precoRedondo, sugerirPromocoes, type ProdutoDoFornecedor } from '@/lib/sugestoes';


describe('vitrine', () => {
  const cat: Catalogo = {
    ...CATALOGO_EXEMPLO,
    patrocinios: [
      { produtoId: 204, uf: 'RJ', inicio: '2026-10-01', fim: '2026-10-31' },
      { produtoId: 406, uf: null, inicio: '2026-10-01', fim: '2026-10-31' }
    ]
  };

  it('patrocínio vale no período e no estado', () => {
    expect(patrocinado(204, cat.patrocinios, 'RJ', '2026-10-14')).toBe(true);
    expect(patrocinado(204, cat.patrocinios, 'SP', '2026-10-14')).toBe(false);
    expect(patrocinado(406, cat.patrocinios, 'SP', '2026-10-14')).toBe(true);
    expect(patrocinado(406, cat.patrocinios, 'SP', '2026-11-01')).toBe(false);
  });

  it('patrocinados primeiro, depois as lojas destaque', () => {
    const ordem = ordenarVitrine(cat.produtos, cat, 'RJ', '2026-10-14');
    expect(ordem.slice(0, 2).map((p) => p.id).sort()).toEqual([204, 406]);
    const destaque = new Set(cat.fornecedores.filter((f) => f.destaque).map((f) => f.id));
    const depois = ordem.slice(2);
    const primeiroComum = depois.findIndex((p) => !destaque.has(p.fornecedorId));
    expect(depois.slice(primeiroComum).every((p) => !destaque.has(p.fornecedorId))).toBe(true);
  });

  it('completa catálogo guardado por versão antiga', () => {
    const antigo = { origem: 'banco', atualizadoEm: 'x', fornecedores: [{ id: 1, nome: 'A', cidade: null, uf: null, demonstracao: false }], produtos: [], promocoes: [] } as unknown as Catalogo;
    const c = normalizarCatalogo(antigo);
    expect(c.patrocinios).toEqual([]);
    expect(c.fornecedores[0].destaque).toBe(false);
  });

  it('foto do fornecedor vence a da categoria', () => {
    expect(fotoDoProduto({ imagemUrl: 'https://x.supabase.co/a.webp', categoria: 'vela' })?.credito).toBeNull();
    const f = fotoDoProduto({ imagemUrl: null, categoria: 'vela' });
    expect(f?.url).toBe(urlDaFoto(FOTOS_CATEGORIA.vela!));
    expect(f?.url).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/500px-/);
    expect(fotoDoProduto({ imagemUrl: null, categoria: 'palheta' })).toBeNull();
  });
});

describe('demanda regional', () => {
  const hoje = new Date('2026-10-14T12:00:00Z');
  const oficina = (n: number, itens: DemandaRecebida['itens'], uf = 'RJ'): DemandaRecebida => ({ uf, cidade: `Cidade ${n}`, atualizadoEm: '2026-10-13T10:00:00Z', itens });
  const oleo = (q: number) => ({ categoria: 'oleo_motor' as const, titulo: 'Óleo 5W-30 dexos1 Gen 3', quantidade: q, unidade: 'L' as const, carros: 1 });

  it('soma por produto e esconde linhas com poucas oficinas', () => {
    const lista = [
      oficina(1, [oleo(4), { categoria: 'filtro_ar', titulo: 'Filtro de ar', quantidade: 2, unidade: 'un', carros: 2 }]),
      oficina(2, [oleo(8)]),
      oficina(3, [oleo(3.5)]),
      oficina(4, [oleo(4)], 'SP')
    ];
    const d = somarDemanda(lista, 'RJ', hoje);
    expect(d.oficinas).toBe(3);
    expect(d.linhas).toHaveLength(1);
    expect(d.linhas[0]).toMatchObject({ titulo: 'Óleo 5W-30 dexos1 Gen 3', quantidade: 15.5, oficinas: 3 });
    expect(d.escondidas).toBe(1);
    expect(MINIMO_OFICINAS).toBe(3);
  });

  it('ignora previsões antigas', () => {
    const velha = { ...oficina(9, [oleo(100)]), atualizadoEm: '2026-09-01T00:00:00Z' };
    const d = somarDemanda([oficina(1, [oleo(4)]), oficina(2, [oleo(4)]), oficina(3, [oleo(4)]), velha], 'RJ', hoje);
    expect(d.linhas[0].quantidade).toBe(12);
  });

  it('a oficina manda só produto, quantidade e carros', () => {
    const itens = itensDaDemanda([
      { chave: 'a', servico: 'troca_oleo', titulo: 'Óleo 0W-20', carros: 2, volume: 7.5, unidadeVolume: 'L', recomendacao: null },
      { chave: 'b', servico: 'troca_oleo', titulo: 'Óleo sem cadastro', carros: 1, volume: 4, unidadeVolume: 'L', recomendacao: null, semEspecificacao: true },
      { chave: 'c', servico: 'filtro_ar', titulo: 'Filtro de ar', carros: 3, volume: 3, unidadeVolume: 'un', recomendacao: null }
    ]);
    expect(itens).toEqual([
      { categoria: 'oleo_motor', titulo: 'Óleo 0W-20', quantidade: 7.5, unidade: 'L', carros: 2 },
      { categoria: 'filtro_ar', titulo: 'Filtro de ar', quantidade: 3, unidade: 'un', carros: 3 }
    ]);
    expect(quantidadeDaLinha({ quantidade: 48, unidade: 'L' })).toBe('48 L');
    expect(quantidadeDaLinha({ quantidade: 20, unidade: 'un' })).toBe('20 unidades');
  });
});

describe('sugestões de promoção', () => {
  const produto = (p: Partial<ProdutoDoFornecedor>): ProdutoDoFornecedor => ({
    id: 1,
    categoria: 'oleo_motor',
    nome: 'Óleo 5W-30 sintético API SP dexos1 Gen 3',
    marca: null,
    unidade: 'L',
    conteudo: 1,
    preco: 42.9,
    especificacao: { viscosidade: '5W-30', normas: ['GM dexos1 Gen 3'] },
    ativo: true,
    ...p
  });
  const linha = { categoria: 'oleo_motor' as const, titulo: 'Óleo 5W-30 dexos1 Gen 3', unidade: 'L' as const, quantidade: 48, carros: 12, oficinas: 12 };

  it('preço redondo nunca passa do valor', () => {
    expect(precoRedondo(39.47)).toBe(38.9);
    expect(precoRedondo(40.1)).toBe(39.9);
    expect(precoRedondo(39.9)).toBe(39.9);
  });

  it('confere viscosidade e norma do óleo', () => {
    expect(atende(produto({}), linha)).toBe(true);
    expect(atende(produto({ nome: 'Óleo 0W-20 sintético', especificacao: { viscosidade: '0W-20' } }), linha)).toBe(false);
    expect(atende(produto({ nome: 'Óleo 5W-30 sintético API SP', especificacao: { viscosidade: '5W-30' } }), linha)).toBe(false);
    expect(atende(produto({ ativo: false }), linha)).toBe(false);
  });

  it('sugere desconto e quantidade mínima pela compra típica', () => {
    const [s] = sugerirPromocoes([linha], [produto({})], [], '2026-10-14');
    expect(s.produto?.id).toBe(1);
    expect(s.unidades).toBe(48);
    expect(s.descontoPercentual).toBeGreaterThanOrEqual(9);
    expect(s.precoSugerido).toBeLessThan(42.9);
    expect(s.quantidadeMinima).toBe(4);
    expect(s.texto).toContain('12 oficinas');
  });

  it('avisa quando o fornecedor não tem o produto ou já está em promoção', () => {
    expect(sugerirPromocoes([linha], [], [], '2026-10-14')[0].produto).toBeNull();
    const [s] = sugerirPromocoes([linha], [produto({})], [{ produtoId: 1, inicio: '2026-10-01', fim: '2026-10-30' }], '2026-10-14');
    expect(s.jaEmPromocao).toBe(true);
  });
});

describe('base de prazos e planos', () => {
  const r: Referencia = {
    id: 1,
    categoria: 'vela',
    marca: 'NGK',
    linha: 'Velas de irídio',
    tipo: 'iridio',
    intervaloKm: 100000,
    intervaloMeses: null,
    intervaloKmSevero: 60000,
    intervaloMesesSevero: null,
    segueManual: false,
    observacao: null,
    fonteNome: 'NGK',
    fonteUrl: null,
    confianca: 'fabricante',
    tipoIntervalo: 'troca'
  };

  it('prazo normal, severo e os que não são de troca', () => {
    expect(prazoDaReferencia(r, false)).toEqual({ km: 100000, meses: null });
    expect(prazoDaReferencia(r, true)).toEqual({ km: 60000, meses: null });
    expect(prazoDaReferencia({ ...r, tipoIntervalo: 'garantia' }, false)).toBeNull();
    expect(prazoDaReferencia({ ...r, segueManual: true }, false)).toBeNull();
  });

  it('nomes e textos', () => {
    expect(nomeDaReferencia(r)).toBe('NGK Velas de irídio');
    expect(nomeDaReferencia({ marca: 'NGK', linha: 'NGK Iridium IX' })).toBe('NGK Iridium IX');
    expect(origemDaReferencia(r)).toBe('Indicado pelo fabricante (NGK)');
    expect(textoDoPrazo(40000, 24)).toBe('40.000 km ou 24 meses');
    expect(textoDoPrazo(null, null)).toBe('segue o manual');
    expect(referenciasDaCategoria([{ ...r, id: 2, confianca: 'imprensa' }, r], 'vela').map((x) => x.id)).toEqual([1, 2]);
  });

  it('fim do impulso e comissão', () => {
    expect(fimDoImpulso('2026-10-14', 7)).toBe('2026-10-20');
    expect(fimDoImpulso('2026-10-25', 15)).toBe('2026-11-08');
    expect(valorDaComissao(1000, 4)).toBe(40);
    expect(valorDaComissao(149.4, 5)).toBe(7.47);
  });
});
