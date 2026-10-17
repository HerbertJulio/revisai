import { Suspense } from 'react';
import { Financeiro } from '@/components/oficina/financeiro/Financeiro';

export const metadata = { title: 'Financeiro' };

export default function PaginaFinanceiro() {
  return (
    <Suspense>
      <Financeiro />
    </Suspense>
  );
}
