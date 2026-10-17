import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

d('cotas da IA', () => {
  it('grátis monta 5 ordens no mês; Pro, 300; a cota é por oficina', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outra = await criarPessoa(b, pessoa('outra'));
      const o = await criarOficina(b, dono);
      for (let i = 0; i < 5; i++) expect((await tentar(b, dono, `select public.consumir_cota($1, 'montagem')`, [o])).erro).toBeNull();
      const sexto = await tentar(b, dono, `select public.consumir_cota($1, 'montagem')`, [o]);
      expect(sexto.codigo).toBe('RV040');
      // a sexta não ficou gasta
      expect((await linhas(b, dono, `select quantidade from public.uso_mensal where oficina_id = $1`, [o]))[0].quantidade).toBe(5);
      await b.query(`update public.oficinas set pro_ate = current_date + 10 where id = $1`, [o]);
      expect((await tentar(b, dono, `select public.consumir_cota($1, 'montagem')`, [o])).erro).toBeNull();
      // outra pessoa não gasta a cota da oficina
      expect((await tentar(b, outra, `select public.consumir_cota($1, 'montagem')`, [o])).codigo).toBe('42501');
      // só o sistema devolve
      expect((await tentar(b, dono, `select public.devolver_cota($1, 'montagem')`, [o])).codigo).toBe('42501');
      expect((await tentar(b, null, `select public.devolver_cota($1, 'montagem')`, [o], { sistema: true })).erro).toBeNull();
    }));

  it('o limite contra abuso conta por janela e só o sistema usa', () =>
    emTransacao(async (b) => {
      const p = await criarPessoa(b, pessoa('p'));
      expect((await tentar(b, p, `select public.limite_consumir('x', 2, 60)`)).erro).toBeTruthy();
      const r = [];
      for (let i = 0; i < 3; i++) r.push((await linhas(b, null, `select public.limite_consumir('ip:1.2.3.4:teste', 2, 60) as ok`, [], { sistema: true }))[0].ok);
      expect(r).toEqual([true, true, false]);
      expect((await linhas(b, null, `select public.limite_esgotado('ip:1.2.3.4:teste', 2, 60) as e`, [], { sistema: true }))[0].e).toBe(true);
    }));
});

d('links do cliente', () => {
  it('orçamento: publica, o cliente vê e aprova uma vez, com prova; outra oficina não mexe', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outra = await criarPessoa(b, pessoa('outra'));
      const o = await criarOficina(b, dono);
      const o2 = await criarOficina(b, outra);
      const [pub] = await linhas(b, dono, `select public.publicar_link($1, 'orcamento', 'doc-1', $2::jsonb) as r`, [o, JSON.stringify({ total: 350, linhas: [{ id: 'l1' }] })]);
      const token = (pub.r as { token: string }).token;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [ver] = await linhas(b, null, 'select public.ver_link($1) as v', [token]);
      expect((ver.v as { dados: { total: number }; oficina: { nome: string } }).dados.total).toBe(350);
      expect((ver.v as { oficina: { nome: string } }).oficina.nome).toBe('Oficina Teste');
      // responder com ação inválida não vale
      expect((await tentar(b, null, `select public.responder_link($1, '{"acao":"assinar"}'::jsonb)`, [token], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, `select public.responder_link($1, '{"acao":"aprovar","recusadas":[]}'::jsonb, '200.1.2.3', 'Celular')`, [token], { sistema: true })).erro).toBeNull();
      expect((await tentar(b, null, `select public.responder_link($1, '{"acao":"recusar"}'::jsonb)`, [token], { sistema: true })).codigo).toBe('RV051');
      const [l] = await linhas(b, dono, `select resposta from public.links_publicos where oficina_id = $1`, [o]);
      expect(l.resposta).toMatchObject({ acao: 'aprovar', ip: '200.1.2.3', agente: 'Celular' });
      expect((l.resposta as { hashDoQueViu: string }).hashDoQueViu).toMatch(/^[0-9a-f]{64}$/);
      // a outra oficina não vê nem publica no lugar
      expect(await linhas(b, outra, 'select * from public.links_publicos where oficina_id = $1', [o])).toEqual([]);
      expect((await tentar(b, outra, `select public.publicar_link($1, 'orcamento', 'doc-1', '{}'::jsonb)`, [o])).codigo).toBe('42501');
      expect(o2).toBeTruthy();
      // revogado, some
      await linhas(b, dono, `select public.revogar_link($1, 'orcamento', 'doc-1')`, [o]);
      expect((await linhas(b, null, 'select public.ver_link($1) as v', [token]))[0].v).toBeNull();
    }));

  it('garantia: consulta pela placa só com o código do certificado', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const [pub] = await linhas(b, dono, `select public.publicar_link($1, 'garantia', 'os-9', '{"servico":"Freios"}'::jsonb, 90, 'abc-1d23') as r`, [o]);
      const codigo = (pub.r as { codigo: string }).codigo;
      expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect((await linhas(b, null, `select public.garantia_consultar('ABC1D23', 'ZZZZZZ') as g`))[0].g).toBeNull();
      const [g] = await linhas(b, null, `select public.garantia_consultar('abc1d23', $1) as g`, [codigo.toLowerCase()]);
      expect((g.g as { dados: { servico: string } }).dados.servico).toBe('Freios');
    }));
});

