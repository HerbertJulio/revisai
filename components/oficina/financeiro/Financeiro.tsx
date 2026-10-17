'use client';

// O financeiro da oficina: contas a receber e a pagar, o caixa do dia, o fiado com lembrete e o
// Pix do balcão. Só o dono e o gerente veem (o banco nem manda os lançamentos para o mecânico).

import { Plus, QrCode } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Botao } from '@/components/ui';
import { dataValida } from '@/lib/datas';
import { caixaDoDia, FILTRO_INICIAL, fiadosPorCliente, resumoFinanceiro, type FiltroLancamentos, type NovaConta } from '@/lib/financeiro';
import { formatarMoeda } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { Caixa } from './Caixa';
import { SoGestao } from './comum';
import { Contas } from './Contas';
import { Fiado } from './Fiado';
import { FolhaDaConta, FolhaNovaConta } from './FolhaConta';
import { ChavePixDaOficina, PixNoBalcao } from './Pix';

type Aba = 'contas' | 'caixa' | 'fiado' | 'pix';

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'contas', nome: 'Contas' },
  { id: 'caixa', nome: 'Caixa do dia' },
  { id: 'fiado', nome: 'Fiado' },
  { id: 'pix', nome: 'Pix' }
];

export function Financeiro() {
  return (
    <SoGestao>
      <TelaFinanceiro />
    </SoGestao>
  );
}

