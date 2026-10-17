import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { filaDeModeracao } from '@/lib/loja/moderacao';
import { agruparDenuncias } from '@/lib/loja/moderacao-dados';
import { FilaDeModeracao } from './_componentes/FilaDeModeracao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Moderação' };

export default async function PaginaModeracao() {
  const acesso = await exigirEquipe(PODE.suporte);
  const { dados, erro } = await filaDeModeracao(acesso.sb);
  return (
    <Moldura
      acesso={acesso}
      aba="moderacao"
      titulo="Moderação"
      descricao="Denúncias das oficinas sobre produtos e lojas. Produto denunciado por 3 oficinas sai da vitrine sozinho até a equipe decidir. A loja não vê quem denunciou."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <FilaDeModeracao grupos={agruparDenuncias(dados.abertas)} ocultos={dados.ocultos} decididas={dados.decididas} />
    </Moldura>
  );
}
