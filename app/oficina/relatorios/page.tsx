import { Suspense } from 'react';
import { Relatorios } from '@/components/oficina/relatorios/Relatorios';

export const metadata = { title: 'Relatórios' };

export default function PaginaRelatorios() {
  return (
    <Suspense>
      <Relatorios />
    </Suspense>
  );
}
