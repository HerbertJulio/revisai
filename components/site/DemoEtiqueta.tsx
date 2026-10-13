'use client';

import { useEffect, useState } from 'react';
import { EtiquetaTroca } from '@/components/pecas';
import { calcularVencimento, DIAS_POR_MES } from '@/lib/agenda';
import { situacaoDe, type ItemAviso } from '@/lib/avisos';
import { diasEntre, formatarDataCurta, hojeISO, somarDias, somarMeses } from '@/lib/datas';
import { formatarKm, formatarNumero } from '@/lib/formatos';
import { MENSAGEM_PADRAO, montarMensagem } from '@/lib/whatsapp';

const ANTECEDENCIA = 15;
const KM_TROCA = 41200;

/** A conta do Revisaí, ao vivo: mexa na rodagem e veja quando a troca vence e quando a oficina avisa. */
export function DemoEtiqueta() {
  // começa numa data fixa (igual no servidor e no navegador) e troca para hoje depois de montar
  const [hoje, setHoje] = useState('2026-10-13');
  const [meses, setMeses] = useState(9);
  const [kmMes, setKmMes] = useState(1100);
  const [severo, setSevero] = useState(false);
  useEffect(() => setHoje(hojeISO()), []);

  const intervalo = severo ? { km: 5000, meses: 6 } : { km: 10000, meses: 12 };
  const dataTroca = somarMeses(hoje, -meses);
  const kmDia = kmMes / DIAS_POR_MES;
  const venc = calcularVencimento({ data: dataTroca, km: KM_TROCA }, intervalo, [], kmDia, hoje);
  const situacao = situacaoDe(venc, { antecedenciaDias: ANTECEDENCIA, antecedenciaKm: 500 });
  const dataAviso = venc.dataPrevista ? somarDias(venc.dataPrevista, -ANTECEDENCIA) : null;
  const item = { servico: 'troca_oleo', venc, situacao } as unknown as ItemAviso;
  const mensagem = montarMensagem(MENSAGEM_PADRAO, {
    cliente: 'Fernanda Lima',
    oficina: 'Auto Center Serra',
    veiculo: { modelo: 'Onix', placa: 'FLM2C24' },
    itens: [item]
  });

  let resultado: string;
  if (!venc.dataPrevista) resultado = '';
  else if (situacao === 'atrasado') resultado = `Já venceu ${venc.motivo === 'km' ? 'pela quilometragem' : 'pela data'}. O cliente aparece no topo da lista, como atrasado.`;
  else if (situacao === 'avisar') resultado = `Vence no dia ${formatarDataCurta(venc.dataPrevista)}, ${venc.motivo === 'km' ? 'pela quilometragem' : 'pela data'}. O cliente já está na lista de quem avisar hoje.`;
  else
    resultado = `Vence no dia ${formatarDataCurta(venc.dataPrevista)}, ${venc.motivo === 'km' ? 'pela quilometragem, antes da data' : 'pela data'}. A oficina recebe o aviso a partir de ${formatarDataCurta(dataAviso)}, ${diasEntre(hoje, dataAviso!)} dias antes.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-[28px] bg-vidro px-6 pt-7 pb-8 sm:px-8">
        {/* borda escura do para-brisa */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-[#1b1f22]/80" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <EtiquetaTroca data={venc.dataLimite} km={venc.kmLimite} situacao={situacao} girar className="mt-2 origin-top-left scale-[1.15] sm:scale-[1.3]" />
          <div className="ml-auto max-w-[300px] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2.5 text-[14px] leading-snug text-[#111b21] shadow-sm sm:mt-16">
            {mensagem}
            <span className="mt-1 block text-right text-[11px] text-[#667781]">mensagem pronta no WhatsApp</span>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] bg-papel p-5 ring-1 ring-linha sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between gap-2 text-[14px] font-semibold">
              Última troca
              <span className="num text-tinta-2">{meses === 0 ? 'hoje' : meses === 1 ? 'há 1 mês' : `há ${meses} meses`}</span>
            </span>
            <input type="range" min={0} max={12} step={1} value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-[var(--oleo)]" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between gap-2 text-[14px] font-semibold">
              O cliente roda
              <span className="num text-tinta-2">{formatarNumero(kmMes)} km por mês</span>
            </span>
            <input type="range" min={300} max={3500} step={100} value={kmMes} onChange={(e) => setKmMes(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-[var(--oleo)]" />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-[14px]">
          <input type="checkbox" checked={severo} onChange={(e) => setSevero(e.target.checked)} className="h-5 w-5 accent-[var(--tinta)]" />
          <span>
            <span className="font-semibold">Uso severo</span> <span className="text-tinta-2">(aplicativo, trânsito pesado): prazo pela metade</span>
          </span>
        </label>
        <p className="mt-4 border-t border-linha pt-4 text-[15px] leading-relaxed" aria-live="polite">
          Trocou com {formatarKm(KM_TROCA)}. {resultado}
        </p>
      </div>
    </div>
  );
}
