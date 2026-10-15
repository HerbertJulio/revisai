import type { Metadata } from 'next';
import { OrcamentoCliente } from '@/components/site/OrcamentoCliente';

export const metadata: Metadata = {
  title: 'Orçamento',
  description: 'O orçamento que a sua oficina mandou, para ver os itens e aprovar pelo WhatsApp.',
  robots: { index: false, follow: false }
};

export default function Orcamento() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-12">
      <OrcamentoCliente />
    </div>
  );
}
