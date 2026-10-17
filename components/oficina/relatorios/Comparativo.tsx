'use client';

// "Sua oficina contra a média da região" no relatório: os números da oficina (dos dados do
// aparelho) contra a faixa das oficinas com conta da cidade ou do estado, que o banco soma sem
// mostrar ninguém. Sem conta, convida para a página pública.

import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { classeBotao } from '@/components/ui';
import { lerComparativo, METRICAS, numerosDaOficina, type Comparativo } from '@/lib/comparativo';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import { LegendaDaRegua, LinhaDoComparativo } from './Regua';

type Estado = { tipo: 'carregando' } | { tipo: 'pronto'; dados: Comparativo | null } | { tipo: 'erro' };

export function ComparativoDaRegiao() {
  const { conta, banco } = useConta();
  const uf = useOficina((s) => s.oficina.uf);
  const cidade = useOficina((s) => s.oficina.cidade);
  const documentos = useOficina((s) => s.documentos);
  const hoje = useHoje();
  const meus = useMemo(() => numerosDaOficina(Object.values(documentos), hoje), [documentos, hoje]);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!conta || !uf) return;
    const sb = banco();
    if (!sb) return;
    let vivo = true;
    setEstado({ tipo: 'carregando' });
    sb.rpc('comparativo_da_regiao', { p_uf: uf, p_cidade: cidade || null }).then(
      ({ data, error }) => {
        if (!vivo) return;
        if (error) {
          console.error('[comparativo]', error);
          setEstado({ tipo: 'erro' });
        } else setEstado({ tipo: 'pronto', dados: lerComparativo(data) });
      },
      () => vivo && setEstado({ tipo: 'erro' })
    );
    return () => {
      vivo = false;
    };
  }, [conta, banco, uf, cidade, tentativa]);

  const titulo = (
    <div>
      <h2 className="text-[21px]">Sua oficina contra a média da região</h2>
      <p className="mt-1 text-[15px] text-tinta-2">Os seus últimos 90 dias contra as oficinas com conta no Revisaí da sua cidade (ou do estado). Ninguém vê os números de ninguém: só a faixa, somada.</p>
    </div>
  );

  if (!conta)
    return (
      <section className="flex flex-col gap-3" aria-label="Comparativo da região">
        {titulo}
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linha px-5 py-6">
          <p className="text-tinta-2">Com a conta, o relatório compara os seus números com os da região sozinho. Sem conta, dá para comparar digitando os números na página do comparativo.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/entrar?para=/oficina/relatorios" className={classeBotao('escuro')}>
              Criar a conta grátis
            </Link>
            <Link href="/comparativo" className={classeBotao('secundario')}>
              Comparar sem conta
            </Link>
          </div>
        </div>
      </section>
    );

  if (!uf)
    return (
      <section className="flex flex-col gap-3" aria-label="Comparativo da região">
        {titulo}
        <p className="rounded-2xl bg-papel-2 px-4 py-3 text-[14.5px] text-tinta-2">
          Escreva a cidade e o estado da oficina em{' '}
          <Link href="/oficina/ajustes" className="font-semibold text-caneta hover:underline">
            Ajustes
          </Link>{' '}
          para comparar com a região.
        </p>
      </section>
    );

  return (
    <section className="flex flex-col gap-3" aria-label="Comparativo da região" aria-busy={estado.tipo === 'carregando'}>
      {titulo}
      {estado.tipo === 'carregando' ? (
        <p className="rounded-2xl bg-papel-2 px-4 py-3 text-[14.5px] text-tinta-3">Somando as oficinas da região…</p>
      ) : estado.tipo === 'erro' ? (
        <p className="flex flex-wrap items-center gap-3 rounded-2xl bg-atraso-claro px-4 py-3 text-[14.5px] text-atraso" role="alert">
          Não deu para buscar a média da região agora.
          <button type="button" className="font-semibold underline" onClick={() => setTentativa((n) => n + 1)}>
            Tentar de novo
          </button>
        </p>
      ) : !estado.dados ? (
        <p className="rounded-2xl bg-papel-2 px-4 py-3 text-[14.5px] text-tinta-2">
          Ainda não há 5 oficinas com conta em {uf} para comparar sem expor ninguém. Assim que tiver, a faixa aparece aqui.
        </p>
      ) : (
        <>
          <p className="flex items-center gap-2 text-[14px] text-tinta-2">
            <MapPin size={15} aria-hidden="true" />
            {estado.dados.nivel === 'cidade' ? `${cidade}, ${uf}` : `Estado de ${uf} (a sua cidade ainda não tem 5 oficinas com conta)`}: {estado.dados.oficinas} ou mais oficinas.
          </p>
          <LegendaDaRegua />
          <div className="grid gap-3 lg:grid-cols-2">
            {METRICAS.map((m) => (
              <LinhaDoComparativo key={m.id} metrica={m.id} valor={meus[m.id]} faixa={estado.dados![m.id]} />
            ))}
          </div>
          {meus.ordens < 3 ? <p className="text-[13.5px] text-tinta-3">Você tem poucas ordens concluídas nos últimos 90 dias; os seus números ficam mais certos com mais serviços registrados.</p> : null}
        </>
      )}
    </section>
  );
}
