import { afterAll, describe, expect, it } from 'vitest';
import { como, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

afterAll(fechar);

const SEMANA_TODA = Array.from({ length: 7 }, () => [{ inicio: '08:00', fim: '12:00' }]);
const CONFIG = { semana: SEMANA_TODA, intervaloMin: 30, vagas: 1, diasAFrente: 30, antecedenciaHoras: 0, servicos: ['Troca de óleo', 'Revisão'], mensagem: 'Chegue 10 minutos antes.' };
const OITO_HORARIOS = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];

/** O dia de hoje mais n, no relógio de Brasília (o mesmo das funções da agenda). */
async function dia(b: Banco, n: number): Promise<string> {
  const r = await b.query(`select to_char((now() at time zone 'America/Sao_Paulo')::date + $1::integer, 'YYYY-MM-DD') as d`, [n]);
  return String(r.rows[0].d);
}

async function publicar(b: Banco, p: Pessoa, oficina: string, config: object = CONFIG, ativo = true): Promise<string> {
  const [r] = await linhas(b, p, 'select public.agenda_publicar($1, $2, $3::jsonb) as slug', [oficina, ativo, JSON.stringify(config)]);
  return String(r.slug);
}

async function horarios(b: Banco, slug: string, de: string, ate: string = de): Promise<Record<string, string[]>> {
  const r = await como(b, null, () => b.query('select public.agenda_horarios($1, $2::date, $3::date) as r', [slug, de, ate]));
  const lista = r.rows[0].r as { data: string; horas: string[] }[] | null;
  return Object.fromEntries((lista ?? []).map((x) => [x.data, x.horas]));
}

interface Pedido {
  data: string;
  hora: string;
  nome?: string;
  telefone?: string;
  placa?: string | null;
  servico?: string;
  observacao?: string | null;
  consentimento?: boolean;
}

async function pedir(b: Banco, slug: string, p: Pedido, ip = '198.51.100.1'): Promise<{ r: { id: string; repetido?: boolean } | null; codigo: string | null }> {
  try {
    const r = await como(
      b,
      null,
      () =>
        b.query('select public.agenda_pedir($1, $2::date, $3, $4, $5, $6, $7, $8, $9) as r', [
          slug,
          p.data,
          p.hora,
          p.nome ?? 'Maria Souza',
          p.telefone ?? '(21) 98765-4321',
          'placa' in p ? p.placa : 'abc-1d23',
          p.servico ?? 'Troca de óleo',
          p.observacao ?? null,
          p.consentimento ?? true
        ]),
      { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }
    );
    return { r: r.rows[0].r, codigo: null };
  } catch (e) {
    return { r: null, codigo: (e as { code?: string }).code ?? 'erro' };
  }
}

async function gravar(b: Banco, p: Pessoa, oficina: string, itens: object[]) {
  await linhas(b, p, 'select public.gravar_registros($1, $2::jsonb)', [oficina, JSON.stringify(itens)]);
}

async function responder(b: Banco, p: Pessoa, id: string, situacao: string, agendamentoId: string | null = null) {
  return tentar(b, p, 'select public.agenda_responder($1, $2, $3) as r', [id, situacao, agendamentoId]);
}

async function membro(b: Banco, dono: Pessoa, oficina: string, papel: 'gerente' | 'mecanico'): Promise<Pessoa> {
  const p = await criarPessoa(b, pessoa(papel));
  await linhas(b, dono, `select public.convidar('oficina', $1, $2, $3)`, [oficina, p.email, papel]);
  await linhas(b, p, 'select public.aceitar_convite()');
  return p;
}

