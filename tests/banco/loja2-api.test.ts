import { createHash, randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarLoja, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';
import { vendedorDaLoja } from './loja2-ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

/** Um token como o servidor sorteia: rvl_<8>_<43 do base64url>. */
function novoToken(): { token: string; prefixo: string; hash: string } {
  const prefixo = `rvl_${randomBytes(6).toString('hex').slice(0, 8)}`;
  const token = `${prefixo}_${randomBytes(32).toString('base64url')}`;
  return { token, prefixo, hash: createHash('sha256').update(token).digest('hex') };
}

async function criarToken(b: Banco, dono: Pessoa, fornecedorId: number, nome = 'Bling'): Promise<{ id: string; token: string; prefixo: string }> {
  const t = novoToken();
  const [r] = await linhas(b, dono, 'select public.loja_api_criar_token($1, $2, $3, $4) as id', [fornecedorId, nome, t.prefixo, t.hash]);
  return { id: String(r.id), token: t.token, prefixo: t.prefixo };
}

const sistema = { sistema: true };

/** Produtos com código na loja. */
async function comCodigos(b: Banco, fornecedorId: number, codigos: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const codigo of codigos) {
    const r = await b.query(`insert into public.produtos (fornecedor_id, categoria, nome, unidade, preco, codigo, estoque) values ($1, 'oleo_motor', $2, 'un', 50, $2, 5) returning id`, [fornecedorId, codigo]);
    ids.push(Number(r.rows[0].id));
  }
  return ids;
}

async function chamadas(b: Banco, fornecedorId: number) {
  const r = await b.query('select metodo, situacao, vezes, recebidos, devolvidos, atualizados, nao_encontrados, erros from privado.lojas_api_chamadas where fornecedor_id = $1 order by id', [fornecedorId]);
  return r.rows;
}

d('tokens da API da loja', () => {
  it('só o dono cria e revoga; o banco guarda só o hash, que não sai nem para o dono', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const loja = await criarLoja(b, dono);
      const t = await criarToken(b, dono, loja.fornecedorId);
      const [linha] = await linhas(b, dono, 'select nome, prefixo, revogado, ultimo_uso_em from public.lojas_api_tokens where id = $1', [t.id]);
      expect(linha).toEqual({ nome: 'Bling', prefixo: t.prefixo, revogado: false, ultimo_uso_em: null });
      // o hash não sai pela API
      expect((await tentar(b, dono, 'select token_hash from public.lojas_api_tokens')).codigo).toBe('42501');
      const guardado = await b.query('select token_hash from public.lojas_api_tokens where id = $1', [t.id]);
      expect(guardado.rows[0].token_hash).toBe(createHash('sha256').update(t.token).digest('hex'));
      expect(guardado.rows[0].token_hash).not.toContain(t.token.slice(13));
      // vendedor e outra loja não criam, não veem e não revogam
      const vendedor = await vendedorDaLoja(b, dono, loja.fornecedorId);
      const x = novoToken();
      expect((await tentar(b, vendedor, 'select public.loja_api_criar_token($1, $2, $3, $4)', [loja.fornecedorId, 'Meu', x.prefixo, x.hash])).codigo).toBe('42501');
      expect(await linhas(b, vendedor, 'select id from public.lojas_api_tokens')).toHaveLength(0);
      const rival = await criarPessoa(b, pessoa('rival'));
      await criarLoja(b, rival, { nome: 'Rival' });
      expect((await tentar(b, rival, 'select public.loja_api_revogar_token($1)', [t.id])).codigo).toBe('42501');
      expect((await tentar(b, vendedor, 'select public.loja_api_revogar_token($1)', [t.id])).codigo).toBe('42501');
      // formato e nome
      expect((await tentar(b, dono, 'select public.loja_api_criar_token($1, $2, $3, $4)', [loja.fornecedorId, 'x', x.prefixo, x.hash])).codigo).toBe('22023');
      expect((await tentar(b, dono, 'select public.loja_api_criar_token($1, $2, $3, $4)', [loja.fornecedorId, 'Bom nome', 'rvl_XYZ', x.hash])).codigo).toBe('22023');
      expect((await tentar(b, dono, 'select public.loja_api_criar_token($1, $2, $3, $4)', [loja.fornecedorId, 'Bom nome', x.prefixo, 'abc'])).codigo).toBe('22023');
      // até 10 ativos
      for (let i = 0; i < 9; i++) await criarToken(b, dono, loja.fornecedorId, `Token ${i}`);
      const demais = novoToken();
      expect((await tentar(b, dono, 'select public.loja_api_criar_token($1, $2, $3, $4)', [loja.fornecedorId, 'Onze', demais.prefixo, demais.hash])).codigo).toBe('RV067');
      // o dono revoga; o revogado não conta
      expect((await tentar(b, dono, 'select public.loja_api_revogar_token($1)', [t.id])).erro).toBeNull();
      const [rev] = await linhas(b, dono, 'select revogado, revogado_em is not null as quando from public.lojas_api_tokens where id = $1', [t.id]);
      expect(rev).toEqual({ revogado: true, quando: true });
      expect((await tentar(b, dono, 'select public.loja_api_criar_token($1, $2, $3, $4)', [loja.fornecedorId, 'Onze', demais.prefixo, demais.hash])).erro).toBeNull();
      // a equipe de suporte revoga também
      const suporte = await criarPessoa(b, pessoa('suporte', { totpHa: 60 }));
      await criarEquipe(b, suporte, 'suporte');
      const [algum] = await linhas(b, dono, 'select id from public.lojas_api_tokens where fornecedor_id = $1 and not revogado limit 1', [loja.fornecedorId]);
      expect((await tentar(b, suporte, 'select public.loja_api_revogar_token($1)', [algum.id])).erro).toBeNull();
      expect((await linhas(b, dono, 'select revogado from public.lojas_api_tokens where id = $1', [algum.id]))[0].revogado).toBe(true);
    }));
});

