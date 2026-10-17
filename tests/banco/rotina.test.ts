import { afterAll, describe, expect, it } from 'vitest';
import { criarLoja, criarOficina, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco } from './ajuda';

afterAll(fechar);

describe.skipIf(!temBanco)('rotina diária', () => {
  it('apaga a posição do entregador 3 dias depois da saída e os pedidos com mais de 5 anos', () =>
    emTransacao(async (b) => {
      const dono = await criarPessoa(b, pessoa('oficina'));
      const lojista = await criarPessoa(b, pessoa('lojista'));
      const o = await criarOficina(b, dono);
      const loja = await criarLoja(b, lojista);
      const pedir = async (codigo: string) => {
        const [p] = await linhas(b, dono, `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb) returning id`, [
          codigo,
          o,
          JSON.stringify([{ produto_id: loja.produtoId, quantidade: 1 }])
        ]);
        const r = await b.query('select id from public.pedidos_fornecedores where pedido_id = $1', [p.id]);
        return { pedido: Number(p.id), parte: Number(r.rows[0].id) };
      };
      const velho = await pedir('ROT001');
      const recente = await pedir('ROT002');
      const naRua = await pedir('ROT003');
      // como o banco direto (equipe técnica): datas no passado
      await b.query(`update public.pedidos set criado_em = now() - interval '6 years' where id = $1`, [velho.pedido]);
      await b.query(
        `update public.pedidos_fornecedores set status = 'saiu_entrega', entrega_saiu_em = now() - interval '4 days', entrega_hash = repeat('a', 64), entrega_lat = -22.9, entrega_lng = -43.2 where id = $1`,
        [naRua.parte]
      );
      const [{ r }] = (await b.query('select public.rotina_diaria() as r')).rows as { r: { entregas: number; pedidos: number } }[];
      expect(r.entregas).toBeGreaterThanOrEqual(1);
      expect(r.pedidos).toBeGreaterThanOrEqual(1);
      expect((await b.query('select id from public.pedidos where id = $1', [velho.pedido])).rows).toEqual([]);
      expect((await b.query('select id from public.pedidos where id = $1', [recente.pedido])).rows).toHaveLength(1);
      const [rua] = (await b.query('select entrega_hash, entrega_lat from public.pedidos_fornecedores where id = $1', [naRua.parte])).rows;
      expect(rua).toEqual({ entrega_hash: null, entrega_lat: null });
    }));
});
