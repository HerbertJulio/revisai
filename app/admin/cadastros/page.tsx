import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaCadastros } from '@/components/equipe/ListaCadastros';
import { Moldura } from '@/components/equipe/Moldura';
import { buscarCadastros } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cadastros' };

export default async function PaginaCadastros() {
  const acesso = await exigirEquipe(PODE.mudarCadastro);
  const { dados, erro } = await buscarCadastros(acesso.sb);
  return (
    <Moldura
      acesso={acesso}
      aba="cadastros"
      titulo="Cadastros do site"
      descricao="Oficinas, lojas, donos de carro e mensagens de contato. Ao responder pelo WhatsApp ou e-mail, o cadastro vai para respondidos."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ListaCadastros cadastros={dados} agora={Date.now()} />
    </Moldura>
  );
}
