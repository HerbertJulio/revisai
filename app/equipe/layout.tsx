import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Painel da equipe', template: '%s | Equipe Revisaí' },
  robots: { index: false, follow: false }
};

export default function LayoutEquipe({ children }: { children: React.ReactNode }) {
  return children;
}
