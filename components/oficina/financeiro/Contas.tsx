'use client';

// A lista das contas a receber e a pagar, com os filtros (em aberto, vencidas, pagas, por mês),
// a busca e os totais; e os pedidos da loja que ainda não viraram conta a pagar.

import { ArrowDownLeft, ArrowUpRight, PackageOpen, Search } from 'lucide-react';
import { useMemo } from 'react';
import { Botao, Vazio, classeEntrada } from '@/components/ui';
import { dataLocal, formatarData } from '@/lib/datas';
import {
  contaDoPedido,
  filtrarLancamentos,
  lojasDoPedido,
  nomeDaCategoria,
  nomeDaForma,
  pedidosSemConta,
  rotuloDoVencimento,
  somarLancamentos,
  type FiltroLancamentos,
  type FiltroSituacao,
  type FiltroTipo,
  type NovaConta
} from '@/lib/financeiro';
import { formatarMoeda, SEM_NOME } from '@/lib/formatos';
import { nomeDoMes } from '@/lib/relatorios';
import type { Lancamento } from '@/lib/registros-oficina';
import { useOficina } from '@/lib/store';
import type { Id } from '@/lib/tipos';
import { BotaoCsv, CABECALHO_CONTAS, dataBr, SeloDaConta, textoDaParcela } from './comum';

const SITUACOES: { id: FiltroSituacao; nome: string }[] = [
  { id: 'abertos', nome: 'Em aberto' },
  { id: 'vencidos', nome: 'Vencidas' },
  { id: 'pagos', nome: 'Pagas' },
  { id: 'todos', nome: 'Todas' }
];

const TIPOS: { id: FiltroTipo; nome: string }[] = [
  { id: 'todos', nome: 'Tudo' },
  { id: 'receber', nome: 'A receber' },
  { id: 'pagar', nome: 'A pagar' }
];

