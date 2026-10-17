import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EntrarEquipe, TelaDaEquipe } from '@/components/equipe/EntrarEquipe';
import { estadoDaEquipe } from '@/lib/equipe/sessao';
import { clienteDoUsuario, configSupabase, sessaoAtual } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entrar', robots: { index: false, follow: false } };

export default async function PaginaEntrarEquipe() {
  if (!configSupabase()) {
    return (
      <TelaDaEquipe>
        <p className="rounded-xl bg-oleo-claro px-4 py-3 text-[14px] text-oleo-tinta">O login ainda não foi ligado neste servidor.</p>
      </TelaDaEquipe>
    );
  }
  const sessao = await sessaoAtual(true);
  if (!sessao) {
    return (
      <TelaDaEquipe>
        <EntrarEquipe passo="email" />
      </TelaDaEquipe>
    );
  }
  const estado = await estadoDaEquipe();
  if (estado.tipo === 'dentro') redirect('/admin');
  const sb = await clienteDoUsuario(true);
  const { data: convidado } = sb ? await sb.rpc('equipe_convidado') : { data: false };
  if (convidado !== true) notFound();
  const fatores = sb ? await sb.auth.mfa.listFactors() : null;
  const temApp = (fatores?.data?.totp.length ?? 0) > 0;
  return (
    <TelaDaEquipe>
      <EntrarEquipe passo={temApp ? 'confirmar' : 'cadastrar'} email={sessao.email} />
    </TelaDaEquipe>
  );
}
