import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PainelConta } from '@/components/conta/PainelConta';
import { TelaDeConta } from '@/components/conta/TelaDeConta';
import { contaAtual } from '@/lib/conta';
import { destinoDaConta } from '@/lib/conta-dados';
import { destinoSeguro } from '@/lib/entrada';
import { clienteDoUsuario, sessaoAtual } from '@/lib/supabase-servidor';

export const metadata: Metadata = { title: 'Sua conta', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaginaConta({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const para = typeof q.para === 'string' ? destinoSeguro(q.para, '') : '';
  const sessao = await sessaoAtual();
  if (!sessao) redirect(`/entrar${para ? `?para=${encodeURIComponent(para)}` : ''}`);
  const conta = await contaAtual();
  const sb = await clienteDoUsuario();
  const pendentes = sb ? (((await sb.rpc('termos_pendentes')).data as string[] | null) ?? []) : [];
  if (conta && para && !pendentes.length && !conta.convites.length) {
    const destino = destinoDaConta(conta, para);
    if (destino !== '/conta') redirect(destino);
  }
  if (conta && !para && !q.ver && !pendentes.length && !conta.convites.length && conta.oficinas.length + conta.fornecedores.length === 1) {
    redirect(conta.oficinas.length ? '/oficina' : '/fornecedor');
  }
  return (
    <TelaDeConta titulo="Sua conta" subtitulo={sessao.email} largura="max-w-xl" rodape={false}>
      {conta ? (
        <PainelConta conta={conta} termosPendentes={pendentes} para={para} />
      ) : (
        <p className="rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso">Não deu para carregar a sua conta agora. Atualize a página em instantes.</p>
      )}
    </TelaDeConta>
  );
}