d('o sistema da loja pela API', () => {
  it('só com a chave do sistema e um token válido; lista e muda só os produtos da loja do token', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const loja = await criarLoja(b, dono);
      const rivalDono = await criarPessoa(b, pessoa('rival'));
      const rival = await criarLoja(b, rivalDono, { nome: 'Rival' });
      await comCodigos(b, loja.fornecedorId, ['A1', 'A2', 'A3']);
      const [r1] = await comCodigos(b, rival.fornecedorId, ['A1', 'R9']);
      const t = await criarToken(b, dono, loja.fornecedorId);

      // sem a chave do sistema: nem anônimo nem conta
      expect((await tentar(b, null, 'select public.loja_api_listar($1)', [t.token])).codigo).toBe('42501');
      expect((await tentar(b, dono, 'select public.loja_api_listar($1)', [t.token])).codigo).toBe('42501');
      // com a chave, token errado ou fora do formato
      expect((await tentar(b, null, 'select public.loja_api_listar($1)', ['qualquer'], sistema)).codigo).toBe('RV066');
      expect((await tentar(b, null, 'select public.loja_api_listar($1)', [novoToken().token], sistema)).codigo).toBe('RV066');

      const [lista] = await linhas(b, null, 'select public.loja_api_listar($1) as r', [t.token], sistema);
      const r = lista.r as { loja: { id: number }; produtos: { codigo: string | null; preco: number; estoque: number | null }[]; proximo: number | null };
      expect(r.loja.id).toBe(loja.fornecedorId);
      expect(r.produtos.map((p) => p.codigo)).toEqual([null, 'A1', 'A2', 'A3']);
      expect(r.proximo).toBeNull();
      // em páginas e por código
      const [pag] = await linhas(b, null, 'select public.loja_api_listar($1, null, null, 2) as r', [t.token], sistema);
      const pagina = pag.r as { produtos: { id: number }[]; proximo: number };
      expect(pagina.produtos).toHaveLength(2);
      expect(pagina.proximo).toBe(pagina.produtos[1].id);
      const [um] = await linhas(b, null, `select public.loja_api_listar($1, 'A2') as r`, [t.token], sistema);
      expect((um.r as { produtos: { codigo: string }[] }).produtos.map((p) => p.codigo)).toEqual(['A2']);

      const antes = await b.query('select count(*)::int as n from public.produtos where fornecedor_id = $1', [loja.fornecedorId]);
      const itens = [
        { codigo: 'A1', preco: 61.9, estoque: 12 },
        { codigo: 'A2', ativo: false, prazo_entrega_horas: 24 },
        { codigo: 'A3', estoque: null },
        { codigo: 'R9', preco: 1 },
        { codigo: 'NOVO', preco: 10 },
        { codigo: 'A3', preco: -1 },
        { codigo: 'A1', estoque: 1.5 },
        { preco: 3 }
      ];
      const [mudou] = await linhas(b, null, 'select public.loja_api_atualizar($1, $2::jsonb) as r', [t.token, JSON.stringify(itens)], sistema);
      const res = mudou.r as { recebidos: number; atualizados: number; sem_mudanca: number; nao_encontrados: string[]; erros: { codigo: string | null; erro: string }[] };
      expect(res.recebidos).toBe(8);
      expect(res.atualizados).toBe(3);
      expect(res.nao_encontrados).toEqual(['R9', 'NOVO']);
      expect(res.erros.map((e) => e.codigo)).toEqual(['A3', 'A1', null]);
      // nunca cria produto, e o da outra loja (mesmo código) fica como estava
      const depois = await b.query('select count(*)::int as n from public.produtos where fornecedor_id = $1', [loja.fornecedorId]);
      expect(depois.rows[0].n).toBe(antes.rows[0].n);
      const rivalA1 = await b.query('select preco, estoque from public.produtos where id = $1', [r1]);
      expect([Number(rivalA1.rows[0].preco), rivalA1.rows[0].estoque]).toEqual([50, 5]);
      const nossos = await b.query(`select codigo, preco, estoque, ativo, prazo_entrega_horas from public.produtos where fornecedor_id = $1 and codigo is not null order by codigo`, [loja.fornecedorId]);
      expect(nossos.rows.map((x) => [x.codigo, Number(x.preco), x.estoque, x.ativo, x.prazo_entrega_horas])).toEqual([
        ['A1', 61.9, 12, true, null],
        ['A2', 50, 5, false, 24],
        ['A3', 50, null, true, null]
      ]);
      // o mesmo de novo não muda nada
      const [igual] = await linhas(b, null, 'select public.loja_api_atualizar($1, $2::jsonb) as r', [t.token, JSON.stringify([{ codigo: 'A1', preco: 61.9 }])], sistema);
      expect(igual.r).toEqual(expect.objectContaining({ atualizados: 0, sem_mudanca: 1 }));
      // lote vazio ou grande demais
      expect((await tentar(b, null, 'select public.loja_api_atualizar($1, $2::jsonb)', [t.token, '[]'], sistema)).codigo).toBe('22023');
      expect((await tentar(b, null, 'select public.loja_api_atualizar($1, $2::jsonb)', [t.token, JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ codigo: `X${i}`, preco: 1 })))], sistema)).codigo).toBe('22023');
      expect((await tentar(b, null, 'select public.loja_api_atualizar($1, $2::jsonb)', [t.token, '{"codigo":"A1"}'], sistema)).codigo).toBe('22023');

      // cada chamada fica registrada só com contagens; o uso do token é anotado
      expect(await chamadas(b, loja.fornecedorId)).toEqual([
        { metodo: 'GET', situacao: 200, vezes: 1, recebidos: 0, devolvidos: 4, atualizados: 0, nao_encontrados: 0, erros: 0 },
        { metodo: 'GET', situacao: 200, vezes: 1, recebidos: 0, devolvidos: 2, atualizados: 0, nao_encontrados: 0, erros: 0 },
        { metodo: 'GET', situacao: 200, vezes: 1, recebidos: 0, devolvidos: 1, atualizados: 0, nao_encontrados: 0, erros: 0 },
        { metodo: 'PATCH', situacao: 200, vezes: 1, recebidos: 8, devolvidos: 0, atualizados: 3, nao_encontrados: 2, erros: 3 },
        { metodo: 'PATCH', situacao: 200, vezes: 1, recebidos: 1, devolvidos: 0, atualizados: 0, nao_encontrados: 0, erros: 0 }
      ]);
      const [uso] = await linhas(b, dono, 'select ultimo_uso_em is not null as usado from public.lojas_api_tokens where id = $1', [t.id]);
      expect(uso.usado).toBe(true);

      // o servidor registra o que recusou antes (400) e o limite (429, uma linha por minuto)
      expect((await linhas(b, null, `select public.loja_api_registrar($1, 'PATCH', 400, 3) as ok`, [t.token], sistema))[0].ok).toBe(true);
      for (let i = 0; i < 3; i++) await linhas(b, null, `select public.loja_api_registrar($1, 'PATCH', 429, 0)`, [t.token], sistema);
      expect((await linhas(b, null, `select public.loja_api_registrar($1, 'PATCH', 400, 1) as ok`, ['rvl_aaaaaaaa_' + 'a'.repeat(43)], sistema))[0].ok).toBe(false);
      const fim = (await chamadas(b, loja.fornecedorId)).slice(-2);
      expect(fim).toEqual([
        expect.objectContaining({ metodo: 'PATCH', situacao: 400, vezes: 1, recebidos: 3, erros: 1 }),
        expect.objectContaining({ metodo: 'PATCH', situacao: 429, vezes: 3 })
      ]);
      // o dono vê o registro; o vendedor não
      const [reg] = await linhas(b, dono, 'select public.loja_api_chamadas($1) as r', [loja.fornecedorId]);
      const registro = reg.r as { hoje: number; chamadas: { metodo: string; token: string }[] };
      // 3 GET, 2 PATCH, o 400 e três 429 (os lotes recusados pelo banco não chegam a registrar)
      expect(registro.hoje).toBe(9);
      expect(registro.chamadas[0]).toEqual(expect.objectContaining({ metodo: 'PATCH', token: t.prefixo }));
      const vendedor = await vendedorDaLoja(b, dono, loja.fornecedorId);
      expect((await tentar(b, vendedor, 'select public.loja_api_chamadas($1)', [loja.fornecedorId])).codigo).toBe('42501');

      // revogado para na hora
      await linhas(b, dono, 'select public.loja_api_revogar_token($1)', [t.id]);
      expect((await tentar(b, null, 'select public.loja_api_listar($1)', [t.token], sistema)).codigo).toBe('RV066');
      expect((await tentar(b, null, 'select public.loja_api_atualizar($1, $2::jsonb)', [t.token, '[{"codigo":"A1","preco":2}]'], sistema)).codigo).toBe('RV066');
    }));

  it('o token de uma loja não alcança outra, e o limite por token conta no banco', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('dono'));
      const loja = await criarLoja(b, dono);
      const outroDono = await criarPessoa(b, pessoa('outro'));
      const outra = await criarLoja(b, outroDono, { nome: 'Outra' });
      await comCodigos(b, outra.fornecedorId, ['B1']);
      const t = await criarToken(b, dono, loja.fornecedorId);
      const [r] = await linhas(b, null, `select public.loja_api_atualizar($1, '[{"codigo":"B1","preco":1}]'::jsonb) as r`, [t.token], sistema);
      expect((r.r as { nao_encontrados: string[] }).nao_encontrados).toEqual(['B1']);
      // o limite: a chave é o hash do token, e só o sistema conta
      const chave = `loja-api:${createHash('sha256').update(t.token).digest('hex').slice(0, 40)}`;
      const vezes = [];
      for (let i = 0; i < 3; i++) vezes.push((await linhas(b, null, 'select public.limite_consumir($1, 2, 60) as ok', [chave], sistema))[0].ok);
      expect(vezes).toEqual([true, true, false]);
      expect((await tentar(b, null, 'select public.limite_consumir($1, 2, 60)', [chave])).codigo).toBe('42501');
    }));
});
