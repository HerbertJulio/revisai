import { Suspense } from 'react';
import { PassoAPasso } from '@/components/oficina/passo/PassoAPasso';

export const metadata = { title: 'Nova ordem ou orçamento' };
// a IA pode levar até um minuto para ouvir o áudio e preencher os serviços
export const maxDuration = 120;

export default function PaginaNova() {
  return (
    <Suspense>
      <PassoAPasso />
    </Suspense>
  );
}
