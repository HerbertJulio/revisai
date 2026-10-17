import type { Metadata } from 'next';
import { ConsultaAcessos } from '@/components/equipe/ConsultaAcessos';
import { Moldura } from '@/components/equipe/Moldura';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Registros de acesso' };

export default async function PaginaAcessos() {
  const acesso = await exigirEquipe(PODE.acessos);
  return (
    <Moldura acesso={acesso} aba="acessos" titulo="Registros de acesso" descricao="Data, hora, IP e porta de cada acesso, para responder a uma ordem judicial. Só o admin consulta.">
      <ConsultaAcessos />
    </Moldura>
  );
}
