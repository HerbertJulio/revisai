import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

// A migração da jornada da ordem: o CNPJ que a oficina digita no app vai para o cadastro dela e
// aparece no ver_link e na consulta da garantia (sempre do banco); a resposta do cliente é pega
// por um aparelho só; e o tempo real dos links não quebra a migração onde ele não existe.

afterAll(fechar);

const MIGRACAO = new URL('../../supabase/migrations/20261017093000_ordem_links.sql', import.meta.url);

async function gravarCadastro(b: Banco, p: Pessoa, oficina: string, dados: object) {
  await linhas(b, p, 'select public.gravar_registros($1, $2::jsonb)', [oficina, JSON.stringify([{ colecao: 'config', id: 'oficina', dados }])]);
  const [o] = (await b.query('select nome, whatsapp, cidade, uf, cnpj from public.oficinas where id = $1', [oficina])).rows;
  return o as { nome: string; whatsapp: string; cidade: string | null; uf: string | null; cnpj: string | null };
}

describe.skipIf(!temBanco)('jornada da ordem no banco', () => {
  it('o CNPJ do cadastro vai só com os dígitos e conferido; sem o campo, fica o que estava', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Auto Center Serra');
      const base = { nome: 'Auto Center Serra', whatsapp: '(21) 99999-0000', cidade: 'Guapimirim', uf: 'rj' };
      expect(await gravarCadastro(b, dono, o, { ...base, cnpj: '11.222.333/0001-81' })).toEqual({ nome: 'Auto Center Serra', whatsapp: '5521999990000', cidade: 'Guapimirim', uf: 'RJ', cnpj: '11222333000181' });
      // dígito errado: não troca o certo
      expect((await gravarCadastro(b, dono, o, { ...base, cnpj: '11.222.333/0001-82' })).cnpj).toBe('11222333000181');
      // sem o campo (app antigo): fica
      expect((await gravarCadastro(b, dono, o, { ...base, cidade: 'Teresópolis' })).cnpj).toBe('11222333000181');
      // apagado no app: sai
      expect(await gravarCadastro(b, dono, o, { ...base, cnpj: '' })).toMatchObject({ cnpj: null, cidade: 'Guapimirim' });
    }));

  it('o ver_link e a consulta da garantia mostram o CNPJ da oficina do banco, não o dos dados', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Auto Center Serra');
      await gravarCadastro(b, dono, o, { nome: 'Auto Center Serra', cidade: 'Rio', uf: 'RJ', cnpj: '11222333000181' });
      const falso = { oficina: { nome: 'Outra', cnpj: '00000000000000' }, servicos: [] };
      const [h] = await linhas(b, dono, `select public.publicar_link($1, 'historico', 'v1', $2::jsonb, 1095, 'RBA5G44') as r`, [o, JSON.stringify(falso)]);
      const token = (h.r as { token: string }).token;
      const [v] = await linhas(b, null, 'select public.ver_link($1) as v', [token]);
      // (o cadastro sem endereço apaga o endereço, como antes)
      expect((v.v as { oficina: object }).oficina).toEqual({ nome: 'Auto Center Serra', whatsapp: '5521999990000', cidade: 'Rio', uf: 'RJ', endereco: null, linkAvaliacao: null, cnpj: '11222333000181' });
      // o ver_link continua contando as visitas
      await linhas(b, null, 'select public.ver_link($1)', [token]);
      expect((await b.query(`select vistas from public.links_publicos where oficina_id = $1 and tipo = 'historico'`, [o])).rows[0].vistas).toBe(2);

      const [g] = await linhas(b, dono, `select public.publicar_link($1, 'garantia', 'os-1', '{"v":1}'::jsonb, 400, 'rba-5g44') as r`, [o]);
      const codigo = (g.r as { codigo: string }).codigo;
      const [c] = await linhas(b, null, 'select public.garantia_consultar($1, $2) as g', ['RBA5G44', codigo]);
      expect((c.g as { oficina: object; dados: object }).oficina).toEqual({ nome: 'Auto Center Serra', whatsapp: '5521999990000', cidade: 'Rio', uf: 'RJ', cnpj: '11222333000181' });
      expect((c.g as { dados: object }).dados).toEqual({ v: 1 });
    }));

  it('a resposta do cliente é pega por um aparelho só; outra oficina não marca', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outro = await criarPessoa(b, pessoa('outro'));
      const o = await criarOficina(b, dono);
      await criarOficina(b, outro, 'Outra Oficina');
      const [p] = await linhas(b, dono, `select public.publicar_link($1, 'orcamento', 'orc-1', '{"v":1}'::jsonb) as r`, [o]);
      const token = (p.r as { token: string }).token;
      await linhas(b, null, `select public.responder_link($1, '{"acao":"aprovar","recusadas":[],"nome":"Ana","hashAprovado":"${'a'.repeat(64)}"}'::jsonb, '200.1.2.3', 'Celular')`, [token]);
      const [l] = await linhas(b, dono, `select id, resposta from public.links_publicos where oficina_id = $1 and processado_em is null and resposta is not null`, [o]);
      expect(l.resposta).toMatchObject({ acao: 'aprovar', nome: 'Ana', hashAprovado: 'a'.repeat(64), ip: '200.1.2.3', agente: 'Celular' });
      expect((await linhas(b, outro, 'select public.link_processado($1) as ok', [l.id]))[0].ok).toBe(false);
      expect((await linhas(b, dono, 'select public.link_processado($1) as ok', [l.id]))[0].ok).toBe(true);
      // o segundo aparelho chega depois: não aplica de novo
      expect((await linhas(b, dono, 'select public.link_processado($1) as ok', [l.id]))[0].ok).toBe(false);
      expect(await linhas(b, dono, `select id from public.links_publicos where oficina_id = $1 and processado_em is null and resposta is not null`, [o])).toEqual([]);
      expect((await tentar(b, null, 'select public.link_processado($1)', [l.id])).erro).toBeTruthy();
    }));

  it('o tempo real dos links: a migração roda de novo e não quebra sem a publicação', () =>
    emTransacao(async (b) => {
      const sql = readFileSync(MIGRACAO, 'utf8');
      // de novo, com a tabela já na publicação (quando ela existe)
      await b.query(sql);
      await b.query(sql);
      const bloco = sql.slice(sql.lastIndexOf('do $$'));
      expect(bloco).toContain('exception when others');
      // sem a publicação do Supabase (o banco local de testes), segue sem erro
      await b.query(bloco.replaceAll('supabase_realtime', 'publicacao_que_nao_existe'));
      const pub = await b.query(`select 1 from pg_publication where pubname = 'supabase_realtime'`);
      if (pub.rowCount) {
        const t = await b.query(`select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'links_publicos'`);
        expect(t.rowCount).toBe(1);
      }
      // e as funções continuam com os mesmos acessos
      const acessos = await b.query(
        `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('ver_link', 'garantia_consultar', 'link_processado') order by p.proname`
      );
      expect(acessos.rows).toEqual([
        { proname: 'garantia_consultar', anon: true, auth: true },
        { proname: 'link_processado', anon: false, auth: true },
        { proname: 'ver_link', anon: true, auth: true }
      ]);
    }));
});
