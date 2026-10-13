import { Cabecalho, Rodape } from '@/components/site/Cabecalho';

export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Cabecalho />
      <main>{children}</main>
      <Rodape />
    </>
  );
}
