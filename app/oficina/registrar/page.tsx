import { Suspense } from 'react';
import { Registrar } from '@/components/oficina/Registrar';

export const metadata = { title: 'Registrar serviço' };

export default function PaginaRegistrar() {
  return (
    <Suspense>
      <Registrar />
    </Suspense>
  );
}
