'use client';

import { Copy, MessageCircle, Mic, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/Toasts';
import { Chip, classeBotao } from '@/components/ui';
import { URGENCIAS } from '@/lib/agente/esquema';
import type { MidiaDaOrdem, OrdemServico } from '@/lib/agente/ordem';
import { dataLocal, formatarData } from '@/lib/datas';
import { apagarMidia, useUrlDaMidia } from '@/lib/midia';
import { servico } from '@/lib/manutencao';
import { useOficina } from '@/lib/store';
import { linkWhatsApp } from '@/lib/whatsapp';

/** As ordens de serviço por voz deste carro, com fotos, áudios e a mensagem para o cliente. */
export function OrdensDoCarro({ veiculoId, telefone }: { veiculoId: string; telefone: string | null }) {
  const ordens = useOficina((s) => s.ordens);
  const remover = useOficina((s) => s.removerOrdem);
  const toast = useToast();
  const lista = Object.values(ordens)
    .filter((o) => o.veiculoId === veiculoId)
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));

  if (!lista.length) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-linha px-5 py-4">
        <p className="min-w-0 flex-1 text-[14.5px] text-tinta-2">Fale o que fez e tire fotos do que encontrou. A IA monta a ordem e a mensagem para o cliente.</p>
        <Link href={`/oficina/ordem?carro=${veiculoId}`} className={classeBotao('secundario', 'pequeno')}>
          <Mic size={16} aria-hidden="true" /> Ordem por voz
        </Link>
      </div>
    );
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ texto: 'Mensagem copiada.' });
    } catch {
      toast({ texto: 'Não deu para copiar.', tom: 'erro' });
    }
  }

  function apagar(o: OrdemServico) {
    if (!window.confirm('Apagar esta ordem de serviço com as fotos e áudios? O registro dos serviços continua no histórico.')) return;
    remover(o.id);
    for (const m of o.midias) void apagarMidia(m.id);
  }

  return (
    <ol className="flex flex-col gap-3">
      {lista.map((o) => {
        const zap = telefone ? linkWhatsApp(telefone, o.ia.mensagemCliente) : null;
        const fotos = o.midias.filter((m) => m.tipo === 'foto');
        const audios = o.midias.filter((m) => m.tipo === 'audio');
        return (
          <li key={o.id} className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold">{formatarData(dataLocal(o.criadoEm))}</p>
              <Chip>{o.origem === 'whatsapp' ? 'Pelo WhatsApp' : 'Por voz no app'}</Chip>
              {o.ia.servicos.length ? <p className="text-[14px] text-tinta-2">{o.ia.servicos.map((s) => servico(s.servico).nome).join(', ')}</p> : null}
              <button type="button" onClick={() => apagar(o)} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-tinta-3 hover:bg-atraso-claro hover:text-atraso" aria-label="Apagar esta ordem">
                <Trash2 size={17} />
              </button>
            </div>
            {o.ia.diagnostico ? <p className="text-[14.5px]">{o.ia.diagnostico}</p> : null}
            {o.ia.recomendacoes.length ? (
              <ul className="flex flex-col gap-1.5">
                {o.ia.recomendacoes.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-[14px]">
                    <Chip tom={r.urgencia === 'agora' ? 'atraso' : r.urgencia === 'proxima_revisao' ? 'oleo' : 'neutro'}>{URGENCIAS.find((u) => u.id === r.urgencia)?.nome}</Chip>
                    {r.texto}
                  </li>
                ))}
              </ul>
            ) : null}
            {fotos.length ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {fotos.map((m) => (
                  <Foto key={m.id} midia={m} />
                ))}
              </ul>
            ) : null}
            {audios.length ? (
              <div className="flex flex-col gap-1.5">
                {audios.map((m) => (
                  <Audio key={m.id} midia={m} />
                ))}
              </div>
            ) : null}
            <details className="rounded-xl bg-papel-2 px-3 py-2 text-[14px]">
              <summary className="cursor-pointer font-semibold">Mensagem para o cliente</summary>
              <p className="mt-2 whitespace-pre-line text-tinta-2">{o.ia.mensagemCliente}</p>
            </details>
            <div className="flex flex-wrap gap-2">
              {zap ? (
                <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
                  <MessageCircle size={16} aria-hidden="true" /> Mandar ao cliente
                </a>
              ) : null}
              <button type="button" className={classeBotao('secundario', 'pequeno')} onClick={() => void copiar(o.ia.mensagemCliente)}>
                <Copy size={15} aria-hidden="true" /> Copiar mensagem
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Foto({ midia }: { midia: MidiaDaOrdem }) {
  const url = useUrlDaMidia(midia.id);
  return (
    <li className="flex flex-col gap-1">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={midia.legenda ?? 'Foto da ordem de serviço'} className="aspect-square w-full rounded-xl object-cover ring-1 ring-linha" />
        </a>
      ) : (
        <div className="aspect-square w-full rounded-xl bg-papel-2" />
      )}
      {midia.legenda ? <p className="text-[12px] leading-snug text-tinta-3">{midia.legenda}</p> : null}
    </li>
  );
}

function Audio({ midia }: { midia: MidiaDaOrdem }) {
  const url = useUrlDaMidia(midia.id);
  return url ? <audio src={url} controls preload="none" className="h-10 w-full" /> : null;
}
