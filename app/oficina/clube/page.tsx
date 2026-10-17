import { Suspense } from 'react';
import { Clube } from '@/components/oficina/clube/Clube';

export const metadata = { title: 'Clube de manutenção' };

export default function PaginaClube() {
  return (
    <Suspense>
      <Clube />
    </Suspense>
  );
}
