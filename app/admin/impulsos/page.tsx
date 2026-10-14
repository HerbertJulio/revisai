import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { ImpulsosAdmin } from '@/components/equipe/ImpulsosAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { diaEmBrasilia } from '@/lib/equipe-dados';
import { listarImpulsosAdmin } from '@/lib/marketplace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Impulsos' };

export default async function PaginaImpulsos() {
  const portao = await portaoDaEquipe('/admin/impulsos');
  if (portao) return portao;
  const { dados, erro } = await listarImpulsosAdmin();
  return (
    <Moldura aba="impulsos" titulo="Impulsos" descricao="Produtos que os fornecedores pagaram para aparecer primeiro, com o selo Patrocinado.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ImpulsosAdmin impulsos={dados} hoje={diaEmBrasilia(Date.now())} />
    </Moldura>
  );
}
