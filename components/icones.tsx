// Ícones dos serviços. Os que não existem no Lucide (galheta, pneu, vela, freio, correia, mola,
// palheta, alinhamento) são desenhados aqui no mesmo traço (24 px, linha 2, pontas redondas).

import {
  AirVent,
  BatteryCharging,
  ClipboardCheck,
  Cog,
  Cylinder,
  Disc3,
  Droplets,
  Funnel,
  Fuel,
  Repeat,
  SprayCan,
  ThermometerSun,
  Wind,
  type LucideProps
} from 'lucide-react';
import type { SVGProps } from 'react';
import type { ServicoId } from '@/lib/tipos';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 24, children, ...props }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function Galheta(props: P) {
  return (
    <Base {...props}>
      <path d="M3 11h8.5l3 3V20H3z" />
      <path d="M6 11V8.5h3V11" />
      <path d="M14.5 14 21 9" />
      <path d="M20.6 15.6c0 .9-.6 1.6-1.3 1.6s-1.3-.7-1.3-1.6c0-.9 1.3-2.6 1.3-2.6s1.3 1.7 1.3 2.6z" />
    </Base>
  );
}

export function Pneu(props: P) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </Base>
  );
}

export function Vela(props: P) {
  return (
    <Base {...props}>
      <path d="M12 2v3" />
      <path d="M9.5 5h5v6h-5z" />
      <path d="M8 11h8v3H8z" />
      <path d="M10 14h4v4h-4z" />
      <path d="M12 18v2.5h2.5" />
    </Base>
  );
}

export function Freio(props: P) {
  return (
    <Base {...props}>
      <circle cx="11" cy="13" r="8" />
      <circle cx="11" cy="13" r="2.5" />
      <path d="M14.5 3.2a10 10 0 0 1 6.3 6.3" strokeWidth={3.2} />
    </Base>
  );
}

export function Correia(props: P) {
  return (
    <Base {...props}>
      <circle cx="7" cy="12" r="4" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M7 8l11 1.5M7 16l11-1.5" />
    </Base>
  );
}

export function Mola(props: P) {
  return (
    <Base {...props}>
      <path d="M12 2v3" />
      <path d="M8 5l8 2-8 2 8 2-8 2 8 2" />
      <path d="M12 15v7" />
      <path d="M9 22h6" />
    </Base>
  );
}

export function Palheta(props: P) {
  return (
    <Base {...props}>
      <path d="M3 18a13 13 0 0 1 18 0" />
      <path d="M12 18l5-9" />
      <circle cx="12" cy="18" r="1" />
    </Base>
  );
}

export function Alinhamento(props: P) {
  return (
    <Base {...props}>
      <rect x="2.5" y="5" width="4" height="14" rx="2" />
      <rect x="17.5" y="5" width="4" height="14" rx="2" />
      <path d="M6.5 12h11M12 9v6" />
    </Base>
  );
}

const LUCIDE: Partial<Record<ServicoId, React.ComponentType<LucideProps>>> = {
  filtro_oleo: Funnel,
  filtro_ar: Wind,
  filtro_combustivel: Fuel,
  filtro_cabine: AirVent,
  revisao: ClipboardCheck,
  rodizio: Repeat,
  discos: Disc3,
  fluido_freio: Droplets,
  bateria: BatteryCharging,
  arrefecimento: ThermometerSun,
  cambio_manual: Cog,
  cambio_automatico: Cog,
  higienizacao: SprayCan,
  gnv: Cylinder
};

const PROPRIOS: Partial<Record<ServicoId, (p: P) => React.JSX.Element>> = {
  troca_oleo: Galheta,
  pneus: Pneu,
  velas: Vela,
  pastilhas: Freio,
  correia_dentada: Correia,
  correia_acessorios: Correia,
  amortecedores: Mola,
  palhetas: Palheta,
  alinhamento: Alinhamento
};

export function IconeServico({ servico, size = 20, className = '' }: { servico: ServicoId; size?: number; className?: string }) {
  const Proprio = PROPRIOS[servico];
  if (Proprio) return <Proprio size={size} className={className} />;
  const L = LUCIDE[servico] ?? ClipboardCheck;
  return <L size={size} className={className} aria-hidden="true" strokeWidth={2} />;
}
