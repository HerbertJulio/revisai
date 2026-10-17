import type { Metadata } from 'next';
import { Moldura } from '@/components/equipe/Moldura';
import { Titulares } from '@/components/equipe/Titulares';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dados pessoais' };

export default async function PaginaTitulares() {
  const acesso = await exigirEquipe(PODE.titulares);
  return (
    <Moldura
      acesso={acesso}
      aba="titulares"
      titulo="Dados pessoais"
      descricao="Pedidos de quem quer saber o que o Revisaí guarda sobre si ou quer apagar tudo (LGPD). Confira que o pedido veio do próprio e-mail antes. Cada pedido fica no histórico da equipe."
    >
      <Titulares />
    </Moldura>
  );
}
