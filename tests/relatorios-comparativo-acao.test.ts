import { beforeEach, describe, expect, it, vi } from 'vitest';

// A ação da página pública do comparativo: confere a entrada, limita por IP (no banco, pela
// chave do sistema; sem ela, na memória) e só manda a UF e a cidade para o banco.

vi.mock('server-only', () => ({}));

const chamadasPublico: { fn: string; args: unknown }[] = [];
const chamadasSistema: { fn: string; args: unknown }[] = [];
let respostaPublico: { data: unknown; error: unknown } = { data: null, error: null };
let respostaLimite: { data: unknown; error: unknown } = { data: true, error: null };
let comSistema = true;
let dentroDaMemoria = true;

vi.mock('@/lib/supabase-servidor', () => ({
  clientePublico: () => ({
    rpc: async (fn: string, args: unknown) => {
      chamadasPublico.push({ fn, args });
      return respostaPublico;
    }
  }),
  clienteSistema: () =>
    comSistema
      ? {
          rpc: async (fn: string, args: unknown) => {
            chamadasSistema.push({ fn, args });
            return respostaLimite;
          }
        }
      : null,
  ipDoPedido: async () => '200.1.2.3'
}));

vi.mock('@/lib/limite', () => ({ permitido: async () => dentroDaMemoria }));

const { consultarComparativo } = await import('@/app/(site)/comparativo/acoes');

const faixa = { p25: 300, mediana: 360, p75: 390, oficinas: 5 };

beforeEach(() => {
  chamadasPublico.length = 0;
  chamadasSistema.length = 0;
  respostaPublico = { data: null, error: null };
  respostaLimite = { data: true, error: null };
  comSistema = true;
  dentroDaMemoria = true;
});

describe('consulta do comparativo', () => {
  it('manda só a UF e a cidade e devolve a faixa conferida', async () => {
    respostaPublico = { data: { nivel: 'cidade', uf: 'RJ', cidade: 'Guapimirim', oficinas: 5, dias: 90, ticket: faixa, trocaOleo: null, carrosMes: faixa, aprovacao: faixa }, error: null };
    const r = await consultarComparativo({ uf: 'rj', cidade: '  Guapimirim ', ticket: 999 });
    expect(r).toMatchObject({ ok: true, dados: { nivel: 'cidade', ticket: faixa, trocaOleo: null } });
    expect(chamadasPublico).toEqual([{ fn: 'comparativo_da_regiao', args: { p_uf: 'RJ', p_cidade: 'Guapimirim' } }]);
    expect(chamadasSistema).toEqual([{ fn: 'limite_consumir', args: { p_chave: 'comparativo:200.1.2.3', p_max: 20, p_segundos: 600 } }]);
  });

  it('região sem 5 oficinas: ok, sem dados', async () => {
    expect(await consultarComparativo({ uf: 'AC' })).toEqual({ ok: true, dados: null });
    expect(chamadasPublico[0].args).toEqual({ p_uf: 'AC', p_cidade: null });
  });

  it('confere a UF e a cidade', async () => {
    expect(await consultarComparativo({ uf: 'XX' })).toEqual({ ok: false, erro: 'Escolha o estado.' });
    expect((await consultarComparativo({ uf: 'RJ', cidade: 'x'.repeat(81) })).ok).toBe(false);
    expect(await consultarComparativo(null)).toMatchObject({ ok: false });
    expect(chamadasPublico).toEqual([]);
  });

  it('limite por IP no banco; sem a chave do sistema, na memória', async () => {
    respostaLimite = { data: false, error: null };
    expect(await consultarComparativo({ uf: 'RJ' })).toEqual({ ok: false, erro: 'Muitas consultas seguidas. Espere alguns minutos e tente de novo.' });
    expect(chamadasPublico).toEqual([]);
    comSistema = false;
    dentroDaMemoria = false;
    expect((await consultarComparativo({ uf: 'RJ' })).ok).toBe(false);
    dentroDaMemoria = true;
    expect((await consultarComparativo({ uf: 'RJ' })).ok).toBe(true);
    // o banco do limite fora do ar não derruba a página
    comSistema = true;
    respostaLimite = { data: null, error: { message: 'fora' } };
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await consultarComparativo({ uf: 'RJ' })).ok).toBe(true);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it('erro do banco vira mensagem; resposta estranha vira "sem dados"', async () => {
    respostaPublico = { data: null, error: { message: 'boom' } };
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await consultarComparativo({ uf: 'RJ' })).toEqual({ ok: false, erro: 'Não deu para buscar a média agora. Tente de novo em instantes.' });
    erro.mockRestore();
    respostaPublico = { data: { qualquer: 'coisa', id: 'abc' }, error: null };
    expect(await consultarComparativo({ uf: 'RJ' })).toEqual({ ok: true, dados: null });
  });
});
