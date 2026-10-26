import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormEntrar } from '@/components/conta/FormEntrar';
import { SeletorDePainel } from '@/components/conta/SeletorDePainel';
import { TelaDeConta } from '@/components/conta/TelaDeConta';
import { destinoSeguro, provedoresDeEntrada } from '@/lib/entrada';
import { configSupabase, sessaoAtual } from '@/lib/supabase-servidor';

export const metadata: Metadata = { title: 'Entrar', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const rawPara = typeof q.para === 'string' ? q.para : null;
  const painel = typeof q.painel === 'string' ? q.painel : rawPara?.startsWith('/fornecedor') ? 'fornecedor' : rawPara?.startsWith('/oficina') ? 'oficina' : null;
  const sessaoTerminou = q.motivo === 'sessao';
  const para = destinoSeguro(rawPara ?? (painel === 'fornecedor' ? '/fornecedor' : painel === 'oficina' ? '/oficina' : null));
  if (await sessaoAtual()) redirect(`/conta?para=${encodeURIComponent(para)}`);

  // Sem painel escolhido, a pessoa escolhe por onde entra; com a sessão vencida, já vai direto ao login.
  if (!painel && !sessaoTerminou) {
    return (
      <TelaDeConta titulo="Entrar no Revisaí" subtitulo="Escolha por onde você usa o Revisaí e entre com o Google ou o seu e-mail.">
        <SeletorDePainel />
      </TelaDeConta>
    );
  }

  const config = configSupabase();
  const provedores = await provedoresDeEntrada();
  const loja = para.startsWith('/fornecedor');
  return (
    <TelaDeConta
      titulo={sessaoTerminou ? 'Entre de novo' : loja ? 'Entrar na sua loja' : 'Entrar na oficina'}
      subtitulo={
        sessaoTerminou
          ? 'Sua sessão terminou. Entre com a mesma conta: o que ficou guardado neste aparelho sobe para a nuvem.'
          : loja
            ? 'Produtos, pedidos e alertas da sua loja.'
            : 'Seus clientes, carros e ordens guardados na nuvem, em qualquer aparelho.'
      }
    >
      {config ? (
        <div className="flex flex-col gap-4">
          <FormEntrar config={config} para={para} google={provedores.google} erro={typeof q.erro === 'string' ? q.erro : null} />
          <Link href="/entrar" className="text-center text-[13px] font-semibold text-tinta-3 hover:text-caneta">
            Trocar de painel
          </Link>
        </div>
      ) : (
        <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">O login ainda não foi ligado neste servidor.</p>
      )}
    </TelaDeConta>
  );
}
