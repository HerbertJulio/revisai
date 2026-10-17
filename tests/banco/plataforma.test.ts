import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { VERSAO_DOS_DOCUMENTOS } from '@/app/(site)/termos/versao';
import { criarEquipe, criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

// Avisos (fila, quem recebe, preferências, Web Push), erros dos navegadores e a limpeza.
// Os estados RR e AP quase não têm lojas: os cenários de alerta não esbarram nos dados de outros testes.

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

type Json = Record<string, unknown>;

const P256 = 'B' + 'A'.repeat(86);
const AUTH = 'C'.repeat(22);

async function rpc<T = Json>(b: Banco, p: Pessoa | null, sql: string, params: unknown[] = [], sistema = false): Promise<T> {
  const [r] = await linhas(b, p, `select ${sql} as r`, params, { sistema });
  return r.r as T;
}

/** Os avisos que os gatilhos puseram na fila (lidos como dono do banco). */
async function fila(b: Banco, onde: string, params: unknown[]): Promise<{ id: number; tipo: string; destino: Json; dados: Json }[]> {
  const r = await b.query(`select id, tipo, destino, dados from public.avisos_fila where ${onde} order by id`, params);
  return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
}

interface Destinatarios {
  pessoas: { userId: string | null; email: string; push: boolean; emailLigado: boolean; whatsapp: boolean; inscricoes: { endpoint: string }[] }[];
  whatsapps: string[];
}

async function para(b: Banco, tipo: string, destino: Json): Promise<Destinatarios> {
  const r = await b.query('select privado.avisos_destinatarios($1, $2::jsonb) as r', [tipo, JSON.stringify(destino)]);
  return r.rows[0].r as Destinatarios;
}

function codigo(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

async function pedido(b: Banco, dono: Pessoa, oficina: string, produtoId: number): Promise<number> {
  const [p] = await linhas(
    b,
    dono,
    `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb) returning id`,
    [codigo(), oficina, JSON.stringify([{ produto_id: produtoId, quantidade: 2 }])]
  );
  return Number(p.id);
}

d('avisos dos eventos', () => {
  it('pedido novo avisa a loja; confirmar e entregar avisam a oficina; pagamento informado avisa a loja', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('oficina'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, lojista);
      const pedidoId = await pedido(b, dono, o, loja.produtoId);
      const [parte] = (await b.query('select id from public.pedidos_fornecedores where pedido_id = $1', [pedidoId])).rows;
      const parteId = Number(parte.id);
      const muda = (p: Pessoa, sql: string) => linhas(b, p, sql, [parteId]);
      await muda(lojista, `update public.pedidos_fornecedores set status = 'confirmado' where id = $1`);
      await muda(dono, `update public.pedidos_fornecedores set pagamento = 'informado' where id = $1`);
      await muda(lojista, `update public.pedidos_fornecedores set pagamento = 'confirmado' where id = $1`);
      await muda(lojista, `update public.pedidos_fornecedores set status = 'entregue' where id = $1`);

      const avisos = await fila(b, `dados ->> 'parteId' = $1`, [String(parteId)]);
      expect(avisos.map((a) => a.tipo)).toEqual(['pedido_novo', 'pedido_situacao', 'pagamento_informado', 'pedido_situacao']);
      expect(avisos[0].destino).toEqual({ fornecedor_id: loja.fornecedorId });
      expect(avisos[0].dados).toMatchObject({ itens: 1, subtotal: 80, cidade: 'Rio' });
      expect(avisos[1].destino).toEqual({ oficina_id: o });
      expect(avisos[1].dados).toMatchObject({ status: 'confirmado', loja: 'Loja Teste' });
      expect(avisos[2].destino).toEqual({ fornecedor_id: loja.fornecedorId });
      expect(avisos[3].dados).toMatchObject({ status: 'entregue' });
    }));

  it('alerta novo vai para as lojas do estado que vendem a categoria; aceite avisa a oficina, recusa não', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('oficina'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const outra = await criarPessoa(b, pessoa('outra'));
      const bateria = await criarPessoa(b, pessoa('bateria'));
      const longe = await criarPessoa(b, pessoa('longe'));
      const o = await criarOficina(b, dono, 'Oficina RR', { uf: 'RR' });
      const loja = await criarLoja(b, lojista, { uf: 'RR' });
      const loja2 = await criarLoja(b, outra, { uf: 'RR', nome: 'Loja Dois' });
      await criarLoja(b, bateria, { uf: 'RR', categoria: 'bateria' });
      await criarLoja(b, longe, { uf: 'SP' });
      const [alerta] = await linhas(
        b,
        dono,
        `insert into public.alertas_preco (oficina_id, oficina_uf, categoria, titulo, produto_id, quantidade, preco_alvo, expira_em) values ($1, 'RR', 'oleo_motor', 'Óleo 5W30', $2, 4, 30, now() + interval '48 hours') returning id`,
        [o, loja.produtoId]
      );
      const [novo] = await fila(b, `tipo = 'alerta_novo' and dados ->> 'alertaId' = $1`, [alerta.id]);
      expect(novo.destino).toEqual({ uf: 'RR', categoria: 'oleo_motor' });
      expect(novo.dados).toMatchObject({ titulo: 'Óleo 5W30', quantidade: 4, precoAlvo: 30 });
      const quem = (await para(b, 'alerta_novo', novo.destino)).pessoas.map((p) => p.userId);
      expect(quem).toEqual(expect.arrayContaining([lojista.id, outra.id]));
      expect(quem).not.toContain(bateria.id);
      expect(quem).not.toContain(longe.id);
      expect(quem).not.toContain(dono.id);

      await linhas(b, lojista, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo, produto_id, preco, quantidade_minima) values ($1, $2, 'aceita', $3, 30, 1)`, [
        alerta.id,
        loja.fornecedorId,
        loja.produtoId
      ]);
      await linhas(b, outra, `insert into public.alertas_respostas (alerta_id, fornecedor_id, tipo) values ($1, $2, 'recusa')`, [alerta.id, loja2.fornecedorId]);
      const respostas = await fila(b, `tipo = 'alerta_resposta' and dados ->> 'alertaId' = $1`, [alerta.id]);
      expect(respostas).toHaveLength(1);
      expect(respostas[0].destino).toEqual({ oficina_id: o });
      expect(respostas[0].dados).toMatchObject({ loja: 'Loja Teste', tipo: 'aceita', preco: 30, minimo: 1, titulo: 'Óleo 5W30' });
    }));

  it('o cliente aprovar pelo link avisa a oficina; publicar de novo não avisa', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('oficina'));
      const o = await criarOficina(b, dono);
      const dados = JSON.stringify({ titulo: 'Troca de óleo', cliente: 'Maria' });
      const link = await rpc<{ token: string }>(b, dono, `public.publicar_link($1, 'orcamento', 'orc-aviso', $2::jsonb)`, [o, dados]);
      await rpc(b, null, `public.responder_link($1, '{"acao": "aprovar"}'::jsonb)`, [link.token]);
      await rpc(b, dono, `public.publicar_link($1, 'orcamento', 'orc-aviso', $2::jsonb, 90, null, true)`, [o, dados]);
      const avisos = await fila(b, `tipo = 'link_resposta' and destino ->> 'oficina_id' = $1`, [o]);
      expect(avisos).toHaveLength(1);
      expect(avisos[0].dados).toMatchObject({ tipoLink: 'orcamento', acao: 'aprovar', titulo: 'Troca de óleo', cliente: 'Maria' });
    }));

  it('a resposta da equipe no pedido de ajuda avisa quem abriu; a resposta de quem abriu não', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      await criarEquipe(b, sup, 'suporte');
      const o = await criarOficina(b, dono);
      const id = await rpc<string>(b, dono, 'public.suporte_abrir($1, $2, $3)', ['Aviso não chega', 'O celular não mostra nada.', o]);
      await rpc(b, sup, 'public.suporte_responder($1, $2)', [id, 'Já vamos ver. Qual aparelho?']);
      await rpc(b, dono, 'public.suporte_responder($1, $2)', [id, 'Android.']);
      const avisos = await fila(b, `tipo = 'suporte_resposta' and dados ->> 'chamadoId' = $1`, [id]);
      expect(avisos).toHaveLength(1);
      expect(avisos[0].destino).toMatchObject({ user_id: dono.id });
      expect(avisos[0].dados).toMatchObject({ area: 'oficina', assunto: 'Aviso não chega', trecho: 'Já vamos ver. Qual aparelho?' });
    }));
});

d('quem recebe', () => {
  it('respeita os canais e os tipos que cada pessoa desligou, e manda o WhatsApp da empresa', () =>
    emTransacao(async (b) => {
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const vendedor = await criarPessoa(b, pessoa('vendedor'));
      const loja = await criarLoja(b, lojista, { uf: 'AP' });
      await b.query(`insert into public.fornecedor_membros (fornecedor_id, user_id, papel, email) values ($1, $2, 'vendedor', $3)`, [loja.fornecedorId, vendedor.id, vendedor.email]);
      await b.query(`update public.fornecedores set whatsapp = '5596988887777' where id = $1`, [loja.fornecedorId]);
      const endpoint = `https://push.exemplo.dev/${randomUUID()}`;
      await rpc(b, lojista, 'public.push_inscrever($1, $2, $3, $4)', [endpoint, P256, AUTH, 'Chrome no Android']);
      await linhas(b, vendedor, `insert into public.avisos_preferencias (email, whatsapp, desligados) values (false, false, '{pedido_novo}')`);

      const destino = { fornecedor_id: loja.fornecedorId };
      const r = await para(b, 'pedido_novo', destino);
      const porId = (id: string) => r.pessoas.find((p) => p.userId === id);
      expect(porId(lojista.id)).toMatchObject({ email: lojista.email, push: true, emailLigado: true, whatsapp: true, inscricoes: [{ endpoint }] });
      expect(porId(vendedor.id)).toMatchObject({ push: false, emailLigado: false, whatsapp: false, inscricoes: [] });
      expect(r.whatsapps).toEqual(['5596988887777']);
      // outro tipo: o vendedor recebe só pelo push
      expect((await para(b, 'pagamento_informado', destino)).pessoas.find((p) => p.userId === vendedor.id)).toMatchObject({ push: true, emailLigado: false, whatsapp: false });

      // ninguém da loja quer WhatsApp: não manda
      await linhas(b, lojista, `insert into public.avisos_preferencias (whatsapp) values (false)`);
      expect((await para(b, 'pedido_novo', destino)).whatsapps).toEqual([]);

      // loja ainda sem ninguém com conta: o WhatsApp dela recebe
      const semConta = await criarLoja(b, null, { uf: 'AP', nome: 'Sem Conta' });
      await b.query(`update public.fornecedores set whatsapp = '5596977776666' where id = $1`, [semConta.fornecedorId]);
      expect(await para(b, 'pedido_novo', { fornecedor_id: semConta.fornecedorId })).toEqual({ pessoas: [], whatsapps: ['5596977776666'] });
      // a loja que desligou o WhatsApp em Sua loja não recebe (quando a coluna existe)
      const coluna = await b.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fornecedores' and column_name = 'avisar_whatsapp'`);
      if (coluna.rowCount) {
        await b.query(`update public.fornecedores set avisar_whatsapp = false where id = $1`, [semConta.fornecedorId]);
        expect((await para(b, 'pedido_novo', { fornecedor_id: semConta.fornecedorId })).whatsapps).toEqual([]);
      }
    }));

  it('oficina, pessoa da conta e e-mail sem conta', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const o = await criarOficina(b, dono, 'Oficina AP', { uf: 'AP', whatsapp: '5596999990000' });
      const r = await para(b, 'pedido_situacao', { oficina_id: o });
      expect(r.pessoas.map((p) => p.userId)).toEqual([dono.id]);
      expect(r.whatsapps).toEqual(['5596999990000']);
      expect(await para(b, 'suporte_resposta', { user_id: dono.id, email: dono.email })).toMatchObject({ pessoas: [{ userId: dono.id, email: dono.email }], whatsapps: [] });
      expect((await para(b, 'suporte_resposta', { user_id: null, email: 'Fulano@Exemplo.dev' })).pessoas).toMatchObject([{ userId: null, email: 'fulano@exemplo.dev' }]);
    }));
});

