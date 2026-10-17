'use client';

// Os relatórios da oficina no período: faturamento por mês, ticket médio, carros atendidos,
// mão de obra e peças, margem das peças, aprovação dos orçamentos, serviços mais feitos,
// retorno dos avisos, recebido e a receber, comissão e a comparação com a região.
// Cada tabela baixa em CSV. Só o dono e o gerente veem.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { comissaoPorProfissional } from '@/lib/comissao';
import { formatarMoeda, formatarNumero } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import {
  aprovacaoDosOrcamentos,
  faturamentoPorMes,
  intervaloDoPeriodo,
  margemDasPecas,
  nomeDoMes,
  ordensConcluidas,
  PERIODOS,
  periodoValido,
  recebidoEAReceber,
  resumoDoPeriodo,
  retornoDosAvisos,
  servicosMaisFeitos,
  textoDasHoras,
  type Periodo
} from '@/lib/relatorios';
import { useOficina } from '@/lib/store';
import { BotaoCsv, SoGestao } from '../financeiro/comum';
import { useOfertaDoPro, usePlano } from '../plano';
import { ComparativoDaRegiao } from './Comparativo';
import { Barras, Colunas, Divisao } from './Graficos';

export function Relatorios() {
  return (
    <SoGestao>
      <TelaRelatorios />
    </SoGestao>
  );
}

