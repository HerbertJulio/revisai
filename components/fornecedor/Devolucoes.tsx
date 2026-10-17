'use client';

// Os pedidos de devolução e garantia das oficinas: o que volta, por quê, as fotos e a resposta da
// loja. A loja pode pedir mais informação (a oficina completa o pedido), aceitar, recusar com a razão
// e marcar como resolvida quando a troca ou o reembolso acontecer. A oficina vê a resposta na hora.

import { MessageCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { responderDevolucaoDaLoja } from '@/app/fornecedor/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Vazio, classeArea, classeBotao } from '@/components/ui';
import { formatarMoeda, formatarTelefone } from '@/lib/formatos';
import { dataCurta, diaEmBrasilia, quandoFoi } from '@/lib/loja/comum';
import { acoesDaDevolucao, aguardaQuem, SITUACOES_DEVOLUCAO, TIPOS_DEVOLUCAO, valorDaDevolucao, type Devolucao, type SituacaoDevolucao } from '@/lib/loja/dados';
import { linkWhatsApp } from '@/lib/whatsapp';
import { AvisoErro, Filtro, LinhaDeFiltros } from './comum';

const SEM_CONEXAO = 'Sem conexão com o servidor. Tente de novo.';

type Vista = 'loja' | 'oficina' | 'encerradas' | 'todas';

const VISTAS: { id: Vista; nome: string; passa: (d: Devolucao) => boolean }[] = [
  { id: 'loja', nome: 'Para responder', passa: (d) => aguardaQuem(d) === 'loja' },
  { id: 'oficina', nome: 'Esperando a oficina', passa: (d) => aguardaQuem(d) === 'oficina' },
  { id: 'encerradas', nome: 'Encerradas', passa: (d) => d.situacao === 'recusada' || d.situacao === 'resolvida' },
  { id: 'todas', nome: 'Todas', passa: () => true }
];

const FEITO: Record<SituacaoDevolucao, string> = {
  aberta: 'Pergunta enviada. A oficina vê na hora e pode completar o pedido.',
  aceita: 'Devolução aceita. A oficina vê a resposta na hora.',
  recusada: 'Devolução recusada. A oficina vê a razão na hora.',
  resolvida: 'Marcada como resolvida.'
};

function quantidade(n: number): string {
  return String(n).replace('.', ',');
}

export function DevolucoesDaLoja({ devolucoes, loja, hoje }: { devolucoes: Devolucao[]; loja: string; hoje: string }) {
  const paraResponder = devolucoes.filter(VISTAS[0].passa).length;
  const [vista, setVista] = useState<Vista>(paraResponder ? 'loja' : 'todas');
  const agora = Date.now();
  const atual = VISTAS.find((v) => v.id === vista) ?? VISTAS[3];
  const visiveis = devolucoes.filter(atual.passa);

  if (!devolucoes.length)
    return (
      <Vazio titulo="Nenhum pedido de devolução">
        Quando uma oficina pedir devolução ou garantia de uma compra entregue, o pedido aparece aqui, com o motivo e as fotos, e o painel avisa na hora.
      </Vazio>
    );

  return (
    <div className="flex flex-col gap-4">
      <LinhaDeFiltros rotulo="Mostrar">
        {VISTAS.map((v) => (
          <Filtro key={v.id} ativo={vista === v.id} aoClicar={() => setVista(v.id)} n={devolucoes.filter(v.passa).length}>
            {v.nome}
          </Filtro>
        ))}
      </LinhaDeFiltros>
      {visiveis.length ? (
        <ul className="flex flex-col gap-3">
          {visiveis.map((d) => (
            <CartaoDaDevolucao key={d.id} d={d} loja={loja} agora={agora} hoje={hoje} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-papel px-4 py-5 text-[15px] text-tinta-3 ring-1 ring-linha sm:px-5">Nada aqui agora.</p>
      )}
    </div>
  );
}

function CartaoDaDevolucao({ d, loja, agora, hoje }: { d: Devolucao; loja: string; agora: number; hoje: string }) {
  const situacao = SITUACOES_DEVOLUCAO[d.situacao];
  const vez = aguardaQuem(d);
  const valor = valorDaDevolucao(d);
  const acoes = acoesDaDevolucao(d.situacao, 'loja');
  const compra = d.codigo ? `compra ${d.codigo}` : 'compra';
  const whatsapp = d.oficina.whatsapp ? linkWhatsApp(d.oficina.whatsapp, `Oi! Aqui é da ${loja}. Sobre o pedido de ${TIPOS_DEVOLUCAO[d.tipo].toLowerCase()} da ${compra}: `) : null;
  const detalhes = [
    [d.oficina.cidade, d.oficina.uf].filter(Boolean).join(', '),
    d.oficina.whatsapp ? formatarTelefone(d.oficina.whatsapp) : null,
    `pedido ${quandoFoi(d.criadoEm, agora)}`,
    d.compra.entregueEm ? `entregue em ${dataCurta(diaEmBrasilia(d.compra.entregueEm), hoje)}` : null
  ].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">
              {TIPOS_DEVOLUCAO[d.tipo]} da {compra}
            </p>
            <Chip tom={situacao.tom}>{situacao.nome}</Chip>
            {vez === 'oficina' ? <Chip>Esperando a oficina</Chip> : null}
          </div>
          <p className="mt-0.5 text-[14.5px] font-semibold">{d.oficina.nome ?? 'Oficina'}</p>
          <p className="text-[13.5px] text-tinta-3">{detalhes.join(' · ')}</p>
        </div>
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
            <MessageCircle size={15} aria-hidden="true" /> Chamar a oficina
          </a>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 text-[14.5px]">
        {d.itens.length ? (
          <ul className="flex flex-col gap-0.5">
            {d.itens.map((i) => (
              <li key={i.produtoId}>
                <span className="num font-semibold">{quantidade(i.quantidade)} ×</span> {i.nome}
                {i.precoUnitario != null ? <span className="text-tinta-3"> ({formatarMoeda(i.precoUnitario)} cada)</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>A compra toda.</p>
        )}
        {valor != null ? <p className="text-tinta-3">Valor: {formatarMoeda(valor)}</p> : null}
      </div>

      <p className="text-[15px] whitespace-pre-line">{d.motivo}</p>

      {d.fotos.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Fotos que a oficina mandou">
          {d.fotos.map((f, i) => (
            <li key={f.caminho}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl bg-papel-2 ring-1 ring-linha sm:h-24 sm:w-24">
                {/* eslint-disable-next-line @next/next/no-img-element -- a foto vem da rota do próprio site, que confere quem pode ver */}
                <img src={f.url} alt={`Foto ${i + 1} do pedido`} loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {d.resposta ? (
        <div className="rounded-xl bg-papel-2 px-3.5 py-3 text-[14.5px]">
          <p className="text-[13px] font-semibold text-tinta-3">Resposta da loja{d.respondidaEm ? `, ${quandoFoi(d.respondidaEm, agora)}` : ''}</p>
          <p className="whitespace-pre-line">{d.resposta}</p>
        </div>
      ) : null}

      {d.situacao === 'resolvida' && d.resolvidaEm ? <p className="text-[14px] text-ok">Resolvida {quandoFoi(d.resolvidaEm, agora)}.</p> : null}
      {acoes.responder ? <Responder d={d} situacoes={acoes.situacoes} /> : null}
    </li>
  );
}

function Responder({ d, situacoes }: { d: Devolucao; situacoes: SituacaoDevolucao[] }) {
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const id = `resposta-${d.id}`;

  function enviar(situacao: SituacaoDevolucao) {
    setErro(null);
    const resposta = texto.trim();
    if (situacao === 'recusada' && resposta.length < 5) return setErro('Diga à oficina por que a devolução foi recusada.');
    if (situacao === d.situacao && resposta.length < 2) return setErro(d.situacao === 'aberta' ? 'Escreva o que precisa saber da oficina.' : 'Escreva a resposta.');
    iniciar(async () => {
      try {
        const r = await responderDevolucaoDaLoja(d.id, { situacao, resposta });
        if (!r.ok) return setErro(r.erro);
        setTexto('');
        toast({ texto: situacao === d.situacao && situacao !== 'aberta' ? 'Resposta atualizada.' : FEITO[situacao] });
      } catch {
        setErro(SEM_CONEXAO);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-linha pt-3">
      <Campo
        rotulo={d.situacao === 'aceita' ? 'Recado para a oficina (opcional)' : 'Resposta para a oficina'}
        htmlFor={id}
        dica={
          d.situacao === 'aberta'
            ? 'Para aceitar, diga como fica a troca ou o reembolso. Para recusar, a razão. Ou peça o que falta (uma foto, o número da nota).'
            : d.situacao === 'aceita'
              ? 'Marque como resolvida quando a troca ou o reembolso acontecer.'
              : 'Mudou de ideia? Dá para aceitar a devolução.'
        }
      >
        <textarea id={id} className={`${classeArea} min-h-20`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} />
      </Campo>
      {erro ? <AvisoErro>{erro}</AvisoErro> : null}
      <div className="flex flex-wrap gap-2">
        {situacoes.includes('aceita') ? (
          <Botao variante="escuro" tamanho="pequeno" onClick={() => enviar('aceita')} disabled={ocupado}>
            Aceitar
          </Botao>
        ) : null}
        {situacoes.includes('resolvida') ? (
          <Botao variante="escuro" tamanho="pequeno" onClick={() => enviar('resolvida')} disabled={ocupado}>
            Marcar como resolvida
          </Botao>
        ) : null}
        {situacoes.includes('recusada') ? (
          <Botao variante="perigo" tamanho="pequeno" onClick={() => enviar('recusada')} disabled={ocupado}>
            Recusar
          </Botao>
        ) : null}
        <Botao tamanho="pequeno" onClick={() => enviar(d.situacao)} disabled={ocupado}>
          {d.situacao === 'aberta' ? 'Pedir informação' : 'Atualizar resposta'}
        </Botao>
      </div>
    </div>
  );
}
