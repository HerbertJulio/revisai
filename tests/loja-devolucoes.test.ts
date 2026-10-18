import { afterEach, describe, expect, it, vi } from 'vitest';
import { acoesDaDevolucao, aguardaQuem, enderecoDaFotoDaDevolucao, lerDevolucoes, valorDaDevolucao } from '@/lib/loja/dados';
import { bancoFalso } from './loja-ajuda';

vi.mock('server-only', () => ({}));

const OFICINA = '7c8e8f6a-1b2c-4d3e-8f9a-0b1c2d3e4f5a';
const ID = '0b9d6a52-3f1e-4c7a-9d2b-5e8f7a6c1d30';
const FOTO = `${OFICINA}/devolucoes/1f2e3d4c-5b6a-4789-8abc-def012345678.webp`;

const linha = {
  id: ID,
  parte_id: '41',
  oficina_id: OFICINA,
  fornecedor_id: 9,
  codigo: 'AB12CD',
  tipo: 'garantia',
  motivo: 'A bomba parou depois de 2 semanas',
  itens: [{ produto_id: 3, nome: 'Bomba d’água', quantidade: '2', preco_unitario: '150.5' }, { produto_id: 'x' }],
  fotos: [FOTO, 42],
  situacao: 'aberta',
  resposta: 'Mande a nota, por favor',
  respondida_em: '2026-10-10T12:00:00+00:00',
  resolvida_em: null,
  criado_em: '2026-10-09T12:00:00+00:00',
  atualizado_em: '2026-10-10T12:00:00+00:00',
  parte: { oficina_nome: 'Oficina do Zé', oficina_whatsapp: '5521999990000', oficina_cidade: 'Niterói', oficina_uf: 'RJ', subtotal: '301', entregue_em: '2026-10-01T15:00:00+00:00' },
  loja: { nome: 'Auto Peças Centro', whatsapp: '5521988887777' }
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('devolução: leitura e de quem é a vez', () => {
  it('lê a devolução com a compra, a loja, os itens e as fotos pela rota do site', () => {
    const [d] = lerDevolucoes([linha, { id: 'quebrada' }]);
    expect(d).toMatchObject({
      id: ID,
      parteId: 41,
      fornecedorId: 9,
      tipo: 'garantia',
      itens: [{ produtoId: 3, nome: 'Bomba d’água', quantidade: 2, precoUnitario: 150.5 }],
      oficina: { nome: 'Oficina do Zé', cidade: 'Niterói', uf: 'RJ' },
      loja: { nome: 'Auto Peças Centro' },
      compra: { subtotal: 301 }
    });
    expect(d.fotos).toHaveLength(1);
    expect(d.fotos[0].caminho).toBe(FOTO);
    expect(d.fotos[0].url).toMatch(new RegExp(`^/fornecedor/devolucoes/foto/${ID}/0\\?v=[0-9a-z]+$`));
    // a marca muda quando a foto daquela posição muda
    expect(enderecoDaFotoDaDevolucao(ID, 0, FOTO)).not.toBe(enderecoDaFotoDaDevolucao(ID, 0, `${OFICINA}/devolucoes/outra.webp`));
    expect(valorDaDevolucao(d)).toBe(301);
    expect(valorDaDevolucao({ ...d, itens: [] })).toBe(301);
    expect(valorDaDevolucao({ ...d, itens: [{ produtoId: 3, nome: 'x', quantidade: 1, precoUnitario: null }] })).toBeNull();
  });

  it('a pergunta da loja passa a vez para a oficina; a oficina completando, volta para a loja', () => {
    const base = { situacao: 'aberta' as const, respondidaEm: null, atualizadoEm: '2026-10-10T12:00:00Z' };
    expect(aguardaQuem(base)).toBe('loja');
    expect(aguardaQuem({ ...base, respondidaEm: '2026-10-10T12:00:00Z' })).toBe('oficina');
    expect(aguardaQuem({ ...base, respondidaEm: '2026-10-10T12:00:00Z', atualizadoEm: '2026-10-10T13:00:00Z' })).toBe('loja');
    expect(aguardaQuem({ ...base, situacao: 'aceita' })).toBe('loja');
    expect(aguardaQuem({ ...base, situacao: 'recusada' })).toBeNull();
    expect(acoesDaDevolucao('aberta', 'loja').situacoes).toEqual(['aceita', 'recusada']);
    expect(acoesDaDevolucao('recusada', 'loja').situacoes).toEqual(['aceita']);
    expect(acoesDaDevolucao('resolvida', 'loja')).toMatchObject({ situacoes: [], responder: false });
    expect(acoesDaDevolucao('aberta', 'oficina')).toMatchObject({ situacoes: [], editar: true, desistir: true });
    expect(acoesDaDevolucao('aceita', 'oficina')).toMatchObject({ situacoes: ['resolvida'], editar: false });
  });
});

describe('devolução: a oficina pede, a loja responde', async () => {
  const { abrirDevolucao, confirmarResolucao, desistirDaDevolucao, editarDevolucao, enviarFotoDaDevolucao, fotoDaDevolucao, responderDevolucao } = await import('@/lib/loja/devolucoes');

  it('a oficina pede com motivo, itens e fotos da pasta dela; o banco põe a loja e o código', async () => {
    const b = bancoFalso({ 'devolucoes.insert': { data: { id: ID } } });
    expect(await abrirDevolucao(b.sb, { parteId: 41, tipo: 'garantia', motivo: '  Parou de funcionar  ', itens: [{ produtoId: 3, quantidade: 1 }], fotos: [FOTO] })).toEqual({ ok: true, id: ID });
    expect(b.chamadas[0]).toMatchObject({ nome: 'devolucoes', op: 'insert', dados: { parte_id: 41, tipo: 'garantia', motivo: 'Parou de funcionar', itens: [{ produto_id: 3, quantidade: 1 }], fotos: [FOTO] } });
    expect(b.chamadas[0].dados).not.toHaveProperty('fornecedor_id');
    // conferido antes de ir ao banco
    for (const ruim of [
      { parteId: 41, motivo: 'oi' },
      { parteId: 41, motivo: 'Motivo bom', fotos: ['outra-pasta/x.webp'] },
      { parteId: 41, motivo: 'Motivo bom', fotos: Array(7).fill(FOTO) },
      { parteId: 41, motivo: 'Motivo bom', itens: [{ produtoId: 3, quantidade: 1 }, { produtoId: 3, quantidade: 2 }] },
      { parteId: 0, motivo: 'Motivo bom' }
    ])
      expect((await abrirDevolucao(b.sb, ruim)).ok).toBe(false);
    expect(b.chamadas).toHaveLength(1);
    // as recusas do banco viram mensagem
    const em = bancoFalso({ devolucoes: { error: { code: '23505', message: 'duplicate key' } } });
    expect(await abrirDevolucao(em.sb, { parteId: 41, motivo: 'Motivo bom' })).toEqual({ ok: false, erro: 'Esta compra já tem um pedido de devolução em andamento.' });
    const prazo = bancoFalso({ devolucoes: { error: { code: 'P0001', message: 'O prazo para pedir devolução ou garantia pelo Revisaí é de 90 dias depois da entrega' } } });
    expect(await abrirDevolucao(prazo.sb, { parteId: 41, motivo: 'Motivo bom' })).toEqual({ ok: false, erro: 'O prazo para pedir devolução ou garantia pelo Revisaí é de 90 dias depois da entrega.' });
  });

  it('a oficina muda e desiste só enquanto está aberta, e confirma a resolução depois do aceite', async () => {
    const b = bancoFalso({ devolucoes: { data: { id: ID } } });
    expect(await editarDevolucao(b.sb, ID, { motivo: 'Veio a peça errada', fotos: [FOTO] })).toEqual({ ok: true });
    expect(b.chamadas[0]).toMatchObject({ op: 'update', filtros: [['eq', 'id', ID], ['eq', 'situacao', 'aberta']] });
    expect(await desistirDaDevolucao(b.sb, ID)).toEqual({ ok: true });
    expect(b.chamadas[1]).toMatchObject({ op: 'delete', filtros: [['eq', 'id', ID], ['eq', 'situacao', 'aberta']] });
    expect(await confirmarResolucao(b.sb, ID)).toEqual({ ok: true });
    expect(b.chamadas[2]).toMatchObject({ op: 'update', dados: { situacao: 'resolvida' }, filtros: [['eq', 'id', ID], ['eq', 'situacao', 'aceita']] });
    const nada = bancoFalso();
    expect(await editarDevolucao(nada.sb, ID, { motivo: 'Veio a peça errada' })).toEqual({ ok: false, erro: 'Este pedido não pode mais mudar: a loja já decidiu.' });
    expect(await desistirDaDevolucao(nada.sb, 'nao-e-id')).toEqual({ ok: false, erro: 'Pedido de devolução não encontrado.' });
    expect(nada.chamadas).toHaveLength(1);
  });

  it('a loja pede informação, aceita, recusa com a razão e resolve, só na própria loja', async () => {
    const b = bancoFalso({ devolucoes: (c) => ({ data: { situacao: (c.dados as { situacao: string }).situacao } }) });
    expect(await responderDevolucao(b.sb, 9, ID, { situacao: 'aberta', resposta: 'Mande a foto da etiqueta' })).toEqual({ ok: true, situacao: 'aberta' });
    expect(b.chamadas[0]).toMatchObject({ op: 'update', dados: { situacao: 'aberta', resposta: 'Mande a foto da etiqueta' }, filtros: [['eq', 'id', ID], ['eq', 'fornecedor_id', 9]] });
    // aceitar sem texto mantém a resposta que estava
    expect(await responderDevolucao(b.sb, 9, ID, { situacao: 'aceita', resposta: '  ' })).toEqual({ ok: true, situacao: 'aceita' });
    expect(b.chamadas[1].dados).toEqual({ situacao: 'aceita' });
    expect(await responderDevolucao(b.sb, 9, ID, { situacao: 'recusada', resposta: 'não' })).toEqual({ ok: false, erro: 'Diga à oficina por que a devolução foi recusada.' });
    expect(await responderDevolucao(b.sb, 9, ID, { situacao: 'aberta' })).toEqual({ ok: false, erro: 'Escreva o que precisa saber da oficina.' });
    expect((await responderDevolucao(b.sb, 9, ID, { situacao: 'cancelada', resposta: 'x' })).ok).toBe(false);
    expect(b.chamadas).toHaveLength(2);
    const fim = bancoFalso({ devolucoes: { error: { code: 'P0001', message: 'Esta devolução já foi resolvida' } } });
    expect(await responderDevolucao(fim.sb, 9, ID, { situacao: 'resolvida' })).toEqual({ ok: false, erro: 'Esta devolução já foi resolvida.' });
    const outra = bancoFalso();
    expect(await responderDevolucao(outra.sb, 9, ID, { situacao: 'resolvida' })).toEqual({ ok: false, erro: 'Pedido de devolução não encontrado.' });
  });

  it('a foto vai para a pasta da oficina com nome novo e só sai pela rota para quem vê a devolução', async () => {
    const b = bancoFalso();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const r = await enviarFotoDaDevolucao(b.sb, OFICINA, new File([png], 'peca.png', { type: 'image/png' }));
    expect(r.ok).toBe(true);
    expect(b.uploads[0].caminho).toMatch(new RegExp(`^${OFICINA}/devolucoes/[0-9a-f-]{36}\\.png$`));
    expect((await enviarFotoDaDevolucao(b.sb, OFICINA, new File([png], 'x.gif', { type: 'image/gif' }))).ok).toBe(false);
    expect((await enviarFotoDaDevolucao(b.sb, OFICINA, new File([new Uint8Array([1, 2, 3, 4])], 'x.png', { type: 'image/png' }))).ok).toBe(false);
    expect((await enviarFotoDaDevolucao(b.sb, 'outra', new File([png], 'peca.png', { type: 'image/png' }))).ok).toBe(false);
    expect(b.uploads).toHaveLength(1);

    const busca = vi.fn(async () => new Response(png, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', busca);
    const v = bancoFalso({ devolucoes: { data: { fotos: [FOTO] } } });
    const foto = await fotoDaDevolucao(v.sb, ID, 0);
    expect(foto?.tipo).toBe('image/png');
    expect(foto?.bytes.byteLength).toBe(png.length);
    expect(busca).toHaveBeenCalledWith(`https://fotos.teste/${FOTO}`, expect.anything());
    expect(await fotoDaDevolucao(v.sb, ID, 1)).toBeNull();
    expect(await fotoDaDevolucao(v.sb, ID, 9)).toBeNull();
    // quem não vê a devolução (o banco não devolve a linha) não recebe a foto
    expect(await fotoDaDevolucao(bancoFalso().sb, ID, 0)).toBeNull();
    // o que voltar sem ser imagem não passa
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect(await fotoDaDevolucao(v.sb, ID, 0)).toBeNull();
    expect(busca).toHaveBeenCalledTimes(1);
  });

  it('o aviso no WhatsApp da loja sai com o modelo de devolução', async () => {
    const { avisarLojaDaDevolucao } = await import('@/lib/loja/avisos');
    for (const [k, v] of Object.entries({ WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_VERIFY_TOKEN: 'v', WHATSAPP_APP_SECRET: 's', WHATSAPP_MODELO_LOJA_DEVOLUCAO: 'loja_devolucao' })) vi.stubEnv(k, v);
    const enviado = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', enviado);
    const b = bancoFalso({
      devolucoes: { data: { fornecedor_id: 9, codigo: 'AB12CD', tipo: 'garantia', parte: { oficina_nome: 'Oficina do Zé' } } },
      fornecedores: { data: [{ id: 9, nome: 'Auto Peças Centro', whatsapp: '5521988887777', avisar_whatsapp: true }] }
    });
    expect(await avisarLojaDaDevolucao(b.sb, ID)).toBe(true);
    expect(enviado.mock.calls[0][0]).toContain('/123/messages');
    const corpo = JSON.parse(String(enviado.mock.calls[0][1].body));
    expect(corpo).toMatchObject({ to: '5521988887777', template: { name: 'loja_devolucao' } });
    expect(corpo.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(['AB12CD', 'Oficina do Zé', 'garantia']);
  });
});