function TelaRelatorios() {
  const params = useSearchParams();
  const router = useRouter();
  const hoje = useHoje();
  const periodo = periodoValido(params.get('periodo'));
  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, hoje), [periodo, hoje]);
  const documentos = useOficina((s) => s.documentos);
  const estoque = useOficina((s) => s.estoque);
  const contatos = useOficina((s) => s.contatos);
  const atendimentos = useOficina((s) => s.atendimentos);
  const lancamentos = useOficina((s) => s.lancamentos);
  const profissionais = useOficina((s) => s.profissionais);

  const docs = useMemo(() => Object.values(documentos), [documentos]);
  const ordens = useMemo(() => ordensConcluidas(docs, intervalo), [docs, intervalo]);
  const resumo = useMemo(() => resumoDoPeriodo(ordens), [ordens]);
  const meses = useMemo(() => faturamentoPorMes(ordens, intervalo), [ordens, intervalo]);
  const margem = useMemo(() => margemDasPecas(ordens, estoque), [ordens, estoque]);
  const aprovacao = useMemo(() => aprovacaoDosOrcamentos(docs, intervalo), [docs, intervalo]);
  const servicos = useMemo(() => servicosMaisFeitos(ordens, 10), [ordens]);
  const retorno = useMemo(() => retornoDosAvisos(Object.values(contatos), Object.values(atendimentos), intervalo), [contatos, atendimentos, intervalo]);
  const caixa = useMemo(() => recebidoEAReceber(Object.values(lancamentos), intervalo, hoje), [lancamentos, intervalo, hoje]);
  const comissao = useMemo(() => comissaoPorProfissional(ordens, profissionais), [ordens, profissionais]);
  const nomePeriodo = PERIODOS.find((p) => p.id === periodo)!.nome.toLowerCase();
  const arquivo = (nome: string) => `${nome}-${intervalo.inicio}-a-${intervalo.fim}`;
  const variosMeses = intervalo.meses.length > 1;

  function escolher(p: Periodo) {
    router.replace(p === 'este_mes' ? '/oficina/relatorios' : `/oficina/relatorios?periodo=${p}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="largo text-[30px] sm:text-[34px]">Relatórios</h1>
          <p className="mt-1 max-w-[62ch] text-tinta-2">O que as ordens concluídas renderam, como os orçamentos foram recebidos e para onde foi o dinheiro. Só o dono e o gerente veem.</p>
        </div>
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === periodo}
              onClick={() => escolher(p.id)}
              className={`h-9 shrink-0 rounded-full border px-3.5 text-[14px] font-semibold ${p.id === periodo ? 'border-tinta bg-tinta text-papel' : 'border-linha bg-papel text-tinta-2 hover:border-tinta-3'}`}
            >
              {p.nome}
            </button>
          ))}
        </nav>
      </header>

      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Numero rotulo="Faturamento" valor={formatarMoeda(resumo.faturamento)} nota={`ordens concluídas, ${nomePeriodo}`} escuro />
        <Numero rotulo="Ticket médio" valor={resumo.ticketMedio != null ? formatarMoeda(resumo.ticketMedio) : '—'} nota="por ordem de serviço" />
        <Numero rotulo="Ordens concluídas" valor={formatarNumero(resumo.ordens)} nota={resumo.descontos ? `${formatarMoeda(resumo.descontos)} em descontos` : 'sem descontos'} />
        <Numero rotulo="Carros atendidos" valor={formatarNumero(resumo.carros)} nota="carros diferentes" />
      </dl>

      <Bloco
        titulo="Faturamento por mês"
        descricao="A soma das ordens concluídas em cada mês, pela data da conclusão."
        csv={<BotaoCsv nome={arquivo('faturamento')} cabecalho={['Mês', 'Faturamento', 'Ordens concluídas', 'Carros atendidos', 'Ticket médio']} linhas={meses.map((m) => [nomeDoMes(m.mes), m.faturamento, m.ordens, m.carros, m.ticket])} />}
      >
        {variosMeses ? <Colunas rotulo="Faturamento por mês" itens={meses.map((m) => ({ rotulo: nomeDoMes(m.mes), curto: nomeDoMes(m.mes).slice(0, 3), valor: m.faturamento, texto: formatarMoeda(m.faturamento) }))} /> : null}
        <Tabela
          cabecalho={['Mês', 'Faturamento', 'Ordens', 'Carros', 'Ticket médio']}
          linhas={[...meses].reverse().map((m) => [nomeDoMes(m.mes), formatarMoeda(m.faturamento), formatarNumero(m.ordens), formatarNumero(m.carros), m.ticket != null ? formatarMoeda(m.ticket) : '—'])}
        />
      </Bloco>

      {variosMeses ? (
        <Bloco titulo="Carros atendidos por mês" descricao="Carros diferentes com ordem concluída no mês (o mesmo carro duas vezes conta uma).">
          <Colunas rotulo="Carros atendidos por mês" itens={meses.map((m) => ({ rotulo: nomeDoMes(m.mes), curto: nomeDoMes(m.mes).slice(0, 3), valor: m.carros, texto: `${formatarNumero(m.carros)} ${m.carros === 1 ? 'carro' : 'carros'}` }))} />
        </Bloco>
      ) : null}

      <Bloco titulo="Mão de obra e peças" descricao="Do que foi cobrado nas ordens concluídas (antes dos descontos).">
        <Divisao
          rotulo="Mão de obra e peças"
          partes={[
            { rotulo: 'Mão de obra', valor: resumo.maoDeObra, texto: formatarMoeda(resumo.maoDeObra), cor: 'bg-caneta' },
            { rotulo: 'Peças', valor: resumo.pecas, texto: formatarMoeda(resumo.pecas), cor: 'bg-oleo' },
            ...(resumo.outros ? [{ rotulo: 'Outros', valor: resumo.outros, texto: formatarMoeda(resumo.outros), cor: 'bg-tinta-3' }] : [])
          ]}
        />
      </Bloco>

      <Bloco
        titulo="Margem das peças"
        descricao="O preço cobrado contra o custo do estoque (o da última compra), nas peças que saíram do estoque."
        csv={<BotaoCsv nome={arquivo('margem-das-pecas')} cabecalho={['Peça', 'Quantidade', 'Venda', 'Custo', 'Margem']} linhas={margem.linhas.map((l) => [l.nome, l.quantidade, l.venda, l.custo, l.margem])} />}
      >
        {margem.linhas.length ? (
          <>
            {margem.linhas.some((l) => l.custo != null) ? (
              <dl className="grid grid-cols-3 gap-2.5">
                <Numero rotulo="Vendido" valor={formatarMoeda(margem.venda)} nota="com custo conhecido" />
                <Numero rotulo="Custo" valor={formatarMoeda(margem.custo)} nota="da última compra" />
                <Numero rotulo="Margem" valor={formatarMoeda(margem.margem)} nota={margem.percentual != null ? `${formatarNumero(margem.percentual, 1)}% da venda` : 'sem venda'} />
              </dl>
            ) : null}
            {margem.linhasSemCusto ? (
              <p className="rounded-xl bg-oleo-claro px-3.5 py-2.5 text-[14px] text-oleo-tinta">
                {formatarMoeda(margem.vendaSemCusto)} em peças sem custo conhecido ({margem.linhasSemCusto} {margem.linhasSemCusto === 1 ? 'linha' : 'linhas'}): a peça não saiu do estoque ou o estoque não tem o preço de compra. Elas ficam fora da margem.
              </p>
            ) : null}
            <Tabela
              cabecalho={['Peça', 'Qtd.', 'Venda', 'Custo', 'Margem']}
              linhas={margem.linhas.slice(0, 15).map((l) => [l.nome, formatarNumero(l.quantidade, 2), formatarMoeda(l.venda), l.custo != null ? formatarMoeda(l.custo) : 'sem custo', l.margem != null ? formatarMoeda(l.margem) : '—'])}
            />
          </>
        ) : (
          <Nada>Nenhuma peça nas ordens concluídas {nomePeriodo}.</Nada>
        )}
      </Bloco>

      <Bloco
        titulo="Orçamentos"
        descricao="Os orçamentos mostrados ao cliente no período e quantos ele aprovou."
        csv={
          <BotaoCsv
            nome={arquivo('orcamentos')}
            cabecalho={['Mostrados', 'Aprovados', 'Recusados', 'Esperando resposta', 'Valor mostrado', 'Valor aprovado', '% aprovados', '% do valor aprovado', 'Horas para responder']}
            linhas={[[aprovacao.enviados, aprovacao.aprovados, aprovacao.recusados, aprovacao.esperando, aprovacao.valorEnviado, aprovacao.valorAprovado, aprovacao.taxa, aprovacao.taxaDoValor, aprovacao.horasParaResponder]]}
          />
        }
      >
        {aprovacao.enviados ? (
          <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Numero rotulo="Mostrados" valor={formatarNumero(aprovacao.enviados)} nota={aprovacao.esperando ? `${aprovacao.esperando} esperando resposta` : 'todos respondidos'} />
            <Numero rotulo="Aprovados" valor={`${formatarNumero(aprovacao.aprovados)}${aprovacao.taxa != null ? ` (${aprovacao.taxa}%)` : ''}`} nota={`${aprovacao.recusados} recusados`} />
            <Numero rotulo="Valor aprovado" valor={formatarMoeda(aprovacao.valorAprovado)} nota={`de ${formatarMoeda(aprovacao.valorEnviado)}${aprovacao.taxaDoValor != null ? `, ${aprovacao.taxaDoValor}%` : ''}`} />
            <Numero rotulo="Tempo para responder" valor={aprovacao.horasParaResponder != null ? textoDasHoras(aprovacao.horasParaResponder) : '—'} nota="em média, de mandar até a resposta" />
          </dl>
        ) : (
          <Nada>Nenhum orçamento mostrado ao cliente {nomePeriodo}.</Nada>
        )}
      </Bloco>

      <Bloco
        titulo="Serviços mais feitos"
        descricao="Em quantas ordens concluídas cada serviço apareceu, e quanto somou."
        csv={<BotaoCsv nome={arquivo('servicos')} cabecalho={['Serviço', 'Ordens', 'Valor']} linhas={servicos.map((s) => [s.nome, s.vezes, s.valor])} />}
      >
        {servicos.length ? (
          <Barras rotulo="Serviços mais feitos" itens={servicos.map((s) => ({ rotulo: s.nome, valor: s.vezes, texto: `${s.vezes}×`, detalhe: formatarMoeda(s.valor) }))} />
        ) : (
          <Nada>Nenhum serviço nas ordens concluídas {nomePeriodo}.</Nada>
        )}
      </Bloco>

      <RetornoDosAvisos avisados={retorno.avisados} voltaram={retorno.voltaram} taxa={retorno.taxa} valor={retorno.valor} csv={<BotaoCsv nome={arquivo('retorno-dos-avisos')} cabecalho={['Avisados', 'Voltaram', '% voltaram', 'Valor dos serviços']} linhas={[[retorno.avisados, retorno.voltaram, retorno.taxa, retorno.valor]]} />} />

      <Bloco
        titulo="Recebido e a receber"
        descricao={
          <>
            Pelo{' '}
            <Link href="/oficina/financeiro" className="font-semibold text-caneta hover:underline">
              financeiro
            </Link>
            : o que entrou e saiu em cada mês e o que está em aberto com vencimento no mês.
          </>
        }
        csv={<BotaoCsv nome={arquivo('recebido-e-a-receber')} cabecalho={['Mês', 'Recebido', 'A receber', 'Pago', 'A pagar']} linhas={caixa.meses.map((m) => [nomeDoMes(m.mes), m.recebido, m.aReceber, m.pago, m.aPagar])} />}
      >
        <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Numero rotulo="Recebido" valor={formatarMoeda(caixa.recebido)} nota={nomePeriodo} />
          <Numero rotulo="A receber" valor={formatarMoeda(caixa.aReceber)} nota={caixa.vencido ? `${formatarMoeda(caixa.vencido)} já vencido` : 'nada vencido'} alerta={caixa.vencido > 0} />
          <Numero rotulo="Pago" valor={formatarMoeda(caixa.pago)} nota={nomePeriodo} />
          <Numero rotulo="A pagar" valor={formatarMoeda(caixa.aPagar)} nota="com vencimento no período" />
        </dl>
        {variosMeses ? (
          <Tabela
            cabecalho={['Mês', 'Recebido', 'A receber', 'Pago', 'A pagar']}
            linhas={[...caixa.meses].reverse().map((m) => [nomeDoMes(m.mes), formatarMoeda(m.recebido), formatarMoeda(m.aReceber), formatarMoeda(m.pago), formatarMoeda(m.aPagar)])}
          />
        ) : null}
      </Bloco>

      <Bloco
        titulo="Comissão"
        descricao={
          <>
            A % de cada profissional sobre a mão de obra e as peças das ordens em que trabalhou (a linha é de quem está nela, senão do responsável pela ordem). O desconto da ordem entra na conta. Os profissionais e as % ficam em{' '}
            <Link href="/oficina/agenda?aba=profissionais" className="font-semibold text-caneta hover:underline">
              Profissionais
            </Link>
            .
          </>
        }
        csv={
          <BotaoCsv
            nome={arquivo('comissao')}
            cabecalho={['Profissional', 'Ordens', 'Mão de obra', 'Peças', '% mão de obra', '% peças', 'Comissão mão de obra', 'Comissão peças', 'Total']}
            linhas={comissao.map((c) => [c.nome, c.ordens, c.maoDeObra, c.pecas, c.percentualServicos, c.percentualPecas, c.comissaoServicos, c.comissaoPecas, c.total])}
          />
        }
      >
        {comissao.length ? (
          <Tabela
            cabecalho={['Profissional', 'Ordens', 'Mão de obra', 'Peças', 'Comissão']}
            linhas={comissao.map((c) => [
              c.profissionalId ? c.nome : <span className="text-tinta-3">{c.nome}</span>,
              formatarNumero(c.ordens),
              `${formatarMoeda(c.maoDeObra)}${c.profissionalId ? ` · ${formatarNumero(c.percentualServicos, 1)}%` : ''}`,
              `${formatarMoeda(c.pecas)}${c.profissionalId ? ` · ${formatarNumero(c.percentualPecas, 1)}%` : ''}`,
              c.profissionalId ? <strong className="num">{formatarMoeda(c.total)}</strong> : '—'
            ])}
          />
        ) : (
          <Nada>Nenhuma ordem concluída {nomePeriodo}.</Nada>
        )}
      </Bloco>

      <ComparativoDaRegiao />
    </div>
  );
}

function Bloco({ titulo, descricao, csv, children }: { titulo: string; descricao?: ReactNode; csv?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[21px]">{titulo}</h2>
          {descricao ? <p className="mt-1 max-w-[70ch] text-[15px] text-tinta-2">{descricao}</p> : null}
        </div>
        {csv}
      </div>
      {children}
    </section>
  );
}

function Numero({ rotulo, valor, nota, escuro = false, alerta = false }: { rotulo: string; valor: string; nota?: string; escuro?: boolean; alerta?: boolean }) {
  return (
    <div className={`flex flex-col rounded-2xl px-3.5 py-3 sm:px-4 ${escuro ? 'bg-asfalto text-white' : 'bg-papel ring-1 ring-linha'}`}>
      <dt className={`text-[13px] ${escuro ? 'text-white/70' : 'text-tinta-3'}`}>{rotulo}</dt>
      <dd className="largo mt-0.5 text-[18px] leading-tight font-extrabold sm:text-[22px]">{valor}</dd>
      {nota ? <dd className={`mt-0.5 text-[12.5px] ${alerta ? 'font-semibold text-atraso' : escuro ? 'text-white/70' : 'text-tinta-3'}`}>{nota}</dd> : null}
    </div>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: ReactNode[][] }) {
  if (!linhas.length) return null;
  return (
    <div className="overflow-x-auto rounded-2xl bg-papel ring-1 ring-linha">
      <table className="w-full min-w-[420px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-linha text-[12.5px] text-tinta-3">
            {cabecalho.map((c, i) => (
              <th key={c} scope="col" className={`px-4 py-2 font-semibold ${i > 0 ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-linha">
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} className={`px-4 py-2 ${j > 0 ? 'num text-right whitespace-nowrap' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Nada({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-papel-2 px-4 py-3 text-[14.5px] text-tinta-3">{children}</p>;
}

/** O retorno dos avisos: quantos voltaram é grátis; a taxa e o valor que renderam são do Pro, como no início. */
function RetornoDosAvisos({ avisados, voltaram, taxa, valor, csv }: { avisados: number; voltaram: number; taxa: number | null; valor: number; csv: ReactNode }) {
  const p = usePlano();
  const abrirPro = useOfertaDoPro();
  return (
    <Bloco titulo="Retorno dos avisos" descricao="Dos carros avisados ou agendados no período, quantos fizeram serviço em até 60 dias depois do aviso." csv={p.liberado ? csv : undefined}>
      {avisados ? (
        <dl className="grid grid-cols-3 gap-2.5">
          <Numero rotulo="Avisados" valor={formatarNumero(avisados)} nota="carros" />
          <Numero rotulo="Voltaram" valor={formatarNumero(voltaram)} nota={p.liberado && taxa != null ? `${taxa}% dos avisados` : 'em até 60 dias'} />
          <div className="flex flex-col rounded-2xl bg-papel px-3.5 py-3 ring-1 ring-linha sm:px-4">
            <dt className="text-[13px] text-tinta-3">Rendeu</dt>
            {p.liberado ? (
              <dd className="largo mt-0.5 text-[18px] leading-tight font-extrabold sm:text-[22px]">{formatarMoeda(valor)}</dd>
            ) : (
              <dd className="mt-1">
                <button type="button" onClick={() => abrirPro('retorno')} className="inline-flex items-center gap-1.5 rounded-full bg-oleo-claro px-3 py-1 text-[13.5px] font-bold text-oleo-tinta hover:brightness-95">
                  Ver no Pro
                </button>
              </dd>
            )}
          </div>
        </dl>
      ) : (
        <Nada>Nenhum carro avisado no período.</Nada>
      )}
    </Bloco>
  );
}
