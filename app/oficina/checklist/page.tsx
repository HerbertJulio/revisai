import { Suspense } from 'react';
import { PaginaDoChecklist } from '@/components/oficina/servico/Checklist';

export const metadata = { title: 'Checklist de entrada' };

export default function PaginaChecklist() {
  return (
    <Suspense>
      <PaginaDoChecklist />
    </Suspense>
  );
}
