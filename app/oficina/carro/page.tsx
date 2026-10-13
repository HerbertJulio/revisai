import { Suspense } from 'react';
import { Carro } from '@/components/oficina/Carro';

export const metadata = { title: 'Carro' };

export default function PaginaCarro() {
  return (
    <Suspense>
      <Carro />
    </Suspense>
  );
}
