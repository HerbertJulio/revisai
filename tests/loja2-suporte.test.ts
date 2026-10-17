import { describe, expect, it } from 'vitest';
import { conferirMensagem, conferirPedido, lerMensagensDeAjuda, lerPedidosDeAjuda, mensagemDoSuporte, whatsappDaEquipe } from '@/components/suporte/dados';
import { agruparDenuncias, lerBloqueios, lerDenuncias, lerLimiteDeCompra, nomeDoMotivo, type Denuncia } from '@/lib/loja/moderacao-dados';
import { ITENS_PROIBIDOS } from '@/lib/loja/proibidos';

describe('botão de ajuda', () => {
  it('o WhatsApp da equipe sai do número configurado, com o texto de quem pede', () => {
    expect(whatsappDaEquipe('(21) 99999-0000', 'loja')).toBe(`https://wa.me/5521999990000?text=${encodeURIComponent('Olá! Preciso de ajuda com o painel da minha loja no Revisaí.')}`);
    expect(whatsappDaEquipe('5521999990000', 'oficina')).toMatch(/minha%20oficina/);
    expect(whatsappDaEquipe('', null)).toBeNull();
    expect(whatsappDaEquipe(undefined, null)).toBeNull();
    expect(whatsappDaEquipe('123', null)).toBeNull();
  });

  it('confere o pedido como o banco (assunto de 2 a 120, mensagem de 1 a 4.000)', () => {
    expect(conferirPedido('a', 'texto')).toBe('Escreva o assunto em poucas palavras.');
    expect(conferirPedido('x'.repeat(121), 'texto')).toBe('O assunto tem até 120 letras.');
    expect(conferirPedido('Preço errado', '   ')).toBe('Escreva a mensagem.');
    expect(conferirPedido('Preço errado', 'Não muda')).toBeNull();
    expect(conferirMensagem('y'.repeat(4001))).toBe('A mensagem tem até 4.000 letras.');
  });

  it('as mensagens do banco viram texto para a pessoa', () => {
    expect(mensagemDoSuporte({ code: 'P0001', message: 'Muitos pedidos de ajuda seguidos' })).toBe('Muitos pedidos de ajuda seguidos. Tente mais tarde ou use o WhatsApp.');
    expect(mensagemDoSuporte({ code: '28000' })).toBe('Sua sessão terminou. Entre de novo.');
    expect(mensagemDoSuporte({ code: '42501' })).toMatch(/não é da sua conta/);
    expect(mensagemDoSuporte(null)).toMatch(/Tente de novo/);
  });

  it('lê os pedidos e as mensagens do banco', () => {
    expect(lerPedidosDeAjuda([{ id: 'a', assunto: 'Ajuda', situacao: 'respondido', criado_em: 'x', atualizado_em: 'y' }, { id: 1 }])).toEqual([
      { id: 'a', assunto: 'Ajuda', situacao: 'respondido', criadoEm: 'x', atualizadoEm: 'y' }
    ]);
    expect(lerMensagensDeAjuda([{ id: '3', autor: 'equipe', texto: 'Oi', criado_em: 'z' }])).toEqual([{ id: 3, autor: 'equipe', texto: 'Oi', criadoEm: 'z' }]);
  });
});

describe('moderação', () => {
  const linha = (extra: Record<string, unknown>) => ({
    id: 'd1',
    oficina_id: 'o1',
    fornecedor_id: 7,
    produto_id: 70,
    motivo: 'falsificado',
    texto: null,
    situacao: 'nova',
    criado_em: '2026-10-17T10:00:00Z',
    resolvido_em: null,
    resolucao: null,
    oficina: { nome: 'Oficina 1', cidade: 'Rio', uf: 'RJ' },
    loja: { nome: 'Loja', ativo: true, whatsapp: null },
    produto: { nome: 'Óleo', marca: 'X', preco: '40', imagem_url: null, ativo: true, oculto_moderacao: false, categoria: 'oleo_motor' },
    ...extra
  });

  it('junta as denúncias pelo produto ou pela loja, com as escondidas e as de mais oficinas primeiro', () => {
    const lista: Denuncia[] = lerDenuncias([
      linha({ id: 'a', produto_id: 70, oficina_id: 'o1', criado_em: '2026-10-17T10:00:00Z' }),
      linha({ id: 'b', produto_id: 70, oficina_id: 'o2', criado_em: '2026-10-16T10:00:00Z' }),
      linha({ id: 'c', produto_id: 71, oficina_id: 'o3', produto: { nome: 'Filtro', marca: null, preco: 10, imagem_url: null, ativo: true, oculto_moderacao: true, categoria: 'filtro_oleo' } }),
      linha({ id: 'd', produto_id: null, produto: null, motivo: 'nao_entregou', oficina_id: 'o4' }),
      linha({ id: 'e', produto_id: 70, oficina_id: 'o1', criado_em: '2026-10-15T10:00:00Z', situacao: 'em_analise' })
    ]);
    const grupos = agruparDenuncias(lista);
    expect(grupos.map((g) => [g.chave, g.oficinas, g.denuncias.map((d) => d.id)])).toEqual([
      ['p71', 1, ['c']],
      ['p70', 2, ['a', 'b', 'e']],
      ['l7', 1, ['d']]
    ]);
    expect(grupos[2].tipo).toBe('loja');
    expect(grupos[1].maisAntiga).toBe('2026-10-15T10:00:00Z');
  });

  it('nomes, limite e bloqueios lidos do banco; a lista do que não pode ser vendido', () => {
    expect(nomeDoMotivo('preco_enganoso')).toBe('Preço ou anúncio enganoso');
    expect(lerLimiteDeCompra({ limite: '2000', usado: 1500, livre: 500, ate: '2026-11-10T00:00:00Z', daEquipe: false })).toEqual({ limite: 2000, usado: 1500, livre: 500, ate: '2026-11-10T00:00:00Z', daEquipe: false });
    expect(lerLimiteDeCompra(null)).toBeNull();
    expect(lerBloqueios([{ id: 1, oficinaId: 'o', nome: 'O', cidade: null, uf: null, criada: 'c', limiteDaEquipe: null, valor: '900', usado: 1500, limite: 2000, quando: 'q' }])).toEqual([
      expect.objectContaining({ valor: 900, usado: 1500, limite: 2000, limiteDaEquipe: null })
    ]);
    expect(ITENS_PROIBIDOS.length).toBeGreaterThanOrEqual(6);
    expect(ITENS_PROIBIDOS.every((i) => i.titulo && i.detalhe.endsWith('.'))).toBe(true);
  });
});