d('fila', () => {
  it('só o sistema pega e conclui; o lote não repete; falha espera mais a cada vez; para em 5 tentativas', () =>
    emTransacao(async (b) => {
      const alguem = await criarPessoa(b, pessoa('alguem'));
      // deixa pendentes só os avisos deste teste (tudo é desfeito no fim)
      await b.query('update public.avisos_fila set enviado_em = now() where enviado_em is null');
      const destino = JSON.stringify({ user_id: alguem.id, email: alguem.email });
      const ids: number[] = [];
      for (let i = 0; i < 2; i++) {
        const r = await b.query(`insert into public.avisos_fila (tipo, destino, dados) values ('suporte_resposta', $1::jsonb, '{"assunto": "Teste"}') returning id`, [destino]);
        ids.push(Number(r.rows[0].id));
      }
      expect((await tentar(b, null, 'select public.avisos_reservar(10)')).codigo).toBe('42501');
      expect((await tentar(b, alguem, 'select public.avisos_reservar(10)')).codigo).toBe('42501');
      expect((await tentar(b, alguem, 'select * from public.avisos_fila')).codigo).toBe('42501');
      expect((await tentar(b, alguem, `select privado.avisar('suporte_resposta', '{}', '{}')`)).codigo).toBe('42501');

      const reservar = () => rpc<{ id: number; tentativas: number; para: Destinatarios }[]>(b, null, 'public.avisos_reservar(10)', [], true);
      const lote = await reservar();
      expect(lote.map((a) => [a.id, a.tentativas])).toEqual([
        [ids[0], 1],
        [ids[1], 1]
      ]);
      expect(lote[0].para.pessoas).toMatchObject([{ userId: alguem.id, email: alguem.email }]);
      expect(await reservar()).toEqual([]);

      const concluir = (id: number, ok: boolean, erro: string | null = null, invalidos: string[] = [], bons: string[] = []) =>
        rpc<boolean>(b, null, 'public.avisos_concluir($1, $2, $3, $4, $5)', [id, ok, erro, invalidos, bons], true);
      expect(await concluir(ids[0], true)).toBe(true);
      expect(await concluir(ids[1], false, 'push 500')).toBe(true);
      const estado = async (id: number) =>
        (await b.query(`select enviado_em is not null as enviado, erro, reservado_ate, tentativas, extract(epoch from proxima_em - now())::int as espera from public.avisos_fila where id = $1`, [id])).rows[0];
      expect(await estado(ids[0])).toMatchObject({ enviado: true, reservado_ate: null });
      expect(await estado(ids[1])).toMatchObject({ enviado: false, erro: 'push 500', reservado_ate: null, espera: 120 });
      expect(await reservar()).toEqual([]);

      const vence = () => b.query(`update public.avisos_fila set proxima_em = now() - interval '1 second' where id = $1`, [ids[1]]);
      await vence();
      expect((await reservar()).map((a) => [a.id, a.tentativas])).toEqual([[ids[1], 2]]);
      await concluir(ids[1], false, 'push 500');
      expect((await estado(ids[1])).espera).toBe(240);
      await b.query('update public.avisos_fila set tentativas = 5 where id = $1', [ids[1]]);
      await vence();
      expect(await reservar()).toEqual([]);

      // o serviço de push disse que o navegador sumiu: sai da lista; o que recebeu ganha a data
      const bom = `https://push.exemplo.dev/${randomUUID()}`;
      const sumiu = `https://push.exemplo.dev/${randomUUID()}`;
      await rpc(b, alguem, 'public.push_inscrever($1, $2, $3)', [bom, P256, AUTH]);
      await rpc(b, alguem, 'public.push_inscrever($1, $2, $3)', [sumiu, P256, AUTH]);
      await concluir(ids[0], true, null, [sumiu], [bom]);
      const restam = (await b.query('select endpoint, ultimo_ok_em is not null as ok from public.push_inscricoes where user_id = $1', [alguem.id])).rows;
      expect(restam).toEqual([{ endpoint: bom, ok: true }]);
    }));

  it('o código do acordar só confere com a chave do sistema; sem pg_net, pôr na fila continua funcionando', () =>
    emTransacao(async (b) => {
      await b.query(`select privado.avisos_configurar('http://localhost:3106/')`);
      const [cfg] = (await b.query('select app_url, token from privado.avisos_config')).rows;
      expect(cfg.app_url).toBe('http://localhost:3106');
      expect(await rpc(b, null, 'public.avisos_ping_confere($1)', [cfg.token], true)).toBe(true);
      expect(await rpc(b, null, 'public.avisos_ping_confere($1)', ['x'.repeat(43)], true)).toBe(false);
      expect((await tentar(b, null, 'select public.avisos_ping_confere($1)', [cfg.token])).codigo).toBe('42501');
      await b.query(`select privado.avisar('suporte_resposta', '{"email": "x@exemplo.dev"}', '{}')`);
      expect(await fila(b, `destino ->> 'email' = 'x@exemplo.dev'`, [])).toHaveLength(1);
    }));
});