d('termos e titulares', () => {
  it('termos pendentes até aceitar a versão atual; dono de oficina aceita o tratamento de dados', () =>
    emTransacao(async (b) => {
      const p = await criarPessoa(b, pessoa('p'));
      expect((await linhas(b, p, 'select public.termos_pendentes() as t'))[0].t).toEqual(['privacidade', 'termos']);
      await criarOficina(b, p);
      expect((await linhas(b, p, 'select public.termos_pendentes() as t'))[0].t).toEqual(['privacidade', 'termos', 'tratamento_dados']);
      await linhas(b, p, `select public.aceitar_termos(array['termos','privacidade','tratamento_dados'], '1.1.1.1', 'Chrome')`);
      expect((await linhas(b, p, 'select public.termos_pendentes() as t'))[0].t).toEqual([]);
    }));

  it('a equipe exporta e apaga os dados de um titular, com registro', () =>
    emTransacao(async (b) => {
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 30 }));
      await criarEquipe(b, sup, 'suporte');
      const zé = await criarPessoa(b, pessoa('ze'));
      await b.query(`insert into public.interessados (tipo, nome, email, consentimento) values ('oficina', 'Zé', $1, true)`, [zé.email]);
      const [ex] = await linhas(b, sup, 'select public.titular_exportar($1) as r', [zé.email]);
      expect((ex.r as { cadastros: unknown[] }).cadastros).toHaveLength(1);
      expect((await tentar(b, zé, 'select public.titular_exportar($1)', [zé.email])).codigo).toBe('42501');
      const [ap] = await linhas(b, sup, 'select public.titular_apagar($1) as r', [zé.email]);
      expect(ap.r).toEqual({ cadastros: 1, conta: true });
      expect((await b.query('select count(*)::int as n from auth.users where id = $1', [zé.id])).rows[0].n).toBe(0);
      const acoes = (await b.query(`select acao from privado.auditoria where user_id = $1 order by id`, [sup.id])).rows.map((r) => r.acao);
      expect(acoes).toEqual(['exportou_titular', 'delete', 'apagou_titular']);
    }));

  it('a rotina diária só roda pelo sistema e apaga o que venceu', () =>
    emTransacao(async (b) => {
      const p = await criarPessoa(b, pessoa('p'));
      const o = await criarOficina(b, p);
      await b.query(`update public.oficinas set excluir_em = now() - interval '1 day' where id = $1`, [o]);
      await b.query(`insert into privado.acessos (quando, ip) values (now() - interval '7 months', '1.1.1.1'), (now(), '2.2.2.2')`);
      expect((await tentar(b, p, 'select public.rotina_diaria()')).codigo).toBe('42501');
      const [r] = await linhas(b, null, 'select public.rotina_diaria() as r', [], { sistema: true });
      expect(r.r).toMatchObject({ oficinas: 1, acessos: 1 });
      expect((await b.query('select count(*)::int as n from public.oficinas where id = $1', [o])).rows[0].n).toBe(0);
    }));
});
