import type { Metadata } from 'next';
import { ChamadosEquipe } from '@/components/equipe/ChamadosEquipe';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { listarChamados } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suporte' };

export default async function PaginaSuporte() {
  const acesso = await exigirEquipe(PODE.suporte);
  const { dados, erro } = await listarChamados(acesso.sb);
  return (
    <Moldura
      acesso={acesso}
      aba="suporte"
      titulo="Suporte"
      descricao="Os pedidos de ajuda das oficinas e lojas. A pessoa vê a resposta no app; quando ela escreve de novo, o pedido volta para esperando."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ChamadosEquipe chamados={dados} agora={Date.now()} />
    </Moldura>
  );
}
