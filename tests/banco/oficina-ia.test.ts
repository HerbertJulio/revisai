import { afterAll, describe, expect, it } from 'vitest';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

d('cota da IA por ordem', () => {
  it('a mesma ordem gasta uma vez; devolver solta a chave para a próxima tentativa', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const gastar = async (chave: string | null) => (await linhas(b, dono, `select public.consumir_cota($1, 'montagem', 1, $2) as r`, [o, chave]))[0].r as { usado: number; repetida: boolean };
      expect(await gastar('ordem-1')).toMatchObject({ usado: 1, repetida: false });
      expect(await gastar('ordem-1')).toMatchObject({ usado: 1, repetida: true });
      expect(await gastar('ordem-2')).toMatchObject({ usado: 2, repetida: false });
      // a IA falhou na ordem 2: o servidor devolve e a ordem 2 pode gastar de novo
      expect((await linhas(b, null, `select public.devolver_cota($1, 'montagem', 1, 'ordem-2') as ok`, [o], { sistema: true }))[0].ok).toBe(true);
      expect((await linhas(b, null, `select public.devolver_cota($1, 'montagem', 1, 'ordem-2') as ok`, [o], { sistema: true }))[0].ok).toBe(false);
      expect(await gastar('ordem-2')).toMatchObject({ usado: 2, repetida: false });
      // sem chave, cada chamada conta (a transcrição de cada áudio)
      for (let i = 0; i < 3; i++) await linhas(b, dono, `select public.consumir_cota($1, 'transcricao')`, [o]);
      expect((await linhas(b, dono, `select quantidade from public.uso_mensal where oficina_id = $1 and recurso = 'transcricao'`, [o]))[0].quantidade).toBe(3);
      // recurso desconhecido não passa
      expect((await tentar(b, dono, `select public.consumir_cota($1, 'outra coisa')`, [o])).codigo).toBe('22023');
      // a oficina não limpa as chaves; o sistema sim
      expect((await tentar(b, dono, 'select public.limpar_uso_chaves()')).codigo).toBe('42501');
      expect((await tentar(b, null, 'select public.limpar_uso_chaves()', [], { sistema: true })).erro).toBeNull();
    }));

  it('a mesma chave gasta de novo a cada 5 preenchimentos (não vira passe livre)', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const gastar = async () => (await linhas(b, dono, `select public.consumir_cota($1, 'montagem', 1, 'mesma') as r`, [o]))[0].r as { usado: number; repetida: boolean };
      const vezes = [];
      for (let i = 0; i < 11; i++) vezes.push(await gastar());
      expect(vezes.map((v) => v.repetida)).toEqual([false, true, true, true, true, false, true, true, true, true, false]);
      expect(vezes.at(-1)).toMatchObject({ usado: 3 });
      // o membro não devolve cota (só o servidor)
      expect((await tentar(b, dono, `select public.devolver_cota($1, 'montagem', 1, 'mesma')`, [o])).codigo).toBe('42501');
    }));

  it('no limite do grátis, a sexta ordem falha sem gastar e sem guardar a chave', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      for (let i = 0; i < 5; i++) await linhas(b, dono, `select public.consumir_cota($1, 'montagem', 1, $2)`, [o, `ordem-${i}`]);
      expect((await tentar(b, dono, `select public.consumir_cota($1, 'montagem', 1, 'ordem-5')`, [o])).codigo).toBe('RV040');
      // a chave da sexta não ficou (a transação desfez): ela ainda conta como nova se o plano mudar
      await b.query(`update public.oficinas set teste_ate = current_date + 5 where id = $1`, [o]);
      expect((await linhas(b, dono, `select public.consumir_cota($1, 'montagem', 1, 'ordem-5') as r`, [o]))[0].r).toMatchObject({ usado: 6, repetida: false, plano: 'teste' });
    }));
});

d('agente do WhatsApp', () => {
  it('liga o número pelo código uma vez só, e só o sistema faz isso', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Oficina do Agente');
      const [g] = await linhas(b, dono, 'select public.whatsapp_gerar_codigo($1) as c', [o]);
      const codigo = String(g.c);
      expect(codigo).toMatch(/^\d{8}$/);
      // a oficina não liga números direto (só pelo WhatsApp, pelo sistema)
      expect((await tentar(b, dono, `select public.whatsapp_vincular('5521988887777', $1)`, [codigo])).erro).toBeTruthy();
      expect((await linhas(b, null, `select public.whatsapp_vincular('5521988887777', '00000000') as r`, [], { sistema: true }))[0].r).toBeNull();
      const [v] = await linhas(b, null, `select public.whatsapp_vincular('5521988887777', $1) as r`, [codigo], { sistema: true });
      expect(v.r).toEqual({ oficinaId: o, oficina: 'Oficina do Agente' });
      // o código já foi usado
      expect((await linhas(b, null, `select public.whatsapp_vincular('5521977776666', $1) as r`, [codigo], { sistema: true }))[0].r).toBeNull();
      // o contexto traz o plano (grátis aqui)
      const [ctx] = await linhas(b, null, `select public.whatsapp_contexto('5521988887777') as r`, [], { sistema: true });
      expect(ctx.r).toEqual({ oficinaId: o, oficina: 'Oficina do Agente', plano: 'gratis' });
      // a oficina vê o número ligado e pode desligar
      expect(await linhas(b, dono, 'select telefone from public.whatsapp_vinculos where oficina_id = $1', [o])).toEqual([{ telefone: '5521988887777' }]);
      expect((await tentar(b, dono, `delete from public.whatsapp_vinculos where telefone = '5521988887777'`)).erro).toBeNull();
      expect((await linhas(b, null, `select public.whatsapp_contexto('5521988887777') as r`, [], { sistema: true }))[0].r).toBeNull();
    }));

  it('código vencido não liga; outra oficina não vê o número', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outra = await criarPessoa(b, pessoa('outra'));
      const o = await criarOficina(b, dono);
      await criarOficina(b, outra);
      const [g] = await linhas(b, dono, 'select public.whatsapp_gerar_codigo($1) as c', [o]);
      await b.query(`update public.whatsapp_codigos set expira_em = now() - interval '1 minute' where codigo = $1`, [g.c]);
      expect((await linhas(b, null, `select public.whatsapp_vincular('5521988887777', $1) as r`, [g.c], { sistema: true }))[0].r).toBeNull();
      const [g2] = await linhas(b, dono, 'select public.whatsapp_gerar_codigo($1) as c', [o]);
      await linhas(b, null, `select public.whatsapp_vincular('5521988887777', $1)`, [g2.c], { sistema: true });
      expect(await linhas(b, outra, `select * from public.whatsapp_vinculos where telefone = '5521988887777'`)).toEqual([]);
      expect((await tentar(b, outra, `delete from public.whatsapp_vinculos where telefone = '5521988887777' returning telefone`)).linhas).toEqual([]);
    }));
});
