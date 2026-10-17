'use client';

// Os pontos do cliente onde a oficina precisa deles: no detalhe da ordem (o saldo e "Usar
// pontos", que vira desconto) e na página do carro (o saldo e a mensagem com o saldo). E o
// crédito dos pontos quando a ordem é concluída.

import { Award, MessageCircle, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, Secao, classeEntrada } from '@/components/ui';
import { hojeISO } from '@/lib/datas';
import {
  configDaFidelidade,
  descontoSemResgate,
  ganhoDaOrdem,
  idDoGanho,
  limiteDoResgate,
  mensagemDoSaldo,
  pontosDoValor,
  resgateDoDocumento,
  resgateNoDocumento,
  saldoDoCliente,
  valorDosPontos
} from '@/lib/fidelidade';
import { totais } from '@/lib/documentos';
import { formatarMoeda, formatarNumero, lerNumero, primeiroNome } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Documento, Id } from '@/lib/tipos';
import { linkWhatsApp } from '@/lib/whatsapp';
import { useGestao } from '../cadastro/comum';

/** Credita os pontos da ordem concluída (uma vez por ordem, em qualquer aparelho). */
export function creditarPontosDaOrdem(documentoId: Id): number {
  const s = useOficina.getState();
  const config = configDaFidelidade(s.preferencias.fidelidade);
  const doc = s.documentos[documentoId];
  if (!config.ativo || !doc?.veiculoId || s.fidelidade[idDoGanho(doc.id)]) return 0;
  const veiculo = s.veiculos[doc.veiculoId];
  if (!veiculo) return 0;
  const ganho = ganhoDaOrdem(doc, veiculo.clienteId, config, hojeISO());
  if (!ganho) return 0;
  s.salvarRegistro('fidelidade', ganho);
  return ganho.pontos;
}

function useClienteDoCarro(veiculoId: Id | null | undefined) {
  const veiculo = useOficina((s) => (veiculoId ? s.veiculos[veiculoId] : undefined));
  const cliente = useOficina((s) => (veiculo ? s.clientes[veiculo.clienteId] : undefined));
  return { veiculo, cliente };
}

function useSaldo(clienteId: Id | undefined) {
  const fidelidade = useOficina((s) => s.fidelidade);
  const documentos = useOficina((s) => s.documentos);
  return useMemo(() => (clienteId ? saldoDoCliente(Object.values(fidelidade), clienteId, documentos) : 0), [fidelidade, documentos, clienteId]);
}

