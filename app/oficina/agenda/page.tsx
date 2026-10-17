import { Suspense } from 'react';
import { Agenda } from '@/components/oficina/agenda/Agenda';

export const metadata = { title: 'Agenda' };

export default function PaginaAgenda() {
  return (
    <Suspense>
      <Agenda />
    </Suspense>
  );
}
