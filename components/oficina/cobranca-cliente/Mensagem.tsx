'use client';

import { Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, classeBotao } from '@/components/ui';

/** Copia o texto (e avisa quando o navegador não deixa). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/**
 * A mensagem pronta para o cliente: abrir no WhatsApp (toque direto, para o navegador não
 * bloquear), copiar, e a página do Pix para conferir.
 */
export function MensagemPronta({ texto, whatsapp, link, aoFechar }: { texto: string; whatsapp: string | null; link: string | null; aoFechar?: () => void }) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      <pre className="max-h-44 overflow-y-auto rounded-lg bg-papel-2 px-3 py-2.5 font-sans text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-tinta-2" aria-label="Mensagem para o cliente">
        {texto}
      </pre>
      <div className="flex flex-wrap gap-2">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp')} onClick={aoFechar}>
            <MessageCircle size={17} aria-hidden="true" /> Abrir o WhatsApp
          </a>
        ) : null}
        <Botao
          variante="secundario"
          onClick={async () => {
            const ok = await copiarTexto(texto);
            setCopiado(ok);
            toast(ok ? { texto: 'Mensagem copiada.' } : { texto: 'Não deu para copiar. Segure o texto e copie.', tom: 'erro' });
          }}
        >
          <Copy size={16} aria-hidden="true" /> {copiado ? 'Copiada' : 'Copiar a mensagem'}
        </Botao>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={classeBotao('fantasma')} data-link-pagamento={link}>
            <ExternalLink size={16} aria-hidden="true" /> Ver a página
          </a>
        ) : null}
      </div>
      {!whatsapp ? <p className="text-[13px] text-tinta-3">O cliente não tem WhatsApp no cadastro. Copie a mensagem e mande por onde preferir.</p> : null}
    </div>
  );
}
