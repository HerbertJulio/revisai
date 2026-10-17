import { afterAll, describe, expect, it } from 'vitest';
import { COLECOES_EXTRAS } from '../../lib/registros-oficina';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, type Banco, type Pessoa } from './ajuda';

afterAll(fechar);

async function gravar(b: Banco, p: Pessoa, oficina: string, itens: object[]) {
  const r = await linhas(b, p, 'select public.gravar_registros($1, $2::jsonb) as r', [oficina, JSON.stringify(itens)]);
  return (r[0].r as { colecao: string }[]).map((x) => x.colecao);
}

async function ler(b: Banco, p: Pessoa, oficina: string) {
  const r = await linhas(b, p, 'select public.ler_registros($1, 0) as r', [oficina]);
  return ((r[0].r as { itens: { colecao: string }[] }).itens ?? []).map((x) => x.colecao).sort();
}

describe.skipIf(!temBanco)('coleções novas da oficina', () => {
  it('o banco aceita todas as coleções novas do app', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const itens = COLECOES_EXTRAS.map((c) => ({ colecao: c, id: `${c}-1`, dados: { id: `${c}-1` } }));
      expect((await gravar(b, dono, o, itens)).sort()).toEqual([...COLECOES_EXTRAS].sort());
    }));

  it('o mecânico não vê nem grava o financeiro', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const mec = await criarPessoa(b, pessoa('mec'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email]);
      await linhas(b, mec, 'select public.aceitar_convite()');

      await gravar(b, dono, o, [
        { colecao: 'lancamentos', id: 'l1', dados: { valor: 100 } },
        { colecao: 'clubeCobrancas', id: 'k1', dados: { valor: 50 } },
        { colecao: 'agendamentos', id: 'a1', dados: { hora: '08:00' } }
      ]);
      expect(await ler(b, dono, o)).toEqual(['agendamentos', 'clubeCobrancas', 'lancamentos']);
      expect(await ler(b, mec, o)).toEqual(['agendamentos']);
      expect(await linhas(b, mec, `select id from public.registros where colecao = 'lancamentos'`)).toEqual([]);
      expect(await linhas(b, dono, `select id from public.registros where colecao = 'lancamentos'`)).toHaveLength(1);

      // o mecânico grava a agenda, mas o lançamento dele é ignorado
      expect(await gravar(b, mec, o, [
        { colecao: 'lancamentos', id: 'l2', dados: { valor: 1 } },
        { colecao: 'agendamentos', id: 'a2', dados: { hora: '09:00' } }
      ])).toEqual(['agendamentos']);
      expect(await linhas(b, dono, `select id from public.registros where colecao = 'lancamentos' order by id`)).toEqual([{ id: 'l1' }]);
    }));

  it('a paginação do mecânico não para no meio por causa do financeiro', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const mec = await criarPessoa(b, pessoa('mec'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email]);
      await linhas(b, mec, 'select public.aceitar_convite()');
      const itens = [];
      for (let i = 0; i < 5; i++) itens.push({ colecao: 'lancamentos', id: `l${i}`, dados: {} });
      for (let i = 0; i < 3; i++) itens.push({ colecao: 'clientes', id: `c${i}`, dados: {} });
      await gravar(b, dono, o, itens);
      const r = await linhas(b, mec, 'select public.ler_registros($1, 0, $2, $3, 2) as r', [o, '', '']);
      const pagina = r[0].r as { itens: { colecao: string }[]; mais: boolean };
      expect(pagina.itens.map((x) => x.colecao)).toEqual(['clientes', 'clientes']);
      expect(pagina.mais).toBe(true);
    }));
});
