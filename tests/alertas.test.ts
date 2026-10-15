import { describe, expect, it } from 'vitest';
import {
  aceiteEquivalente,
  ALERTAS,
  alertaConta,
  cotaAmostra,
  cotaPro,
  depoisDeGastar,
  embalagemComparavel,
  escolherAte,
  esquemaFechar,
  esquemaNovoAlerta,
  esquemaResposta,
  faixaParaFechar,
  faseDoAlerta,
  mesEmBrasilia,
  pacoteValido,
  propostasEmOrdem,
  quantidadeParaFechar,
  resultadoParaLoja,
  resumoDaResposta,
  textoDoPedidoDeAlerta,
  textoDoPreco,
  type AlertaParaContar,
  type Embalagem,
  type RespostaDoAlerta
} from '@/lib/alertas-dados';

const HORA = 3_600_000;
const agora = Date.parse('2026-10-15T15:00:00Z');
const iso = (h: number) => new Date(agora + h * HORA).toISOString();

function alerta(x: Partial<AlertaParaContar> = {}): AlertaParaContar {
  return { status: 'aberto', expiraEm: iso(40), criadoEm: iso(-8), usouCredito: false, propostas: 0, ...x };
}

describe('fase do alerta', () => {
  it('espera as lojas, depois dá um dia para escolher', () => {
    const a = { status: 'aberto' as const, expiraEm: iso(10) };
    expect(faseDoAlerta(a, 0, agora)).toBe('esperando');
    expect(faseDoAlerta(a, 2, agora)).toBe('esperando');
    expect(faseDoAlerta(a, 2, agora + 12 * HORA)).toBe('escolher');
    expect(faseDoAlerta(a, 0, agora + 12 * HORA)).toBe('vencido');
    expect(faseDoAlerta(a, 2, agora + 35 * HORA)).toBe('vencido');
    expect(escolherAte(iso(10))).toBe(agora + (10 + ALERTAS.horasParaEscolher) * HORA);
    expect(faseDoAlerta({ status: 'fechado', expiraEm: iso(-100) }, 1, agora)).toBe('fechado');
    expect(faseDoAlerta({ status: 'cancelado', expiraEm: iso(10) }, 0, agora)).toBe('cancelado');
  });
});

describe('cota de alertas', () => {
  it('alerta sem proposta que terminou ou foi cancelado não conta', () => {
    expect(alertaConta(alerta(), agora)).toBe(true);
    expect(alertaConta(alerta({ status: 'cancelado' }), agora)).toBe(false);
    expect(alertaConta(alerta({ status: 'cancelado', propostas: 1 }), agora)).toBe(true);
    expect(alertaConta(alerta({ expiraEm: iso(-1) }), agora)).toBe(false);
    expect(alertaConta(alerta({ expiraEm: iso(-1), propostas: 2 }), agora)).toBe(true);
    expect(alertaConta(alerta({ status: 'fechado', expiraEm: iso(-30) }), agora)).toBe(true);
  });

  it('Pro: 10 por mês, os do mês passado não contam, e os pacotes entram depois', () => {
    const doMes = Array.from({ length: 9 }, () => alerta({ status: 'fechado' }));
    const mesPassado = alerta({ status: 'fechado', criadoEm: '2026-09-20T12:00:00Z' });
    let c = cotaPro([...doMes, mesPassado], 0, agora);
    expect(c).toMatchObject({ tipo: 'pro', usados: 9, extras: 0, restantes: 1, proximoUsaCredito: false });
    c = cotaPro([...doMes, alerta({ status: 'fechado' })], 5, agora);
    expect(c).toMatchObject({ usados: 10, extras: 5, restantes: 5, proximoUsaCredito: true });
    // um alerta pago com pacote e cancelado sem proposta devolve o crédito
    c = cotaPro([...doMes, alerta(), alerta({ usouCredito: true }), alerta({ usouCredito: true, status: 'cancelado' })], 5, agora);
    expect(c).toMatchObject({ usados: 10, extras: 4, restantes: 4 });
  });

  it('o mês vira em Brasília, não em UTC', () => {
    expect(mesEmBrasilia('2026-11-01T02:00:00Z')).toBe('2026-10');
    expect(mesEmBrasilia('2026-11-01T03:30:00Z')).toBe('2026-11');
  });

  it('sem o Pro: 3 a cada 30 dias', () => {
    const c = cotaAmostra([alerta({ status: 'fechado' }), alerta(), alerta({ criadoEm: iso(-24 * 31), status: 'fechado' })], agora);
    expect(c).toMatchObject({ tipo: 'amostra', usados: 2, restantes: 1 });
    expect(depoisDeGastar(c)).toMatchObject({ usados: 3, restantes: 0 });
  });

  it('gastar um tira do mês e, quando acaba, do pacote', () => {
    const base = cotaPro(Array.from({ length: 9 }, () => alerta()), 2, agora);
    const um = depoisDeGastar(base);
    expect(um).toMatchObject({ usados: 10, extras: 2, restantes: 2, proximoUsaCredito: true });
    const dois = depoisDeGastar(um);
    expect(dois).toMatchObject({ usados: 10, extras: 1, restantes: 1, proximoUsaCredito: true });
  });
});

