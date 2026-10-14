import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { BaseAdmin } from '@/components/equipe/BaseAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { listarBaseAdmin } from '@/lib/marketplace';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Base de prazos' };

export default async function PaginaBase() {
  const portao = await portaoDaEquipe('/admin/base');
  if (portao) return portao;
  const { dados, erro } = await listarBaseAdmin();
  return (
    <Moldura
      aba="base"
      titulo="Base de prazos"
      descricao="O prazo de troca recomendado para cada produto, com a fonte. As sugestões das oficinas só aparecem para todos depois de aprovadas."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <BaseAdmin linhas={dados} />
    </Moldura>
  );
}
