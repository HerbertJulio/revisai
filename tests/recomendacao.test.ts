import { describe, expect, it } from 'vitest';
import { precoNaQuantidade } from '@/lib/catalogo';
import { CATALOGO_EXEMPLO as cat } from '@/lib/catalogo-demo';
import { intervaloSugerido } from '@/lib/manutencao';
import { buscarReferencias, exigenciaDoCarro, nivelApi, oleoAtende } from '@/lib/oleos';
import { calcularDemanda, recomendarParaItem } from '@/lib/recomendacao';

const hoje = '2026-10-13';

describe('óleo', () => {
  it('API mais nova cobre a antiga; ILSAC GF-6A vale como SP', () => {
    expect(nivelApi('SP')).toBeGreaterThan(nivelApi('SN'));
    expect(oleoAtende({ viscosidade: '0W-20', ilsac: 'GF-6A', base: 'sintetico' }, { viscosidades: ['0W-20'], api: 'SP' }).atende).toBe(true);
    expect(oleoAtende({ viscosidade: '0W-20', api: 'SN' }, { viscosidades: ['0W-20'], api: 'SP' }).atende).toBe(false);
  });

  it('exige a viscosidade e a norma do manual', () => {
    const onix = { viscosidades: ['5W-30'], norma: 'GM dexos1 Gen 3' };
    expect(oleoAtende({ viscosidade: '5W-30', api: 'SP' }, onix).faltas).toContain('sem a norma GM dexos1 Gen 3');
    expect(oleoAtende({ viscosidade: '5W-40', normas: ['GM dexos1 Gen 3'] }, onix).atende).toBe(false);
    expect(oleoAtende({ viscosidade: '5w30', normas: ['GM dexos1 Gen 3'] }, onix).atende).toBe(true);
    // Gen 3 atende quem pede Gen 2
    expect(oleoAtende({ viscosidade: '5W-30', normas: ['GM dexos1 Gen 3'] }, { viscosidades: ['5W-30'], norma: 'GM dexos1 Gen 2' }).atende).toBe(true);
  });

  it('não rebaixa de sintético para mineral', () => {
    expect(oleoAtende({ viscosidade: '20W-50', base: 'mineral' }, { viscosidades: ['20W-50'], base: 'sintetico' }).atende).toBe(false);
    expect(oleoAtende({ viscosidade: '20W-50', base: 'sintetico' }, { viscosidades: ['20W-50'], base: 'mineral' }).atende).toBe(true);
  });

  it('usa o último óleo quando o carro não tem cadastro', () => {
    expect(exigenciaDoCarro(undefined, { viscosidade: '10W-40', base: 'semissintetico', api: 'SN' })).toMatchObject({ viscosidades: ['10W-40'], api: 'SN' });
    expect(exigenciaDoCarro(undefined, null)).toBeNull();
  });

  it('acha a referência pelo texto do carro', () => {
    expect(buscarReferencias('Chevrolet Onix 1.0 Turbo 2022')[0]?.id).toBe('onix-turbo');
    expect(buscarReferencias('Onix 1.0 LT')[0]?.id).toBe('onix-aspirado');
    expect(buscarReferencias('VW Polo 1.0 TSI')[0]?.id).toBe('vw-tsi');
    expect(buscarReferencias('Strada 1.0 Turbo')[0]?.id).toBe('fiat-t200');
    expect(buscarReferencias('Jeep Compass 1.3 turbo')[0]?.id).toBe('jeep-t270');
    expect(buscarReferencias('Gol 1.0')).toEqual([]);
  });
});

