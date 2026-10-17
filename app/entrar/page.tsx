import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FormEntrar } from '@/components/conta/FormEntrar';
import { TelaDeConta } from '@/components/conta/TelaDeConta';
import { destinoSeguro, provedoresDeEntrada } from '@/lib/entrada';
import { configSupabase, sessaoAtual } from '@/lib/supabase-servidor';

export const metadata: Metadata = { title: 'Entrar', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const para = destinoSeguro(typeof q.para === 'string' ? q.para : null);
  if (await sessaoAtual()) redirect(`/conta?para=${encodeURIComponent(para)}`);
  const config = configSupabase();
  const provedores = await provedoresDeEntrada();
  const loja = para.startsWith('/fornecedor');
  return (
    <TelaDeConta
      titulo={loja ? 'Entrar na sua loja' : 'Entrar no Revisaí'}
      subtitulo={loja ? 'Produtos, pedidos e alertas da sua loja.' : 'Seus clientes, carros e ordens guardados na nuvem, em qualquer aparelho.'}
    >
      {config ? (
        <FormEntrar config={config} para={para} google={provedores.google} erro={typeof q.erro === 'string' ? q.erro : null} />
      ) : (
        <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">O login ainda não foi ligado neste servidor.</p>
      )}
    </TelaDeConta>
  );
}
