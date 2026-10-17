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

  it('o mecânico recebe os registros sem a comissão, o custo e os preços, e não muda esses valores', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const mec = await criarPessoa(b, pessoa('mec'));
      const o = await criarOficina(b, dono);
      await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email]);
      await linhas(b, mec, 'select public.aceitar_convite()');
      await gravar(b, dono, o, [
        { colecao: 'profissionais', id: 'p1', dados: { id: 'p1', nome: 'Zé', comissaoServicos: 10, comissaoPecas: 5 } },
        { colecao: 'estoque', id: 'e1', dados: { id: 'e1', nome: 'Óleo', custo: 20, preco: 35, quantidade: 4 } },
        { colecao: 'movimentos', id: 'm1', dados: { id: 'm1', itemId: 'e1', custoUnitario: 20, quantidade: 4 } },
        { colecao: 'lembretes', id: 'r1', dados: { id: 'r1', descricao: 'Pastilha', valorEstimado: 300 } },
        { colecao: 'clubePlanos', id: 'c1', dados: { id: 'c1', nome: 'Clube', preco: 49 } }
      ]);
      const r = await linhas(b, mec, 'select public.ler_registros($1, 0) as r', [o]);
      const itens = (r[0].r as { itens: { colecao: string; dados: Record<string, unknown> }[] }).itens;
      const de = (c: string) => itens.find((x) => x.colecao === c)?.dados ?? {};
      expect(de('profissionais')).toEqual({ id: 'p1', nome: 'Zé' });
      expect(de('estoque')).toEqual({ id: 'e1', nome: 'Óleo', preco: 35, quantidade: 4 });
      expect(de('movimentos')).toEqual({ id: 'm1', itemId: 'e1', quantidade: 4 });
      expect(de('lembretes')).toEqual({ id: 'r1', descricao: 'Pastilha' });
      expect(de('clubePlanos')).toEqual({ id: 'c1', nome: 'Clube' });
      // direto na tabela, o mecânico não lê o que tem dinheiro
      expect(await linhas(b, mec, `select id from public.registros where colecao in ('profissionais', 'estoque', 'movimentos', 'lembretes', 'clubePlanos')`)).toEqual([]);

      // o mecânico tenta subir a própria comissão e baixar o custo: nada muda
      await gravar(b, mec, o, [
        { colecao: 'profissionais', id: 'p1', dados: { id: 'p1', nome: 'Zé', comissaoServicos: 90, comissaoPecas: 90 } },
        { colecao: 'estoque', id: 'e1', dados: { id: 'e1', nome: 'Óleo 5W30', custo: 1, preco: 35, quantidade: 3 } },
        { colecao: 'clubePlanos', id: 'c1', dados: { id: 'c1', nome: 'Clube', preco: 1 } },
        { colecao: 'estoque', id: 'e2', dados: { id: 'e2', nome: 'Filtro', custo: 5, quantidade: 1 } }
      ]);
      const dados = async (c: string, id: string) =>
        (await b.query('select dados from public.registros where oficina_id = $1 and colecao = $2 and id = $3', [o, c, id])).rows[0]?.dados;
      expect(await dados('profissionais', 'p1')).toMatchObject({ comissaoServicos: 10, comissaoPecas: 5 });
      expect(await dados('estoque', 'e1')).toEqual({ id: 'e1', nome: 'Óleo 5W30', custo: 20, preco: 35, quantidade: 3 });
      expect(await dados('clubePlanos', 'c1')).toMatchObject({ preco: 49 });
      expect(await dados('estoque', 'e2')).toEqual({ id: 'e2', nome: 'Filtro', quantidade: 1 });
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
