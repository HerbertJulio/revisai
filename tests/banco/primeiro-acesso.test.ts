import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { emTransacao, fechar, temBanco, type Banco } from './ajuda';

// A migração do primeiro acesso: no banco de produção (o único com a chave 'equipe', do painel
// antigo) convida o dono da plataforma como admin e liga os avisos na hora; nos outros bancos
// não faz nada, e rodar de novo não duplica o convite nem troca o código dos avisos.

afterAll(fechar);

const MIGRACAO = readFileSync(new URL('../../supabase/migrations/20261018000000_primeiro_acesso.sql', import.meta.url), 'utf8');

async function comoAntesDasContas(b: Banco) {
  await b.query(`insert into privado.chaves (nome, hash) values ('equipe', repeat('a', 64)) on conflict (nome) do nothing`);
  await b.query('delete from privado.equipe_aparelhos');
  await b.query('delete from privado.equipe');
  await b.query('delete from privado.equipe_convites');
  await b.query('delete from privado.avisos_config');
}

async function estado(b: Banco) {
  const convites = (await b.query('select email, papel, nome from privado.equipe_convites order by email')).rows;
  const [avisos] = (await b.query('select app_url, token from privado.avisos_config')).rows as { app_url: string; token: string }[];
  return { convites, avisos };
}

describe.skipIf(!temBanco)('primeiro acesso da produção', () => {
  it('sem a chave da equipe antiga (banco local ou de teste), não muda nada', () =>
    emTransacao(async (b) => {
      await b.query(`delete from privado.chaves where nome = 'equipe'`);
      const antes = await estado(b);
      await b.query(MIGRACAO);
      expect(await estado(b)).toEqual(antes);
    }));

  it('no banco de produção, convida o admin e liga os avisos uma vez só', () =>
    emTransacao(async (b) => {
      await comoAntesDasContas(b);
      await b.query(MIGRACAO);
      const depois = await estado(b);
      expect(depois.convites).toEqual([{ email: 'hvcotta@gmail.com', papel: 'admin', nome: 'Herbert' }]);
      expect(depois.avisos?.app_url).toBe('https://revisai.howlks.com');
      expect(depois.avisos?.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      await b.query(MIGRACAO);
      expect(await estado(b)).toEqual(depois);
    }));

  it('com alguém na equipe ou um convite, não convida de novo', () =>
    emTransacao(async (b) => {
      await comoAntesDasContas(b);
      await b.query(`insert into privado.equipe_convites (email, papel, nome) values ('outra@teste.dev', 'suporte', 'Outra')`);
      await b.query(MIGRACAO);
      expect((await estado(b)).convites).toEqual([{ email: 'outra@teste.dev', papel: 'suporte', nome: 'Outra' }]);
    }));
});
