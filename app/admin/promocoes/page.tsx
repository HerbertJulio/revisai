import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { LojaEquipe } from '@/components/equipe/LojaEquipe';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { buscarLoja } from '@/lib/equipe';
import { diaEmBrasilia } from '@/lib/equipe-dados';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Promoções' };

export default async function PaginaPromocoes() {
  const portao = await portaoDaEquipe('/admin/promocoes');
  if (portao) return portao;
  const { dados, erro } = await buscarLoja();
  return (
    <Moldura aba="promocoes" titulo="Promoções" descricao="As promoções dos fornecedores, em vigor, programadas e encerradas.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <LojaEquipe loja={dados} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