/** No detalhe do orçamento ou da ordem. */
export function PontosDaOrdem({ doc }: { doc: Documento }) {
  const gestao = useGestao();
  const preferencias = useOficina((s) => s.preferencias);
  const fidelidade = useOficina((s) => s.fidelidade);
  const { cliente } = useClienteDoCarro(doc.veiculoId);
  const saldo = useSaldo(cliente?.id);
  const config = useMemo(() => configDaFidelidade(preferencias.fidelidade), [preferencias.fidelidade]);
  const resgate = resgateDoDocumento(fidelidade, doc.id);
  const ganho = fidelidade[idDoGanho(doc.id)] ?? null;
  const [usando, setUsando] = useState(false);
  const [pontos, setPontos] = useState('');
  const toast = useToast();

  if (!gestao || !cliente) return null;
  if (!config.ativo && !resgate && !ganho) return null;
  const nome = primeiroNome(cliente.nome) || 'O cliente';
  const limite = limiteDoResgate(saldo, doc, resgate, config);

  function aplicar() {
    const n = Math.floor(lerNumero(pontos) ?? 0);
    if (n <= 0) return toast({ texto: 'Escreva quantos pontos usar.', tom: 'erro' });
    if (n > limite.maxPontos) return toast({ texto: `Dá para usar até ${formatarNumero(limite.maxPontos)} pontos aqui.`, tom: 'erro' });
    const s = useOficina.getState();
    const atual = s.documentos[doc.id];
    if (!atual || !cliente) return;
    const r = resgateNoDocumento(atual, cliente.id, n, resgate, config, hojeISO());
    s.salvarRegistro('fidelidade', r.movimento);
    s.salvarDocumento({ ...atual, desconto: r.desconto });
    setUsando(false);
    toast({ texto: `${formatarNumero(n)} pontos viraram ${formatarMoeda(r.movimento.valor ?? 0)} de desconto.` });
  }

  function desfazer() {
    const s = useOficina.getState();
    const atual = s.documentos[doc.id];
    if (!atual || !resgate) return;
    s.salvarDocumento({ ...atual, desconto: descontoSemResgate(atual, resgate) });
    s.apagarRegistro('fidelidade', resgate.id);
    toast({ texto: 'Os pontos voltaram para o cliente.' });
  }

  function creditar() {
    const n = creditarPontosDaOrdem(doc.id);
    if (n) toast({ texto: `${formatarNumero(n)} pontos para ${nome}.` });
  }

  const aberta = doc.tipo === 'ordem' && doc.situacao === 'aberta';
  const cancelada = doc.situacao === 'cancelada';
  return (
    <section className="flex flex-col gap-2.5 rounded-xl bg-papel-2 px-3.5 py-3 text-[14.5px]" aria-label="Pontos de fidelidade" data-testid="pontos-da-ordem">
      <p className="flex items-start gap-2">
        <Award size={17} className="mt-0.5 shrink-0 text-tinta-2" aria-hidden="true" />
        <span>
          {nome} tem <strong className="num">{formatarNumero(saldo)}</strong> {saldo === 1 ? 'ponto' : 'pontos'} ({formatarMoeda(valorDosPontos(saldo, config))}).
          {resgate && !cancelada ? ` Usou ${formatarNumero(-resgate.pontos)} aqui: ${formatarMoeda(resgate.valor ?? 0)} de desconto.` : ''}
          {resgate && cancelada ? ` Os ${formatarNumero(-resgate.pontos)} pontos usados aqui voltaram (a ordem foi cancelada).` : ''}
          {ganho ? ` Esta ordem deu ${formatarNumero(ganho.pontos)} pontos.` : ''}
        </span>
      </p>

      {aberta && !usando ? (
        <div className="flex flex-wrap items-center gap-2">
          {limite.maxPontos > 0 ? (
            <Botao
              tamanho="pequeno"
              variante="escuro"
              onClick={() => {
                setPontos(String(-(resgate?.pontos ?? 0) || limite.maxPontos));
                setUsando(true);
              }}
            >
              {resgate ? 'Mudar os pontos usados' : 'Usar pontos'}
            </Botao>
          ) : (
            <span className="text-[13.5px] text-tinta-3">{limite.motivo}</span>
          )}
          {resgate ? (
            <Botao tamanho="pequeno" variante="fantasma" onClick={desfazer}>
              <Undo2 size={15} aria-hidden="true" /> Devolver os pontos
            </Botao>
          ) : null}
        </div>
      ) : null}

      {aberta && usando ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            Pontos (até {formatarNumero(limite.maxPontos)})
            <input className={`${classeEntrada} num w-36`} value={pontos} onChange={(e) => setPontos(e.target.value)} inputMode="numeric" autoFocus />
          </label>
          <Botao variante="primario" onClick={aplicar}>
            Dar {formatarMoeda(valorDosPontos(Math.min(limite.maxPontos, Math.floor(lerNumero(pontos) ?? 0)), config))} de desconto
          </Botao>
          <Botao variante="fantasma" onClick={() => setUsando(false)}>
            Cancelar
          </Botao>
        </div>
      ) : null}

      {doc.tipo === 'orcamento' && config.ativo && saldo >= Math.max(1, config.minimoResgate) ? (
        <p className="text-[13.5px] text-tinta-3">Dá para usar os pontos quando o orçamento virar ordem de serviço.</p>
      ) : null}

      {doc.tipo === 'ordem' && doc.situacao === 'concluida' && !ganho && config.ativo && pontosDoValor(totais(doc).total, config) > 0 ? (
        <Botao tamanho="pequeno" className="self-start" onClick={creditar}>
          Dar os {formatarNumero(pontosDoValor(totais(doc).total, config))} pontos desta ordem
        </Botao>
      ) : null}
    </section>
  );
}

/** Na página do carro: o saldo do dono do carro e a mensagem com o saldo. */
export function PontosDoCarro({ veiculoId }: { veiculoId: Id }) {
  const gestao = useGestao();
  const preferencias = useOficina((s) => s.preferencias);
  const oficina = useOficina((s) => s.oficina);
  const { cliente } = useClienteDoCarro(veiculoId);
  const saldo = useSaldo(cliente?.id);
  const config = useMemo(() => configDaFidelidade(preferencias.fidelidade), [preferencias.fidelidade]);
  if (!gestao || !cliente || (!config.ativo && saldo === 0)) return null;
  const zap = cliente.telefone ? linkWhatsApp(cliente.telefone, mensagemDoSaldo({ cliente: cliente.nome, oficina: oficina.nome, saldo, config })) : null;
  return (
    <Secao
      titulo="Pontos de fidelidade"
      acao={
        <Link href="/oficina/fidelidade" className="text-[14px] font-semibold text-caneta hover:underline">
          Ver todos
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha" data-testid="pontos-do-carro">
        <p>
          {cliente.nome} tem <strong className="largo num text-[22px]">{formatarNumero(saldo)}</strong> {saldo === 1 ? 'ponto' : 'pontos'}, que {saldo === 1 ? 'vale' : 'valem'}{' '}
          <strong className="num">{formatarMoeda(valorDosPontos(saldo, config))}</strong> de desconto.
        </p>
        {zap ? (
          <a href={zap} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-ok px-3 text-sm font-semibold text-sobre-ok hover:brightness-110">
            <MessageCircle size={16} aria-hidden="true" /> Mandar o saldo
          </a>
        ) : null}
      </div>
    </Secao>
  );
}
