'use client';

// Cadastro do carro e do estoque e o relacionamento com o cliente: o valor FIPE na página do
// carro (a busca pela placa fica no formulário do carro; a nota de compra e o código de barras,
// na tela do estoque), a fidelidade (pontos que viram desconto), as campanhas de recall e a
// pergunta do NPS no início.

import { Award, ShieldAlert } from 'lucide-react';
import { PainelFipe } from '../cadastro/PainelFipe';
import { creditarPontosDaOrdem, PontosDaOrdem, PontosDoCarro } from '../fidelidade/PaineisDePontos';
import { CartaoNps } from '../nps/CartaoNps';
import type { Extensao } from './tipos';

export const extensao: Extensao = {
  telas: [
    { href: '/oficina/fidelidade', rotulo: 'Fidelidade', descricao: 'Pontos a cada serviço que viram desconto, e quem mais volta.', Icone: Award, soGestao: true },
    { href: '/oficina/recall', rotulo: 'Recall', descricao: 'Campanhas das montadoras e os carros dos seus clientes que entram nelas.', Icone: ShieldAlert }
  ],
  paineisDaOrdem: [PontosDaOrdem],
  paineisDoCarro: [PainelFipe, PontosDoCarro],
  paineisDoInicio: [CartaoNps],
  aoConcluir: (documentoId) => {
    creditarPontosDaOrdem(documentoId);
  }
};