d('Web Push e preferências', () => {
  it('cada um vê só os próprios navegadores; o navegador passa para quem entrou por último; no máximo 20', () =>
    emTransacao(async (b) => {
      const a = await criarPessoa(b, pessoa('a'));
      const c = await criarPessoa(b, pessoa('c'));
      const e1 = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
      const meus = (p: Pessoa) => linhas(b, p, 'select endpoint from public.push_inscricoes order by id');
      await rpc(b, a, 'public.push_inscrever($1, $2, $3, $4)', [e1, P256, AUTH, 'Chrome no Android']);
      expect(await meus(a)).toEqual([{ endpoint: e1 }]);
      expect(await meus(c)).toEqual([]);
      await rpc(b, c, 'public.push_inscrever($1, $2, $3)', [e1, P256, AUTH]);
      expect(await meus(a)).toEqual([]);
      expect(await meus(c)).toEqual([{ endpoint: e1 }]);
      expect(await rpc(b, a, 'public.push_cancelar($1)', [e1])).toBe(false);
      expect(await meus(c)).toEqual([{ endpoint: e1 }]);
      expect((await tentar(b, null, 'select public.push_inscrever($1, $2, $3)', [`https://push.exemplo.dev/${randomUUID()}`, P256, AUTH])).codigo).toBe('42501');
      expect((await tentar(b, a, 'insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)', [a.id, 'https://push.exemplo.dev/x', P256, AUTH])).codigo).toBe('42501');
      expect((await tentar(b, a, 'select public.push_inscrever($1, $2, $3)', ['ftp://push.exemplo.dev/x', P256, AUTH])).codigo).toBe('23514');
      for (let i = 0; i < 22; i++) await rpc(b, a, 'public.push_inscrever($1, $2, $3)', [`https://push.exemplo.dev/${i}-${randomUUID()}`, P256, AUTH]);
      expect(await linhas(b, a, 'select count(*)::int as n from public.push_inscricoes')).toEqual([{ n: 20 }]);
      // inscrever de novo o mesmo navegador não tira outro
      const [ultimo] = await linhas(b, a, 'select endpoint from public.push_inscricoes order by id desc limit 1');
      await rpc(b, a, 'public.push_inscrever($1, $2, $3)', [ultimo.endpoint, P256, AUTH]);
      expect(await linhas(b, a, 'select count(*)::int as n from public.push_inscricoes')).toEqual([{ n: 20 }]);
      expect(await rpc(b, c, 'public.push_cancelar($1)', [e1])).toBe(true);
      expect(await meus(c)).toEqual([]);
    }));

  it('cada um grava e vê só as próprias preferências; tipo desconhecido não entra', () =>
    emTransacao(async (b) => {
      const a = await criarPessoa(b, pessoa('a'));
      const c = await criarPessoa(b, pessoa('c'));
      await linhas(b, a, `insert into public.avisos_preferencias (push, email, whatsapp, desligados) values (true, false, true, '{alerta_novo}')`);
      expect(await linhas(b, a, 'select user_id, email, desligados from public.avisos_preferencias')).toEqual([{ user_id: a.id, email: false, desligados: ['alerta_novo'] }]);
      expect(await linhas(b, c, 'select user_id from public.avisos_preferencias')).toEqual([]);
      expect((await tentar(b, c, 'insert into public.avisos_preferencias (user_id) values ($1)', [a.id])).codigo).toBe('42501');
      expect((await tentar(b, c, 'update public.avisos_preferencias set email = true where user_id = $1 returning user_id', [a.id])).linhas).toEqual([]);
      expect((await tentar(b, a, `update public.avisos_preferencias set desligados = '{nao_existe}' where user_id = $1`, [a.id])).codigo).toBe('23514');
      expect((await tentar(b, null, 'select * from public.avisos_preferencias')).codigo).toBe('42501');
    }));
});

