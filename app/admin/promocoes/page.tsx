import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { LojaEquipe } from '@/components/equipe/LojaEquipe';
import { Moldura } from '@/components/equipe/Moldura';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { buscarLoja } from '@/lib/equipe/dados';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promoções' };

export default async function PaginaPromocoes() {
  const acesso = await exigirEquipe();
  const { dados, erro } = await buscarLoja(acesso.sb);
  return (
    <Moldura acesso={acesso} aba="promocoes" titulo="Promoções" descricao="As promoções das lojas, em vigor, programadas e encerradas.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <LojaEquipe loja={dados} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
