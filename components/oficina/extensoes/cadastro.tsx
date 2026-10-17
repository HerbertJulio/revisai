'use client';

// Cadastro do carro e do estoque e o relacionamento com o cliente: o valor FIPE na página do
// carro (a busca pela placa fica no próprio formulário do carro, e a nota de compra e o código de
// barras na tela do estoque).

import { PainelFipe } from '../cadastro/PainelFipe';
import type { Extensao } from './tipos';

export const extensao: Extensao = {
  paineisDoCarro: [PainelFipe]
};
