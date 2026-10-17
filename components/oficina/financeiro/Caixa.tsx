'use client';

// O caixa do dia: o que entrou e o que saiu, por forma de pagamento, e o saldo. Dá para ver
// outro dia (para fechar o caixa de ontem, conferir a semana).

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Botao, Vazio, classeEntrada } from '@/components/ui';
import { formatarData, somarDias } from '@/lib/datas';
import { caixaDoDia, nomeDaCategoria, nomeDaForma, type LinhaDoCaixa } from '@/lib/financeiro';
import { formatarMoeda, SEM_NOME } from '@/lib/formatos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { BotaoCsv, CABECALHO_CONTAS, dataBr, textoDaParcela } from './comum';
import { LinhaDaConta } from './Contas';

export function Caixa({ dia, aoMudarDia, hoje, aoAbrir }: { dia: string; aoMudarDia: (dia: string) => void; hoje: string; aoAbrir: (id: Id) => void }) {
  const lancamentos = useOficina((s) => s.lancamentos);
  const clientes = useOficina((s) => s.clientes);
  const caixa = useMemo(() => caixaDoDia(Object.values(lancamentos), dia), [lancamentos, dia]);
  const nomeDoCliente = useMemo(() => (id: Id) => {
    const c = clientes[id];
    return c ? (c.nome === SEM_NOME ? 'Cliente sem nome' : c.nome) : '';
  }, [clientes]);
  const ehHoje = dia === hoje;
  const csv = caixa.lancamentos.map((l) => [
    l.tipo === 'receber' ? 'Entrou' : 'Saiu',
    l.descricao,
    l.tipo === 'receber' ? (l.clienteId ? nomeDoCliente(l.clienteId) : '') : (l.favorecido ?? ''),
    nomeDaCategoria(l.categoria, l.tipo),
    nomeDaForma(l.forma),
    textoDaParcela(l),
    dataBr(l.vencimento),
    dataBr(l.pagoEm),
    l.tipo === 'receber' ? l.valor : -l.valor,
    l.observacao ?? ''
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => aoMudarDia(somarDias(dia, -1))} className="grid h-11 w-11 place-items-center rounded-[10px] border border-linha bg-papel text-tinta-2 hover:border-tinta-3" aria-label="Dia anterior">
          <ChevronLeft size={19} />
        </button>
        <input type="date" className={`${classeEntrada} max-w-44`} value={dia} max={hoje} onChange={(e) => e.target.value && aoMudarDia(e.target.value)} aria-label="Dia do caixa" />
        <button
          type="button"
          onClick={() => aoMudarDia(somarDias(dia, 1))}
          disabled={dia >= hoje}
          className="grid h-11 w-11 place-items-center rounded-[10px] border border-linha bg-papel text-tinta-2 hover:border-tinta-3 disabled:opacity-40"
          aria-label="Dia seguinte"
        >
          <ChevronRight size={19} />
        </button>
        {!ehHoje ? (
          <Botao variante="fantasma" onClick={() => aoMudarDia(hoje)}>
            Hoje
          </Botao>
        ) : null}
        <span className="ml-auto">
          <BotaoCsv nome={`caixa-${dia}`} cabecalho={CABECALHO_CONTAS} linhas={csv} />
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        <Numero rotulo="Entrou" valor={caixa.totalEntradas} />
        <Numero rotulo="Saiu" valor={caixa.totalSaidas} />
        <Numero rotulo={ehHoje ? 'Saldo de hoje' : `Saldo de ${formatarData(dia).slice(0, 5)}`} valor={caixa.saldo} destaque />
      </dl>

      {caixa.lancamentos.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <PorForma titulo="Entrou por forma" linhas={caixa.entradas} vazio="Nada entrou." />
            <PorForma titulo="Saiu por forma" linhas={caixa.saidas} vazio="Nada saiu." />
          </div>
          <section className="flex flex-col gap-2" aria-label="Lançamentos do dia">
            <h3 className="font-bold">Lançamentos do dia</h3>
            <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
              {caixa.lancamentos.map((l) => (
                <li key={l.id}>
                  <LinhaDaConta lancamento={l} hoje={hoje} nomeDoCliente={nomeDoCliente} aoAbrir={() => aoAbrir(l.id)} />
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <Vazio titulo={ehHoje ? 'Nada no caixa hoje ainda' : `Nada entrou nem saiu em ${formatarData(dia)}`}>
          O caixa mostra o que foi recebido e pago no dia: o que você recebe nas ordens de serviço, o Pix do balcão e as contas que marca como pagas.
        </Vazio>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-3 sm:px-4 ${destaque ? 'bg-asfalto text-white' : 'bg-papel ring-1 ring-linha'}`}>
      <dt className={`text-[13px] ${destaque ? 'text-white/70' : 'text-tinta-3'}`}>{rotulo}</dt>
      <dd className="largo mt-0.5 text-[18px] font-extrabold sm:text-[22px]">{formatarMoeda(valor)}</dd>
    </div>
  );
}

function PorForma({ titulo, linhas, vazio }: { titulo: string; linhas: LinhaDoCaixa[]; vazio: string }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha" aria-label={titulo}>
      <h3 className="text-[15px] font-bold">{titulo}</h3>
      {linhas.length ? (
        <ul className="flex flex-col gap-1.5 text-[14.5px]">
          {linhas.map((l) => (
            <li key={l.forma ?? 'sem'} className="flex items-baseline justify-between gap-3">
              <span className="text-tinta-2">
                {l.nome} <span className="text-[12.5px] text-tinta-3">({l.quantidade})</span>
              </span>
              <span className="num font-semibold">{formatarMoeda(l.total)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-tinta-3">{vazio}</p>
      )}
    </section>
  );
}
