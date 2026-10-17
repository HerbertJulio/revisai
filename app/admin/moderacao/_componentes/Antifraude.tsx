// O limite de compra na página da oficina e as compras barradas na página de antifraude (componentes
// do servidor: leem com o cliente da pessoa da equipe e o banco confere o papel).

import type { SupabaseClient } from '@supabase/supabase-js';
import { Ban } from 'lucide-react';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { Chip, Secao, Vazio } from '@/components/ui';
import { formatarMoeda } from '@/lib/formatos';
import { quandoFoi } from '@/lib/loja/comum';
import { bloqueiosDeCompra, limiteDaOficina } from '@/lib/loja/moderacao';
import { ControleDoLimite } from './LimiteDeCompra';

export async function LimiteDeCompraDaOficina({ sb, oficinaId, podeMudar }: { sb: SupabaseClient; oficinaId: string; podeMudar: boolean }) {
  const { dados, erro } = await limiteDaOficina(sb, oficinaId);
  return (
    <Secao titulo="Limite de compra" descricao="Antifraude das oficinas novas na loja do Revisaí.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : <ControleDoLimite oficinaId={oficinaId} agora={dados.agora} daEquipe={dados.daEquipe} podeMudar={podeMudar} />}
    </Secao>
  );
}

export async function ComprasBarradas({ sb }: { sb: SupabaseClient }) {
  const { dados, erro } = await bloqueiosDeCompra(sb, 30);
  const agora = Date.now();
  return (
    <Secao titulo="Compras barradas pelo limite" descricao="Pedidos de oficinas novas que passaram do limite de compra nos últimos 30 dias. Para liberar, dê um limite maior na página da oficina.">
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {dados.length ? (
        <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {dados.map((b) => (
            <li key={b.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
              <Ban size={19} className="mt-0.5 shrink-0 text-atraso" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/oficinas/${b.oficinaId}`} className="font-bold text-caneta hover:underline">
                    {b.nome}
                  </Link>
                  {b.limiteDaEquipe != null ? <Chip tom="caneta">Limite da equipe {formatarMoeda(b.limiteDaEquipe)}</Chip> : null}
                </div>
                <p className="text-[14px] text-tinta-2">
                  Tentou {formatarMoeda(b.valor)} com {formatarMoeda(b.usado ?? 0)} já comprados em 7 dias (limite {formatarMoeda(b.limite ?? 0)}).
                </p>
                <p className="text-[13px] text-tinta-3">
                  {[b.cidade, b.uf].filter(Boolean).join(', ')}
                  {b.cidade || b.uf ? ' · ' : ''}conta criada {quandoFoi(b.criada, agora)} · barrado {quandoFoi(b.quando, agora)}
                </p>
              </div>
              <p className="num text-[17px] font-extrabold">{formatarMoeda(b.valor)}</p>
            </li>
          ))}
        </ul>
      ) : !erro ? (
        <Vazio titulo="Nenhuma compra barrada">Aparecem aqui os pedidos de oficinas com menos de 30 dias que passariam do limite de compra.</Vazio>
      ) : null}
    </Secao>
  );
}
