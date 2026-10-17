import { Suspense } from 'react';
import { PaginaDasGarantias } from '@/components/oficina/servico/Garantia';

export const metadata = { title: 'Garantias' };

export default function PaginaGarantias() {
  return (
    <Suspense>
      <PaginaDasGarantias />
    </Suspense>
  );
}
