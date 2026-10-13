import type { Metadata } from 'next';
import { AppOficina } from '@/components/oficina/AppOficina';

export const metadata: Metadata = {
  title: 'Painel da oficina',
  robots: { index: false, follow: false }
};

export default function LayoutOficina({ children }: { children: React.ReactNode }) {
  return <AppOficina>{children}</AppOficina>;
}