describe.skipIf(!temBanco)('agendamento pelo link', () => {
  it('a oficina liga o link; só dono e gerente mudam', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Oficina do Zé');
      const slug = await publicar(b, dono, o);
      expect(slug).toMatch(/^[a-z0-9]{10}$/);
      // de novo: o mesmo endereço
      expect(await publicar(b, dono, o, { ...CONFIG, vagas: 2 })).toBe(slug);
      const gerente = await membro(b, dono, o, 'gerente');
      expect(await publicar(b, gerente, o)).toBe(slug);
      const mec = await membro(b, dono, o, 'mecanico');
      expect((await tentar(b, mec, 'select public.agenda_publicar($1, true, $2::jsonb)', [o, JSON.stringify(CONFIG)])).codigo).toBe('42501');
      const outro = await criarPessoa(b, pessoa('outro'));
      await criarOficina(b, outro, 'Outra');
      expect((await tentar(b, outro, 'select public.agenda_publicar($1, true, $2::jsonb)', [o, JSON.stringify(CONFIG)])).codigo).toBe('42501');
      // configuração que não vale
      for (const ruim of [{ ...CONFIG, semana: SEMANA_TODA.slice(1) }, { ...CONFIG, intervaloMin: 3 }, { ...CONFIG, vagas: 'dois' }, { ...CONFIG, folgas: ['2026-02-30'] }, { ...CONFIG, semana: [[{ inicio: '12:00', fim: '08:00' }], ...SEMANA_TODA.slice(1)] }]) {
        expect((await tentar(b, dono, 'select public.agenda_publicar($1, true, $2::jsonb)', [o, JSON.stringify(ruim)])).codigo).toBe('22023');
      }
      // a oficina vê o próprio link; outra oficina e o anônimo não
      expect(await linhas(b, mec, 'select slug from public.agenda_publica where oficina_id = $1', [o])).toEqual([{ slug }]);
      expect(await linhas(b, outro, 'select slug from public.agenda_publica where oficina_id = $1', [o])).toEqual([]);
      expect((await tentar(b, null, 'select slug from public.agenda_publica')).codigo).toBe('42501');
      const [cfg] = await linhas(b, dono, 'select config from public.agenda_publica where oficina_id = $1', [o]);
      expect(cfg.config).toMatchObject({ intervaloMin: 30, vagas: 1, diasAFrente: 30, antecedenciaHoras: 0, servicos: ['Troca de óleo', 'Revisão'], folgas: [], fuso: 'America/Sao_Paulo' });
    }));

  it('o cliente vê a oficina e os horários livres, sem dados pessoais', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Oficina do Zé');
      const slug = await publicar(b, dono, o);
      const [v] = await linhas(b, null, 'select public.agenda_ver($1) as r', [slug]);
      const ver = v.r as Record<string, unknown>;
      expect(ver).toMatchObject({ oficina: { nome: 'Oficina do Zé', cidade: 'Rio', uf: 'RJ', endereco: 'Rua A, 1' }, config: { servicos: ['Troca de óleo', 'Revisão'], mensagem: 'Chegue 10 minutos antes.' } });
      expect(JSON.stringify(ver)).not.toContain('5521999990000');
      expect(JSON.stringify(ver)).not.toContain('@teste.dev');
      const d = await dia(b, 2);
      expect((await horarios(b, slug, d))[d]).toEqual(OITO_HORARIOS);
      // código errado ou link desligado: nada
      expect((await linhas(b, null, 'select public.agenda_ver($1) as r', ['naoexiste00']))[0].r).toBeNull();
      await publicar(b, dono, o, CONFIG, false);
      expect((await linhas(b, null, 'select public.agenda_ver($1) as r', [slug]))[0].r).toBeNull();
      expect((await linhas(b, null, 'select public.agenda_horarios($1) as r', [slug]))[0].r).toBeNull();
      expect((await pedir(b, slug, { data: d, hora: '08:00' })).codigo).toBe('RV070');
    }));

  it('os horários livres descontam a agenda da oficina e os pedidos abertos', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const slug = await publicar(b, dono, o);
      const d = await dia(b, 2);
      await gravar(b, dono, o, [
        { colecao: 'agendamentos', id: 'ag-1', dados: { id: 'ag-1', data: d, hora: '08:00', duracaoMin: 60, servico: 'Revisão', situacao: 'marcado' } },
        { colecao: 'agendamentos', id: 'ag-2', dados: { id: 'ag-2', data: d, hora: '10:00', duracaoMin: 30, servico: 'Revisão', situacao: 'cancelado' } },
        { colecao: 'agendamentos', id: 'ag-3', dados: { id: 'ag-3', data: d, hora: '11:00', servico: 'Revisão', situacao: 'faltou' } },
        { colecao: 'agendamentos', id: 'ag-4', dados: { id: 'ag-4', data: d, hora: '11:30', servico: 'Revisão', situacao: 'confirmado' } },
        { colecao: 'agendamentos', id: 'ag-5', dados: { id: 'ag-5', data: d, hora: '10:30', servico: 'Revisão', situacao: 'marcado' }, apagado: true }
      ]);
      expect((await horarios(b, slug, d))[d]).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
      expect((await pedir(b, slug, { data: d, hora: '09:00' })).codigo).toBeNull();
      expect((await horarios(b, slug, d))[d]).toEqual(['09:30', '10:00', '10:30', '11:00']);
      // o horário tomado não sai de novo
      expect((await pedir(b, slug, { data: d, hora: '08:30', telefone: '21911112222' }, '198.51.100.2')).codigo).toBe('RV071');
      expect((await pedir(b, slug, { data: d, hora: '09:00', telefone: '21911112222' }, '198.51.100.2')).codigo).toBe('RV071');
      // outra oficina com o mesmo dia não interfere
      const outro = await criarPessoa(b, pessoa('outro'));
      const o2 = await criarOficina(b, outro, 'Outra');
      const slug2 = await publicar(b, outro, o2);
      expect((await horarios(b, slug2, d))[d]).toEqual(OITO_HORARIOS);
    }));

  it('respeita as vagas, a grade, a antecedência, os dias a frente e as folgas', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const d = await dia(b, 2);
      const folga = await dia(b, 3);
      const slug = await publicar(b, dono, o, { ...CONFIG, vagas: 2, folgas: [folga] });
      expect((await pedir(b, slug, { data: d, hora: '10:00', telefone: '21900000001' }, '198.51.100.11')).codigo).toBeNull();
      expect((await horarios(b, slug, d))[d]).toContain('10:00');
      expect((await pedir(b, slug, { data: d, hora: '10:00', telefone: '21900000002' }, '198.51.100.12')).codigo).toBeNull();
      expect((await horarios(b, slug, d))[d]).not.toContain('10:00');
      expect((await pedir(b, slug, { data: d, hora: '10:00', telefone: '21900000003' }, '198.51.100.13')).codigo).toBe('RV071');
      // fora da grade
      expect((await pedir(b, slug, { data: d, hora: '10:15' })).codigo).toBe('RV071');
      expect((await pedir(b, slug, { data: d, hora: '12:00' })).codigo).toBe('RV071');
      // folga e longe demais
      expect((await horarios(b, slug, folga))[folga]).toBeUndefined();
      expect((await pedir(b, slug, { data: folga, hora: '08:00' })).codigo).toBe('RV071');
      expect((await pedir(b, slug, { data: await dia(b, 31), hora: '08:00' })).codigo).toBe('RV071');
      expect(Object.keys(await horarios(b, slug, await dia(b, 0), await dia(b, 90)))).not.toContain(await dia(b, 31));
      // ontem nunca
      expect((await pedir(b, slug, { data: await dia(b, -1), hora: '08:00' })).codigo).toBe('RV071');
      // com 3 dias de antecedência, depois de amanhã não dá
      await publicar(b, dono, o, { ...CONFIG, antecedenciaHoras: 72 });
      expect(await horarios(b, slug, d)).toEqual({});
      expect((await pedir(b, slug, { data: d, hora: '11:00' })).codigo).toBe('RV071');
    }));

  it('pede o consentimento e confere os dados; o toque duplo não cria dois pedidos', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const slug = await publicar(b, dono, o);
      const d = await dia(b, 2);
      expect((await pedir(b, slug, { data: d, hora: '08:00', consentimento: false })).codigo).toBe('RV073');
      expect((await pedir(b, slug, { data: d, hora: '08:00', telefone: '1234' })).codigo).toBe('22023');
      expect((await pedir(b, slug, { data: d, hora: '08:00', nome: ' ' })).codigo).toBe('22023');
      expect((await pedir(b, slug, { data: d, hora: '08:00', placa: 'AB12' })).codigo).toBe('22023');
      expect((await pedir(b, slug, { data: d, hora: '08:00', servico: 'Pintura' })).codigo).toBe('22023');
      expect((await pedir(b, slug, { data: d, hora: '08:00', observacao: 'x'.repeat(301) })).codigo).toBe('22023');
      const um = await pedir(b, slug, { data: d, hora: '08:00', placa: null, observacao: ' Barulho no freio ' });
      expect(um.codigo).toBeNull();
      const dois = await pedir(b, slug, { data: d, hora: '08:00', placa: null });
      expect(dois.r).toMatchObject({ id: um.r!.id, repetido: true });
      const rows = await linhas(b, dono, 'select nome, telefone, placa, servico, observacao, situacao, duracao_min, consentimento from public.agendamentos_online where oficina_id = $1', [o]);
      expect(rows).toEqual([{ nome: 'Maria Souza', telefone: '5521987654321', placa: null, servico: 'Troca de óleo', observacao: 'Barulho no freio', situacao: 'novo', duracao_min: 30, consentimento: true }]);
    }));

  it('outra oficina não lê os pedidos; só quem é da oficina responde', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const slug = await publicar(b, dono, o);
      const d = await dia(b, 2);
      const { r } = await pedir(b, slug, { data: d, hora: '08:00' });
      const outro = await criarPessoa(b, pessoa('outro'));
      await criarOficina(b, outro, 'Outra');
      expect(await linhas(b, outro, 'select id from public.agendamentos_online where id = $1', [r!.id])).toEqual([]);
      expect((await responder(b, outro, r!.id, 'aceito', 'x')).codigo).toBe('42501');
      expect((await tentar(b, null, 'select id from public.agendamentos_online')).codigo).toBe('42501');
      expect((await tentar(b, dono, `update public.agendamentos_online set situacao = 'aceito' where id = $1`, [r!.id])).codigo).toBe('42501');
      expect((await tentar(b, dono, `insert into public.agendamentos_online (oficina_id, data, hora, duracao_min, nome, telefone, servico, consentimento) values ($1, $2, '09:00', 30, 'Fulano', '5521911112222', 'Revisão', true)`, [o, d])).codigo).toBe('42501');
      // o mecânico da oficina vê e responde
      const mec = await membro(b, dono, o, 'mecanico');
      expect(await linhas(b, mec, 'select id from public.agendamentos_online where id = $1', [r!.id])).toEqual([{ id: r!.id }]);
      const resp = await responder(b, mec, r!.id, 'recusado');
      expect(resp.codigo).toBeNull();
      expect(resp.linhas[0].r).toMatchObject({ situacao: 'recusado', agendamentoId: null });
      // recusado é final, e libera o horário
      expect((await responder(b, dono, r!.id, 'aceito', 'x')).codigo).toBe('RV074');
      expect((await horarios(b, slug, d))[d]).toContain('08:00');
      expect((await responder(b, dono, r!.id, 'qualquer')).codigo).toBe('22023');
    }));

  it('o pedido aceito segura a vaga uma vez só, antes e depois de entrar na agenda', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const slug = await publicar(b, dono, o);
      const d = await dia(b, 2);
      const { r } = await pedir(b, slug, { data: d, hora: '10:00' });
      const aceito = await responder(b, dono, r!.id, 'aceito', 'ag-online-1');
      expect(aceito.linhas[0].r).toMatchObject({ situacao: 'aceito', agendamentoId: 'ag-online-1' });
      // outro aparelho aceita de novo: vale o primeiro agendamento
      expect((await responder(b, dono, r!.id, 'aceito', 'ag-outro')).linhas[0].r).toMatchObject({ agendamentoId: 'ag-online-1' });
      expect((await horarios(b, slug, d))[d]).not.toContain('10:00');
      // o agendamento chega à agenda (sincronia): continua um carro só às 10h
      await gravar(b, dono, o, [{ colecao: 'agendamentos', id: 'ag-online-1', dados: { id: 'ag-online-1', data: d, hora: '10:00', duracaoMin: 30, situacao: 'confirmado', origem: 'online', pedidoOnlineId: r!.id } }]);
      await publicar(b, dono, o, { ...CONFIG, vagas: 2 });
      expect((await horarios(b, slug, d))[d]).toContain('10:00');
      await publicar(b, dono, o, CONFIG);
      expect((await horarios(b, slug, d))[d]).not.toContain('10:00');
      // a oficina mudou o horário na agenda: vale o da agenda
      await gravar(b, dono, o, [{ colecao: 'agendamentos', id: 'ag-online-1', dados: { id: 'ag-online-1', data: d, hora: '11:00', duracaoMin: 30, situacao: 'confirmado', origem: 'online' } }]);
      const livres = (await horarios(b, slug, d))[d];
      expect(livres).toContain('10:00');
      expect(livres).not.toContain('11:00');
      // e cancelar depois de aceito pode
      expect((await responder(b, dono, r!.id, 'cancelado')).linhas[0].r).toMatchObject({ situacao: 'cancelado' });
    }));

  it('limita os pedidos por IP e por oficina por dia', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const slug = await publicar(b, dono, o, { ...CONFIG, vagas: 20 });
      const d = await dia(b, 2);
      for (let i = 0; i < 5; i++) expect((await pedir(b, slug, { data: d, hora: '08:00', telefone: `2190000000${i}` }, '203.0.113.7')).codigo).toBeNull();
      expect((await pedir(b, slug, { data: d, hora: '08:00', telefone: '21900000009' }, '203.0.113.7')).codigo).toBe('RV072');
      // outro IP ainda pede
      expect((await pedir(b, slug, { data: d, hora: '08:00', telefone: '21900000009' }, '203.0.113.8')).codigo).toBeNull();
      // o servidor do Revisaí manda o IP (em hash) de quem pediu; sem a chave do sistema, o hash é ignorado
      const hash = 'a'.repeat(64);
      const comChave = await como(
        b,
        null,
        () => b.query(`select public.agenda_pedir($1, $2::date, '08:30', 'João', '21900000010', null, 'Revisão', null, true, $3) as r`, [slug, d, hash]),
        { sistema: true, headers: { 'x-forwarded-for': '203.0.113.7' } }
      );
      expect(comChave.rows[0].r).toHaveProperty('id');
      const chaves = (await b.query(`select chave, n from privado.limites where chave in ($1, $2)`, [`agenda-ip:${hash}`, `agenda-oficina:${o}`])).rows;
      expect(chaves).toEqual(expect.arrayContaining([{ chave: `agenda-ip:${hash}`, n: 1 }, { chave: `agenda-oficina:${o}`, n: 7 }]));
      // a oficina recebeu 60 pedidos hoje: o próximo não entra
      await b.query(`update privado.limites set n = 60 where chave = $1`, [`agenda-oficina:${o}`]);
      expect((await pedir(b, slug, { data: d, hora: '09:00', telefone: '21900000011' }, '203.0.113.99')).codigo).toBe('RV072');
    }));

  it('o pedido novo vira aviso para a oficina', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono);
      const slug = await publicar(b, dono, o);
      const d = await dia(b, 2);
      const { r } = await pedir(b, slug, { data: d, hora: '09:30', nome: 'Maria Souza da Silva' });
      const avisos = (await b.query(`select tipo, destino, dados from public.avisos_fila where tipo = 'agendamento_online' and destino ->> 'oficina_id' = $1`, [o])).rows;
      expect(avisos).toEqual([{ tipo: 'agendamento_online', destino: { oficina_id: o }, dados: { pedidoId: r!.id, data: d, hora: '09:30', servico: 'Troca de óleo', cliente: 'Maria' } }]);
      // quem recebe: as pessoas da oficina, e dá para desligar este tipo
      await linhas(b, dono, `insert into public.avisos_preferencias (desligados) values ('{agendamento_online}')`);
      const destino = (await b.query(`select privado.avisos_destinatarios('agendamento_online', $1::jsonb) as r`, [JSON.stringify({ oficina_id: o })])).rows[0].r;
      expect(destino.pessoas).toEqual([expect.objectContaining({ userId: dono.id, push: false, emailLigado: false })]);
    }));

  it('a tabela de pedidos está no tempo real', () =>
    emTransacao(async (b) => {
      const pub = (await b.query(`select count(*)::int as n from pg_publication where pubname = 'supabase_realtime'`)).rows[0].n;
      if (!pub) return;
      const r = await b.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'agendamentos_online'`);
      expect(r.rows).toEqual([{ tablename: 'agendamentos_online' }]);
    }));
});
