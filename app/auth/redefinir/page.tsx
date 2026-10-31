import type { Metadata } from 'next';
import { RedefinirSenha } from '@/components/conta/RedefinirSenha';
import { TelaDeConta } from '@/components/conta/TelaDeConta';
import { destinoSeguro } from '@/lib/entrada';
import { configSupabase } from '@/lib/supabase-servidor';

export const metadata: Metadata = { title: 'Nova senha', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaginaRedefinir({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const para = destinoSeguro(typeof q.para === 'string' ? q.para : null);
  const config = configSupabase();
  return (
    <TelaDeConta titulo="Escolha uma senha nova" subtitulo="Digite a senha que você vai usar para entrar.">
      {config ? (
        <RedefinirSenha config={config} para={para} />
      ) : (
        <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">O login ainda não foi ligado neste servidor.</p>
      )}
    </TelaDeConta>
  );
}
