import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Painel do fornecedor', template: '%s | Fornecedor Revisaí' },
  robots: { index: false, follow: false }
};

export default function LayoutFornecedor({ children }: { children: React.ReactNode }) {
  return children;
}
