import type { Metadata } from 'next';
import { Entregador } from '@/components/site/Entregador';
import { dadosDaEntrega } from '@/lib/entregas';
import { tokenValido } from '@/lib/entregas-dados';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Entrega',
  description: 'A entrega de um pedido feito pelo Revisaí.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

export default async function PaginaEntrega({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dados = tokenValido(token) ? await dadosDaEntrega(token) : null;
  return (
    <div className="mx-auto max-w-lg px-4 pt-6 sm:pt-10">
      {dados ? (
        <Entregador token={token} dados={dados} />
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="largo text-[28px] leading-tight">Este link não vale mais</h1>
          <p className="text-tinta-2">A entrega pode ter terminado, ou a loja gerou um link novo. Peça o link certo para a loja.</p>
        </div>
      )}
    </div>
  );
}
