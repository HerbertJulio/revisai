'use client';

import { MessageCircle, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { encerrarRascunhoDoWhatsApp, rascunhosDoWhatsApp } from '@/app/oficina/acoes-agente';
import { useToast } from '@/components/Toasts';
import { Botao } from '@/components/ui';
import type { RascunhoParaApp } from '@/lib/agente/rascunhos';
import { formatarData } from '@/lib/datas';
import { formatarPlaca } from '@/lib/formatos';
import { reduzirFoto } from '@/lib/imagem-cliente';
import { servico as infoServico } from '@/lib/manutencao';
import { novoId, type Clipe } from './gravador';
import type { FotoLocal } from './sessao';

/** Ordens que o mecânico mandou pelo WhatsApp e a IA já montou, esperando conferência. */
export function CaixaWhatsApp({ aparelhoId, aoAbrir }: { aparelhoId: string; aoAbrir: (r: RascunhoParaApp, fotos: FotoLocal[], clipes: Clipe[]) => void }) {
  const toast = useToast();
  const [lista, setLista] = useState<RascunhoParaApp[]>([]);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    rascunhosDoWhatsApp(aparelhoId)
      .then((l) => vivo && setLista(l))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [aparelhoId]);

  async function abrir(r: RascunhoParaApp) {
    setAbrindo(r.id);
    const fotos: FotoLocal[] = [];
    const clipes: Clipe[] = [];
    try {
      for (const [indice, m] of r.midias.entries()) {
        const resp = await fetch('/api/agente/midia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aparelhoId, rascunhoId: r.id, indice }) });
        if (!resp.ok) continue;
        const blob = await resp.blob();
        const id = novoId();
        if (m.tipo === 'foto') {
          // do mesmo tamanho das fotos tiradas no app (para guardar e para a IA olhar de novo)
          const original = new File([blob], `foto-${indice + 1}`, { type: m.mime });
          const arquivo = await reduzirFoto(original, 1280, 0.8).catch(() => original);
          fotos.push({ id, arquivo, url: URL.createObjectURL(arquivo) });
        } else clipes.push({ id, blob, url: URL.createObjectURL(blob), segundos: 0, ouvido: true });
      }
      aoAbrir(r, fotos, clipes);
    } catch {
      toast({ texto: 'Não deu para baixar os áudios e fotos. Confira a internet.', tom: 'erro' });
    } finally {
      setAbrindo(null);
    }
  }

  async function descartar(r: RascunhoParaApp) {
    if (!window.confirm('Jogar fora esta ordem do WhatsApp?')) return;
    const ok = await encerrarRascunhoDoWhatsApp(aparelhoId, r.id, 'descartada').catch(() => false);
    if (ok) setLista((l) => l.filter((x) => x.id !== r.id));
    else toast({ texto: 'Não deu para descartar agora.', tom: 'erro' });
  }

  if (!lista.length) return null;
  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="text-[19px]">Chegaram pelo WhatsApp</h2>
      <ul className="flex flex-col gap-2">
        {lista.map((r) => {
          const fotos = r.midias.filter((m) => m.tipo === 'foto').length;
          const audios = r.midias.length - fotos;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok-claro text-ok">
                <MessageCircle size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.ordem.placa ? formatarPlaca(r.ordem.placa) : 'Carro a escolher'}
                  {r.ordem.servicos.length ? `, ${r.ordem.servicos.map((s) => infoServico(s.servico).nome.toLowerCase()).join(', ')}` : ''}
                </p>
                <p className="text-[13.5px] text-tinta-3">
                  {formatarData(r.criadoEm.slice(0, 10))}, {audios} {audios === 1 ? 'áudio' : 'áudios'} e {fotos} {fotos === 1 ? 'foto' : 'fotos'}
                </p>
              </div>
              <Botao tamanho="pequeno" variante="escuro" onClick={() => void abrir(r)} disabled={abrindo != null}>
                {abrindo === r.id ? 'Abrindo…' : 'Conferir'}
              </Botao>
              <Botao tamanho="pequeno" variante="fantasma" onClick={() => void descartar(r)} aria-label="Descartar">
                <Trash2 size={16} />
              </Botao>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
