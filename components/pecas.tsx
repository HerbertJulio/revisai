// Objetos do mundo da oficina: placa, etiqueta de troca de óleo, carimbo e odômetro.

import { formatarDataCurta } from '@/lib/datas';
import { formatarKm, formatarPlaca } from '@/lib/formatos';
import type { Situacao } from '@/lib/avisos';
import { Galheta } from './icones';

export function Placa({ placa, grande = false }: { placa: string; grande?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 flex-col overflow-hidden rounded-[5px] border-[1.5px] border-[#1b1f22] bg-white leading-none text-[#1b1f22]"
      aria-label={`Placa ${formatarPlaca(placa)}`}
    >
      <span className={`${grande ? 'h-[6px]' : 'h-[4px]'} bg-placa`} />
      <span className={`largo num font-extrabold tracking-[0.08em] ${grande ? 'px-2.5 py-1 text-[19px]' : 'px-1.5 py-[3px] text-[12.5px]'}`}>{formatarPlaca(placa)}</span>
    </span>
  );
}

const BANDAS: Record<Situacao, string> = {
  atrasado: 'bg-[#c7361f] text-white',
  avisar: 'bg-[#f2a900] text-[#1b1f22]',
  futuro: 'bg-[#dfe3e1] text-[#1b1f22]'
};

/** A etiqueta de para-brisa com a próxima troca (data e km). Sempre papel branco, como a de verdade. */
export function EtiquetaTroca({
  data,
  km,
  situacao = 'avisar',
  titulo = 'Próxima troca',
  girar = false,
  className = ''
}: {
  data: string | null;
  km: number | null;
  situacao?: Situacao;
  titulo?: string;
  girar?: boolean;
  className?: string;
}) {
  const ano = data?.slice(0, 4);
  return (
    <div
      className={`w-[150px] shrink-0 overflow-hidden rounded-[10px] bg-white text-[#1b1f22] shadow-etiqueta ring-1 ring-black/10 ${girar ? '-rotate-[1.6deg]' : ''} ${className}`}
    >
      <div className={`flex items-center justify-between px-2.5 py-1 text-[12px] font-bold ${BANDAS[situacao]}`}>
        <span>{titulo}</span>
        <Galheta size={14} />
      </div>
      <div className="px-2.5 pt-1.5 pb-2">
        {data ? (
          <p className="leading-none">
            <span className="largo num text-[24px] font-extrabold">{formatarDataCurta(data)}</span>
            <span className="num ml-1 text-[12px] font-semibold text-[#4b545a]">{ano}</span>
          </p>
        ) : (
          <p className="text-[13px] font-semibold text-[#4b545a]">Sem data</p>
        )}
        {km != null ? <p className="largo num mt-1 text-[16px] font-extrabold leading-tight">{formatarKm(km)}</p> : null}
        {data && km != null ? <p className="mt-0.5 text-[11px] leading-tight text-[#6b747a]">o que vier primeiro</p> : null}
      </div>
    </div>
  );
}

/** Carimbo de borracha (avisado, agendado), com a batida animada quando acabou de acontecer. */
export function Carimbo({ texto, data, novo = false, className = '' }: { texto: string; data?: string; novo?: boolean; className?: string }) {
  return (
    <span className={`carimbo inline-flex flex-col items-center text-caneta ${novo ? 'carimbo-novo' : ''} ${className}`} aria-label={`${texto}${data ? ` em ${data}` : ''}`}>
      <span className="text-[14px]">{texto}</span>
      {data ? <span className="num text-[11px] tracking-[0.12em]">{data}</span> : null}
    </span>
  );
}

/** Odômetro de tambor: dígitos brancos no preto e o último invertido. */
export function Odometro({ km, digitos = 6 }: { km: number; digitos?: number }) {
  const texto = String(Math.max(0, Math.round(km))).padStart(digitos, '0').slice(-Math.max(digitos, String(Math.round(km)).length));
  return (
    <span className="inline-flex items-end gap-[2px] rounded-md bg-[#1b1f22] p-[3px]" role="img" aria-label={formatarKm(km)}>
      {texto.split('').map((d, i) => (
        <span
          key={i}
          className={`num grid h-8 w-[20px] place-items-center rounded-[3px] text-[18px] font-bold ${i === texto.length - 1 ? 'bg-white text-[#1b1f22]' : 'bg-[#2c3135] text-white'}`}
        >
          {d}
        </span>
      ))}
      <span className="px-1 pb-0.5 text-[10px] font-bold text-white/70">km</span>
    </span>
  );
}
