import { Suspense } from 'react';
import { Ordens } from '@/components/oficina/Ordens';

export const metadata = { title: 'Ordens e orçamentos' };

export default function PaginaOrdens() {
  return (
    <Suspense>
      <Ordens />
    </Suspense>
  );
}
