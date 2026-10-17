// Placas, FIPE e NPS no banco: só o servidor lê e grava o que fica guardado das consultas, a cota
// de placas é por oficina e por plano, e as respostas do NPS só entram pela função e só a equipe lê.

import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

async function convidarMecanico(b: Banco, dono: Pessoa, oficina: string): Promise<Pessoa> {
  const mec = await criarPessoa(b, pessoa('mec'));
  await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [oficina, mec.email]);
  await linhas(b, mec, 'select public.aceitar_convite()');
  return mec;
}

d('placas já consultadas', () => {
  it('só o servidor lê e grava; ninguém vê a tabela pela API', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const dados = JSON.stringify({ v: 1, dados: { placa: 'TST1A23', marca: 'Fiat' } });
      expect((await tentar(b, dono, `select public.placas_cache_gravar('TST1A23', $1::jsonb)`, [dados])).codigo).toBe('42501');
      expect((await tentar(b, null, `select public.placas_cache_gravar('TST1A23', $1::jsonb)`, [dados])).codigo).toBe('42501');
      expect((await tentar(b, null, `select public.placas_cache_gravar('TST1A23', $1::jsonb)`, [dados], { sistema: true })).erro).toBeNull();
      const [lido] = await linhas(b, null, `select public.placas_cache_ler('tst1a23') as r`, [], { sistema: true });
      expect((lido.r as { dados: { dados: { marca: string } } }).dados.dados.marca).toBe('Fiat');
      expect((await tentar(b, dono, `select public.placas_cache_ler('TST1A23')`)).codigo).toBe('42501');
      expect((await tentar(b, dono, `select * from public.placas_cache`)).codigo).toBe('42501');
      expect((await tentar(b, null, `select * from public.placas_cache`)).codigo).toBe('42501');
      // placa inválida não entra
      expect((await tentar(b, null, `select public.placas_cache_gravar('X', '{}'::jsonb)`, [], { sistema: true })).codigo).toBe('22023');
    }));

  it('vale por 30 dias; o que passou sai na próxima gravação', () =>
    emTransacao(async (b) => {
      const dados = JSON.stringify({ v: 1 });
      await linhas(b, null, `select public.placas_cache_gravar('TST2B34', $1::jsonb)`, [dados], { sistema: true });
      await b.query(`update public.placas_cache set consultado_em = now() - interval '31 days' where placa = 'TST2B34'`);
      const [lido] = await linhas(b, null, `select public.placas_cache_ler('TST2B34') as r`, [], { sistema: true });
      expect(lido.r).toBeNull();
      await linhas(b, null, `select public.placas_cache_gravar('TST3C45', $1::jsonb)`, [dados], { sistema: true });
      expect((await b.query(`select placa from public.placas_cache where placa in ('TST2B34', 'TST3C45')`)).rows).toEqual([{ placa: 'TST3C45' }]);
    }));
});

