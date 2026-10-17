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
import { codigoLimpo, descricaoDoAparelho, emailValido, mensagemDaEntrada } from '@/lib/equipe/entrada';
import { nomeDoPapelEquipe, pode, temPapel } from '@/lib/equipe/papeis';
import { quandoPassouPeloApp, segundoFatorEmDia } from '@/lib/equipe/segundo-fator';

describe('entrada da equipe', () => {
  const agora = Date.parse('2026-10-16T21:00:00-03:00');
  const seg = Math.floor(agora / 1000);

  it('o código do app vale por 12 horas, e só com aal2', () => {
    const sessao = (aal: 'aal1' | 'aal2', totpHa: number | null) => ({
      aal,
      metodos: [{ metodo: 'otp', quando: seg - 20 * 3600 }, ...(totpHa == null ? [] : [{ metodo: 'totp', quando: seg - totpHa }])]
    });
    expect(segundoFatorEmDia(sessao('aal2', 60), agora)).toBe(true);
    expect(segundoFatorEmDia(sessao('aal2', 11 * 3600 + 3500), agora)).toBe(true);
    expect(segundoFatorEmDia(sessao('aal2', 12 * 3600 + 1), agora)).toBe(false);
    expect(segundoFatorEmDia(sessao('aal1', 60), agora)).toBe(false);
    expect(segundoFatorEmDia(sessao('aal2', null), agora)).toBe(false);
    // vale o mais recente quando a pessoa confirmou mais de uma vez
    expect(quandoPassouPeloApp({ metodos: [{ metodo: 'totp', quando: 10 }, { metodo: 'totp', quando: 20 }, { metodo: 'otp', quando: 30 }] })).toBe(20_000);
    expect(quandoPassouPeloApp({ metodos: [{ metodo: 'otp', quando: 30 }] })).toBeNull();
  });

  it('confere e-mail e código, e não diz se o e-mail existe', () => {
    expect(emailValido('ana@revisai.com.br')).toBe(true);
    expect(emailValido('ana@revisai')).toBe(false);
    expect(emailValido('ana revisai@x.com')).toBe(false);
    expect(codigoLimpo(' 123 456 ')).toBe('123456');
    expect(codigoLimpo('12345')).toBeNull();
    expect(codigoLimpo('12a456')).toBeNull();
    expect(mensagemDaEntrada({ code: 'over_email_send_rate_limit' })).toMatch(/Muitas tentativas/);
    expect(mensagemDaEntrada({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/Código errado ou vencido/);
    expect(mensagemDaEntrada({ message: 'Signups not allowed for otp' })).toBe('Não deu para entrar agora. Tente de novo em instantes.');
  });

  it('descreve o aparelho para o histórico', () => {
    expect(descricaoDoAparelho('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36')).toBe('Chrome no Windows');
    expect(descricaoDoAparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari no iPhone');
    expect(descricaoDoAparelho('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 EdgA/141.0')).toBe('Chrome no Android');
    expect(descricaoDoAparelho('')).toBe('Navegador no outro sistema');
  });
});

describe('papéis da equipe', () => {
  it('admin pode tudo; cada papel só o que é dele', () => {
    expect(temPapel('admin', ['financeiro'])).toBe(true);
    expect(temPapel('suporte', ['financeiro'])).toBe(false);
    expect(temPapel('suporte')).toBe(true);
    expect(pode('financeiro', 'criarCodigo')).toBe(true);
    expect(pode('suporte', 'criarCodigo')).toBe(false);
    expect(pode('suporte', 'mudarPedido')).toBe(true);
    expect(pode('financeiro', 'mudarPedido')).toBe(false);
    expect(pode('financeiro', 'mudarContrato')).toBe(true);
    expect(pode('suporte', 'mudarContrato')).toBe(false);
    expect(pode('suporte', 'equipe')).toBe(false);
    expect(pode('financeiro', 'historico')).toBe(false);
    expect(pode('admin', 'acessos')).toBe(true);
    expect(pode('financeiro', 'ver')).toBe(true);
    expect(nomeDoPapelEquipe('financeiro')).toBe('Financeiro');
    expect(nomeDoPapelEquipe('sistema')).toBe('Sistema');
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
