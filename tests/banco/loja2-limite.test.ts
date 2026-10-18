import { afterAll, describe, expect, it } from 'vitest';
import { criarEquipe, criarPessoa, emTransacao, fechar, linhas, pessoa, temBanco, tentar, type Banco, type Pessoa } from './ajuda';
import { cenario, codigoNovo, mudarParte, pedir, tentarPedir } from './loja2-ajuda';

const d = temBanco ? describe : describe.skip;

afterAll(fechar);

async function equipe(b: Banco, papel: 'suporte' | 'financeiro'): Promise<Pessoa> {
  const p = await criarPessoa(b, pessoa(papel, { totpHa: 60 }));
  await criarEquipe(b, p, papel);
  return p;
}

/** Volta as datas sem passar pelas regras (só nesta transação). */
async function semRegras(b: Banco, sql: string, params: unknown[]) {
  await b.query('set local session_replication_role = replica');
  await b.query(sql, params);
  await b.query('set local session_replication_role = origin');
}

d('limite de compra das oficinas novas', () => {
  it('nos primeiros 30 dias a oficina compra até R$ 2.000 a cada 7 dias (RV060); cancelado e antigo não contam', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { preco: 1000 });
      const um = [{ produto_id: c.loja.produtoId, quantidade: 1 }];
      const p1 = await pedir(b, c, um);
      await pedir(b, c, um); // chega aos 2.000: ainda vale
      const passou = await tentarPedir(b, c, um);
      expect(passou.codigo).toBe('RV060');
      expect(passou.erro).toMatch(/R\$ 2\.000,00 a cada 7 dias/);
      expect(passou.erro).toMatch(/ainda cabem R\$ 0,00/);
      expect(JSON.parse(passou.detail ?? '{}')).toEqual({ limite: 2000, usado: 2000, livre: 0, valor: 1000 });
      // o que a oficina vê antes de pedir
      const [lim] = await linhas(b, c.donoOficina, 'select public.compra_limite($1) as r', [c.oficina]);
      expect(lim.r).toEqual(expect.objectContaining({ limite: 2000, usado: 2000, livre: 0, daEquipe: false }));
      // a loja cancela uma parte: cabe de novo
      expect((await mudarParte(b, c.lojista, p1.partes[0].id, `status = 'cancelado', cancelado_motivo = 'Sem estoque'`)).erro).toBeNull();
      const p3 = await pedir(b, c, um);
      expect(p3.partes).toHaveLength(1);
      expect((await tentarPedir(b, c, um)).codigo).toBe('RV060');
      // compras de mais de 7 dias saem da conta
      await semRegras(b, `update public.pedidos_fornecedores set criado_em = now() - interval '8 days' where oficina_id = $1`, [c.oficina]);
      expect((await tentarPedir(b, c, um)).erro).toBeNull();
    }));

  it('a equipe aumenta o limite; a oficina não muda o próprio; depois dos 30 dias não há limite', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { preco: 1500 });
      const dois = [{ produto_id: c.loja.produtoId, quantidade: 2 }];
      expect((await tentarPedir(b, c, dois)).codigo).toBe('RV060');
      // a oficina não aumenta o próprio limite
      expect((await tentar(b, c.donoOficina, 'update public.oficinas set limite_compra_7d = 99999 where id = $1 returning id', [c.oficina])).linhas).toHaveLength(0);
      // a equipe (suporte ou financeiro) aumenta pela função (a linha pela API só aceita o cadastro)
      const suporte = await equipe(b, 'suporte');
      expect((await tentar(b, suporte, 'update public.oficinas set limite_compra_7d = 5000 where id = $1 returning id', [c.oficina])).codigo).toBe('42501');
      expect((await tentar(b, suporte, 'select public.equipe_limite_de_compra($1, 5000)', [c.oficina])).erro).toBeNull();
      expect((await tentar(b, c.donoOficina, 'select public.equipe_limite_de_compra($1, 99999)', [c.oficina])).codigo).toBe('42501');
      expect((await tentar(b, suporte, 'select public.equipe_limite_de_compra($1, -1)', [c.oficina])).codigo).toBe('22023');
      const p = await pedir(b, c, dois);
      expect(p.partes[0].subtotal).toBe(3000);
      const [lim] = await linhas(b, c.donoOficina, 'select public.compra_limite($1) as r', [c.oficina]);
      expect(lim.r).toEqual(expect.objectContaining({ limite: 5000, usado: 3000, livre: 2000, daEquipe: true }));
      expect((await tentarPedir(b, c, dois)).codigo).toBe('RV060');
      // a mudança fica no histórico da equipe
      const h = await b.query(`select count(*)::int as n from privado.auditoria where tabela = 'public.oficinas' and registro = $1 and user_id = $2`, [c.oficina, suporte.id]);
      expect(h.rows[0].n).toBe(1);
      // o financeiro volta para o padrão
      const financeiro = await equipe(b, 'financeiro');
      expect((await tentar(b, financeiro, 'select public.equipe_limite_de_compra($1, null)', [c.oficina])).erro).toBeNull();
      const [padrao] = await linhas(b, c.donoOficina, 'select public.compra_limite($1) as r', [c.oficina]);
      expect(padrao.r).toEqual(expect.objectContaining({ limite: 2000, daEquipe: false }));
      expect((await tentar(b, financeiro, 'select public.equipe_limite_de_compra($1, 5000)', [c.oficina])).erro).toBeNull();
      // a oficina com mais de 30 dias compra sem limite
      await semRegras(b, `update public.oficinas set criado_em = now() - interval '31 days' where id = $1`, [c.oficina]);
      expect((await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 6 }])).erro).toBeNull();
      const [semLimite] = await linhas(b, c.donoOficina, 'select public.compra_limite($1) as r', [c.oficina]);
      expect(semLimite.r).toBeNull();
    }));

  it('quem não é da oficina não descobre o limite dela pelo pedido', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { preco: 1500 });
      await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }]);
      const intruso = await criarPessoa(b, pessoa('intruso'));
      const r = await tentar(
        b,
        intruso,
        `insert into public.pedidos (codigo, oficina_id, oficina_nome, oficina_whatsapp, itens) values ($1, $2, 'x', '5521911112222', $3::jsonb)`,
        [codigoNovo(), c.oficina, JSON.stringify([{ produto_id: c.loja.produtoId, quantidade: 1 }])]
      );
      expect(r.codigo).toBe('42501');
      expect(r.erro).not.toMatch(/R\$/);
    }));

  it('a tentativa barrada fica registrada (conferida de novo pelo banco) e a equipe vê na página de antifraude', () =>
    emTransacao(async (b) => {
      const c = await cenario(b, { preco: 1500 });
      await pedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }]);
      expect((await tentarPedir(b, c, [{ produto_id: c.loja.produtoId, quantidade: 1 }])).codigo).toBe('RV060');
      // o servidor registra depois do RV060
      expect((await linhas(b, c.donoOficina, 'select public.compra_registrar_bloqueio($1, 1500) as ok', [c.oficina]))[0].ok).toBe(true);
      // repetido em 2 minutos junta; valor que cabe não registra
      expect((await linhas(b, c.donoOficina, 'select public.compra_registrar_bloqueio($1, 1500) as ok', [c.oficina]))[0].ok).toBe(true);
      expect((await linhas(b, c.donoOficina, 'select public.compra_registrar_bloqueio($1, 100) as ok', [c.oficina]))[0].ok).toBe(false);
      expect((await linhas(b, c.donoOficina, 'select public.compra_registrar_bloqueio($1, -5) as ok', [c.oficina]))[0].ok).toBe(false);
      const guardados = await b.query('select valor, usado, limite, criado_por from privado.antifraude_bloqueios where oficina_id = $1', [c.oficina]);
      expect(guardados.rows.map((x) => [Number(x.valor), Number(x.usado), Number(x.limite), x.criado_por])).toEqual([[1500, 1500, 2000, c.donoOficina.id]]);
      // a equipe (suporte e financeiro) vê; a loja e a oficina não
      for (const papel of ['suporte', 'financeiro'] as const) {
        const p = await equipe(b, papel);
        const [r] = await linhas(b, p, 'select public.equipe_bloqueios_de_compra(30) as r', []);
        const lista = r.r as { oficinaId: string; valor: number; usado: number; limite: number }[];
        expect(lista.filter((x) => x.oficinaId === c.oficina)).toEqual([expect.objectContaining({ valor: 1500, usado: 1500, limite: 2000 })]);
      }
      expect((await tentar(b, c.lojista, 'select public.equipe_bloqueios_de_compra(30)')).codigo).toBe('42501');
      expect((await tentar(b, c.donoOficina, 'select public.equipe_bloqueios_de_compra(30)')).codigo).toBe('42501');
      // ninguém lê a tabela pela API
      expect((await tentar(b, c.donoOficina, 'select * from privado.antifraude_bloqueios')).codigo).toBe('42501');
    }));
});
