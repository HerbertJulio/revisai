import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AndamentoDoLink } from '@/components/cliente/AndamentoDoLink';
import { CertificadoDeGarantia } from '@/components/cliente/CertificadoDeGarantia';
import { ChecklistDoLink } from '@/components/cliente/ChecklistDoLink';
import { LinkInvalido } from '@/components/cliente/comum';
import { HistoricoDoLink } from '@/components/cliente/HistoricoDoLink';
import { OrcamentoDoLink } from '@/components/cliente/OrcamentoDoLink';
import { lerAndamentoDoLink } from '@/lib/andamento';
import { lerChecklistDoLink } from '@/lib/checklist';
import { lerGarantiaDoLink } from '@/lib/garantia';
import { lerHistoricoDoLink } from '@/lib/historico';
import { hojeNoBrasil, lerOrcamentoDoLink, lerResposta } from '@/lib/links-publicos';
import { verLink } from '@/lib/links-servidor';

// O link que a oficina manda para o cliente dela: orçamento, andamento do serviço, checklist de
// entrada, garantia ou histórico do carro. O endereço é a chave (o banco guarda só o hash).

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Da sua oficina',
  description: 'O que a sua oficina mandou: orçamento, andamento do serviço, checklist, garantia ou histórico do carro.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

export default async function PaginaDoLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verLink(token);
  if (!link) return <LinkInvalido />;
  // a cobrança e o clube têm as páginas deles
  if (link.tipo === 'pagamento') redirect(`/pagar/${token}`);
  if (link.tipo === 'clube') redirect(`/clube/${token}`);

  const hoje = hojeNoBrasil();
  const resposta = lerResposta(link.resposta);
  let conteudo: React.ReactNode = null;
  if (link.tipo === 'orcamento') {
    const dados = lerOrcamentoDoLink(link.dados);
    if (dados) conteudo = <OrcamentoDoLink token={token} dados={dados} oficina={link.oficina} resposta={resposta} hoje={hoje} />;
  } else if (link.tipo === 'andamento') {
    const dados = lerAndamentoDoLink(link.dados);
    if (dados) conteudo = <AndamentoDoLink dados={dados} oficina={link.oficina} atualizadoEm={link.atualizadoEm} />;
  } else if (link.tipo === 'checklist') {
    const dados = lerChecklistDoLink(link.dados);
    if (dados) conteudo = <ChecklistDoLink token={token} dados={dados} oficina={link.oficina} resposta={resposta} />;
  } else if (link.tipo === 'garantia') {
    const dados = lerGarantiaDoLink(link.dados);
    const h = await headers();
    const host = (h.get('x-forwarded-host') ?? h.get('host') ?? 'revisai.howlks.com').split(',')[0].trim();
    if (dados) conteudo = <CertificadoDeGarantia dados={dados} oficina={link.oficina} codigo={link.codigo} hoje={hoje} enderecoDaConsulta={`${host}/garantia`} />;
  } else if (link.tipo === 'historico') {
    const dados = lerHistoricoDoLink(link.dados);
    if (dados) conteudo = <HistoricoDoLink dados={dados} oficina={link.oficina} atualizadoEm={link.atualizadoEm} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-12">
      {conteudo ?? (
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          <h1 className="largo text-[28px] leading-tight">Este link não abriu</h1>
          <p className="text-tinta-2">Peça para a oficina mandar de novo.</p>
        </div>
      )}
    </div>
  );
}
