import { afterAll, describe, expect, it } from 'vitest';
import { criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';

// Cobrança do cliente pelo link (Pix e clube) e as notas fiscais da oficina, direto no Postgres.

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

async function comMecanico(b: Banco) {
  const dono = await criarPessoa(b, pessoa('dono'));
  const mec = await criarPessoa(b, pessoa('mec'));
  const o = await criarOficina(b, dono);
  await linhas(b, dono, `select public.convidar('oficina', $1, $2, 'mecanico')`, [o, mec.email]);
  await linhas(b, mec, 'select public.aceitar_convite()');
  return { dono, mec, o };
}

async function publicar(b: Banco, p: Pessoa, o: string, tipo: string, ref: string, dados: object): Promise<{ token: string }> {
  const [r] = await linhas(b, p, `select public.publicar_link($1, $2, $3, $4::jsonb) as r`, [o, tipo, ref, JSON.stringify(dados)]);
  return r.r as { token: string };
}

async function idDoLink(b: Banco, o: string, ref: string): Promise<string> {
  const r = await b.query(`select id from public.links_publicos where oficina_id = $1 and ref = $2`, [o, ref]);
  return String(r.rows[0].id);
}

const PAGUEI = `select public.responder_link($1, $2::jsonb, '200.1.2.3', 'Celular')`;

d('cobrança do cliente pelo link', () => {
  it('o cliente avisa que pagou uma vez; depois que a oficina trata, pode avisar de novo', () =>
    emTransacao(async (b) => {
      const { dono, o } = await comMecanico(b);
      const { token } = await publicar(b, dono, o, 'pagamento', 'pix-1', { valor: 350, documentoId: 'doc-1' });
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"aprovar"}'], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei"}'], { sistema: true })).erro).toBeNull();
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei"}'], { sistema: true })).codigo).toBe('RV051');
      const [l] = await linhas(b, dono, `select resposta, respondido_em from public.links_publicos where oficina_id = $1 and ref = 'pix-1'`, [o]);
      expect(l.resposta).toMatchObject({ acao: 'paguei', ip: '200.1.2.3', agente: 'Celular' });
      // a oficina tratou (não caiu, por exemplo): o cliente pode avisar de novo, e a oficina é avisada de novo
      const id = await idDoLink(b, o, 'pix-1');
      await linhas(b, dono, 'select public.link_processado($1)', [id]);
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei","nome":"Ana"}'], { sistema: true })).erro).toBeNull();
      const [depois] = await linhas(b, dono, `select resposta, processado_em from public.links_publicos where id = $1`, [id]);
      expect(depois.processado_em).toBeNull();
      expect(depois.resposta).toMatchObject({ acao: 'paguei', nome: 'Ana' });
    }));

  it('o aviso de que o cliente pagou vai só para o dono e o gerente', () =>
    emTransacao(async (b) => {
      const { dono, mec, o } = await comMecanico(b);
      const { token } = await publicar(b, dono, o, 'pagamento', 'pix-2', { valor: 90 });
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei"}'], { sistema: true })).erro).toBeNull();
      const fila = await b.query(`select destino from public.avisos_fila where tipo = 'link_resposta' and dados ->> 'ref' = 'pix-2' order by id desc limit 1`);
      const destino = fila.rows[0].destino;
      const r = await b.query('select privado.avisos_destinatarios($1, $2::jsonb) as r', ['link_resposta', JSON.stringify(destino)]);
      const pessoas = (r.rows[0].r as { pessoas: { userId: string }[] }).pessoas.map((p) => p.userId);
      expect(pessoas).toContain(dono.id);
      expect(pessoas).not.toContain(mec.id);
    }));

  it('o cartão do clube pede o mês da mensalidade', () =>
    emTransacao(async (b) => {
      const { dono, o } = await comMecanico(b);
      const { token } = await publicar(b, dono, o, 'clube', 'membro-1', { plano: { nome: 'Ouro' } });
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei"}'], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei","competencia":"2026-13"}'], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei","competencia":"2026-10"}'], { sistema: true })).erro).toBeNull();
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei","competencia":"2026-11"}'], { sistema: true })).codigo).toBe('RV051');
      await linhas(b, dono, 'select public.link_processado($1)', [await idDoLink(b, o, 'membro-1')]);
      expect((await tentar(b, null, PAGUEI, [token, '{"acao":"paguei","competencia":"2026-11"}'], { sistema: true })).erro).toBeNull();
    }));

  it('o orçamento e o checklist seguem as regras de antes', () =>
    emTransacao(async (b) => {
      const { dono, o } = await comMecanico(b);
      const orc = await publicar(b, dono, o, 'orcamento', 'orc-1', { total: 10 });
      expect((await tentar(b, null, PAGUEI, [orc.token, '{"acao":"paguei"}'], { sistema: true })).codigo).toBe('22023');
      // sem a ação, a resposta não passa (um NULL não pula a conferência)
      expect((await tentar(b, null, PAGUEI, [orc.token, '{"recusadas":[]}'], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, PAGUEI, [orc.token, '{"acao":"aprovar","recusadas":[]}'], { sistema: true })).erro).toBeNull();
      await linhas(b, dono, 'select public.link_processado($1)', [await idDoLink(b, o, 'orc-1')]);
      // o orçamento respondido não aceita outra resposta, mesmo depois de aplicado
      expect((await tentar(b, null, PAGUEI, [orc.token, '{"acao":"recusar"}'], { sistema: true })).codigo).toBe('RV051');
      const chk = await publicar(b, dono, o, 'checklist', 'chk-1', {});
      expect((await tentar(b, null, PAGUEI, [chk.token, '{"acao":"paguei"}'], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, PAGUEI, [chk.token, '{"nome":"Ana"}'], { sistema: true })).codigo).toBe('22023');
      expect((await tentar(b, null, PAGUEI, [chk.token, '{"acao":"assinar","nome":"Ana"}'], { sistema: true })).erro).toBeNull();
      const and = await publicar(b, dono, o, 'andamento', 'and-1', {});
      expect((await tentar(b, null, PAGUEI, [and.token, '{"acao":"paguei"}'], { sistema: true })).codigo).toBe('22023');
    }));

  it('o mecânico não vê os links de cobrança nem os cartões do clube', () =>
    emTransacao(async (b) => {
      const { dono, mec, o } = await comMecanico(b);
      await publicar(b, dono, o, 'pagamento', 'pix-1', { valor: 1 });
      await publicar(b, dono, o, 'clube', 'membro-1', {});
      await publicar(b, dono, o, 'orcamento', 'orc-1', {});
      const doDono = await linhas(b, dono, `select tipo from public.links_publicos where oficina_id = $1 order by tipo`, [o]);
      expect(doDono.map((x) => x.tipo)).toEqual(['clube', 'orcamento', 'pagamento']);
      const doMecanico = await linhas(b, mec, `select tipo from public.links_publicos where oficina_id = $1 order by tipo`, [o]);
      expect(doMecanico.map((x) => x.tipo)).toEqual(['orcamento']);
    }));
});

