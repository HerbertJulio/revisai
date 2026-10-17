import { AjustesFiscais } from '@/components/oficina/fiscal/AjustesFiscais';
import { estadoDoEmissor } from '@/lib/fiscal/servidor';

export const metadata = { title: 'Notas fiscais' };
export const dynamic = 'force-dynamic';

export default function PaginaFiscal() {
  const { ligado, provedor } = estadoDoEmissor();
  return <AjustesFiscais ligado={ligado} provedor={provedor} />;
}
