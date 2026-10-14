import type { Metadata } from 'next';
import { AvisoErro } from '@/components/equipe/comum';
import { ListaCadastros } from '@/components/equipe/ListaCadastros';
import { Moldura } from '@/components/equipe/Moldura';
import { portaoDaEquipe } from '@/components/equipe/Portao';
import { buscarCadastros } from '@/lib/equipe';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cadastros' };

export default async function PaginaCadastros() {
  const portao = await portaoDaEquipe('/equipe/cadastros');
  if (portao) return portao;
  const { dados, erro } = await buscarCadastros();
  return (
    <Moldura aba="cadastros" titulo="Cadastros do site" descricao="Oficinas, fornecedores, donos de carro e mensagens de contato. Ao responder pelo WhatsApp ou e-mail, o cadastro vai para respondidos.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <ListaCadastros cadastros={dados} agora={Date.now()} />
    </Moldura>
  );
}
