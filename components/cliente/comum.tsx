// Peças das páginas que a oficina manda para o cliente dela: o cabeçalho com a oficina (sempre
// a do banco, nunca a dos dados do link), o botão de imprimir e o contato pelo WhatsApp.

import { MapPin, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { classeBotao } from '@/components/ui';
import { formatarCnpj } from '@/lib/cnpj';
import { formatarTelefone } from '@/lib/formatos';
import { cidadeDaOficina, type OficinaDoLink } from '@/lib/links-publicos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { BotaoImprimir } from './Imprimir';

export function CabecalhoDaOficina({ oficina, rotulo, children }: { oficina: OficinaDoLink; rotulo: string; children?: ReactNode }) {
  const local = [oficina.endereco, cidadeDaOficina(oficina)].filter(Boolean).join(', ');
  return (
    <header className="flex flex-col gap-1 border-b-2 border-tinta pb-4">
      <p className="largo text-[15px] font-extrabold tracking-wide text-oleo-tinta">{rotulo}</p>
      <h1 className="largo text-[28px] leading-tight sm:text-[34px]">{oficina.nome}</h1>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px] text-tinta-2">
        {local ? (
          <span className="inline-flex items-center gap-1">
            <MapPin size={15} aria-hidden="true" /> {local}
          </span>
        ) : null}
        {oficina.whatsapp ? <span>WhatsApp {formatarTelefone(oficina.whatsapp)}</span> : null}
        {oficina.cnpj ? <span className="num">CNPJ {formatarCnpj(oficina.cnpj)}</span> : null}
      </p>
      {children}
    </header>
  );
}

/** Falar com a oficina pelo WhatsApp, com a mensagem pronta. */
export function FalarComAOficina({ oficina, mensagem, rotulo = 'Falar com a oficina', destaque = false }: { oficina: OficinaDoLink; mensagem: string; rotulo?: string; destaque?: boolean }) {
  const zap = oficina.whatsapp ? linkWhatsApp(oficina.whatsapp, mensagem) : null;
  if (!zap) return null;
  return (
    <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao(destaque ? 'whatsapp' : 'secundario', 'normal', 'flex-1 print:hidden')}>
      <MessageCircle size={17} aria-hidden="true" /> {rotulo}
    </a>
  );
}

export function Rodape({ children }: { children: ReactNode }) {
  return <p className="border-t border-linha pt-4 text-[12.5px] leading-relaxed text-tinta-3">{children}</p>;
}

export function AcoesDoCliente({ children, imprimir = 'Imprimir ou salvar PDF' }: { children?: ReactNode; imprimir?: string | null }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {children}
      {imprimir ? <BotaoImprimir rotulo={imprimir} /> : null}
    </div>
  );
}

export function LinkInvalido() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-10">
      <h1 className="largo text-[28px] leading-tight">Este link não vale mais</h1>
      <p className="text-tinta-2">Ele pode ter vencido, ou a oficina mandou um link novo. Peça o link certo para a oficina.</p>
    </div>
  );
}

/** Data e hora de um instante no fuso do Brasil: "17/10/2026 às 14:05". */
export function dataHora(instante: string | null | undefined): string {
  if (!instante) return '';
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const p = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`;
}
