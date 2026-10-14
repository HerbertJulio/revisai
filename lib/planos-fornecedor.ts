// Como o fornecedor paga para vender no Revisaí. Os valores aqui são os de tabela;
// a equipe pode combinar outro valor no contrato de cada fornecedor (painel administrativo).

export type PlanoFornecedor = 'vitrine' | 'destaque';

export interface InfoPlano {
  nome: string;
  mensalidade: number;
  /** Percentual sobre os pedidos entregues. */
  comissao: number;
  resumo: string;
  itens: string[];
}

export const PLANOS_FORNECEDOR: Record<PlanoFornecedor, InfoPlano> = {
  vitrine: {
    nome: 'Vitrine',
    mensalidade: 0,
    comissao: 6,
    resumo: 'Para começar a vender sem mensalidade.',
    itens: [
      'Seus produtos na loja das oficinas, com foto e ficha técnica',
      'Entram nas recomendações quando atendem ao carro',
      'Promoções com quantidade mínima e data para acabar',
      'Pedidos com o WhatsApp da oficina',
      'Resumo da demanda da sua região'
    ]
  },
  destaque: {
    nome: 'Destaque',
    mensalidade: 149,
    comissao: 4,
    resumo: 'Para quem quer aparecer primeiro e vender mais.',
    itens: [
      'Tudo da Vitrine, com comissão menor',
      'Sua loja aparece antes das outras e ganha o selo Loja destaque',
      'Demanda da região completa, com as quantidades de cada produto',
      'Sugestões de promoção para o que as oficinas vão comprar',
      'Um impulso de 7 dias por mês incluído'
    ]
  }
};

/** Impulso: um produto no topo da categoria, com o selo Patrocinado. */
export const DIAS_IMPULSO = [7, 15, 30] as const;
export type DiasImpulso = (typeof DIAS_IMPULSO)[number];

export const PRECO_IMPULSO: Record<DiasImpulso, number> = { 7: 29, 15: 49, 30: 89 };

export function diasImpulsoValido(n: number): n is DiasImpulso {
  return (DIAS_IMPULSO as readonly number[]).includes(n);
}

/** O último dia do impulso (o primeiro dia conta). */
export function fimDoImpulso(inicio: string, dias: number): string {
  const d = new Date(`${inicio}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias - 1);
  return d.toISOString().slice(0, 10);
}

/** Comissão de um valor, em reais. */
export function valorDaComissao(subtotal: number, percentual: number): number {
  return Math.round(subtotal * percentual) / 100;
}
