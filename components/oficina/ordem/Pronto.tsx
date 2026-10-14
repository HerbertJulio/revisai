'use client';

import { Check, MessageCircle, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, classeBotao } from '@/components/ui';
import { dataLocal, formatarData } from '@/lib/datas';
import { useOficina } from '@/lib/store';
import { linkWhatsApp } from '@/lib/whatsapp';
import { BotaoAvaliacao } from '../plano';
import type { FotoLocal } from './sessao';

function guardados(audios: number, fotos: number): string {
  const itens = [audios ? (audios === 1 ? 'O áudio' : 'Os áudios') : null, 'o texto', fotos ? (fotos === 1 ? 'a foto' : 'as fotos') : null].filter(Boolean) as string[];
  const lista = itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0];
  return `${lista.charAt(0).toUpperCase()}${lista.slice(1)} ${itens.length > 1 ? 'ficam guardados' : 'fica guardado'} na ordem, neste aparelho.`;
}

/** A ordem confirmada: a mensagem pronta para o cliente, a etiqueta e o caminho para a próxima. */
export function Pronto({
  veiculoId,
  mensagem,
  atendimentoId,
  fotos,
  audios,
  aoNova
}: {
  veiculoId: string;
  mensagem: string;
  atendimentoId: string | null;
  fotos: FotoLocal[];
  audios: number;
  aoNova: () => void;
}) {
  const veiculo = useOficina((s) => s.veiculos[veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const toast = useToast();
  const whatsapp = cliente ? linkWhatsApp(cliente.telefone, mensagem) : null;
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);
  useEffect(() => {
    try {
      setPodeCompartilhar(!!fotos.length && !!navigator.canShare?.({ files: fotos.map((f) => f.arquivo) }));
    } catch {
      setPodeCompartilhar(false);
    }
  }, [fotos]);

  async function compartilhar() {
    try {
      await navigator.share({ text: mensagem, files: fotos.map((f, i) => new File([f.arquivo], `foto-${i + 1}.${f.arquivo.type.includes('webp') ? 'webp' : 'jpg'}`, { type: f.arquivo.type })) });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast({ texto: 'Não deu para compartilhar. Use o botão do WhatsApp.', tom: 'erro' });
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast({ texto: 'Mensagem copiada.' });
    } catch {
      toast({ texto: 'Não deu para copiar.', tom: 'erro' });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="flex items-center gap-2 font-semibold text-ok">
          <Check size={18} aria-hidden="true" /> Ordem registrada
        </p>
        <h1 className="largo mt-1 text-[28px] sm:text-[32px]">
          {cliente?.nome ?? 'Cliente'}, {veiculo?.modelo}
        </h1>
        <p className="mt-1 text-tinta-2">
          {atendimentoId ? 'Os serviços entraram no histórico e os próximos avisos já estão calculados.' : 'A ordem ficou guardada no carro.'} {guardados(audios, fotos.length)}
        </p>
      </div>
      <div className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
        <p className="mb-2 text-[13px] font-semibold text-tinta-3">Mensagem para o cliente</p>
        <p className="text-[15px] whitespace-pre-line">{mensagem}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {podeCompartilhar ? (
          <Botao variante="whatsapp" tamanho="grande" onClick={() => void compartilhar()}>
            <Share2 size={18} /> Mandar com as fotos
          </Botao>
        ) : null}
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao(podeCompartilhar ? 'secundario' : 'whatsapp', 'grande')}>
            <MessageCircle size={18} aria-hidden="true" /> Mandar no WhatsApp
          </a>
        ) : null}
        <Botao tamanho="grande" onClick={() => void copiar()}>
          Copiar mensagem
        </Botao>
        <BotaoAvaliacao telefone={cliente?.telefone} nomeCliente={cliente?.nome ?? ''} carro={veiculo?.modelo ?? 'carro'} />
        {atendimentoId ? (
          <Link href={`/oficina/etiqueta?atendimento=${atendimentoId}`} className={classeBotao('secundario', 'grande')}>
            Etiqueta do para-brisa
          </Link>
        ) : null}
        <Link href={`/oficina/carro?id=${veiculoId}`} className={classeBotao('fantasma', 'grande')}>
          Ver o carro
        </Link>
        <Botao variante="fantasma" tamanho="grande" onClick={aoNova}>
          Nova ordem
        </Botao>
      </div>
      <p className="text-[13px] text-tinta-3">Registrada em {formatarData(dataLocal(new Date().toISOString()))}. Para a foto ir junto no WhatsApp, use Mandar com as fotos no celular.</p>
    </div>
  );
}
