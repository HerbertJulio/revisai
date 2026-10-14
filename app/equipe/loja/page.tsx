import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { LojaEquipe } from '@/components/equipe/LojaEquipe';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { buscarLoja } from '@/lib/equipe';
import { diaEmBrasilia } from '@/lib/equipe-dados';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Loja' };

export default async function PaginaLoja() {
  const portao = await portaoDaEquipe('/equipe/loja');
  if (portao) return portao;
  const { dados, erro } = await buscarLoja();
  return (
    <Moldura aba="loja" titulo="Loja" descricao="Promoções e fornecedores do marketplace, inclusive o que está fora do ar.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <LojaEquipe loja={dados} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
