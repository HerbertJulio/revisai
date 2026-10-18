import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvisoErro } from '@/components/equipe/comum';
import { ConversaChamado } from '@/components/equipe/ConversaChamado';
import { Moldura } from '@/components/equipe/Moldura';
import { Chip, classeBotao } from '@/components/ui';
import { quandoFoi } from '@/lib/equipe-dados';
import { abrirChamado } from '@/lib/equipe/dados';
import { uuidValido } from '@/lib/equipe/escrita';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { SITUACOES_CHAMADO } from '@/lib/equipe/tipos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pedido de ajuda' };

export default async function PaginaChamado({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirEquipe(PODE.suporte);
  const { id } = await params;
  if (!uuidValido(id)) notFound();
  const { dados, erro } = await abrirChamado(acesso.sb, id);
  if (!dados && !erro) notFound();
  const agora = Date.now();
  const voltar = (
    <Link href="/admin/suporte" className={classeBotao('fantasma', 'pequeno')}>
      <ArrowLeft size={16} aria-hidden="true" /> Todos os pedidos
    </Link>
  );
  if (!dados) {
    return (
      <Moldura acesso={acesso} aba="suporte" titulo="Pedido de ajuda" acao={voltar}>
        <AvisoErro>{erro}</AvisoErro>
      </Moldura>
    );
  }
  const { chamado: c, mensagens } = dados;
  const s = SITUACOES_CHAMADO.find((x) => x.id === c.situacao) ?? SITUACOES_CHAMADO[0];
  return (
    <Moldura
      acesso={acesso}
      aba="suporte"
      titulo={c.assunto}
      descricao={
        <span className="flex flex-wrap items-center gap-2">
          <Chip tom={s.tom}>{s.nome}</Chip>
          {c.oficina_id ? (
            <Link href={`/admin/oficinas/${c.oficina_id}`} className="font-semibold text-caneta hover:underline">
              {c.origem}
            </Link>
          ) : c.origem ? (
            <span className="font-semibold">{c.origem}</span>
          ) : null}
          <span>{[c.email, `aberto ${quandoFoi(c.criado_em, agora)}`].filter(Boolean).join(', ')}</span>
        </span>
      }
      acao={voltar}
    >
      <ConversaChamado chamado={c} mensagens={mensagens} agora={agora} />
    </Moldura>
  );
}
