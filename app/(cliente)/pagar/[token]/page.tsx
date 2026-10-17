import type { Metadata } from 'next';
import { LinkInvalido } from '@/components/cliente/comum';
import { PaginaPagamento } from '@/components/oficina/cobranca-cliente/PaginaPagamento';
import { avisoAindaVale, lerDadosDoPagamento, lerRespostaPaguei } from '@/lib/cobranca-cliente';
import { hojeNoBrasil } from '@/lib/links-publicos';
import { verLink } from '@/lib/links-servidor';

// O Pix que a oficina mandou ao cliente (o link /l/<token> de tipo 'pagamento' chega aqui).
// O endereço é a chave: o banco guarda só o hash, e a oficina é sempre a do banco.

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Pagamento por Pix',
  description: 'O Pix que a sua oficina mandou, com o QR Code e o código para copiar.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

export default async function PaginaPagar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verLink(token);
  const dados = link?.tipo === 'pagamento' ? lerDadosDoPagamento(link.dados) : null;
  if (!link || !dados) return <LinkInvalido />;
  const resposta = lerRespostaPaguei(link.resposta);
  const quando = resposta ? resposta.quando || link.respondidoEm : null;
  const vale = avisoAindaVale(quando, dados.naoCaiuEm);
  return (
    <div className="px-4 pt-8 sm:px-6 lg:pt-12">
      <PaginaPagamento token={token} dados={dados} oficina={link.oficina} avisouEm={vale ? quando : null} naoCaiu={!!quando && !vale} hoje={hojeNoBrasil()} />
    </div>
  );
}
