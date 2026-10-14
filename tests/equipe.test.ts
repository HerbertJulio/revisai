import { describe, expect, it } from 'vitest';
import {
  dataCurta,
  descontoPercentual,
  diasParaAcabar,
  lerCadastros,
  lerPedidos,
  mensagemCadastro,
  mensagemPedido,
  porFornecedor,
  quandoFoi,
  situacaoPromocao,
  somaDosPedidos
} from '@/lib/equipe-dados';
import { criarSessao, DURACAO_SESSAO_MS, senhaConfere, sessaoValida } from '@/lib/sessao-equipe';

const SEGREDO = 'segredo-de-teste-0123456789abcdef0123456789';

describe('sessão da equipe', () => {
  const agora = Date.parse('2026-10-13T21:00:00-03:00');

  it('aceita a sessão recém-criada e recusa a adulterada, a vencida e a de outra senha', () => {
    const s = criarSessao(SEGREDO, 'rvq7-m4kp', agora);
    expect(sessaoValida(s, SEGREDO, 'rvq7-m4kp', agora + 1000)).toBe(true);
    expect(sessaoValida(s, SEGREDO, 'outra-senha', agora + 1000)).toBe(false);
    expect(sessaoValida(s, 'outro-segredo-0123456789abcdef0123456789', 'rvq7-m4kp', agora + 1000)).toBe(false);
    expect(sessaoValida(s, SEGREDO, 'rvq7-m4kp', agora + DURACAO_SESSAO_MS + 1)).toBe(false);
    const [expira, assinatura] = s.split('.');
    expect(sessaoValida(`${Number(expira) + 1000}.${assinatura}`, SEGREDO, 'rvq7-m4kp', agora)).toBe(false);
    expect(sessaoValida(`${expira}.${assinatura.slice(0, -2)}xx`, SEGREDO, 'rvq7-m4kp', agora)).toBe(false);
    expect(sessaoValida('lixo', SEGREDO, 'rvq7-m4kp', agora)).toBe(false);
    expect(sessaoValida(undefined, SEGREDO, 'rvq7-m4kp', agora)).toBe(false);
  });

  it('confere a senha sem ligar para maiúsculas e espaços nas pontas', () => {
    expect(senhaConfere(' Rvq7-M4kp ', 'rvq7-m4kp')).toBe(true);
    expect(senhaConfere('rvq7-m4kq', 'rvq7-m4kp')).toBe(false);
    expect(senhaConfere('', '')).toBe(false);
  });
});

const linhaPedido = {
  id: 7,
  codigo: 'NVF9VX',
  oficina_nome: 'Auto Center Serra',
  oficina_whatsapp: '5521987654321',
  oficina_cidade: 'Guapimirim',
  oficina_uf: 'RJ',
  itens: [
    { produto_id: 101, nome: 'Óleo 5W-30 dexos1 1 L', fornecedor_id: 1, fornecedor: 'Distribuidora de Lubrificantes', quantidade: 4, preco_unitario: 37.35, promocao: true },
    { produto_id: 201, nome: 'Filtro de óleo Onix', fornecedor_id: 2, fornecedor: 'Central de Filtros', quantidade: 1, preco_unitario: '29.90', promocao: false }
  ],
  total: '179.30',
  observacao: null,
  status: 'novo',
  criado_em: '2026-10-14T00:17:05.123+00:00'
};

describe('pedidos no painel', () => {
  it('lê as linhas do banco e descarta as quebradas', () => {
    const { itens, descartadas } = lerPedidos([linhaPedido, { ...linhaPedido, id: 8, status: 'perdido' }, null]);
    expect(itens).toHaveLength(1);
    expect(descartadas).toBe(2);
    expect(itens[0].total).toBe(179.3);
    expect(itens[0].itens[1].preco_unitario).toBe(29.9);
  });

  it('agrupa os itens por fornecedor e soma', () => {
    const p = lerPedidos([linhaPedido]).itens[0];
    const grupos = porFornecedor(p.itens);
    expect(grupos.map((g) => [g.fornecedor, g.subtotal])).toEqual([
      ['Distribuidora de Lubrificantes', 149.4],
      ['Central de Filtros', 29.9]
    ]);
    expect(somaDosPedidos([p, p])).toBe(358.6);
  });

  it('monta a mensagem para a oficina', () => {
    const p = lerPedidos([linhaPedido]).itens[0];
    expect(mensagemPedido(p).replace(/\s/g, ' ')).toBe(
      'Olá! Aqui é da equipe do Revisaí. Recebemos o pedido NVF9VX da Auto Center Serra, com 2 itens, no total de R$ 179,30. Vamos combinar o pagamento e a entrega?'
    );
  });

  it('diz quando foi no horário de Brasília', () => {
    const agora = Date.parse('2026-10-13T22:00:00-03:00');
    expect(quandoFoi('2026-10-14T00:17:05Z', agora)).toBe('hoje às 21:17');
    expect(quandoFoi('2026-10-13T00:05:00Z', agora)).toBe('ontem às 21:05');
    expect(quandoFoi('2026-09-02T15:30:00Z', agora)).toBe('02/09 às 12:30');
    expect(quandoFoi('2025-12-31T15:30:00Z', agora)).toBe('31/12/2025 às 12:30');
    expect(quandoFoi('quebrado', agora)).toBe('');
  });
});

describe('cadastros no painel', () => {
  const base = { id: 1, nome: 'Marcos Antônio', empresa: 'Auto Center Serra', whatsapp: '5521987654321', email: null, cidade: 'Teresópolis', uf: 'RJ', mensagem: null, origem: 'planos', situacao: 'novo', criado_em: '2026-10-13T12:00:00Z' };

  it('lê e escreve a mensagem certa para cada tipo', () => {
    const [oficina, fornecedor] = lerCadastros([
      { ...base, tipo: 'oficina', plano: 'plus' },
      { ...base, id: 2, tipo: 'fornecedor', plano: null, empresa: 'Lubrificantes Rio' }
    ]).itens;
    expect(mensagemCadastro(oficina)).toBe('Oi, Marcos! Aqui é da equipe do Revisaí. Vi que você quer o Revisaí Pro para a Auto Center Serra. Posso te explicar como funciona e liberar o seu acesso?');
    expect(mensagemCadastro(fornecedor)).toContain('da Lubrificantes Rio em vender para as oficinas');
    expect(lerCadastros([{ ...base, tipo: 'outro', plano: null }]).descartadas).toBe(1);
  });
});

describe('promoções no painel', () => {
  it('situação, desconto e prazo', () => {
    const hoje = '2026-10-13';
    expect(situacaoPromocao({ ativo: true, inicio: '2026-10-01', fim: '2026-10-31' }, hoje)).toBe('em_vigor');
    expect(situacaoPromocao({ ativo: true, inicio: '2026-11-01', fim: '2026-11-15' }, hoje)).toBe('programada');
    expect(situacaoPromocao({ ativo: true, inicio: '2026-09-01', fim: '2026-10-12' }, hoje)).toBe('encerrada');
    expect(situacaoPromocao({ ativo: false, inicio: '2026-10-01', fim: '2026-10-31' }, hoje)).toBe('pausada');
    expect(descontoPercentual(49.9, 39.9)).toBe(20);
    expect(descontoPercentual(39.9, 39.9)).toBe(0);
    expect(diasParaAcabar('2026-10-13', hoje)).toBe(0);
    expect(diasParaAcabar('2026-10-20', hoje)).toBe(7);
    expect(dataCurta('2026-10-31', hoje)).toBe('31/10');
    expect(dataCurta('2027-01-05', hoje)).toBe('05/01/2027');
  });
});