describe('preço e embalagem', () => {
  const frasco = { categoria: 'oleo_motor' as const, unidade: 'L' as const, conteudo: 1 };
  const galao = { categoria: 'oleo_motor' as const, unidade: 'kit' as const, conteudo: 4 };
  const filtro = { categoria: 'filtro_oleo' as const, unidade: 'un' as const, conteudo: null };

  it('aceitar com outra embalagem mantém o preço do litro', () => {
    expect(aceiteEquivalente({ quantidade: 8, precoAlvo: 30, litros: 1 }, galao)).toEqual({ preco: 120, quantidadeMinima: 2 });
    expect(aceiteEquivalente({ quantidade: 5, precoAlvo: 30, litros: 1 }, galao)).toEqual({ preco: 120, quantidadeMinima: 2 });
    expect(aceiteEquivalente({ quantidade: 5, precoAlvo: 24, litros: null }, filtro)).toEqual({ preco: 24, quantidadeMinima: 5 });
  });

  it('a quantidade ao fechar dá os mesmos litros e respeita o mínimo', () => {
    expect(quantidadeParaFechar({ quantidade: 8, litros: 1 }, { quantidadeMinima: 2, produto: galao })).toBe(2);
    expect(quantidadeParaFechar({ quantidade: 5, litros: null }, { quantidadeMinima: 10, produto: filtro })).toBe(10);
    expect(quantidadeParaFechar({ quantidade: 5, litros: null }, { quantidadeMinima: null, produto: null })).toBe(5);
  });

  it('ao fechar, pede do mínimo da loja até o que o alerta negociou', () => {
    expect(faixaParaFechar({ quantidade: 5, litros: null }, { quantidadeMinima: 10, produto: filtro })).toEqual({ minimo: 10, maximo: 10 });
    expect(faixaParaFechar({ quantidade: 5, litros: null }, { quantidadeMinima: null, produto: filtro })).toEqual({ minimo: 1, maximo: 5 });
    expect(faixaParaFechar({ quantidade: 5, litros: null }, { quantidadeMinima: 3, produto: filtro })).toEqual({ minimo: 3, maximo: 5 });
    expect(faixaParaFechar({ quantidade: 8, litros: 1 }, { quantidadeMinima: 2, produto: galao })).toEqual({ minimo: 2, maximo: 2 });
  });

  it('aceitar o preço só com a mesma embalagem', () => {
    expect(embalagemComparavel({ litros: 1, especificacao: {} }, galao)).toBe(true);
    expect(embalagemComparavel({ litros: 1, especificacao: {} }, filtro)).toBe(false);
    expect(embalagemComparavel({ litros: null, especificacao: {} }, galao)).toBe(false);
    expect(embalagemComparavel({ litros: null, especificacao: { unidade: 'un', conteudo: null } }, filtro)).toBe(true);
    expect(embalagemComparavel({ litros: null, especificacao: { unidade: 'kit', conteudo: null } }, filtro)).toBe(false);
    expect(embalagemComparavel({ litros: null, especificacao: {} }, filtro)).toBe(true);
  });

  it('textos', () => {
    expect(textoDoPreco(24, filtro)).toMatch(/^R\$\s24,00 cada$/);
    expect(textoDoPreco(120, galao)).toMatch(/^R\$\s30,00 o litro \(R\$\s120,00 a embalagem de 4 L\)$/);
    expect(textoDoPreco(31.9, frasco)).toMatch(/^R\$\s31,90 o litro$/);
    expect(textoDoPedidoDeAlerta({ quantidade: 5, precoAlvo: 24, litros: null })).toMatch(/^5 unidades por R\$\s24,00 cada$/);
    expect(textoDoPedidoDeAlerta({ quantidade: 8, precoAlvo: 30, litros: 1 })).toMatch(/^8 litros por R\$\s30,00 o litro$/);
    expect(resumoDaResposta({ tipo: 'contraproposta', preco: 23.5, quantidadeMinima: 10 }, filtro)).toMatch(/^Contraproposta: R\$\s23,50 cada, a partir de 10$/);
    expect(resumoDaResposta({ tipo: 'aceita', preco: 24, quantidadeMinima: 5 }, filtro)).toMatch(/^Aceitou: R\$\s24,00 cada, levando 5$/);
    expect(resumoDaResposta({ tipo: 'recusa', preco: null, quantidadeMinima: null }, null)).toBe('Não tem esse preço agora');
  });

  it('propostas da mais barata para a mais cara, comparando o litro', () => {
    const r = (id: string, preco: number | null, produto: Embalagem = filtro, tipo: RespostaDoAlerta['tipo'] = 'contraproposta'): RespostaDoAlerta => ({
      id,
      fornecedorId: 1,
      fornecedor: id,
      cidade: null,
      tipo,
      produto: { id: 1, nome: id, marca: null, imagemUrl: null, ...produto },
      preco,
      quantidadeMinima: 1,
      prazoEntrega: null,
      mensagem: null,
      status: 'enviada',
      criadoEm: iso(0)
    });
    const ordem = propostasEmOrdem({ respostas: [r('a', 24), r('b', null, filtro, 'recusa'), r('c', 23.5), r('galao', 110, galao)] }).map((x) => x.id);
    expect(ordem).toEqual(['c', 'a', 'galao']);
  });
});

