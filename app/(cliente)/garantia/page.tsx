import type { Metadata } from 'next';
import { ConsultaDeGarantia } from '@/components/cliente/ConsultaDeGarantia';

export const metadata: Metadata = {
  title: 'Consultar a garantia',
  description: 'A garantia do serviço da sua oficina, pela placa do carro e pelo código do certificado.',
  robots: { index: false, follow: false }
};

export default async function PaginaDaGarantia({ searchParams }: { searchParams: Promise<{ placa?: string; codigo?: string }> }) {
  const p = await searchParams;
  const placa = String(p.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  const codigo = String(p.codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-12">
      <ConsultaDeGarantia placaInicial={placa} codigoInicial={codigo} />
    </div>
  );
}
