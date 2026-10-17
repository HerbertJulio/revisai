import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { esquemaRespostaDaLoja, mensagemDaLoja, podeMudar, proximasSituacoes } from '@/lib/loja/comum';
import { corDaReputacao, lerContratoDaLoja, lerDemanda, lerPedidosDaLoja, lerResumoPix, lerReputacoes } from '@/lib/loja/dados';

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------- um banco de mentira

type Erro = { code?: string; message?: string } | null;
type Resposta = { data?: unknown; error?: Erro; count?: number };
interface Chamada {
  tipo: 'from' | 'rpc';
  nome: string;
  op: 'select' | 'insert' | 'update';
  dados?: unknown;
  args?: unknown;
  filtros: [string, string, unknown][];
}

/** Um cliente que guarda o que o código pediu e devolve o que o teste mandar, por tabela/função. */
function bancoFalso(respostas: Record<string, Resposta | ((c: Chamada) => Resposta)> = {}) {
  const chamadas: Chamada[] = [];
  const responder = (c: Chamada) => {
    const r = respostas[`${c.nome}.${c.op}`] ?? respostas[c.nome];
    const v = typeof r === 'function' ? r(c) : (r ?? {});
    return { data: v.data ?? null, error: v.error ?? null, count: v.count ?? null };
  };
  const uploads: { caminho: string; tipo: string }[] = [];
  const sb = {
    from(nome: string) {
      const c: Chamada = { tipo: 'from', nome, op: 'select', filtros: [] };
      chamadas.push(c);
      const filtro =
        (f: string) =>
        (k: string, v: unknown) => {
          c.filtros.push([f, k, v]);
          return q;
        };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (d: unknown) => ((c.op = 'insert'), (c.dados = d), q),
        update: (d: unknown) => ((c.op = 'update'), (c.dados = d), q),
        eq: filtro('eq'),
        in: filtro('in'),
        is: filtro('is'),
        gt: filtro('gt'),
        gte: filtro('gte'),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => responder(c),
        single: async () => responder(c),
        then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => Promise.resolve(responder(c)).then(ok, erro)
      };
      return q;
    },
    async rpc(nome: string, args: unknown) {
      const c: Chamada = { tipo: 'rpc', nome, op: 'select', args, filtros: [] };
      chamadas.push(c);
      return responder(c);
    },
    storage: {
      from: () => ({
        upload: async (caminho: string, _bytes: Uint8Array, o: { contentType: string }) => (uploads.push({ caminho, tipo: o.contentType }), { error: null }),
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://fotos.teste/${caminho}` } })
      })
    }
  };
  return { sb: sb as unknown as SupabaseClient, chamadas, uploads };
}

// ---------------------------------------------------------------- regras puras

describe('situação do pedido na loja', () => {
  it('anda só para a frente (como o banco): entregue e cancelado não voltam', () => {
    expect(proximasSituacoes('novo')).toEqual(['em_contato', 'confirmado', 'cancelado']);
    expect(podeMudar('confirmado', 'saiu_entrega')).toBe(true);
    expect(podeMudar('saiu_entrega', 'confirmado')).toBe(true);
    expect(podeMudar('confirmado', 'novo')).toBe(false);
    expect(proximasSituacoes('entregue')).toEqual([]);
    expect(proximasSituacoes('cancelado')).toEqual([]);
  });

  it('traduz os erros das regras do banco', () => {
    expect(mensagemDaLoja({ code: 'RV011' })).toBe('Diga o motivo do cancelamento.');
    expect(mensagemDaLoja({ code: 'RV010' })).toMatch(/não vale/);
    expect(mensagemDaLoja({ code: '42501', message: 'new row violates row-level security policy for table "produtos"' })).toBe('Você não tem permissão para isso.');
    expect(mensagemDaLoja({ code: '42501', message: 'Só o dono muda o cadastro da loja' })).toBe('Só o dono muda o cadastro da loja.');
    expect(mensagemDaLoja({ code: 'XX000' }, 'Padrão.')).toBe('Padrão.');
  });

  it('a resposta ao alerta: recusa sem produto; contraproposta pede a quantidade mínima', () => {
    const alertaId = '7c8e8f6a-1b2c-4d3e-8f9a-0b1c2d3e4f5a';
    expect(esquemaRespostaDaLoja.safeParse({ alertaId, tipo: 'recusa' }).success).toBe(true);
    expect(esquemaRespostaDaLoja.safeParse({ alertaId, tipo: 'contraproposta', produtoId: 3, preco: 30 }).success).toBe(false);
    expect(esquemaRespostaDaLoja.safeParse({ alertaId, tipo: 'contraproposta', produtoId: 3, preco: 30, quantidadeMinima: 4 }).success).toBe(true);
  });
});