d('cota de placas', () => {
  it('20 por mês no grátis; a 21ª dá RV090 e não fica gasta; o mecânico também consulta', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const mec = await convidarMecanico(b, dono, o);
      for (let i = 0; i < 19; i++) expect((await tentar(b, dono, 'select public.placas_consumir($1)', [o])).erro).toBeNull();
      const [vigesima] = await linhas(b, mec, 'select public.placas_consumir($1) as r', [o]);
      expect(vigesima.r).toEqual({ plano: 'gratis', usado: 20, limite: 20 });
      const passou = await tentar(b, dono, 'select public.placas_consumir($1)', [o]);
      expect(passou.codigo).toBe('RV090');
      const [uso] = await linhas(b, dono, 'select public.placas_uso_do_mes($1) as r', [o]);
      expect(uso.r).toEqual({ plano: 'gratis', usado: 20, limite: 20 });
    }));

  it('200 no Pro e no teste do Pro', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      await b.query(`update public.oficinas set teste_ate = current_date + 5 where id = $1`, [o]);
      const [t] = await linhas(b, dono, 'select public.placas_uso_do_mes($1) as r', [o]);
      expect(t.r).toMatchObject({ plano: 'teste', limite: 200 });
      await b.query(`update public.oficinas set pro_ate = current_date + 30 where id = $1`, [o]);
      await b.query(`insert into privado.placas_uso (oficina_id, mes, quantidade) values ($1, to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'), 199)`, [o]);
      const [ultima] = await linhas(b, dono, 'select public.placas_consumir($1) as r', [o]);
      expect(ultima.r).toEqual({ plano: 'pro', usado: 200, limite: 200 });
      expect((await tentar(b, dono, 'select public.placas_consumir($1)', [o])).codigo).toBe('RV090');
    }));

  it('quem não é da oficina não gasta nem vê; só o sistema devolve; oficina desativada não consulta', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outro = await criarPessoa(b, pessoa('outro'));
      const o = await criarOficina(b, dono);
      expect((await tentar(b, outro, 'select public.placas_consumir($1)', [o])).codigo).toBe('42501');
      expect((await tentar(b, outro, 'select public.placas_uso_do_mes($1)', [o])).codigo).toBe('42501');
      expect((await tentar(b, null, 'select public.placas_consumir($1)', [o])).codigo).toBe('42501');
      await linhas(b, dono, 'select public.placas_consumir($1)', [o]);
      await linhas(b, null, 'select public.placas_consumir($1)', [o], { sistema: true });
      expect((await tentar(b, dono, 'select public.placas_devolver($1)', [o])).codigo).toBe('42501');
      const [dev] = await linhas(b, null, 'select public.placas_devolver($1) as ok', [o], { sistema: true });
      expect(dev.ok).toBe(true);
      const [uso] = await linhas(b, dono, 'select public.placas_uso_do_mes($1) as r', [o]);
      expect((uso.r as { usado: number }).usado).toBe(1);
      expect((await tentar(b, dono, 'select * from privado.placas_uso')).codigo).toBe('42501');
      await b.query('update public.oficinas set ativa = false where id = $1', [o]);
      expect((await tentar(b, dono, 'select public.placas_consumir($1)', [o])).codigo).toBe('42501');
    }));
});

d('tabela FIPE guardada', () => {
  it('só o servidor; vale no mês e o que é de antes do mês passado sai', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const precos = JSON.stringify([{ codigo: '004478-1', valor: 58000 }]);
      expect((await tentar(b, dono, `select public.fipe_cache_gravar('preco:004478-1', '2026-10', $1::jsonb)`, [precos])).codigo).toBe('42501');
      expect((await tentar(b, dono, `select * from public.fipe_cache`)).codigo).toBe('42501');
      await linhas(b, null, `select public.fipe_cache_gravar('preco:004478-1', '2026-08', $1::jsonb)`, [precos], { sistema: true });
      await linhas(b, null, `select public.fipe_cache_gravar('preco:004478-1', '2026-09', $1::jsonb)`, [precos], { sistema: true });
      await linhas(b, null, `select public.fipe_cache_gravar('preco:004478-1', '2026-10', $1::jsonb)`, [precos], { sistema: true });
      const [lido] = await linhas(b, null, `select public.fipe_cache_ler('preco:004478-1', '2026-10') as r`, [], { sistema: true });
      expect(lido.r).toEqual([{ codigo: '004478-1', valor: 58000 }]);
      const [outroMes] = await linhas(b, null, `select public.fipe_cache_ler('preco:004478-1', '2026-11') as r`, [], { sistema: true });
      expect(outroMes.r).toBeNull();
      expect((await b.query(`select mes from public.fipe_cache where chave = 'preco:004478-1' order by mes`)).rows.map((r) => r.mes)).toEqual(['2026-09', '2026-10']);
      expect((await tentar(b, null, `select public.fipe_cache_gravar('Errada Chave', '2026-10', '{}'::jsonb)`, [], { sistema: true })).codigo).toBe('23514');
    }));
});

