import { redirect } from 'next/navigation';

// O cadastro de serviço virou o passo a passo da ordem de serviço.
export default async function PaginaRegistrar({ searchParams }: { searchParams: Promise<{ carro?: string; servicos?: string }> }) {
  const { carro, servicos } = await searchParams;
  const p = new URLSearchParams({ tipo: 'ordem' });
  if (carro) p.set('carro', carro);
  if (servicos) p.set('servicos', servicos);
  redirect(`/oficina/nova?${p.toString()}`);
}