describe('leitura do que o banco devolve', () => {
  it('a parte do pedido traz só os itens da loja, o histórico em ordem e o motivo do cancelamento', () => {
    const partes = [
      {
        id: 10,
        pedido_id: 5,
        codigo: 'ABC123',
        status: 'cancelado',
        subtotal: '80.00',
        comissao_percentual: 5,
        criado_em: '2026-10-16T12:00:00Z',
        oficina_nome: 'Oficina A',
        oficina_whatsapp: '5521999990000',
        itens: [
          { produto_id: 1, nome: 'Óleo', fornecedor_id: 7, quantidade: 2, preco_unitario: 40 },
          { produto_id: 2, nome: 'Filtro de outra loja', fornecedor_id: 8, quantidade: 1, preco_unitario: 20 }
        ],
        pagamento: 'pendente',
        cancelado_motivo: 'Sem o produto no estoque',
        cancelado_por: 'loja'
      }
    ];
    const historico = [
      { parte_id: 10, quando: '2026-10-16T13:00:00Z', campo: 'status', de: 'em_contato', para: 'cancelado', quem: 'loja', motivo: 'Sem o produto no estoque' },
      { parte_id: 10, quando: '2026-10-16T12:30:00Z', campo: 'status', de: 'novo', para: 'em_contato', quem: 'loja', motivo: null },
      { parte_id: 99, quando: '2026-10-16T12:00:00Z', campo: 'status', de: 'novo', para: 'confirmado', quem: 'loja', motivo: null }
    ];
    const [p] = lerPedidosDaLoja(partes, historico, 7);
    expect(p.itens.map((i) => i.nome)).toEqual(['Óleo']);
    expect(p.subtotal).toBe(80);
    expect(p.historico.map((h) => h.para)).toEqual(['em_contato', 'cancelado']);
    expect(p.cancelamento).toEqual({ motivo: 'Sem o produto no estoque', por: 'loja' });
  });

  it('o Pix: o vendedor só sabe se a loja recebe; o dono vê a chave, a troca e as antigas', () => {
    expect(lerResumoPix({ tem: true, dono: false })).toEqual({ dono: false, tem: true });
    const r = lerResumoPix({
      tem: true,
      dono: true,
      atual: { tipo: 'cnpj', chave: '12345678000199', nome: 'Loja', cidade: 'Rio', desde: '2026-10-01T00:00:00Z' },
      troca: { tipo: 'email', chave: 'a@b.com', nome: 'Loja', cidade: 'Rio', pedidaEm: '2026-10-16T00:00:00Z', valeEm: '2026-10-17T00:00:00Z', pedidaPor: 'dono@loja.com' },
      antigas: [{ tipo: 'cpf', chave: '12345678909', nome: 'Velha', usadaAte: '2026-09-01T00:00:00Z' }, { lixo: true }]
    });
    expect(r?.dono).toBe(true);
    if (r?.dono) {
      expect(r.atual?.chave).toBe('12345678000199');
      expect(r.troca?.pedidaPor).toBe('dono@loja.com');
      expect(r.antigas).toHaveLength(1);
    }
  });

  it('a reputação e a cor dela', () => {
    const m = lerReputacoes({ '7': { nova: false, pedidos: 20, canceladosPct: 1.5, atrasoPct: 8, horasParaConfirmar: 2 }, '8': { nova: true, pedidos: 2 }, x: { nova: true, pedidos: 1 } });
    expect([...m.keys()]).toEqual([7, 8]);
    expect(corDaReputacao(m.get(7)!)).toBe('boa');
    expect(corDaReputacao(m.get(8)!)).toBe('nova');
    expect(corDaReputacao({ nova: false, pedidos: 10, canceladosPct: 4, atrasoPct: 12, horasParaConfirmar: 1 })).toBe('atencao');
    expect(corDaReputacao({ nova: false, pedidos: 10, canceladosPct: 10, atrasoPct: 0, horasParaConfirmar: 1 })).toBe('ruim');
  });

  it('a demanda da região e o contrato que a loja vê', () => {
    const d = lerDemanda({ uf: 'RJ', oficinas: 7, minimo: 5, linhas: [{ categoria: 'oleo_motor', titulo: '5W30', unidade: 'L', quantidade: 120, carros: 30, oficinas: 6 }], escondidas: 2 });
    expect(d?.linhas[0].titulo).toBe('5W30');
    expect(d?.minimo).toBe(5);
    expect(lerContratoDaLoja({ plano: 'destaque', comissao_percentual: '4.5', mensalidade: 99 })).toEqual({ plano: 'destaque', comissaoPercentual: 4.5, mensalidade: 99 });
  });
});

