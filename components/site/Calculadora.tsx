'use client';

import { CalendarPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EtiquetaTroca } from '@/components/pecas';
import { Botao, Campo, classeEntrada } from '@/components/ui';
import { calcularVencimento, DIAS_POR_MES } from '@/lib/agenda';
import { situacaoDe } from '@/lib/avisos';
import { dataValida, diasEntre, formatarData, hojeISO, somarMeses } from '@/lib/datas';
import { formatarKm, lerNumero } from '@/lib/formatos';
import { gerarIcs } from '@/lib/ics';
import { FormInteresse } from './FormInteresse';

/** Calculadora da próxima troca de óleo para quem tem carro. */
export function Calculadora({ captcha }: { captcha?: string | null }) {
  const [hoje, setHoje] = useState('2026-10-13');
  const [data, setData] = useState('');
  const [kmTroca, setKmTroca] = useState('');
  const [kmHoje, setKmHoje] = useState('');
  const [kmMes, setKmMes] = useState('1000');
  const [severo, setSevero] = useState(false);
  useEffect(() => {
    const h = hojeISO();
    setHoje(h);
    setData(somarMeses(h, -6));
  }, []);

  const base = lerNumero(kmTroca);
  const atual = lerNumero(kmHoje);
  const intervalo = severo ? { km: 5000, meses: 6 } : { km: 10000, meses: 12 };
  const pontos = base && atual && atual > base && dataValida(data) && data < hoje ? [{ data: hoje, km: atual }] : [];
  const kmDia = pontos.length && base ? (atual! - base) / Math.max(1, diasEntre(data, hoje)) : (lerNumero(kmMes) ?? 1000) / DIAS_POR_MES;
  const pronto = dataValida(data) && base != null && base > 0;
  const venc = pronto ? calcularVencimento({ data, km: base! }, intervalo, pontos, kmDia, hoje) : null;
  const situacao = venc ? situacaoDe(venc, { antecedenciaDias: 15, antecedenciaKm: 500 }) : 'futuro';

  function calendario() {
    if (!venc?.dataPrevista) return;
    const ics = gerarIcs([
      {
        uid: `troca-oleo-${venc.dataPrevista}@revisai.howlks.com`,
        titulo: 'Troca de óleo do carro',
        data: venc.dataPrevista,
        descricao: `Próxima troca até ${formatarData(venc.dataLimite)} ou ${formatarKm(venc.kmLimite)}, o que vier primeiro. Calculado no Revisaí.`
      }
    ]);
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'troca-de-oleo.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-5 rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data da última troca" htmlFor="c-data">
            <input id="c-data" type="date" className={classeEntrada} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo rotulo="Km na última troca" htmlFor="c-km" dica="Está na etiqueta do para-brisa.">
            <input id="c-km" className={classeEntrada} value={kmTroca} onChange={(e) => setKmTroca(e.target.value)} inputMode="numeric" placeholder="40.000" />
          </Campo>
          <Campo rotulo="Km de hoje" htmlFor="c-hoje" dica="Opcional. Com ele a conta fica certinha.">
            <input id="c-hoje" className={classeEntrada} value={kmHoje} onChange={(e) => setKmHoje(e.target.value)} inputMode="numeric" placeholder="45.500" />
          </Campo>
          <Campo rotulo="Quanto roda por mês" htmlFor="c-mes" dica="Se não souber, deixe 1.000.">
            <input id="c-mes" className={classeEntrada} value={kmMes} onChange={(e) => setKmMes(e.target.value)} inputMode="numeric" disabled={pontos.length > 0} />
          </Campo>
        </div>
        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" checked={severo} onChange={(e) => setSevero(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--tinta)]" />
          <span>
            <span className="font-semibold">Uso severo</span>
            <span className="block text-[14px] text-tinta-2">Aplicativo ou táxi, trânsito pesado, trajetos curtos, estrada de terra. O prazo cai pela metade.</span>
          </span>
        </label>
        <p className="text-[13.5px] text-tinta-3">A conta usa o prazo mais comum dos manuais: 10.000 km ou 12 meses (5.000 km ou 6 meses no uso severo). O manual do seu carro é quem manda.</p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-[28px] bg-vidro px-6 py-8 sm:px-10">
          {venc ? (
            <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
              <EtiquetaTroca data={venc.dataLimite} km={venc.kmLimite} situacao={situacao} girar />
              <div className="min-w-[200px] flex-1">
                {venc.dataPrevista ? (
                  <>
                    <p className="meio-largo text-[22px] leading-tight font-extrabold">
                      {situacao === 'atrasado' ? 'A troca já venceu.' : `Troque até ${formatarData(venc.dataPrevista)}.`}
                    </p>
                    <p className="mt-2 text-tinta-2">
                      {venc.motivo === 'km'
                        ? `Pela rodagem, você chega aos ${formatarKm(venc.kmLimite)} antes da data limite.`
                        : `A data chega antes dos ${formatarKm(venc.kmLimite)}.`}{' '}
                      {situacao === 'atrasado' ? 'Procure a sua oficina.' : `Faltam ${diasEntre(hoje, venc.dataPrevista)} dias.`}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-tinta-2">Preencha a data e o km da última troca para ver a próxima.</p>
          )}
        </div>
        {venc?.dataPrevista && situacao !== 'atrasado' ? (
          <Botao className="self-start" onClick={calendario}>
            <CalendarPlus size={18} /> Lembrar no calendário
          </Botao>
        ) : null}
        <div className="rounded-[22px] bg-papel p-6 ring-1 ring-linha sm:p-8">
          <h2 className="text-[21px]">Quer que a gente lembre você?</h2>
          <p className="mt-1 mb-5 text-tinta-2">Mandamos um aviso perto da data e indicamos oficinas parceiras quando elas estiverem na sua região.</p>
          <FormInteresse
            captcha={captcha}
            tipo="motorista"
            origem="motorista"
            mensagem="Carro"
            dicaMensagem="Ex.: Onix 2022."
            botao="Quero o lembrete"
            sucesso="Combinado. A gente avisa perto da data."
            consentimento="Concordo em receber o lembrete do Revisaí pelo WhatsApp ou e-mail."
            extra={venc?.dataPrevista ? `Próxima troca calculada: ${formatarData(venc.dataPrevista)} (${formatarData(venc.dataLimite)} ou ${formatarKm(venc.kmLimite)})` : undefined}
          />
        </div>
      </div>
    </div>
  );
}