function TelaFinanceiro() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const lancamentos = useOficina((s) => s.lancamentos);
  const lista = useMemo(() => Object.values(lancamentos), [lancamentos]);
  const resumo = useMemo(() => resumoFinanceiro(lista, hoje), [lista, hoje]);
  const caixaDeHoje = useMemo(() => caixaDoDia(lista, hoje), [lista, hoje]);
  const fiadosVencidos = useMemo(() => fiadosPorCliente(lista, hoje, true).length, [lista, hoje]);
  const pedida = params.get('aba');
  const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : 'contas';
  const diaPedido = params.get('dia');
  const dia = diaPedido && dataValida(diaPedido) && diaPedido <= hoje ? diaPedido : hoje;
  const [filtro, setFiltro] = useState<FiltroLancamentos>(FILTRO_INICIAL);
  const [aberta, setAberta] = useState<Id | null>(params.get('ver'));
  const [nova, setNova] = useState<Partial<NovaConta> | null>(null);

  function ir(a: Aba, extra = '') {
    router.replace(`/oficina/financeiro${a === 'contas' ? (extra ? `?${extra}` : '') : `?aba=${a}${extra ? `&${extra}` : ''}`}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Financeiro</h1>
          <p className="mt-1 max-w-[60ch] text-tinta-2">O que a oficina tem para receber e para pagar, o caixa do dia e o fiado. Só o dono e o gerente veem.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => ir('pix')}>
            <QrCode size={17} aria-hidden="true" /> Pix no balcão
          </Botao>
          <Botao variante="primario" onClick={() => setNova({})}>
            <Plus size={18} aria-hidden="true" /> Nova conta
          </Botao>
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4" aria-label="Resumo">
        <Resumo rotulo="A receber" valor={resumo.aReceber} nota={resumo.receberVencido ? `${formatarMoeda(resumo.receberVencido)} vencido` : 'nada vencido'} alerta={resumo.receberVencido > 0} aoClicar={() => (setFiltro({ ...FILTRO_INICIAL, tipo: 'receber', situacao: resumo.receberVencido ? 'vencidos' : 'abertos' }), ir('contas'))} />
        <Resumo rotulo="A pagar" valor={resumo.aPagar} nota={resumo.pagarVencido ? `${formatarMoeda(resumo.pagarVencido)} vencido` : 'nada vencido'} alerta={resumo.pagarVencido > 0} aoClicar={() => (setFiltro({ ...FILTRO_INICIAL, tipo: 'pagar', situacao: resumo.pagarVencido ? 'vencidos' : 'abertos' }), ir('contas'))} />
        <Resumo rotulo="Recebido no mês" valor={resumo.recebidoNoMes} nota={`pago ${formatarMoeda(resumo.pagoNoMes)}`} aoClicar={() => (setFiltro({ ...FILTRO_INICIAL, situacao: 'pagos', mes: hoje.slice(0, 7) }), ir('contas'))} />
        <Resumo rotulo="Caixa de hoje" valor={caixaDeHoje.saldo} nota={`entrou ${formatarMoeda(caixaDeHoje.totalEntradas)}`} escuro aoClicar={() => ir('caixa')} />
      </ul>

      <div role="tablist" aria-label="Partes do financeiro" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {ABAS.map((a) => {
          const sel = a.id === aba;
          return (
            <button
              key={a.id}
              role="tab"
              type="button"
              aria-selected={sel}
              onClick={() => ir(a.id)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors ${sel ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
            >
              {a.nome}
              {a.id === 'fiado' && fiadosVencidos > 0 ? <span className="num grid h-6 min-w-6 place-items-center rounded-full bg-oleo px-1.5 text-[12.5px] text-[#1b1f22]">{fiadosVencidos}</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {aba === 'contas' ? <Contas filtro={filtro} aoFiltrar={setFiltro} hoje={hoje} aoAbrir={setAberta} aoNova={(inicial) => setNova(inicial ?? {})} /> : null}
        {aba === 'caixa' ? <Caixa dia={dia} aoMudarDia={(d) => ir('caixa', d === hoje ? '' : `dia=${d}`)} hoje={hoje} aoAbrir={setAberta} /> : null}
        {aba === 'fiado' ? <Fiado hoje={hoje} aoAbrir={setAberta} aoIrParaPix={() => ir('pix')} /> : null}
        {aba === 'pix' ? (
          <div className="flex flex-col gap-8">
            <section className="flex flex-col gap-3" aria-labelledby="t-balcao">
              <div>
                <h2 id="t-balcao" className="text-[21px]">
                  Pix no balcão
                </h2>
                <p className="mt-1 text-[15px] text-tinta-2">Escreva o valor e mostre o QR Code. Quando cair, ponha no caixa.</p>
              </div>
              <PixNoBalcao aoFaltarChave={() => document.getElementById('chave-pix')?.scrollIntoView({ behavior: 'smooth' })} />
            </section>
            <ChavePixDaOficina id="chave-pix" />
          </div>
        ) : null}
      </div>

      <p className="text-[13.5px] text-tinta-3">
        Os números do mês, a margem das peças e a comissão estão nos{' '}
        <Link href="/oficina/relatorios" className="font-semibold text-caneta hover:underline">
          relatórios
        </Link>
        .
      </p>

      <FolhaNovaConta aberta={nova !== null} aoFechar={() => setNova(null)} inicial={nova} />
      <FolhaDaConta id={aberta} aoFechar={() => setAberta(null)} />
    </div>
  );
}

function Resumo({ rotulo, valor, nota, alerta = false, escuro = false, aoClicar }: { rotulo: string; valor: number; nota: string; alerta?: boolean; escuro?: boolean; aoClicar: () => void }) {
  return (
    <li>
      <button type="button" onClick={aoClicar} className={`flex h-full w-full flex-col items-start rounded-2xl px-3.5 py-3 text-left sm:px-4 ${escuro ? 'bg-asfalto text-white hover:brightness-110' : 'bg-papel ring-1 ring-linha hover:ring-tinta-3'}`}>
        <span className={`text-[13px] ${escuro ? 'text-white/70' : 'text-tinta-3'}`}>{rotulo}</span>
        <span className="largo mt-0.5 text-[19px] leading-tight font-extrabold sm:text-[22px]">{formatarMoeda(valor)}</span>
        <span className={`mt-0.5 text-[12.5px] ${alerta ? 'font-semibold text-atraso' : escuro ? 'text-white/70' : 'text-tinta-3'}`}>{nota}</span>
      </button>
    </li>
  );
}