// ---------------------------------------------------------------- o que vai para o banco

describe('pedidos da loja', async () => {
  const { mudarSituacao, saidaParaEntrega } = await import('@/lib/loja/pedidos');

  it('não manda para o banco uma mudança que não vale, nem cancelamento sem motivo', async () => {
    const b = bancoFalso({ 'pedidos_fornecedores.select': { data: { status: 'entregue' } } });
    expect((await mudarSituacao(b.sb, 7, 10, 'confirmado')).ok).toBe(false);
    expect(b.chamadas.some((c) => c.op === 'update')).toBe(false);

    const b2 = bancoFalso({ 'pedidos_fornecedores.select': { data: { status: 'novo' } } });
    const r = await mudarSituacao(b2.sb, 7, 10, 'cancelado', '   ');
    expect(r).toEqual({ ok: false, erro: 'Diga o motivo do cancelamento.' });
    expect(b2.chamadas.some((c) => c.op === 'update')).toBe(false);
  });

  it('cancela com o motivo e só na parte da própria loja', async () => {
    const b = bancoFalso({ 'pedidos_fornecedores.select': { data: { status: 'confirmado' } }, 'pedidos_fornecedores.update': { data: { id: 10 } } });
    expect((await mudarSituacao(b.sb, 7, 10, 'cancelado', 'A oficina desistiu')).ok).toBe(true);
    const u = b.chamadas.find((c) => c.op === 'update')!;
    expect(u.dados).toEqual({ status: 'cancelado', cancelado_motivo: 'A oficina desistiu' });
    expect(u.filtros).toContainEqual(['eq', 'fornecedor_id', 7]);
  });

  it('a saída para entrega guarda só o hash do link e só depois de confirmar', async () => {
    const antes = bancoFalso({ 'pedidos_fornecedores.select': { data: { status: 'novo' } } });
    expect((await saidaParaEntrega(antes.sb, 7, 10, 'hoje')).ok).toBe(false);

    const b = bancoFalso({ 'pedidos_fornecedores.select': { data: { status: 'confirmado' } }, 'pedidos_fornecedores.update': { data: { id: 10 } } });
    const r = await saidaParaEntrega(b.sb, 7, 10, ' hoje até 16h ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const u = b.chamadas.find((c) => c.op === 'update')!.dados as Record<string, unknown>;
    expect(u.entrega_hash).toBe(createHash('sha256').update(r.token).digest('hex'));
    expect(JSON.stringify(u)).not.toContain(r.token);
    expect(u.entrega_previsao).toBe('hoje até 16h');
  });
});

describe('Pix, equipe e vitrine da loja', async () => {
  const { trocarPix } = await import('@/lib/loja/pix');
  const { convidarParaLoja, mudarPapelNaLoja } = await import('@/lib/loja/equipe');
  const { assinaturaConfere, enviarFoto, salvarProduto, salvarPromocao } = await import('@/lib/loja/produtos');

  it('troca o Pix pela função do banco, com a chave limpa e o nome do QR Code cortado', async () => {
    const b = bancoFalso({ loja_trocar_pix: { data: { valeEm: '2026-10-17T12:00:00Z', imediata: false } } });
    const r = await trocarPix(b.sb, 7, { tipo: 'cnpj', chave: '12.345.678/0001-99', nome: 'Auto Peças Irmãos Oliveira Ltda', cidade: 'São João de Meriti' });
    expect(r).toEqual({ ok: true, imediata: false, valeEm: '2026-10-17T12:00:00Z' });
    const args = b.chamadas[0].args as Record<string, string>;
    expect(args.p_chave).toBe('12345678000199');
    expect(args.p_nome.length).toBeLessThanOrEqual(25);
    expect(args.p_cidade.length).toBeLessThanOrEqual(15);
  });

  it('sem o código do e-mail recente, pede a confirmação', async () => {
    const b = bancoFalso({ loja_trocar_pix: { error: { code: 'RV020', message: 'Confirme o código do e-mail para trocar a chave' } } });
    const r = await trocarPix(b.sb, 7, { tipo: 'email', chave: 'pix@loja.com', nome: 'Loja', cidade: 'Rio' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.confirmarEmail).toBe(true);
    expect((await trocarPix(b.sb, 7, { tipo: 'cpf', chave: '123', nome: 'Loja', cidade: 'Rio' })).ok).toBe(false);
  });

  it('convida pelo e-mail (minúsculo) e pede o código para chamar outro dono', async () => {
    const b = bancoFalso({ convidar: { data: 'id' } });
    expect(await convidarParaLoja(b.sb, 7, { email: ' Vendedor@Loja.COM ', papel: 'vendedor' })).toEqual({ ok: true, email: 'vendedor@loja.com' });
    expect(b.chamadas[0].args).toEqual({ p_tipo: 'fornecedor', p_alvo: '7', p_email: 'vendedor@loja.com', p_papel: 'vendedor' });
    expect((await convidarParaLoja(b.sb, 7, { email: 'x', papel: 'vendedor' })).ok).toBe(false);
    expect((await convidarParaLoja(b.sb, 7, { email: 'a@b.com', papel: 'gerente' })).ok).toBe(false);

    const dono = bancoFalso({ convidar: { error: { code: 'RV020' } } });
    const r = await convidarParaLoja(dono.sb, 7, { email: 'socio@loja.com', papel: 'dono' });
    expect(!r.ok && r.confirmarEmail).toBe(true);
    const p = await mudarPapelNaLoja(dono.sb, 7, 'nao-e-uuid', 'dono');
    expect(p.ok).toBe(false);
  });

  it('o produto novo vai com a loja; a promoção precisa ser menor que o preço', async () => {
    const b = bancoFalso({ 'produtos.insert': { data: { id: 55 } } });
    const r = await salvarProduto(b.sb, 7, {
      categoria: 'oleo_motor',
      nome: 'Óleo 5W30 sintético',
      unidade: 'L',
      conteudo: 1,
      preco: 39.9,
      intervaloKm: 10000,
      intervaloMeses: 12,
      referenciaId: null,
      ativo: true,
      especificacao: { viscosidade: '5W30', acea: [] }
    });
    expect(r).toEqual({ ok: true, id: 55 });
    const ins = b.chamadas.find((c) => c.op === 'insert')!.dados as Record<string, unknown>;
    expect(ins.fornecedor_id).toBe(7);
    expect(ins.especificacao).toEqual({ viscosidade: '5W30' });

    const semLitros = await salvarProduto(b.sb, 7, { categoria: 'oleo_motor', nome: 'Óleo', unidade: 'L', conteudo: null, preco: 10, intervaloKm: null, intervaloMeses: null, referenciaId: null, ativo: true, especificacao: {} });
    expect(semLitros.ok).toBe(false);

    const produto = { id: 3, fornecedor_id: 7, categoria: 'oleo_motor', nome: 'Óleo', marca: null, descricao: null, unidade: 'un', conteudo: null, preco: 40, especificacao: {}, intervalo_km: null, intervalo_meses: null, ativo: true, imagem_url: null, referencia_id: null };
    const p = bancoFalso({ 'produtos.select': { data: produto }, 'promocoes.insert': { data: { id: 9 } } });
    const base = { produtoId: 3, titulo: 'Semana do óleo', quantidadeMinima: 4, inicio: '2026-10-16', fim: '2026-10-30', ativo: true };
    expect((await salvarPromocao(p.sb, 7, { ...base, precoPromocional: 45 })).ok).toBe(false);
    expect(await salvarPromocao(p.sb, 7, { ...base, precoPromocional: 35 })).toEqual({ ok: true, id: 9 });
  });

  it('a foto só entra se for imagem de verdade, na pasta da loja', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(assinaturaConfere(png, 'image/png')).toBe(true);
    expect(assinaturaConfere(png, 'image/jpeg')).toBe(false);
    const produto = { id: 3, fornecedor_id: 7, categoria: 'oleo_motor', nome: 'Óleo', marca: null, descricao: null, unidade: 'un', conteudo: null, preco: 40, especificacao: {}, intervalo_km: null, intervalo_meses: null, ativo: true, imagem_url: null, referencia_id: null };
    const b = bancoFalso({ 'produtos.select': { data: produto } });
    const falsa = new File([new TextEncoder().encode('<script>')], 'x.png', { type: 'image/png' });
    expect((await enviarFoto(b.sb, 7, 3, falsa)).ok).toBe(false);
    const r = await enviarFoto(b.sb, 7, 3, new File([png], 'foto.png', { type: 'image/png' }));
    expect(r.ok).toBe(true);
    expect(b.uploads[0].caminho).toMatch(/^fornecedores\/7\/3-[a-z0-9]+\.png$/);
  });
});

describe('a página do entregador (sem conta, pelas funções públicas)', async () => {
  const banco = bancoFalso();
  let respostas: Record<string, Resposta> = {};
  vi.doMock('@/lib/supabase-servidor', () => ({
    clientePublico: () => ({
      rpc: async (nome: string, args: unknown) => {
        banco.chamadas.push({ tipo: 'rpc', nome, op: 'select', args, filtros: [] });
        const r = respostas[nome] ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      }
    })
  }));
  const { concluirEntrega, dadosDaEntrega, registrarPosicao } = await import('@/lib/loja/entregador');
  const token = 'A'.repeat(43);

  it('mostra a entrega pelo link', async () => {
    respostas = { entrega_ver: { data: { codigo: 'ABC123', loja: 'Loja', oficina: 'Oficina', whatsapp: '5521', endereco: 'Rua 1', cidade: 'Rio', uf: 'RJ', itens: [{ nome: 'Óleo', quantidade: 2 }], previsao: null, posicaoEm: null } } };
    expect((await dadosDaEntrega(token))?.itens).toEqual([{ nome: 'Óleo', quantidade: 2 }]);
    respostas = { entrega_ver: { data: null } };
    expect(await dadosDaEntrega(token)).toBeNull();
  });

  it('a posição que chegou cedo demais não é erro; o link vencido é', async () => {
    respostas = { entrega_posicao: { data: true } };
    expect(await registrarPosicao(token, { lat: -22.9, lng: -43.2, precisao: 12.4 })).toEqual({ ok: true, guardada: true });
    respostas = { entrega_posicao: { data: false }, entrega_ver: { data: { codigo: 'ABC123', itens: [] } } };
    expect(await registrarPosicao(token, { lat: -22.9, lng: -43.2, precisao: null })).toEqual({ ok: true, guardada: false });
    respostas = { entrega_posicao: { data: false }, entrega_ver: { data: null } };
    const r = await registrarPosicao(token, { lat: -22.9, lng: -43.2, precisao: null });
    expect(r.ok).toBe(false);
    respostas = { entrega_concluir: { data: true } };
    expect(await concluirEntrega(token)).toEqual({ ok: true });
  });
});
