import { Suspense } from 'react';
import { Etiqueta } from '@/components/oficina/Etiqueta';

export const metadata = { title: 'Etiqueta do para-brisa' };

export default function PaginaEtiqueta() {
  return (
    <Suspense>
      <Etiqueta />
    </Suspense>
  );
}
