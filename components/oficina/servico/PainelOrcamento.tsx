'use client';

// No orçamento: o link que o cliente recebeu (visto quantas vezes, respondido) e, sem conta, o
// convite para entrar e mandar o link onde o cliente responde sozinho.

import { Copy, Eye, Link2, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao } from '@/components/ui';
import { dataHora } from '@/components/cliente/comum';
import { jsonCanonico } from '@/lib/aprovacao';
import { dadosDoOrcamento } from '@/lib/links-publicos';
import { useOficina } from '@/lib/store';
import type { Documento } from '@/lib/tipos';
import { AvisoSemConta, CaixaDoServico, copiarTexto } from './comum';
import { useContextoDaConta } from './conta';
import { useLinkNoBanco } from './situacao';

export function PainelDoLinkDoOrcamento({ doc }: { doc: Documento }) {
  const ctx = useContextoDaConta();
  const toast = useToast();
  const veiculo = useOficina((s) => (doc.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const guardado = doc.links?.orcamento;
  const { link } = useLinkNoBanco('orcamento', doc.id, doc.tipo === 'orcamento' && !!guardado);
  const mudou = useMemo(() => {
    if (!link || link.respondidoEm || doc.situacao === 'aprovado') return false;
    return jsonCanonico(link.dados) !== jsonCanonico(dadosDoOrcamento(doc, cliente, veiculo));
  }, [link, doc, cliente, veiculo]);

  if (doc.tipo !== 'orcamento') return null;
  if (!ctx) {
    if (doc.situacao === 'aprovado' || doc.situacao === 'recusado') return null;
    return <AvisoSemConta texto="Sem conta, o cliente aprova pelo WhatsApp e você marca aqui. Entre com sua conta para mandar o link onde ele aprova sozinho." />;
  }
  if (!guardado?.url) return null;

  return (
    <CaixaDoServico
      titulo="Link do cliente"
      icone={<Link2 size={18} aria-hidden="true" />}
      acao={
        <Botao
          tamanho="pequeno"
          variante="fantasma"
          onClick={async () => toast({ texto: (await copiarTexto(guardado.url!)) ? 'Link copiado.' : 'Não deu para copiar.' })}
        >
          <Copy size={15} aria-hidden="true" /> Copiar
        </Botao>
      }
    >
      <p className="flex items-center gap-2 text-[14px] text-tinta-2">
        <Eye size={16} aria-hidden="true" />
        {link?.respondidoEm
          ? `Respondido em ${dataHora(link.respondidoEm)}.`
          : link?.vistas
            ? `O cliente abriu ${link.vistas === 1 ? '1 vez' : `${link.vistas} vezes`}, a última em ${dataHora(link.vistoEm)}.`
            : 'O cliente ainda não abriu.'}
      </p>
      {mudou ? (
        <p className="flex items-start gap-2 rounded-lg bg-oleo-claro px-3 py-2 text-[13.5px] text-oleo-tinta">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> O orçamento mudou depois de mandar. Toque em Mandar de novo para o cliente ver a versão nova.
        </p>
      ) : null}
    </CaixaDoServico>
  );
}