d('NPS', () => {
  it('responde pela oficina de que é membro; uma vez a cada 60 dias; ninguém lê a tabela', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outro = await criarPessoa(b, pessoa('outro'));
      const o = await criarOficina(b, dono);
      expect((await tentar(b, outro, 'select public.nps_responder(9, null, $1)', [o])).codigo).toBe('42501');
      expect((await tentar(b, null, 'select public.nps_responder(9, null, $1)', [o])).codigo).toBe('42501');
      expect((await tentar(b, dono, 'select public.nps_responder(11, null, $1)', [o])).codigo).toBe('22023');
      expect((await tentar(b, dono, 'select public.nps_responder(9)')).codigo).toBe('22023');
      const longo = 'x'.repeat(1500);
      expect((await tentar(b, dono, 'select public.nps_responder(9, $2, $1)', [o, `  ${longo}  `])).erro).toBeNull();
      expect((await tentar(b, dono, 'select public.nps_responder(10, null, $1)', [o])).codigo).toBe('RV091');
      const [r] = (await b.query('select user_id, oficina_id, nota, char_length(comentario) as tam from public.nps_respostas where oficina_id = $1', [o])).rows;
      expect(r).toEqual({ user_id: dono.id, oficina_id: o, nota: 9, tam: 1000 });
      expect((await tentar(b, dono, 'select * from public.nps_respostas')).codigo).toBe('42501');
      expect((await tentar(b, dono, `insert into public.nps_respostas (nota) values (10)`)).codigo).toBe('42501');
      // passados 60 dias, responde de novo
      await b.query(`update public.nps_respostas set criado_em = now() - interval '61 days' where user_id = $1`, [dono.id]);
      expect((await tentar(b, dono, `select public.nps_responder(10, '  ', $1)`, [o])).erro).toBeNull();
      expect((await b.query('select comentario from public.nps_respostas where user_id = $1 order by criado_em desc limit 1', [dono.id])).rows[0].comentario).toBeNull();
    }));

  it('pela loja também, sendo membro dela', () =>
    emTransacao(async (b) => {
      const vendedor = await criarPessoa(b, pessoa('loja'));
      const { fornecedorId } = await criarLoja(b, vendedor);
      const estranho = await criarPessoa(b, pessoa('estranho'));
      expect((await tentar(b, estranho, 'select public.nps_responder(8, null, null, $1)', [fornecedorId])).codigo).toBe('42501');
      expect((await tentar(b, vendedor, 'select public.nps_responder(8, null, null, $1)', [fornecedorId])).erro).toBeNull();
    }));

  it('pergunta depois de 30 dias na oficina e de novo 90 depois de responder ou dispensar', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const outro = await criarPessoa(b, pessoa('outro'));
      const o = await criarOficina(b, dono);
      const pendente = async (p: Pessoa) => ((await linhas(b, p, 'select public.nps_pendente($1) as r', [o]))[0].r as { perguntar: boolean }).perguntar;
      expect(await pendente(dono)).toBe(false);
      expect(await pendente(outro)).toBe(false);
      await b.query(`update public.oficina_membros set criado_em = now() - interval '31 days' where oficina_id = $1`, [o]);
      expect(await pendente(dono)).toBe(true);
      await linhas(b, dono, 'select public.nps_dispensar()');
      expect(await pendente(dono)).toBe(false);
      await b.query(`update privado.nps_dispensas set dispensado_em = now() - interval '91 days' where user_id = $1`, [dono.id]);
      expect(await pendente(dono)).toBe(true);
      await linhas(b, dono, 'select public.nps_responder(7, null, $1)', [o]);
      expect(await pendente(dono)).toBe(false);
      await b.query(`update public.nps_respostas set criado_em = now() - interval '90 days 1 minute' where user_id = $1`, [dono.id]);
      expect(await pendente(dono)).toBe(true);
      expect((await tentar(b, null, 'select public.nps_dispensar()')).codigo).toBe('42501');
    }));

  it('o resumo é só da equipe: NPS, mês a mês, notas e comentários com o nome da oficina', () =>
    emTransacao(async (b) => {
      const equipe = await criarPessoa(b, pessoa('eq', { totpHa: 60 }));
      await criarEquipe(b, equipe, 'suporte');
      const semApp = await criarPessoa(b, pessoa('eq2'));
      await criarEquipe(b, semApp, 'admin');
      const donos = await Promise.all(['a', 'b', 'c', 'd'].map((n) => criarPessoa(b, pessoa(`dono-${n}`))));
      const oficinas: string[] = [];
      for (const [i, p] of donos.entries()) oficinas.push(await criarOficina(b, p, `Oficina NPS ${i}`));
      // o resumo conta todas as respostas do banco: compara antes e depois
      const resumo = async () => (await linhas(b, equipe, 'select public.nps_resumo(3) as r'))[0].r as {
        total: { respostas: number; promotores: number; neutros: number; detratores: number; nps: number | null };
        meses: { mes: string; respostas: number }[];
        notas: { nota: number; respostas: number }[];
        comentarios: { nota: number; comentario: string; oficina: string | null }[];
      };
      const antes = await resumo();
      await linhas(b, donos[0], `select public.nps_responder(10, 'Ótimo app', $1)`, [oficinas[0]]);
      await linhas(b, donos[1], 'select public.nps_responder(9, null, $1)', [oficinas[1]]);
      await linhas(b, donos[2], 'select public.nps_responder(8, null, $1)', [oficinas[2]]);
      await linhas(b, donos[3], `select public.nps_responder(3, 'Falta boleto', $1)`, [oficinas[3]]);
      // na mesma transação o relógio não anda: o primeiro comentário fica um minuto antes
      await b.query(`update public.nps_respostas set criado_em = now() - interval '1 minute' where user_id = $1`, [donos[0].id]);
      const depois = await resumo();
      expect(depois.total.respostas - antes.total.respostas).toBe(4);
      expect(depois.total.promotores - antes.total.promotores).toBe(2);
      expect(depois.total.neutros - antes.total.neutros).toBe(1);
      expect(depois.total.detratores - antes.total.detratores).toBe(1);
      expect(depois.meses).toHaveLength(3);
      expect(depois.meses.at(-1)!.respostas - antes.meses.at(-1)!.respostas).toBe(4);
      expect(depois.comentarios.slice(0, 2).map((c) => [c.nota, c.comentario, c.oficina])).toEqual([
        [3, 'Falta boleto', 'Oficina NPS 3'],
        [10, 'Ótimo app', 'Oficina NPS 0']
      ]);
      const n10 = (r: typeof depois) => r.notas.find((x) => x.nota === 10)?.respostas ?? 0;
      expect(n10(depois) - n10(antes)).toBe(1);
      // sem o app autenticador, mesmo admin não vê; dono de oficina não vê
      expect((await tentar(b, semApp, 'select public.nps_resumo(3)')).codigo).toBe('42501');
      expect((await tentar(b, donos[0], 'select public.nps_resumo(3)')).codigo).toBe('42501');
      expect((await tentar(b, null, 'select public.nps_resumo(3)')).codigo).toBe('42501');
    }));

  it('o NPS do resumo bate com a conta (só as respostas desta transação)', () =>
    emTransacao(async (b) => {
      const equipe = await criarPessoa(b, pessoa('eq', { totpHa: 60 }));
      await criarEquipe(b, equipe, 'financeiro');
      // começa sem nenhuma outra resposta (desfeito no fim do teste)
      await b.query('delete from public.nps_respostas');
      const notas = [10, 10, 9, 7, 6, 2, 0, 9];
      for (const [i, nota] of notas.entries()) {
        const p = await criarPessoa(b, pessoa(`p${i}`));
        const o = await criarOficina(b, p, `Oficina ${i}`);
        await linhas(b, p, 'select public.nps_responder($2, null, $1)', [o, nota]);
      }
      const [r] = await linhas(b, equipe, 'select public.nps_resumo(1) as r');
      // 4 promotores, 1 neutro, 3 detratores em 8: (4 - 3) / 8 = 12,5% vira 13
      expect((r.r as { total: object }).total).toEqual({ respostas: 8, promotores: 4, neutros: 1, detratores: 3, nps: 13 });
    }));
});