d('documentos', () => {
  it('a versão das páginas é a que o banco pede para aceitar', () =>
    emTransacao(async (b) => {
      const versoes = (await b.query('select public.versoes_dos_termos() as v')).rows[0].v as Record<string, string>;
      expect(Object.keys(versoes)).toEqual(expect.arrayContaining(['contrato_loja', 'privacidade', 'termos', 'tratamento_dados']));
      for (const v of Object.values(versoes)) expect(v).toBe(VERSAO_DOS_DOCUMENTOS);
    }));
});

d('chaves VAPID, erros e limpeza', () => {
  it('as chaves VAPID só saem com a chave do sistema e a primeira guardada vale', () =>
    emTransacao(async (b) => {
      const a = await criarPessoa(b, pessoa('a'));
      expect((await tentar(b, null, 'select public.vapid_obter()')).codigo).toBe('42501');
      expect((await tentar(b, a, 'select public.vapid_obter()')).codigo).toBe('42501');
      expect((await tentar(b, a, 'select * from privado.vapid')).codigo).toBe('42501');
      const antes = await rpc<Json | null>(b, null, 'public.vapid_obter()', [], true);
      const g1 = await rpc<Json>(b, null, 'public.vapid_guardar($1, $2)', ['B' + 'x'.repeat(86), 'y'.repeat(43)], true);
      expect(g1).toEqual(antes ?? { publica: 'B' + 'x'.repeat(86), privada: 'y'.repeat(43) });
      expect(await rpc(b, null, 'public.vapid_guardar($1, $2)', ['C' + 'z'.repeat(86), 'w'.repeat(43)], true)).toEqual(g1);
      expect(await rpc(b, null, 'public.vapid_obter()', [], true)).toEqual(g1);
    }));

  it('o sistema grava os erros (repetido no dia só conta); só a equipe de suporte lê', () =>
    emTransacao(async (b) => {
      const a = await criarPessoa(b, pessoa('a'));
      const sup = await criarPessoa(b, pessoa('sup', { totpHa: 60 }));
      const fin = await criarPessoa(b, pessoa('fin', { totpHa: 60 }));
      await criarEquipe(b, sup, 'suporte');
      await criarEquipe(b, fin, 'financeiro');
      const mensagem = `TypeError: x is undefined ${randomUUID()}`;
      for (let i = 0; i < 2; i++)
        await rpc(b, null, `public.erros_registrar('/oficina', $1, 'at a (app.js:1:2)', 'janela', 'Chrome 130 / Android', 'v1')`, [mensagem], true);
      expect((await tentar(b, null, `select public.erros_registrar('/x', 'y', null, 'janela', null, null)`)).codigo).toBe('42501');
      expect((await tentar(b, a, `select public.erros_registrar('/x', 'y', null, 'janela', null, null)`)).codigo).toBe('42501');
      const lista = await rpc<Json[]>(b, sup, 'public.erros_listar()');
      expect(lista.find((e) => e.mensagem === mensagem)).toMatchObject({ rota: '/oficina', origem: 'janela', agente: 'Chrome 130 / Android', repeticoes: 2 });
      expect((await tentar(b, fin, 'select public.erros_listar()')).codigo).toBe('42501');
      expect((await tentar(b, a, 'select public.erros_listar()')).codigo).toBe('42501');
      expect((await tentar(b, a, 'select * from privado.erros')).codigo).toBe('42501');
    }));

  it('a limpeza apaga avisos e erros com mais de 30 dias e navegadores parados há 6 meses', () =>
    emTransacao(async (b) => {
      const a = await criarPessoa(b, pessoa('a'));
      const av = await b.query(
        `insert into public.avisos_fila (tipo, destino, criado_em) values ('suporte_resposta', '{}', now() - interval '31 days'), ('suporte_resposta', '{}', now() - interval '29 days') returning id`
      );
      const [velho, novo] = av.rows.map((r) => Number(r.id));
      const er = await b.query(
        `insert into privado.erros (mensagem, assinatura, quando) values ('velho', md5($1), now() - interval '31 days'), ('novo', md5($2), now() - interval '1 day') returning id`,
        [randomUUID(), randomUUID()]
      );
      const [erroVelho, erroNovo] = er.rows.map((r) => Number(r.id));
      const parado = `https://push.exemplo.dev/${randomUUID()}`;
      const ativo = `https://push.exemplo.dev/${randomUUID()}`;
      await b.query(
        `insert into public.push_inscricoes (user_id, endpoint, p256dh, auth, criado_em, ultimo_ok_em) values ($1, $2, $4, $5, now() - interval '200 days', null), ($1, $3, $4, $5, now() - interval '300 days', now() - interval '10 days')`,
        [a.id, parado, ativo, P256, AUTH]
      );
      expect((await tentar(b, null, 'select public.plataforma_rotina()')).codigo).toBe('42501');
      expect((await tentar(b, a, 'select public.plataforma_rotina()')).codigo).toBe('42501');
      const r = await rpc<{ avisos: number; erros: number; push: number }>(b, null, 'public.plataforma_rotina()', [], true);
      expect(r.avisos).toBeGreaterThanOrEqual(1);
      expect(r.erros).toBeGreaterThanOrEqual(1);
      expect(r.push).toBeGreaterThanOrEqual(1);
      expect((await b.query('select id from public.avisos_fila where id = any ($1)', [[velho, novo]])).rows.map((x) => Number(x.id))).toEqual([novo]);
      expect((await b.query('select id from privado.erros where id = any ($1)', [[erroVelho, erroNovo]])).rows.map((x) => Number(x.id))).toEqual([erroNovo]);
      expect((await b.query('select endpoint from public.push_inscricoes where user_id = $1', [a.id])).rows).toEqual([{ endpoint: ativo }]);
    }));
});