export function Contas({ filtro, aoFiltrar, hoje, aoAbrir, aoNova }: { filtro: FiltroLancamentos; aoFiltrar: (f: FiltroLancamentos) => void; hoje: string; aoAbrir: (id: Id) => void; aoNova: (inicial?: Partial<NovaConta>) => void }) {
  const lancamentos = useOficina((s) => s.lancamentos);
  const clientes = useOficina((s) => s.clientes);
  const lista = useMemo(() => Object.values(lancamentos), [lancamentos]);
  const nomeDoCliente = useMemo(() => (id: Id) => {
    const c = clientes[id];
    return c ? (c.nome === SEM_NOME ? 'Cliente sem nome' : c.nome) : '';
  }, [clientes]);
  const visiveis = useMemo(() => filtrarLancamentos(lista, filtro, hoje, nomeDoCliente), [lista, filtro, hoje, nomeDoCliente]);
  const soma = somarLancamentos(visiveis);
  const meses = useMemo(() => [...new Set([hoje.slice(0, 7), ...lista.map((l) => (l.pagoEm ?? l.vencimento).slice(0, 7))])].sort().reverse(), [lista, hoje]);
  const csv = visiveis.map((l) => [
    l.tipo === 'receber' ? 'A receber' : 'A pagar',
    l.descricao,
    l.tipo === 'receber' ? (l.clienteId ? nomeDoCliente(l.clienteId) : '') : (l.favorecido ?? ''),
    nomeDaCategoria(l.categoria, l.tipo),
    l.forma ? nomeDaForma(l.forma) : '',
    textoDaParcela(l),
    dataBr(l.vencimento),
    dataBr(l.pagoEm),
    l.tipo === 'receber' ? l.valor : -l.valor,
    l.observacao ?? ''
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PedidosDaLoja hoje={hoje} aoLancar={aoNova} />

      <div className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Situação">
          {SITUACOES.map((s) => (
            <Pilula key={s.id} ativo={filtro.situacao === s.id} aoClicar={() => aoFiltrar({ ...filtro, situacao: s.id })}>
              {s.nome}
            </Pilula>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-linha" aria-hidden="true" />
          {TIPOS.map((t) => (
            <Pilula key={t.id} ativo={filtro.tipo === t.id} aoClicar={() => aoFiltrar({ ...filtro, tipo: t.id })}>
              {t.nome}
            </Pilula>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <label className="relative">
            <span className="sr-only">Buscar nas contas</span>
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-3" aria-hidden="true" />
            <input className={`${classeEntrada} pl-10`} value={filtro.busca} onChange={(e) => aoFiltrar({ ...filtro, busca: e.target.value })} placeholder="Descrição, cliente, loja ou valor" autoComplete="off" />
          </label>
          <select className={classeEntrada} value={filtro.mes ?? ''} onChange={(e) => aoFiltrar({ ...filtro, mes: e.target.value || null })} aria-label="Mês">
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {nomeDoMes(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio titulo="Nenhuma conta ainda" acao={<Botao variante="primario" onClick={() => aoNova()}>Lançar a primeira</Botao>}>
          Lance o que a oficina tem para receber (fiado, boleto, parcelas da maquininha) e para pagar (aluguel, fornecedor, salário). O que entra pelas ordens de serviço aparece aqui sozinho quando você toca em Receber na OS.
        </Vazio>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-papel-2 px-3.5 py-2.5 text-[14px]">
            <span className="font-semibold">
              {visiveis.length} {visiveis.length === 1 ? 'conta' : 'contas'}
            </span>
            {soma.receber ? (
              <span className="text-tinta-2">
                A receber <strong className="num text-tinta">{formatarMoeda(soma.receber)}</strong>
              </span>
            ) : null}
            {soma.pagar ? (
              <span className="text-tinta-2">
                A pagar <strong className="num text-tinta">{formatarMoeda(soma.pagar)}</strong>
              </span>
            ) : null}
            <span className="ml-auto">
              <BotaoCsv nome={`contas-${filtro.mes ?? 'todas'}`} cabecalho={CABECALHO_CONTAS} linhas={csv} />
            </span>
          </div>
          {visiveis.length ? (
            <ul className="flex flex-col divide-y divide-linha overflow-hidden rounded-2xl bg-papel ring-1 ring-linha">
              {visiveis.slice(0, 300).map((l) => (
                <li key={l.id}>
                  <LinhaDaConta lancamento={l} hoje={hoje} nomeDoCliente={nomeDoCliente} aoAbrir={() => aoAbrir(l.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-tinta-2">Nenhuma conta com esse filtro.</p>
          )}
          {visiveis.length > 300 ? <p className="text-[13.5px] text-tinta-3">Mostrando as 300 primeiras. Use o mês ou a busca para achar as outras.</p> : null}
        </>
      )}
    </div>
  );
}

function Pilula({ ativo, aoClicar, children }: { ativo: boolean; aoClicar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoClicar}
      className={`h-9 shrink-0 rounded-full border px-3.5 text-[14px] font-semibold ${ativo ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
    >
      {children}
    </button>
  );
}

export function LinhaDaConta({ lancamento: l, hoje, nomeDoCliente, aoAbrir }: { lancamento: Lancamento; hoje: string; nomeDoCliente: (id: Id) => string; aoAbrir: () => void }) {
  const recebe = l.tipo === 'receber';
  const quem = recebe ? (l.clienteId ? nomeDoCliente(l.clienteId) : '') : (l.favorecido ?? '');
  const detalhes = [quem, l.forma ? nomeDaForma(l.forma) : '', textoDaParcela(l) ? `parcela ${textoDaParcela(l)}` : ''].filter(Boolean).join(' · ');
  const vencido = !l.pagoEm && l.vencimento < hoje;
  return (
    <button type="button" onClick={aoAbrir} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-papel-2 sm:px-5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${recebe ? 'bg-ok-claro text-ok' : 'bg-atraso-claro text-atraso'}`} aria-hidden="true">
        {recebe ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{l.descricao}</span>
        <span className="block truncate text-[13.5px] text-tinta-3">{detalhes || nomeDaCategoria(l.categoria, l.tipo)}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="num font-extrabold">
          <span className="sr-only">{recebe ? 'A receber' : 'A pagar'} </span>
          {recebe ? '+' : '−'}
          {formatarMoeda(l.valor)}
        </span>
        <span className={`text-[12.5px] ${vencido ? 'font-semibold text-atraso' : 'text-tinta-3'}`}>{rotuloDoVencimento(l, hoje)}</span>
      </span>
      <span className="hidden sm:block">
        <SeloDaConta lancamento={l} hoje={hoje} />
      </span>
    </button>
  );
}

/** Os pedidos da loja dos últimos 60 dias que ainda não estão no contas a pagar. */
function PedidosDaLoja({ hoje, aoLancar }: { hoje: string; aoLancar: (inicial: Partial<NovaConta>) => void }) {
  const pedidos = useOficina((s) => s.pedidos);
  const lancamentos = useOficina((s) => s.lancamentos);
  const lista = useMemo(() => pedidosSemConta(pedidos, Object.values(lancamentos), hoje), [pedidos, lancamentos, hoje]);
  if (!lista.length) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-caneta-claro px-4 py-3.5 text-caneta" aria-label="Pedidos da loja sem conta a pagar">
      <p className="flex items-center gap-2 font-bold">
        <PackageOpen size={18} aria-hidden="true" /> Pedidos da loja sem conta a pagar
      </p>
      <ul className="flex flex-col gap-2">
        {lista.slice(0, 5).map((p) => (
          <li key={p.codigo} className="flex flex-wrap items-center gap-2 text-[14.5px]">
            <span className="largo num font-extrabold tracking-wider">{p.codigo}</span>
            <span className="min-w-0 flex-1">
              {formatarData(dataLocal(p.quando))}, {lojasDoPedido(p)}, <strong className="num">{formatarMoeda(p.total)}</strong>
            </span>
            <Botao tamanho="pequeno" variante="escuro" onClick={() => aoLancar(contaDoPedido(p, hoje))}>
              Lançar no contas a pagar
            </Botao>
          </li>
        ))}
      </ul>
    </section>
  );
}
