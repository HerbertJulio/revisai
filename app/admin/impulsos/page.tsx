import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { ImpulsosAdmin } from '@/components/equipe/ImpulsosAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { listarImpulsos } from '@/lib/equipe/dados';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Impulsos' };

export default async function PaginaImpulsos() {
  const acesso = await exigirEquipe();
  const { dados, erro } = await listarImpulsos(acesso.sb);
  return (
    <Moldura acesso={acesso} aba="impulsos" titulo="Impulsos" descricao="Produtos que as lojas pagaram para aparecer primeiro, com o selo Patrocinado.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ImpulsosAdmin impulsos={dados} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
