import type { Metadata } from 'next';
import { LinkInvalido } from '@/components/cliente/comum';
import { CartaoDoMembro } from '@/components/oficina/clube/CartaoDoMembro';
import { lerDadosDoCartao } from '@/lib/clube';
import { avisoAindaVale, lerRespostaPaguei } from '@/lib/cobranca-cliente';
import { hojeNoBrasil } from '@/lib/links-publicos';
import { verLink } from '@/lib/links-servidor';

// O cartão do clube de manutenção que a oficina mandou ao membro (o link /l/<token> de tipo
// 'clube' chega aqui). O aviso "Já paguei" vale para a mensalidade em aberto que o cartão mostra.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Cartão do clube',
  description: 'O seu plano no clube de manutenção da oficina: benefícios, descontos e a mensalidade.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

export default async function PaginaClube({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verLink(token);
  const dados = link?.tipo === 'clube' ? lerDadosDoCartao(link.dados) : null;
  if (!link || !dados) return <LinkInvalido />;
  const resposta = lerRespostaPaguei(link.resposta);
  // o aviso vale só para a mensalidade que está em aberto agora
  const doMesAberto = !!resposta && !!dados.aberta && resposta.competencia === dados.aberta.competencia;
  const quando = resposta && doMesAberto ? resposta.quando || link.respondidoEm : null;
  const vale = avisoAindaVale(quando, dados.naoCaiuEm);
  return (
    <div className="px-4 pt-8 sm:px-6 lg:pt-12">
      <CartaoDoMembro token={token} dados={dados} oficina={link.oficina} avisouEm={vale ? quando : null} naoCaiu={!!quando && !vale} hoje={hojeNoBrasil()} />
    </div>
  );
}