describe('a loja vê', () => {
  it('o resultado do alerta', () => {
    const aberto = { status: 'aberto' as const, expiraEm: iso(5) };
    expect(resultadoParaLoja(aberto, null, agora)).toBe('aberto');
    expect(resultadoParaLoja({ ...aberto, expiraEm: iso(-1) }, null, agora)).toBe('vencido');
    expect(resultadoParaLoja({ status: 'fechado', expiraEm: iso(-1) }, { status: 'escolhida' }, agora)).toBe('voce');
    expect(resultadoParaLoja({ status: 'fechado', expiraEm: iso(-1) }, { status: 'descartada' }, agora)).toBe('outra');
    expect(resultadoParaLoja({ status: 'cancelado', expiraEm: iso(5) }, null, agora)).toBe('cancelado');
  });
});

describe('entradas', () => {
  const base = {
    aparelhoId: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
    oficina: { nome: 'Auto Center', whatsapp: '21987654321', cidade: 'Niterói', uf: 'RJ' },
    produtoId: 201,
    quantidade: 5,
    precoAlvo: 24
  };
  it('o alerta precisa do estado da oficina', () => {
    expect(esquemaNovoAlerta.safeParse(base).success).toBe(true);
    const r = esquemaNovoAlerta.safeParse({ ...base, oficina: { ...base.oficina, uf: '' } });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toMatch(/estado da oficina/);
    expect(esquemaNovoAlerta.safeParse({ ...base, codigoPro: 'abc' }).success).toBe(false);
  });

  it('a resposta da loja', () => {
    const alertaId = '0b6b7d5e-1c2a-4f3e-9d8c-7b6a5f4e3d2c';
    expect(esquemaResposta.safeParse({ alertaId, tipo: 'recusa' }).success).toBe(true);
    expect(esquemaResposta.safeParse({ alertaId, tipo: 'aceita', produtoId: 3 }).success).toBe(true);
    expect(esquemaResposta.safeParse({ alertaId, tipo: 'contraproposta', produtoId: 3, preco: 23.5 }).success).toBe(false);
    expect(esquemaResposta.safeParse({ alertaId, tipo: 'contraproposta', produtoId: 3, preco: 23.5, quantidadeMinima: 10 }).success).toBe(true);
    expect(esquemaResposta.safeParse({ alertaId, tipo: 'leilao' }).success).toBe(false);
  });

  it('fechar exige a proposta que a oficina viu (produto, preço e mínimo)', () => {
    const base = {
      aparelhoId: '7d3c2b1a-0f9e-4d8c-a7b6-5e4d3c2b1a09',
      alertaId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      respostaId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
      quantidade: 10,
      oficina: { nome: 'Auto Center', whatsapp: '21987650000' }
    };
    const vista = { precoEsperado: 23.5, produtoEsperado: 201, minimoEsperado: 10 };
    expect(esquemaFechar.safeParse(base).success).toBe(false);
    expect(esquemaFechar.safeParse({ ...base, ...vista }).success).toBe(true);
    expect(esquemaFechar.safeParse({ ...base, ...vista, precoEsperado: 0 }).success).toBe(false);
    expect(esquemaFechar.safeParse({ ...base, precoEsperado: 23.5, minimoEsperado: 10 }).success).toBe(false);
    expect(esquemaFechar.safeParse({ ...base, ...vista, minimoEsperado: 0 }).success).toBe(false);
  });

  it('só os pacotes da lista', () => {
    expect(pacoteValido(10)?.preco).toBe(9.9);
    expect(pacoteValido(30)?.preco).toBe(24.9);
    expect(pacoteValido(1000)).toBeNull();
  });
});
