import type { Metadata } from 'next';
import { chaveDoSiteCaptcha } from '@/lib/captcha';
import { AgendarCliente } from './AgendarCliente';
import { buscarLivres, verAgenda } from './dados';

// O link de agendamento que a oficina divulga: o cliente vê só os horários livres e pede um.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const agenda = await verAgenda(slug);
  return {
    title: agenda ? `Agendar na ${agenda.oficina.nome}` : 'Agendar horário',
    description: agenda ? `Escolha um horário livre na ${agenda.oficina.nome}. A oficina confirma pelo WhatsApp.` : 'Agendamento de horário na oficina.',
    robots: { index: false, follow: false },
    referrer: 'no-referrer'
  };
}

export default async function PaginaAgendar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agenda = await verAgenda(slug);
  const livres = agenda ? await buscarLivres(slug) : null;
  return (
    <div className="mx-auto max-w-lg px-4 pt-6 sm:pt-10">
      {agenda ? (
        <AgendarCliente slug={slug} agenda={agenda} inicial={livres ?? []} captcha={chaveDoSiteCaptcha()} />
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="largo text-[28px] leading-tight">Este link de agendamento não está ligado</h1>
          <p className="text-tinta-2">A oficina pode ter desligado o agendamento pelo link. Fale com ela pelo WhatsApp para marcar o horário.</p>
        </div>
      )}
    </div>
  );
}
