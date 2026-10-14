import { Suspense } from 'react';
import { OrdemPorVoz } from '@/components/oficina/OrdemPorVoz';

export const metadata = { title: 'Ordem por voz' };
// a IA pode levar até um minuto para ouvir os áudios e olhar as fotos
export const maxDuration = 120;

export default function PaginaOrdem() {
  return (
    <Suspense>
      <OrdemPorVoz />
    </Suspense>
  );
}
