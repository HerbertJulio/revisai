import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AvisoErro } from '@/components/equipe/comum';
import { Moldura } from '@/components/equipe/Moldura';
import { ComprasBarradas } from '@/app/admin/moderacao/_componentes/Antifraude';
import { Chip, Vazio } from '@/components/ui';
import { quandoFoi } from '@/lib/equipe-dados';
import { sinaisDeFraude } from '@/lib/equipe/dados';
import { PODE } from '@/lib/equipe/papeis';
import { exigirEquipe } from '@/lib/equipe/sessao';
import { NOMES_SINAL, sinalEmReais } from '@/lib/equipe/tipos';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Antifraude' };

export default async function PaginaAntifraude() {
  const acesso = await exigirEquipe(PODE.numeros);
  const { dados, erro } = await sinaisDeFraude(acesso.sb);
  const agora = Date.now();
  return (
    <Moldura
      acesso={acesso}
      aba="antifraude"
      titulo="Antifraude"
      descricao="Sinais para a equipe olhar com calma. Nada aqui bloqueia ninguém: se algo estiver errado, fale com a oficina ou a loja e, se precisar, desative pela página dela."
    >
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      {dados.length ? (
        <ul className="divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
          {dados.map((s) => (
            <li key={`${s.tipo}-${s.id}-${s.sinal}`} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
              <ShieldAlert size={19} className="mt-0.5 shrink-0 text-oleo-tinta" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {s.tipo === 'oficina' ? (
                    <Link href={`/admin/oficinas/${s.id}`} className="font-bold text-caneta hover:underline">
                      {s.nome}
                    </Link>
                  ) : (
                    <Link href="/admin/fornecedores" className="font-bold text-caneta hover:underline">
                      {s.nome}
                    </Link>
                  )}
                  <Chip>{s.tipo === 'oficina' ? 'Oficina' : 'Loja'}</Chip>
                  <Chip tom="oleo">{NOMES_SINAL[s.sinal] ?? s.sinal}</Chip>
                </div>
                <p className="text-[14px] text-tinta-2">{s.motivo}</p>
                <p className="text-[13px] text-tinta-3">Conta criada {quandoFoi(s.criado, agora)}</p>
              </div>
              <p className="num text-[17px] font-extrabold">{sinalEmReais(s.sinal) ? formatarMoeda(s.valor) : formatarNumero(s.valor)}</p>
            </li>
          ))}
        </ul>
      ) : !erro ? (
        <Vazio titulo="Nenhum sinal agora">
          Aparecem aqui: conta nova comprando ou vendendo mais de R$ 2.000 em 7 dias, muitos pedidos cancelados e alertas de preço em série.
        </Vazio>
      ) : null}
      <ComprasBarradas sb={acesso.sb} />
    </Moldura>
  );
}