const CONFIG = {
  provedor: 'teste',
  cnpj: '11222333000181',
  razaoSocial: 'Oficina do Teste Ltda',
  regime: 'simples',
  inscricaoMunicipal: '12345',
  codigoMunicipio: '3304557',
  aliquotaIss: 2,
  cnae: '4520001',
  ambiente: 'homologacao'
};

async function configurar(b: Banco, dono: Pessoa, o: string) {
  return tentar(b, null, `select public.fiscal_salvar_config($1, $2, $3::jsonb) as r`, [o, dono.id, JSON.stringify(CONFIG)], { sistema: true });
}

async function registrar(b: Banco, dono: Pessoa, o: string, externo = 'nfse_teste_000001') {
  return tentar(
    b,
    null,
    `select public.fiscal_registrar_nota($1, $2, 'doc-1', 'nfse', 'teste', $3, 'homologacao', 150, '{"nome":"Ana","documento":"52998224725"}'::jsonb) as r`,
    [o, dono.id, externo],
    { sistema: true }
  );
}

d('notas fiscais da oficina', () => {
  it('só o servidor grava, para o dono ou o gerente, e só no Pro ou no teste', () =>
    emTransacao(async (b) => {
      const { dono, mec, o } = await comMecanico(b);
      // sem a chave do sistema, nem o dono grava
      expect((await tentar(b, dono, `select public.fiscal_salvar_config($1, $2, $3::jsonb)`, [o, dono.id, JSON.stringify(CONFIG)])).codigo).toBe('42501');
      expect((await configurar(b, dono, o)).codigo).toBe('RV090');
      await b.query(`update public.oficinas set teste_ate = current_date + 7 where id = $1`, [o]);
      expect((await tentar(b, null, `select public.fiscal_salvar_config($1, $2, $3::jsonb)`, [o, mec.id, JSON.stringify(CONFIG)], { sistema: true })).codigo).toBe('42501');
      const ok = await configurar(b, dono, o);
      expect(ok.erro).toBeNull();
      expect(ok.linhas[0].r).toMatchObject({ cnpj: '11222333000181', regime: 'simples', codigo_servico: '14.01', codigo_tributacao_nacional: '140101', ambiente: 'homologacao' });
      // dono lê, mecânico e outra pessoa não
      expect(await linhas(b, dono, `select cnpj from public.oficinas_fiscal where oficina_id = $1`, [o])).toEqual([{ cnpj: '11222333000181' }]);
      expect(await linhas(b, mec, `select cnpj from public.oficinas_fiscal where oficina_id = $1`, [o])).toEqual([]);
      const outra = await criarPessoa(b, pessoa('outra'));
      expect(await linhas(b, outra, `select cnpj from public.oficinas_fiscal`)).toEqual([]);
      // ninguém grava direto na tabela
      expect((await tentar(b, dono, `update public.oficinas_fiscal set regime = 'normal' where oficina_id = $1`, [o])).codigo).toBe('42501');
      // o certificado: só a validade fica
      expect((await tentar(b, null, `select public.fiscal_certificado($1, $2, '2027-10-01T00:00:00Z')`, [o, dono.id], { sistema: true })).erro).toBeNull();
      const [c] = await linhas(b, dono, `select certificado_valido_ate from public.oficinas_fiscal where oficina_id = $1`, [o]);
      expect(new Date(String(c.certificado_valido_ate)).toISOString()).toBe('2027-10-01T00:00:00.000Z');
      // trocar o CNPJ (outra empresa) esquece a validade do certificado
      const outroCnpj = await tentar(b, null, `select public.fiscal_salvar_config($1, $2, $3::jsonb) as r`, [o, dono.id, JSON.stringify({ ...CONFIG, cnpj: '11444777000161' })], { sistema: true });
      expect((outroCnpj.linhas[0].r as { certificado_valido_ate: unknown }).certificado_valido_ate).toBeNull();
    }));

  it('as credenciais no emissor ficam fora do alcance da API', () =>
    emTransacao(async (b) => {
      const { dono, o } = await comMecanico(b);
      await b.query(`update public.oficinas set pro_ate = current_date + 30 where id = $1`, [o]);
      expect((await tentar(b, null, `select public.fiscal_guardar_credenciais($1, $2, 'focus', '{"token":"cifrado"}'::jsonb)`, [o, dono.id], { sistema: true })).erro).toBeNull();
      expect((await tentar(b, dono, `select public.fiscal_credenciais($1)`, [o])).codigo).toBe('42501');
      expect((await tentar(b, dono, `select * from privado.fiscal_credenciais`)).codigo).toBe('42501');
      const [r] = await linhas(b, null, `select public.fiscal_credenciais($1) as r`, [o], { sistema: true });
      expect(r.r).toEqual({ provedor: 'focus', dados: { token: 'cifrado' } });
    }));

  it('a nota começa processando, o aviso do emissor atualiza uma vez e a cancelada não volta', () =>
    emTransacao(async (b) => {
      const { dono, mec, o } = await comMecanico(b);
      await b.query(`update public.oficinas set teste_ate = current_date + 7 where id = $1`, [o]);
      expect((await registrar(b, dono, o)).codigo).toBe('RV091');
      await configurar(b, dono, o);
      const r = await registrar(b, dono, o);
      expect(r.erro).toBeNull();
      expect(r.linhas[0].r).toMatchObject({ situacao: 'processando', tipo: 'nfse', valor: 150, documento_id: 'doc-1' });
      // o mesmo número de referência não entra duas vezes
      expect((await registrar(b, dono, o)).codigo).toBe('23505');

      const aviso = { situacao: 'autorizada', numero: '42', urlPdf: 'https://example.com/n.pdf', urlXml: 'http://inseguro/n.xml', mensagem: null };
      const [w1] = await linhas(b, null, `select public.fiscal_webhook('teste', 'evt-1', 'nfse_teste_000001', $1::jsonb) as r`, [JSON.stringify(aviso)], { sistema: true });
      expect(w1.r).toMatchObject({ novo: true, nota: { situacao: 'autorizada', numero: '42', url_pdf: 'https://example.com/n.pdf', url_xml: null } });
      const [w2] = await linhas(b, null, `select public.fiscal_webhook('teste', 'evt-1', 'nfse_teste_000001', $1::jsonb) as r`, [JSON.stringify(aviso)], { sistema: true });
      expect(w2.r).toEqual({ novo: false, nota: null });
      // um aviso atrasado de "processando" não desfaz a autorização
      await linhas(b, null, `select public.fiscal_atualizar_nota('teste', 'nfse_teste_000001', '{"situacao":"processando"}'::jsonb)`, [], { sistema: true });
      const [n1] = await linhas(b, dono, `select situacao, autorizada_em from public.notas_fiscais where oficina_id = $1`, [o]);
      expect(n1.situacao).toBe('autorizada');
      expect(n1.autorizada_em).not.toBeNull();
      await linhas(b, null, `select public.fiscal_atualizar_nota('teste', 'nfse_teste_000001', '{"situacao":"cancelada"}'::jsonb)`, [], { sistema: true });
      await linhas(b, null, `select public.fiscal_atualizar_nota('teste', 'nfse_teste_000001', '{"situacao":"autorizada"}'::jsonb)`, [], { sistema: true });
      const [n2] = await linhas(b, dono, `select situacao, cancelada_em, numero from public.notas_fiscais where oficina_id = $1`, [o]);
      expect(n2).toMatchObject({ situacao: 'cancelada', numero: '42' });
      expect(n2.cancelada_em).not.toBeNull();
      // nota de outro emissor ou desconhecida: nada muda
      const [x] = await linhas(b, null, `select public.fiscal_atualizar_nota('focus', 'nfse_teste_000001', '{"situacao":"erro"}'::jsonb) as r`, [], { sistema: true });
      expect(x.r).toBeNull();

      // o mecânico não vê as notas; ninguém grava direto; sem a chave do sistema não atualiza
      expect(await linhas(b, mec, `select id from public.notas_fiscais where oficina_id = $1`, [o])).toEqual([]);
      expect((await tentar(b, dono, `insert into public.notas_fiscais (oficina_id, tipo, provedor, externo, ambiente, valor) values ($1, 'nfe', 'teste', 'abcdef', 'homologacao', 1)`, [o])).codigo).toBe('42501');
      expect((await tentar(b, dono, `select public.fiscal_atualizar_nota('teste', 'nfse_teste_000001', '{}'::jsonb)`)).codigo).toBe('42501');
      expect((await tentar(b, null, `select public.fiscal_webhook('teste', 'evt-2', 'nfse_teste_000001', '{}'::jsonb)`)).codigo).toBe('42501');
    }));

  it('quem não é de oficina nenhuma recebe 42501 em todas as funções das notas', () =>
    emTransacao(async (b) => {
      const { dono, o } = await comMecanico(b);
      await b.query(`update public.oficinas set pro_ate = current_date + 30 where id = $1`, [o]);
      await configurar(b, dono, o);
      await registrar(b, dono, o);
      const estranho = await criarPessoa(b, pessoa('estranho'));
      const chamadas: [string, unknown[]][] = [
        [`select public.fiscal_salvar_config($1, $2, $3::jsonb)`, [o, estranho.id, JSON.stringify(CONFIG)]],
        [`select public.fiscal_guardar_credenciais($1, $2, 'teste', '{}'::jsonb)`, [o, estranho.id]],
        [`select public.fiscal_credenciais($1)`, [o]],
        [`select public.fiscal_certificado($1, $2, now())`, [o, estranho.id]],
        [`select public.fiscal_registrar_nota($1, $2, 'doc-x', 'nfse', 'teste', 'nfse_estranho_01', 'homologacao', 10, '{}'::jsonb)`, [o, estranho.id]],
        [`select public.fiscal_atualizar_nota('teste', 'nfse_teste_000001', '{"situacao":"cancelada"}'::jsonb)`, []],
        [`select public.fiscal_webhook('teste', 'evt-estranho', 'nfse_teste_000001', '{"situacao":"cancelada"}'::jsonb)`, []]
      ];
      // pela API, com a conta dele (sem a chave do sistema) e sem conta nenhuma
      for (const [sql, params] of chamadas) {
        expect((await tentar(b, estranho, sql, params)).codigo, sql).toBe('42501');
        expect((await tentar(b, null, sql, params)).codigo, sql).toBe('42501');
      }
      // pelo servidor (chave do sistema), mas em nome de quem não é da oficina
      for (const [sql, params] of chamadas.filter(([, p]) => p.includes(estranho.id))) {
        expect((await tentar(b, null, sql, params, { sistema: true })).codigo, sql).toBe('42501');
      }
      // nada mudou e ele não lê nada
      const [n] = await linhas(b, dono, `select situacao from public.notas_fiscais where oficina_id = $1`, [o]);
      expect(n.situacao).toBe('processando');
      expect(await linhas(b, estranho, `select id from public.notas_fiscais`)).toEqual([]);
      expect(await linhas(b, estranho, `select oficina_id from public.oficinas_fiscal`)).toEqual([]);
      expect(await linhas(b, null, `select id from public.notas_fiscais`)).toEqual([]);
    }));

  it('o plano grátis não emite nota', () =>
    emTransacao(async (b) => {
      const { dono, o } = await comMecanico(b);
      await b.query(`update public.oficinas set teste_ate = current_date + 7 where id = $1`, [o]);
      await configurar(b, dono, o);
      await b.query(`update public.oficinas set teste_ate = current_date - 1 where id = $1`, [o]);
      expect((await registrar(b, dono, o)).codigo).toBe('RV090');
    }));
});
