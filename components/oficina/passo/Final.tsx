'use client';

// A última tela do passo a passo: a ordem concluída (com a etiqueta e o cartão), a ordem em
// andamento, ou o orçamento salvo, com o envio pelo WhatsApp e o link para o cliente.

import { Check, ClipboardList, Copy, ExternalLink, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, classeBotao } from '@/components/ui';
import { mensagemDePronto, situacaoVisivel, SITUACOES, tituloDoDocumento, totais, validoAte } from '@/lib/documentos';
import { formatarData } from '@/lib/datas';
import { formatarMoeda, normalizarTelefone } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useLinkDoOrcamento } from '../documentos';
import { Feito } from '../Feito';

export type Resultado =
  | { tipo: 'concluida'; documentoId: Id; atendimentoId: Id | null; veiculoId: Id }
  | { tipo: 'aberta'; documentoId: Id; veiculoId: Id }
  | { tipo: 'orcamento'; documentoId: Id; veiculoId: Id; enviado: boolean };

export function Final({ resultado, aoNova }: { resultado: Resultado; aoNova: () => void }) {
  const doc = useOficina((s) => s.documentos[resultado.documentoId]);
  const veiculo = useOficina((s) => s.veiculos[resultado.veiculoId]);
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const oficina = useOficina((s) => s.oficina);
  if (!doc) return null;

  if (resultado.tipo === 'concluida' && resultado.atendimentoId) {
    const pronto = cliente?.telefone ? linkWhatsApp(cliente.telefone, mensagemDePronto({ oficina: oficina.nome, cliente: cliente.nome, carro: veiculo?.modelo ?? '', total: totais(doc).total || null })) : null;
    return (
      <Feito
        atendimentoId={resultado.atendimentoId}
        veiculoId={resultado.veiculoId}
        aoRegistrarOutro={aoNova}
        titulo={`${tituloDoDocumento(doc)} concluída`}
        extra={
          pronto ? (
            <a href={pronto} target="_blank" rel="noopener noreferrer" className={`${classeBotao('secundario', 'grande')} self-start`}>
              <MessageCircle size={18} aria-hidden="true" /> Avisar que o carro está pronto
            </a>
          ) : null
        }
      />
    );
  }

  if (resultado.tipo === 'orcamento') return <OrcamentoSalvo documentoId={doc.id} enviado={resultado.enviado} aoNova={aoNova} />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="flex items-center gap-2 font-semibold text-caneta">
          <ClipboardList size={18} aria-hidden="true" /> {resultado.tipo === 'aberta' ? 'Em andamento' : 'Salva'}
        </p>
        <h1 className="largo mt-1 text-[28px] sm:text-[32px]">{tituloDoDocumento(doc)}</h1>
        <p className="mt-1 text-tinta-2">
          {[veiculo?.modelo, cliente?.nome].filter(Boolean).join(', ')}. Total de {formatarMoeda(totais(doc).total)}. Quando terminar o serviço, toque em Concluir na lista de ordens: os avisos das próximas trocas saem dali.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/oficina/ordens?aba=ordens" className={classeBotao('escuro', 'grande')}>
          Ver as ordens
        </Link>
        <Botao tamanho="grande" onClick={aoNova}>
          Fazer outra
        </Botao>
      </div>
    </div>
  );
}

function OrcamentoSalvo({ documentoId, enviado, aoNova }: { documentoId: Id; enviado: boolean; aoNova: () => void }) {
  const doc = useOficina((s) => s.documentos[documentoId]);
  const veiculo = useOficina((s) => (doc?.veiculoId ? s.veiculos[doc.veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  const marcarEnviado = useOficina((s) => s.marcarEnviado);
  const montar = useLinkDoOrcamento();
  const hoje = useHoje();
  const toast = useToast();
  const [mandado, setMandado] = useState(enviado);
  if (!doc) return null;
  const t = totais(doc);
  const situacao = situacaoVisivel(doc, hoje);
  const telefone = normalizarTelefone(cliente?.telefone ?? '');

  function link() {
    if (doc!.situacao === 'rascunho') marcarEnviado(doc!.id);
    return montar(doc!.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <p className="flex items-center gap-2 font-semibold text-ok">
          <Check size={18} aria-hidden="true" /> {mandado ? 'Orçamento mandado' : 'Orçamento salvo'}
        </p>
        <h1 className="largo mt-1 text-[28px] sm:text-[32px]">{tituloDoDocumento(doc)}</h1>
        <p className="mt-1 text-tinta-2">
          {[veiculo?.modelo, cliente?.nome].filter(Boolean).join(', ')}. Total de <strong className="num text-tinta">{formatarMoeda(t.total)}</strong>, válido até {formatarData(validoAte(doc))}. {SITUACOES[situacao].nome}.
        </p>
      </div>
      <p className="rounded-2xl bg-papel px-4 py-3.5 text-[14.5px] text-tinta-2 ring-1 ring-linha">
        O cliente abre o link, vê os itens, desmarca o que não quiser e aprova pelo WhatsApp da oficina. Quando ele aprovar, toque em Aprovado na lista de orçamentos e o orçamento vira uma ordem de serviço já preenchida.
      </p>
      <div className="flex flex-wrap gap-2">
        {telefone ? (
          <button
            type="button"
            onClick={() => {
              const l = link();
              if (l?.whatsapp) {
                window.open(l.whatsapp, '_blank', 'noopener,noreferrer');
                setMandado(true);
              }
            }}
            className={classeBotao('whatsapp', 'grande')}
          >
            <MessageCircle size={18} aria-hidden="true" /> {mandado ? 'Mandar de novo' : 'Mandar no WhatsApp'}
          </button>
        ) : null}
        <Botao
          tamanho="grande"
          onClick={async () => {
            const l = link();
            if (!l) return;
            try {
              await navigator.clipboard.writeText(`${l.texto}`);
              toast({ texto: 'Mensagem com o link copiada.' });
            } catch {
              toast({ texto: 'Não deu para copiar. Use o botão do WhatsApp.', tom: 'erro' });
            }
          }}
        >
          <Copy size={17} aria-hidden="true" /> Copiar mensagem
        </Botao>
        <Botao
          tamanho="grande"
          variante="fantasma"
          onClick={() => {
            const l = montar(doc.id);
            if (l) window.open(l.link, '_blank', 'noopener,noreferrer');
          }}
        >
          <ExternalLink size={17} aria-hidden="true" /> Ver como o cliente vê
        </Botao>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-linha pt-4">
        <Link href="/oficina/ordens" className={classeBotao('escuro')}>
          Ver os orçamentos
        </Link>
        <Botao onClick={aoNova}>Fazer outro</Botao>
      </div>
    </div>
  );
}
