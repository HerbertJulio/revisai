'use client';

// O lembrete do fiado pelo WhatsApp: a mensagem com o valor, o vencimento e o Pix copia e cola
// da oficina, e a anotação de quando foi mandado.

import { Copy, MessageCircle } from 'lucide-react';
import { useCallback } from 'react';
import { useToast } from '@/components/Toasts';
import { classeBotao } from '@/components/ui';
import { formatarDiaHora } from '@/lib/datas';
import { mensagemDoFiado, pixDaOficina, somaEmReais, txidDoFiado } from '@/lib/financeiro';
import { SEM_NOME } from '@/lib/formatos';
import type { Lancamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import { linkWhatsApp } from '@/lib/whatsapp';

export interface Lembrete {
  texto: string;
  /** wa.me com o texto, quando o cliente tem WhatsApp. */
  link: string | null;
  pix: string | null;
  nome: string;
}

export function useMontarLembrete() {
  const oficina = useOficina((s) => s.oficina);
  const clientes = useOficina((s) => s.clientes);
  return useCallback(
    (itens: Lancamento[], hoje: string): Lembrete | null => {
      if (!itens.length) return null;
      const cliente = itens[0].clienteId ? clientes[itens[0].clienteId] : undefined;
      const total = somaEmReais(itens.map((i) => i.valor));
      const pix = pixDaOficina(oficina, total, txidDoFiado(itens[0].id));
      const nome = cliente && cliente.nome !== SEM_NOME ? cliente.nome : '';
      const texto = mensagemDoFiado({ oficina: oficina.nome, cliente: nome, itens, hoje, pix });
      return { texto, link: cliente?.telefone ? linkWhatsApp(cliente.telefone, texto) : null, pix, nome };
    },
    [oficina, clientes]
  );
}

/** Anota nos lançamentos que o lembrete foi mandado agora. */
export function marcarLembrados(itens: Lancamento[]) {
  const agora = new Date().toISOString();
  const s = useOficina.getState();
  for (const l of itens) {
    const atual = s.lancamentos[l.id];
    if (atual) s.salvarRegistro('lancamentos', { ...atual, lembradoEm: agora });
  }
}

export function textoDoLembrado(lembradoEm: string | null | undefined): string {
  return lembradoEm ? `Lembrado ${formatarDiaHora(lembradoEm)}` : '';
}

/** Um toque: abre o WhatsApp do cliente com a mensagem pronta (ou copia, quando não tem o número). */
export function BotaoLembrete({ itens, hoje, tamanho = 'normal', className = '' }: { itens: Lancamento[]; hoje: string; tamanho?: 'pequeno' | 'normal'; className?: string }) {
  const montar = useMontarLembrete();
  const toast = useToast();
  const l = montar(itens, hoje);
  if (!l) return null;
  if (l.link)
    return (
      <a href={l.link} target="_blank" rel="noopener noreferrer" onClick={() => marcarLembrados(itens)} className={classeBotao('whatsapp', tamanho, className)}>
        <MessageCircle size={tamanho === 'pequeno' ? 15 : 17} aria-hidden="true" /> Lembrar no WhatsApp
      </a>
    );
  return (
    <button
      type="button"
      className={classeBotao('secundario', tamanho, className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(l.texto);
          marcarLembrados(itens);
          toast({ texto: 'Mensagem copiada. O cliente não tem WhatsApp cadastrado: cole onde for mandar.' });
        } catch {
          toast({ texto: 'Não deu para copiar. Cadastre o WhatsApp do cliente para mandar com um toque.', tom: 'erro' });
        }
      }}
    >
      <Copy size={tamanho === 'pequeno' ? 15 : 17} aria-hidden="true" /> Copiar lembrete
    </button>
  );
}
