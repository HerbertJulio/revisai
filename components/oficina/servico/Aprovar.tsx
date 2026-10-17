'use client';

// Como o cliente aprovou, quando a oficina marca a aprovação no app: pelo WhatsApp (a hora em que
// ele respondeu e uma nota) ou na oficina (assinatura no aparelho e o nome). A prova guarda o
// resumo do que foi aprovado, o mesmo cálculo da aprovação pelo link.

import { MessageCircle, PenLine } from 'lucide-react';
import { QuadroDeAssinatura } from '@/components/cliente/Assinatura';
import { Campo, classeEntrada } from '@/components/ui';
import { conteudoDoOrcamento, versaoDoConteudo } from '@/lib/aprovacao';
import type { AprovacaoDocumento, Documento, Id } from '@/lib/tipos';

export type FormaDaAprovacao =
  | { canal: 'whatsapp'; quando: string; observacao: string }
  | { canal: 'presencial'; nome: string; assinatura: string | null };

/** "2026-10-17T14:05" no fuso do aparelho, para o campo de data e hora. */
export function agoraNoCampo(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formaInicial(): FormaDaAprovacao {
  return { canal: 'whatsapp', quando: agoraNoCampo(), observacao: '' };
}

/** A prova da aprovação marcada no app (ou o que falta para ela valer). */
export async function provaDaAprovacao(doc: Documento, recusadas: Id[], forma: FormaDaAprovacao): Promise<{ ok: true; aprovacao: AprovacaoDocumento } | { ok: false; erro: string }> {
  const versao = await versaoDoConteudo(conteudoDoOrcamento(doc, recusadas));
  const agente = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null;
  if (forma.canal === 'whatsapp') {
    const quando = new Date(forma.quando);
    if (Number.isNaN(quando.getTime())) return { ok: false, erro: 'Escreva a data e a hora em que o cliente respondeu.' };
    if (quando.getTime() > Date.now() + 5 * 60_000) return { ok: false, erro: 'A hora da resposta não pode ser depois de agora.' };
    const observacao = forma.observacao.trim().slice(0, 300);
    return { ok: true, aprovacao: { canal: 'whatsapp', quando: quando.toISOString(), versao, agente, ...(observacao ? { observacao } : {}) } };
  }
  const nome = forma.nome.trim().slice(0, 80);
  if (nome.length < 2) return { ok: false, erro: 'Escreva o nome de quem aprovou.' };
  if (!forma.assinatura) return { ok: false, erro: 'Peça para o cliente assinar no quadro.' };
  return { ok: true, aprovacao: { canal: 'presencial', quando: new Date().toISOString(), nome, versao, agente, ip: null, assinatura: forma.assinatura } };
}

export function EscolhaDaAprovacao({ forma, aoMudar, nomeDoCliente }: { forma: FormaDaAprovacao; aoMudar: (f: FormaDaAprovacao) => void; nomeDoCliente: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-papel-2 px-3.5 py-3">
      <p className="text-[14.5px] font-semibold">Como o cliente aprovou?</p>
      <div className="flex gap-1 self-start rounded-[12px] bg-papel p-1" role="radiogroup" aria-label="Como o cliente aprovou">
        {(
          [
            ['whatsapp', 'Pelo WhatsApp', <MessageCircle key="w" size={16} aria-hidden="true" />],
            ['presencial', 'Na oficina', <PenLine key="p" size={16} aria-hidden="true" />]
          ] as const
        ).map(([canal, rotulo, icone]) => (
          <button
            key={canal}
            type="button"
            role="radio"
            aria-checked={forma.canal === canal}
            onClick={() => aoMudar(canal === 'whatsapp' ? { canal, quando: agoraNoCampo(), observacao: '' } : { canal, nome: nomeDoCliente, assinatura: null })}
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-3.5 text-[14.5px] font-semibold ${forma.canal === canal ? 'bg-tinta text-papel' : 'text-tinta-2 hover:text-tinta'}`}
          >
            {icone} {rotulo}
          </button>
        ))}
      </div>
      {forma.canal === 'whatsapp' ? (
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <Campo rotulo="Quando ele respondeu" htmlFor="aprov-quando">
            <input id="aprov-quando" type="datetime-local" className={classeEntrada} value={forma.quando} max={agoraNoCampo(new Date(Date.now() + 60_000))} onChange={(e) => aoMudar({ ...forma, quando: e.target.value })} />
          </Campo>
          <Campo rotulo="O que ele disse" htmlFor="aprov-nota" dica="Opcional. Ex.: Pode fazer, mas sem as palhetas.">
            <input id="aprov-nota" className={classeEntrada} value={forma.observacao} maxLength={300} onChange={(e) => aoMudar({ ...forma, observacao: e.target.value })} />
          </Campo>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Campo rotulo="Nome de quem aprovou" htmlFor="aprov-nome">
            <input id="aprov-nome" className={classeEntrada} value={forma.nome} maxLength={80} autoComplete="off" onChange={(e) => aoMudar({ ...forma, nome: e.target.value })} />
          </Campo>
          <QuadroDeAssinatura rotulo="Assinatura do cliente" aoMudar={(assinatura) => aoMudar({ ...forma, assinatura })} />
        </div>
      )}
      <p className="text-[13px] text-tinta-3">Fica guardado como comprovante, com o resumo do que foi aprovado.</p>
    </div>
  );
}
