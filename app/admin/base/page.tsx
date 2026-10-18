import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { BaseAdmin } from '@/components/equipe/BaseAdmin';
import { Moldura } from '@/components/equipe/Moldura';
import { listarBase } from '@/lib/equipe/dados';
import { pode } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Base de prazos' };

export default async function PaginaBase() {
  const acesso = await exigirEquipe();
  const { dados, erro } = await listarBase(acesso.sb);
  return (
    <Moldura
      acesso={acesso}
      aba="base"
      titulo="Base de prazos"
      descricao="O prazo de troca recomendado para cada produto, com a fonte. As sugestões das oficinas só aparecem para todos depois que o suporte aprova."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <BaseAdmin linhas={dados} podeDecidir={pode(acesso.papel, 'decidirBase')} />
    </Moldura>
  );
}
