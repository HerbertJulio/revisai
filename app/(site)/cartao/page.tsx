import type { Metadata } from 'next';
import { HistoricoNoCartao } from '@/components/cliente/HistoricoNoCartao';
import { CartaoDono } from '@/components/site/CartaoDono';

export const metadata: Metadata = {
  title: 'Cartão de manutenção',
  description: 'As próximas trocas e revisões do seu carro, enviadas pela sua oficina.',
  robots: { index: false, follow: false }
};

export default function Cartao() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6 lg:pt-14">
      <CartaoDono />
      <HistoricoNoCartao />
    </div>
  );
}