describe('prazo sugerido', () => {
  const prefs = { intervalos: {}, usoSeveroPadrao: false };
  it('óleo: padrão, uso severo, manual do carro e limite do mineral', () => {
    expect(intervaloSugerido('troca_oleo', { prefs })).toMatchObject({ km: 10000, meses: 12 });
    expect(intervaloSugerido('troca_oleo', { prefs, veiculo: { usoSevero: true } })).toMatchObject({ km: 5000, meses: 6 });
    expect(intervaloSugerido('troca_oleo', { prefs, veiculo: { intervaloOleo: { km: 12000, meses: 12 } } })).toMatchObject({ km: 12000, meses: 12, origem: 'Manual do carro' });
    // o lado em branco do manual vem do padrão
    expect(intervaloSugerido('troca_oleo', { prefs, veiculo: { intervaloOleo: { km: 15000, meses: null } } })).toMatchObject({ km: 15000, meses: 12 });
    const mineral = cat.produtos.find((p) => p.id === 109)!;
    expect(intervaloSugerido('troca_oleo', { prefs, produto: mineral })).toMatchObject({ km: 5000, meses: 6, origem: 'Limite do óleo mineral' });
  });

  it('peça com vida própria usa o prazo do produto', () => {
    const iridio = cat.produtos.find((p) => p.id === 209)!;
    expect(intervaloSugerido('velas', { prefs, produto: iridio })).toMatchObject({ km: 60000, meses: 60 });
  });

  it('o padrão da oficina vale, e cai pela metade no uso severo', () => {
    const proprio = { intervalos: { filtro_ar: { km: 15000, meses: 12 } }, usoSeveroPadrao: true };
    expect(intervaloSugerido('filtro_ar', { prefs: proprio })).toMatchObject({ km: 7500, meses: 6 });
  });
});

describe('recomendação', () => {
  it('recomenda o óleo dexos1 mais barato na quantidade do motor', () => {
    const r = recomendarParaItem('troca_oleo', { oleo: { viscosidades: ['5W-30'], norma: 'GM dexos1 Gen 3', capacidadeL: 3.75 } }, null, cat, hoje);
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(x.produto.especificacao.normas).toContain('GM dexos1 Gen 3');
    // 4 frascos de 1 L entram na promoção "a partir de 4"
    const frasco = r.find((x) => x.produto.id === 101)!;
    expect(frasco.quantidade).toBe(4);
    expect(frasco.precoUnitario).toBe(39.9);
    expect(r[0].total).toBeLessThanOrEqual(r[r.length - 1].total);
  });

  it('sem saber o óleo, não recomenda', () => {
    expect(recomendarParaItem('troca_oleo', {}, null, cat, hoje)).toEqual([]);
  });

  it('pneu da mesma medida, quatro unidades', () => {
    const r = recomendarParaItem('pneus', {}, { nome: 'Pneu', especificacao: { medida: '185/65 R15' } }, cat, hoje);
    expect(r).toHaveLength(1);
    expect(r[0].quantidade).toBe(4);
    expect(r[0].promocao?.titulo).toBe('Leve 4 pneus');
  });

  it('promoção só a partir da quantidade mínima', () => {
    const filtro = cat.produtos.find((p) => p.id === 201)!;
    expect(precoNaQuantidade(filtro, cat.promocoes, hoje, 3).preco).toBe(29.9);
    expect(precoNaQuantidade(filtro, cat.promocoes, hoje, 10).preco).toBe(22.9);
    expect(precoNaQuantidade(filtro, cat.promocoes, '2027-03-01', 10).preco).toBe(29.9);
  });

  it('soma a demanda de óleo dos próximos dias', () => {
    const carro = (dias: number, capacidadeL: number) => ({
      veiculo: { oleo: { viscosidades: ['5W-30'], norma: 'GM dexos1 Gen 3', capacidadeL } },
      itens: [
        { servico: 'troca_oleo', venc: { diasRestantes: dias }, produto: null },
        { servico: 'filtro_oleo', venc: { diasRestantes: dias }, produto: null }
      ] as never[]
    });
    const linhas = calcularDemanda([carro(3, 3.75), carro(10, 4), carro(45, 4)], cat, hoje, 30);
    const oleo = linhas.find((l) => l.servico === 'troca_oleo')!;
    expect(oleo.carros).toBe(2);
    expect(oleo.volume).toBe(7.75);
    expect(oleo.recomendacao).not.toBeNull();
    const filtro = linhas.find((l) => l.servico === 'filtro_oleo')!;
    expect(filtro.carros).toBe(2);
    expect(filtro.recomendacao?.quantidade).toBe(2);
  });

  it('escolhe o produto pela soma, para pegar a promoção por quantidade', () => {
    const carros = Array.from({ length: 10 }, () => ({ veiculo: {}, itens: [{ servico: 'filtro_oleo', venc: { diasRestantes: 5 }, produto: null }] as never[] }));
    const filtro = calcularDemanda(carros, cat, hoje, 30).find((l) => l.servico === 'filtro_oleo')!;
    // 10 blindados na "Caixa com 10" (R$ 22,90) saem mais baratos que 10 refis (R$ 24,90)
    expect(filtro.recomendacao?.produto.id).toBe(201);
    expect(filtro.recomendacao?.total).toBe(229);
  });
});
