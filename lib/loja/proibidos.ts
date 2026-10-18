// O que não pode ser vendido pela loja do Revisaí. Aparece no cadastro de produto da loja e orienta
// a moderação: produto assim sai da vitrine, e a loja que insiste sai do ar.

export interface ItemProibido {
  titulo: string;
  detalhe: string;
}

export const ITENS_PROIBIDOS: readonly ItemProibido[] = [
  { titulo: 'Peça falsificada ou réplica', detalhe: 'Vendida como original ou com a marca de outra empresa sem ser dela.' },
  {
    titulo: 'Usado, recondicionado ou remanufaturado sem dizer',
    detalhe: 'Pode vender, desde que o nome e a descrição digam isso com clareza (e o óleo rerrefinado não passe por novo).'
  },
  { titulo: 'Produto sem procedência', detalhe: 'Sem nota fiscal, de roubo ou de desmanche irregular.' },
  { titulo: 'Óleo lubrificante sem registro na ANP', detalhe: 'Todo óleo vendido precisa ter registro válido.' },
  { titulo: 'Item que exige selo do Inmetro sem o selo', detalhe: 'Pneus, rodas e lâmpadas automotivas, por exemplo.' },
  { titulo: 'Peça para burlar a lei', detalhe: 'Para tirar o catalisador, desligar o controle de emissões ou mexer no hodômetro.' },
  { titulo: 'Preço ou anúncio enganoso', detalhe: 'Preço que não é o cobrado, kit incompleto, foto ou ficha técnica de outro produto.' },
  { titulo: 'Conteúdo impróprio', detalhe: 'Foto ou texto ofensivo, de outra loja sem permissão, ou com contato para comprar fora do Revisaí.' }
];

export const TEXTO_DA_MODERACAO =
  'Produto denunciado por três oficinas sai da vitrine na hora, até a equipe do Revisaí olhar. A equipe pode manter fora e, se a loja insistir, tirar a loja do ar.';
