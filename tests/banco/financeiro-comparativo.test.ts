import { afterAll, describe, expect, it } from 'vitest';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco } from './ajuda';

// O comparativo da região (comparativo_da_regiao): só números somados, grupos de 5 ou mais,
// nada que identifique uma oficina. Os testes usam Roraima e desligam, dentro da transação, as
// oficinas que outros testes deixaram lá, para contar só as daqui.

afterAll(fechar);

const UF = 'RR';

function diaAtras(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

async function isolar(b: Banco) {
  await b.query(`update public.oficinas set ativa = false where uf = $1`, [UF]);
  await b.query(`delete from privado.comparativo_base where uf = $1`, [UF]);
  await b.query(`delete from privado.comparativo_calculos where uf = $1`, [UF]);
}

interface Semente {
  cidade: string;
  /** Ticket de cada ordem desta oficina. */
  ticket: number;
  oleo?: number | null;
  ordens?: number;
  aprovados?: number;
  recusados?: number;
}

/** Uma oficina com conta na cidade, com ordens concluídas e orçamentos dos últimos dias. */
async function oficinaCom(b: Banco, s: Semente): Promise<{ id: string; nome: string; email: string }> {
  const dono = await criarPessoa(b, pessoa('cmp'));
  const nome = `Oficina Comparativo ${Math.random().toString(36).slice(2, 8)}`;
  const id = await criarOficina(b, dono, nome, { uf: UF });
  // só oficina com mais de 30 dias entra no comparativo
  await b.query(`update public.oficinas set cidade = $2, criado_em = now() - interval '60 days' where id = $1`, [id, s.cidade]);
  const docs: object[] = [];
  const n = s.ordens ?? 4;
  for (let i = 0; i < n; i++) {
    const oleo = s.oleo ?? null;
    const linhasDoc = oleo
      ? [
          { id: `l${i}a`, tipo: 'peca', servico: 'troca_oleo', descricao: 'Óleo', quantidade: 1, unidade: 'un', valorUnitario: oleo },
          { id: `l${i}b`, tipo: 'servico', descricao: 'Mão de obra', quantidade: 1, unidade: 'un', valorUnitario: s.ticket - oleo },
          { id: `l${i}c`, tipo: 'servico', descricao: 'Recusado', quantidade: 1, unidade: 'un', valorUnitario: 5000, recusada: true }
        ]
      : [{ id: `l${i}a`, tipo: 'servico', descricao: 'Mão de obra', quantidade: 2, unidade: 'h', valorUnitario: s.ticket / 2 }];
    docs.push({ id: `os-${i}`, numero: i + 1, tipo: 'ordem', situacao: 'concluida', veiculoId: `v${i}`, data: diaAtras(12), concluidoEm: `${diaAtras(10)}T15:00:00.000Z`, linhas: linhasDoc, desconto: null });
  }
  // uma ordem velha e uma em andamento não contam
  docs.push({ id: 'os-velha', numero: 90, tipo: 'ordem', situacao: 'concluida', veiculoId: 'vx', data: diaAtras(200), linhas: [{ tipo: 'servico', quantidade: 1, valorUnitario: 99999 }], desconto: null });
  docs.push({ id: 'os-aberta', numero: 91, tipo: 'ordem', situacao: 'aberta', veiculoId: 'vy', data: diaAtras(1), linhas: [{ tipo: 'servico', quantidade: 1, valorUnitario: 99999 }], desconto: null });
  for (let i = 0; i < (s.aprovados ?? 3); i++) docs.push({ id: `orc-a${i}`, numero: i + 1, tipo: 'orcamento', situacao: 'aprovado', data: diaAtras(6), enviadoEm: `${diaAtras(5)}T12:00:00.000Z`, linhas: [] });
  for (let i = 0; i < (s.recusados ?? 1); i++) docs.push({ id: `orc-r${i}`, numero: 50 + i, tipo: 'orcamento', situacao: 'recusado', data: diaAtras(6), enviadoEm: `${diaAtras(5)}T12:00:00.000Z`, linhas: [] });
  await b.query(`insert into public.registros (oficina_id, colecao, id, dados) select $1, 'documentos', x ->> 'id', x from jsonb_array_elements($2::jsonb) x`, [id, JSON.stringify(docs)]);
  return { id, nome, email: dono.email };
}

async function comparativo(b: Banco, cidade: string | null, uf = UF): Promise<Record<string, unknown> | null> {
  const [r] = await linhas(b, null, 'select public.comparativo_da_regiao($1, $2) as r', [uf, cidade]);
  return (r.r as Record<string, unknown> | null) ?? null;
}

type Faixa = { p25: number; mediana: number; p75: number; oficinas: number };

describe.skipIf(!temBanco)('comparativo da região', () => {
  it('menos de 5 oficinas no estado: nada', () =>
    emTransacao(async (b) => {
      await isolar(b);
      for (let k = 0; k < 4; k++) await oficinaCom(b, { cidade: 'Boa Vista', ticket: 300 + 30 * k, oleo: 100 });
      expect(await comparativo(b, 'Boa Vista')).toBeNull();
      expect(await comparativo(b, null)).toBeNull();
      // UF que não existe também não quebra
      expect(await comparativo(b, 'Boa Vista', 'R1')).toBeNull();
    }));

  it('oficina com menos de 30 dias não conta para o mínimo de 5', () =>
    emTransacao(async (b) => {
      await isolar(b);
      for (let k = 0; k < 4; k++) await oficinaCom(b, { cidade: 'Boa Vista', ticket: 300 + 30 * k, oleo: 100 });
      const nova = await oficinaCom(b, { cidade: 'Boa Vista', ticket: 900, oleo: 100 });
      await b.query(`update public.oficinas set criado_em = now() - interval '3 days' where id = $1`, [nova.id]);
      expect(await comparativo(b, 'Boa Vista')).toBeNull();
    }));

  it('5 na cidade: a faixa da cidade, com ruído leve e sem nada que identifique', () =>
    emTransacao(async (b) => {
      await isolar(b);
      const criadas = [];
      for (let k = 0; k < 5; k++) criadas.push(await oficinaCom(b, { cidade: k % 2 ? 'BOA VISTA ' : 'boa vista', ticket: 300 + 30 * k, oleo: 100 + 10 * k }));
      const r = await comparativo(b, 'Boa  Vista');
      expect(r).not.toBeNull();
      expect(Object.keys(r!).sort()).toEqual(['aprovacao', 'carrosMes', 'cidade', 'dias', 'nivel', 'oficinas', 'ticket', 'trocaOleo', 'uf']);
      expect(r).toMatchObject({ nivel: 'cidade', uf: UF, cidade: 'Boa  Vista', oficinas: 5, dias: 90 });
      // tickets 300, 330, 360, 390 e 420: o meio é 360 (± 3%, de 5 em 5 reais)
      const t = r!.ticket as Faixa;
      expect(Object.keys(t).sort()).toEqual(['mediana', 'oficinas', 'p25', 'p75']);
      expect(t.oficinas).toBe(5);
      expect(t.mediana).toBeGreaterThanOrEqual(345);
      expect(t.mediana).toBeLessThanOrEqual(375);
      expect(t.mediana % 5).toBe(0);
      expect(t.p25).toBeLessThanOrEqual(t.mediana);
      expect(t.mediana).toBeLessThanOrEqual(t.p75);
      expect(t.p25).toBeGreaterThan(300);
      expect(t.p75).toBeLessThan(420);
      // trocas de 100 a 140: o meio é 120 (acima de R$ 100, de 5 em 5)
      const o = r!.trocaOleo as Faixa;
      expect([115, 120, 125]).toContain(o.mediana);
      // 4 carros em 3 meses
      const carros = (r!.carrosMes as Faixa).mediana;
      expect(carros).toBeGreaterThanOrEqual(1.2);
      expect(carros).toBeLessThanOrEqual(1.4);
      // 3 de 4 orçamentos aprovados
      const a = r!.aprovacao as Faixa;
      expect(a.mediana).toBeGreaterThanOrEqual(73);
      expect(a.mediana).toBeLessThanOrEqual(77);
      // nada das oficinas no que volta
      const texto = JSON.stringify(r);
      for (const c of criadas) {
        expect(texto).not.toContain(c.id);
        expect(texto).not.toContain(c.nome);
        expect(texto).not.toContain(c.email);
      }
      expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      // o mesmo o dia todo, mesmo refazendo a conta
      await b.query(`delete from privado.comparativo_calculos where uf = $1`, [UF]);
      expect(await comparativo(b, 'boa vista')).toEqual({ ...r, cidade: 'boa vista' });
    }));

  it('cidade com menos de 5: a faixa do estado; cada número só com 5 oficinas', () =>
    emTransacao(async (b) => {
      await isolar(b);
      for (let k = 0; k < 3; k++) await oficinaCom(b, { cidade: 'Caracaraí', ticket: 400, oleo: 150 });
      // duas sem troca de óleo e uma com pouco movimento (2 ordens e 2 orçamentos: não entra)
      for (let k = 0; k < 2; k++) await oficinaCom(b, { cidade: 'Mucajaí', ticket: 500, oleo: null });
      await oficinaCom(b, { cidade: 'Mucajaí', ticket: 9000, oleo: 9000, ordens: 2, aprovados: 1, recusados: 1 });
      const r = await comparativo(b, 'Caracarai');
      expect(r).toMatchObject({ nivel: 'uf', uf: UF, cidade: null, oficinas: 5 });
      expect((r!.ticket as Faixa).oficinas).toBe(5);
      expect((r!.ticket as Faixa).p75).toBeLessThan(600);
      // só 3 oficinas com troca de óleo: o número não sai
      expect(r!.trocaOleo).toBeNull();
      expect(await comparativo(b, 'Cidade que não tem')).toMatchObject({ nivel: 'uf', oficinas: 5 });
      expect(await comparativo(b, '')).toMatchObject({ nivel: 'uf' });
      // a oficina desativada sai da conta
      const [{ id }] = (await b.query(`select id from public.oficinas where uf = $1 and ativa and cidade = 'Caracaraí' limit 1`, [UF])).rows;
      await b.query(`update public.oficinas set ativa = false where id = $1`, [id]);
      await b.query(`delete from privado.comparativo_calculos where uf = $1`, [UF]);
      expect(await comparativo(b, 'Caracaraí')).toBeNull();
    }));

  it('registro estragado não derruba a conta', () =>
    emTransacao(async (b) => {
      await isolar(b);
      const criadas = [];
      for (let k = 0; k < 5; k++) criadas.push(await oficinaCom(b, { cidade: 'Pacaraima', ticket: 300, oleo: 100 }));
      const ruins = [
        { id: 'r1', tipo: 'ordem', situacao: 'concluida', data: diaAtras(3), linhas: 'não é lista', desconto: 'muito' },
        { id: 'r2', tipo: 'ordem', situacao: 'concluida', concluidoEm: '2026-99-99T00:00:00Z', data: 'ontem', linhas: [1, 'x', null, { quantidade: 'dois', valorUnitario: {} }] },
        { id: 'r3', tipo: 'ordem', situacao: 'concluida', data: diaAtras(3), linhas: [{ quantidade: 1e300, valorUnitario: 1e300 }, { quantidade: 1, valorUnitario: 50, recusada: 'sim' }] },
        { id: 'r4', tipo: 'orcamento', situacao: 'aprovado', enviadoEm: 12345, data: diaAtras(2) }
      ];
      await b.query(`insert into public.registros (oficina_id, colecao, id, dados) select $1, 'documentos', x ->> 'id', x from jsonb_array_elements($2::jsonb) x`, [criadas[0].id, JSON.stringify(ruins)]);
      const r = await comparativo(b, 'Pacaraima');
      expect(r).toMatchObject({ nivel: 'cidade', oficinas: 5 });
      expect((r!.ticket as Faixa).mediana).toBeGreaterThanOrEqual(290);
      expect((r!.ticket as Faixa).mediana).toBeLessThanOrEqual(310);
    }));

  it('qualquer um consulta; só o sistema refaz tudo', () =>
    emTransacao(async (b) => {
      await isolar(b);
      for (let k = 0; k < 5; k++) await oficinaCom(b, { cidade: 'Alto Alegre', ticket: 200, oleo: 90 });
      const p = await criarPessoa(b, pessoa('logado'));
      const [r] = await linhas(b, p, 'select public.comparativo_da_regiao($1, $2) as r', ['rr', 'Alto Alegre']);
      expect(r.r).toMatchObject({ nivel: 'cidade', uf: UF });
      expect((await tentar(b, null, 'select public.comparativo_atualizar()')).codigo).toBe('42501');
      expect((await tentar(b, p, 'select public.comparativo_atualizar()')).erro).toBeTruthy();
      const [n] = await linhas(b, null, 'select public.comparativo_atualizar() as n', [], { sistema: true });
      expect(Number(n.n)).toBeGreaterThanOrEqual(1);
      // ninguém lê as contas por oficina direto
      expect((await tentar(b, null, 'select * from privado.comparativo_base')).erro).toBeTruthy();
      expect((await tentar(b, p, 'select * from privado.comparativo_base')).erro).toBeTruthy();
      expect((await tentar(b, p, `select privado.comparativo_calcular('RR')`)).erro).toBeTruthy();
    }));
});
