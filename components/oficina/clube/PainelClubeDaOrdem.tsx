'use client';

// No orçamento e na ordem (só para o dono e o gerente): o carro é de um membro do clube? Mostra o
// desconto do plano, os serviços incluídos que restam no ano e aplica o desconto no documento.

import { BadgePercent } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, Chip } from '@/components/ui';
import { anoDoClube, beneficiosDoMembro, descontoDoClube, membroDoCarro, mensalidadesAtrasadas, nomeDaCompetencia, servicosIncluidosNaOrdem } from '@/lib/clube';
import { formatarData } from '@/lib/datas';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { Documento } from '@/lib/tipos';
import { useGestao } from '../cobranca-cliente/gestao';

export function PainelClubeDaOrdem({ doc }: { doc: Documento }) {
  const { gestao } = useGestao();
  const fechado = doc.tipo === 'ordem' ? doc.situacao === 'cancelada' : doc.situacao === 'recusado' || doc.situacao === 'aprovado';
  if (!gestao || fechado || !doc.veiculoId) return null;
  return <Clube doc={doc} />;
}

function Clube({ doc }: { doc: Documento }) {
  const hoje = useHoje();
  const toast = useToast();
  const membros = useOficina((s) => s.clubeMembros);
  const planos = useOficina((s) => s.clubePlanos);
  const cobrancas = useOficina((s) => s.clubeCobrancas);
  const veiculo = useOficina((s) => (doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const membro = useMemo(() => membroDoCarro(Object.values(membros), veiculo), [membros, veiculo]);
  const plano = membro ? planos[membro.planoId] : undefined;
  const calculo = useMemo(() => {
    if (!membro || !plano) return null;
    return {
      desconto: descontoDoClube(doc, membro, plano, hoje),
      beneficios: beneficiosDoMembro(membro, plano, hoje, doc.id),
      incluidos: servicosIncluidosNaOrdem(doc, membro, plano, hoje),
      atrasadas: mensalidadesAtrasadas(Object.values(cobrancas).filter((c) => c.membroId === membro.id), hoje),
      ano: anoDoClube(membro, hoje)
    };
  }, [doc, membro, plano, cobrancas, hoje]);
  if (!membro || !plano || !calculo) return null;
  const { desconto, beneficios, incluidos, atrasadas, ano } = calculo;
  const usadosAqui = new Set(membro.usos.filter((u) => u.documentoId === doc.id).map((u) => u.servico));
  const aplicado = desconto.total > 0 && Math.round((doc.desconto ?? 0) * 100) === Math.round(desconto.total * 100);
  const podeAplicar = doc.situacao !== 'concluida' && desconto.total > 0 && !aplicado;
  const percentuais = [plano.descontoPecas > 0 ? `${formatarNumero(plano.descontoPecas, 2)}% em peças` : '', plano.descontoServicos > 0 ? `${formatarNumero(plano.descontoServicos, 2)}% na mão de obra` : '']
    .filter(Boolean)
    .join(' e ');

  function aplicar() {
    const s = useOficina.getState();
    const atual = s.documentos[doc.id];
    if (!atual) return;
    if (atual.desconto && Math.round(atual.desconto * 100) !== Math.round(desconto.total * 100) && !window.confirm(`Trocar o desconto de ${formatarMoeda(atual.desconto)} pelo do clube (${formatarMoeda(desconto.total)})?`)) return;
    s.salvarDocumento({ ...atual, desconto: desconto.total });
    toast({ texto: `Desconto do clube de ${formatarMoeda(desconto.total)} aplicado.` });
  }

  return (
    <section aria-label="Clube de manutenção" className="flex flex-col gap-2.5 rounded-xl bg-caneta-claro px-3.5 py-3 text-[14.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-caneta">
          <BadgePercent size={17} aria-hidden="true" /> Cliente do clube {plano.nome}
        </h3>
        {aplicado ? <Chip tom="ok">Desconto aplicado</Chip> : null}
      </div>
      <p>{percentuais ? `Cliente do clube: ${percentuais}.` : 'O plano não tem desconto em peças nem na mão de obra.'}</p>
      {beneficios.length ? (
        <ul className="flex flex-col gap-1 text-[14px]">
          {beneficios.map((b) => (
            <li key={b.servico}>
              <strong>{b.nome}</strong>
              {usadosAqui.has(b.servico) ? ' (usado nesta ordem)' : (incluidos as string[]).includes(b.servico) ? ' (incluído nesta ordem)' : ''}: restam {formatarNumero(b.restantes)} de {formatarNumero(b.quantidadePorAno)} até {formatarData(ano.fim)}.
            </li>
          ))}
        </ul>
      ) : null}
      {desconto.total > 0 ? (
        <p>
          Desconto do clube aqui: <strong className="num">{formatarMoeda(desconto.total)}</strong>
          {desconto.incluidos > 0 ? <span className="text-tinta-2"> (mão de obra incluída: {formatarMoeda(desconto.incluidos)})</span> : null}.
        </p>
      ) : null}
      {atrasadas.length ? (
        <p className="font-semibold text-atraso">
          Mensalidade atrasada: {atrasadas.map((c) => nomeDaCompetencia(c.competencia)).join(', ')}.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {podeAplicar ? (
          <Botao variante="escuro" tamanho="pequeno" onClick={aplicar}>
            Aplicar o desconto do clube
          </Botao>
        ) : null}
        <Link href="/oficina/clube?aba=membros" className="text-[14px] font-semibold text-caneta hover:underline">
          Ver no clube
        </Link>
      </div>
    </section>
  );
}
