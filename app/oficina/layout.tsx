import type { Metadata } from 'next';
import { AppOficina } from '@/components/oficina/AppOficina';
import { contaAtual, oficinaEscolhida } from '@/lib/conta';
import { configSupabase } from '@/lib/supabase-servidor';

export const metadata: Metadata = {
  title: 'Painel da oficina',
  robots: { index: false, follow: false }
};

export const dynamic = 'force-dynamic';

export default async function LayoutOficina({ children }: { children: React.ReactNode }) {
  const [conta, oficina] = await Promise.all([contaAtual(), oficinaEscolhida()]);
  return (
    <AppOficina conta={conta} oficinaId={oficina?.id ?? null} config={configSupabase()}>
      {children}
    </AppOficina>
  );
}
