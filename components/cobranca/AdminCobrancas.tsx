'use client';

// O painel da cobrança para o financeiro: assinaturas do Pro, pagamentos com a nota fiscal, o
// fechamento do mês das lojas (Pix pelo gateway ou lançamento à mão) e os avisos dos gateways
// que deram problema.

import { ChevronLeft, ChevronRight, Copy, ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  agendarPixAutomaticoAgora,
  cancelarAssinaturaDaOficina,
  cancelarCobranca,
  emitirNotaDeNovo,
  gerarPixDaLoja,
  lancarLojaAMao,
  marcarComoPago,
  tentarAvisosDeNovo
} from '@/app/admin/cobrancas/acoes';
import { AvisoErro, CampoBusca, Filtro, LinhaDeFiltros, MostrarMais, POR_PAGINA, combina, paraBusca } from '@/components/equipe/comum';
import { Botao, Chip, Secao, Vazio, classeBotao, classeEntrada } from '@/components/ui';
import {
  NOMES_PROVEDOR,
  NOMES_SITUACAO_ASSINATURA,
  NOMES_SITUACAO_PAGAMENTO,
  nomeDoMetodo,
  type AssinaturaNoPainel,
  type AvisoComProblema,
  type EstadoDosGateways,
  type LojaDoMes,
  type PagamentoNoPainel,
  type SituacaoAssinatura,
  type SituacaoPagamento
} from '@/lib/cobranca/tipos';
import { dataLocal, formatarData } from '@/lib/datas';
import { formatarMoeda, lerNumero } from '@/lib/formatos';

type Resposta = { ok: true; texto?: string } | { ok: false; erro: string };

/** Uma ação com retorno: mostra o erro (ou o texto de sucesso) perto do botão. */
function useAcao() {
  const router = useRouter();
  const [indo, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  function rodar(fn: () => Promise<Resposta>, sucesso?: string) {
    setMsg(null);
    iniciar(async () => {
      try {
        const r = await fn();
        if (!r.ok) setMsg({ tom: 'erro', texto: r.erro });
        else {
          if (r.texto || sucesso) setMsg({ tom: 'ok', texto: r.texto ?? sucesso ?? '' });
          router.refresh();
        }
      } catch {
        setMsg({ tom: 'erro', texto: 'Sem conexão com o servidor. Tente de novo.' });
      }
    });
  }
  return { indo, msg, rodar };
}

function Mensagem({ msg }: { msg: { tom: 'ok' | 'erro'; texto: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-[13.5px] font-semibold ${msg.tom === 'erro' ? 'text-atraso' : 'text-ok'}`} role={msg.tom === 'erro' ? 'alert' : 'status'}>
      {msg.texto}
    </p>
  );
}

function tomPagamento(s: SituacaoPagamento) {
  return s === 'pago' ? 'ok' : s === 'atrasado' ? 'atraso' : s === 'pendente' ? 'oleo' : 'neutro';
}

function tomAssinatura(s: SituacaoAssinatura) {
  return s === 'ativa' ? 'ok' : s === 'atrasada' ? 'atraso' : s === 'pendente' ? 'oleo' : 'neutro';
}

function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 15)));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`;
}

export interface PropsAdminCobrancas {
  gateways: EstadoDosGateways;
  assinaturas: AssinaturaNoPainel[];
  pagamentos: PagamentoNoPainel[];
  avisos: AvisoComProblema[];
  mes: string;
  mesAnterior: string;
  mesSeguinte: string;
  lojas: LojaDoMes[];
  semExtrato: boolean;
  erroLojas: string | null;
  hoje: string;
}

export function AdminCobrancas(p: PropsAdminCobrancas) {
  return (
    <div className="flex flex-col gap-10">
      <Gateways g={p.gateways} />
      <Assinaturas assinaturas={p.assinaturas} />
      <Pagamentos pagamentos={p.pagamentos} />
      <Lojas {...p} />
      <Avisos avisos={p.avisos} />
    </div>
  );
}

// ---------------------------------------------------------------- gateways

function Gateways({ g }: { g: EstadoDosGateways }) {
  const nenhum = !g.asaas && !g.efi && !g.teste;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-papel px-4 py-3 ring-1 ring-linha">
      <span className="text-[14px] font-semibold text-tinta-2">Gateways:</span>
      {nenhum ? <Chip>Nenhum ligado: a assinatura é pelo WhatsApp da equipe</Chip> : null}
      {g.asaas ? (
        <Chip tom={g.asaas.webhook ? 'ok' : 'atraso'}>
          Asaas ({g.asaas.ambiente === 'producao' ? 'produção' : 'sandbox'}){g.asaas.webhook ? '' : ', sem token do webhook'}
        </Chip>
      ) : null}
      {g.asaas ? <Chip tom={g.asaas.nota ? 'ok' : 'neutro'}>{g.asaas.nota ? 'Nota fiscal ligada' : 'Nota fiscal desligada'}</Chip> : null}
      {g.efi ? (
        <Chip tom={g.efi.webhook ? 'ok' : 'atraso'}>
          Efí ({g.efi.ambiente === 'producao' ? 'produção' : 'homologação'}){g.efi.webhook ? '' : ', sem segredo do webhook'}
        </Chip>
      ) : null}
      {g.teste ? <Chip tom="caneta">Gateway de teste</Chip> : null}
    </div>
  );
}

// ---------------------------------------------------------------- assinaturas

const FILTROS_ASSINATURA: { id: SituacaoAssinatura | 'todas'; nome: string }[] = [
  { id: 'todas', nome: 'Todas' },
  { id: 'ativa', nome: 'Ativas' },
  { id: 'pendente', nome: 'Esperando' },
  { id: 'atrasada', nome: 'Atrasadas' },
  { id: 'cancelada', nome: 'Canceladas' }
];

function Assinaturas({ assinaturas }: { assinaturas: AssinaturaNoPainel[] }) {
  const [filtro, setFiltro] = useState<SituacaoAssinatura | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const [mostrando, setMostrando] = useState(POR_PAGINA);
  const lista = useMemo(
    () => assinaturas.filter((a) => (filtro === 'todas' || a.situacao === filtro) && combina(paraBusca(a.oficina, a.nome_nota, a.email_nota, a.documento), busca)),
    [assinaturas, filtro, busca]
  );
  const mrr = assinaturas.filter((a) => a.situacao === 'ativa' || a.situacao === 'atrasada').reduce((s, a) => s + a.valor, 0);
  return (
    <Secao titulo="Assinaturas do Pro" descricao={`Pelo app, com gateway. ${formatarMoeda(mrr)} por mês nas assinaturas ativas e atrasadas.`}>
      <div className="flex flex-col gap-3">
        <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar assinatura" dica="Oficina, nome da nota, e-mail ou documento" />
        <LinhaDeFiltros rotulo="Situação da assinatura">
          {FILTROS_ASSINATURA.map((f) => (
            <Filtro key={f.id} ativo={filtro === f.id} aoClicar={() => setFiltro(f.id)} n={f.id === 'todas' ? assinaturas.length : assinaturas.filter((a) => a.situacao === f.id).length}>
              {f.nome}
            </Filtro>
          ))}
        </LinhaDeFiltros>
        {lista.length ? (
          <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {lista.slice(0, mostrando).map((a) => (
              <LinhaAssinatura key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhuma assinatura aqui" />
        )}
        <MostrarMais total={lista.length} mostrando={mostrando} aoMostrar={() => setMostrando((n) => n + POR_PAGINA)} />
      </div>
    </Secao>
  );
}

function LinhaAssinatura({ a }: { a: AssinaturaNoPainel }) {
  const { indo, msg, rodar } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold">{a.oficina}</p>
          <p className="text-[13.5px] text-tinta-3">
            {nomeDoMetodo(a.metodo)} · {formatarMoeda(a.valor)} por mês · {NOMES_PROVEDOR[a.provedor]}
            {a.proximo_vencimento && a.situacao !== 'cancelada' ? ` · próxima em ${formatarData(a.proximo_vencimento)}` : ''}
            {a.situacao === 'cancelada' && a.cancelada_em ? ` · cancelada em ${formatarData(dataLocal(a.cancelada_em))}` : ''}
          </p>
          {a.nome_nota ? (
            <p className="text-[13px] text-tinta-3">
              Nota para {a.nome_nota}
              {a.email_nota ? `, ${a.email_nota}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Chip tom={tomAssinatura(a.situacao)}>{NOMES_SITUACAO_ASSINATURA[a.situacao]}</Chip>
          {a.situacao !== 'cancelada' ? (
            confirmar ? (
              <>
                <Botao variante="perigo" tamanho="pequeno" disabled={indo} onClick={() => rodar(() => cancelarAssinaturaDaOficina(a.oficina_id), 'Assinatura cancelada.')}>
                  {indo ? 'Cancelando…' : 'Confirmar'}
                </Botao>
                <Botao variante="fantasma" tamanho="pequeno" onClick={() => setConfirmar(false)}>
                  Manter
                </Botao>
              </>
            ) : (
              <Botao variante="fantasma" tamanho="pequeno" onClick={() => setConfirmar(true)} aria-label={`Cancelar a assinatura de ${a.oficina}`}>
                Cancelar
              </Botao>
            )
          ) : null}
        </div>
      </div>
      {confirmar && a.situacao !== 'cancelada' ? (
        <p className="text-[13px] text-tinta-3">Cancela no gateway: nada mais é cobrado; o Pro já pago continua até o fim.</p>
      ) : null}
      <Mensagem msg={msg} />
    </li>
  );
}

// ---------------------------------------------------------------- pagamentos

const FILTROS_PAGAMENTO: { id: SituacaoPagamento | 'todos' | 'nota'; nome: string }[] = [
  { id: 'todos', nome: 'Todos' },
  { id: 'pendente', nome: 'A pagar' },
  { id: 'atrasado', nome: 'Atrasados' },
  { id: 'pago', nome: 'Pagos' },
  { id: 'nota', nome: 'Nota com problema' },
  { id: 'cancelado', nome: 'Cancelados' },
  { id: 'estornado', nome: 'Devolvidos' }
];

function notaComProblema(p: PagamentoNoPainel) {
  return p.situacao === 'pago' && p.valor > 0 && (p.nota_situacao === 'erro' || !p.nota_situacao);
}

function Pagamentos({ pagamentos }: { pagamentos: PagamentoNoPainel[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS_PAGAMENTO)[number]['id']>('todos');
  const [tipo, setTipo] = useState<'todos' | 'pro' | 'loja'>('todos');
  const [busca, setBusca] = useState('');
  const [mostrando, setMostrando] = useState(POR_PAGINA);
  const lista = useMemo(
    () =>
      pagamentos.filter(
        (p) =>
          (tipo === 'todos' || p.tipo === tipo) &&
          (filtro === 'todos' || (filtro === 'nota' ? notaComProblema(p) : p.situacao === filtro)) &&
          combina(paraBusca(p.quem, p.descricao, p.externo, p.nota_numero), busca)
      ),
    [pagamentos, filtro, tipo, busca]
  );
  const contar = (id: (typeof FILTROS_PAGAMENTO)[number]['id']) =>
    pagamentos.filter((p) => (tipo === 'todos' || p.tipo === tipo) && (id === 'todos' || (id === 'nota' ? notaComProblema(p) : p.situacao === id))).length;
  return (
    <Secao titulo="Pagamentos" descricao="Cada cobrança do Pro e das lojas, com a nota fiscal. Os pagos pelo gateway entram sozinhos pelo aviso do banco.">
      <div className="flex flex-col gap-3">
        <CampoBusca valor={busca} aoMudar={setBusca} rotulo="Buscar pagamento" dica="Oficina, loja, descrição ou número da nota" />
        <LinhaDeFiltros rotulo="Tipo de cobrança">
          {(['todos', 'pro', 'loja'] as const).map((t) => (
            <Filtro key={t} ativo={tipo === t} aoClicar={() => setTipo(t)}>
              {t === 'todos' ? 'Pro e lojas' : t === 'pro' ? 'Pro' : 'Lojas'}
            </Filtro>
          ))}
        </LinhaDeFiltros>
        <LinhaDeFiltros rotulo="Situação do pagamento">
          {FILTROS_PAGAMENTO.map((f) => (
            <Filtro key={f.id} ativo={filtro === f.id} aoClicar={() => setFiltro(f.id)} n={contar(f.id)}>
              {f.nome}
            </Filtro>
          ))}
        </LinhaDeFiltros>
        {lista.length ? (
          <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {lista.slice(0, mostrando).map((p) => (
              <LinhaPagamento key={p.id} p={p} />
            ))}
          </ul>
        ) : (
          <Vazio titulo="Nenhum pagamento aqui" />
        )}
        <MostrarMais total={lista.length} mostrando={mostrando} aoMostrar={() => setMostrando((n) => n + POR_PAGINA)} />
      </div>
    </Secao>
  );
}

function LinhaPagamento({ p }: { p: PagamentoNoPainel }) {
  const { indo, msg, rodar } = useAcao();
  const aberto = p.situacao === 'pendente' || p.situacao === 'atrasado';
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold">
            {p.quem} <span className="font-normal text-tinta-3">· {p.tipo === 'pro' ? 'Pro' : 'Loja'}</span>
          </p>
          <p className="text-[13.5px] text-tinta-3">
            {formatarMoeda(p.valor)} · {nomeDoMetodo(p.metodo)} · {NOMES_PROVEDOR[p.provedor]}
            {p.situacao === 'pago' && p.pago_em ? ` · pago em ${formatarData(dataLocal(p.pago_em))}` : p.vencimento ? ` · vence em ${formatarData(p.vencimento)}` : ''}
            {p.referencia ? ` · ${p.referencia}` : ''}
          </p>
          {p.descricao ? <p className="text-[13px] text-tinta-3">{p.descricao}</p> : null}
          <NotaDoPagamento p={p} />
        </div>
        <Chip tom={tomPagamento(p.situacao)}>{NOMES_SITUACAO_PAGAMENTO[p.situacao]}</Chip>
      </div>
      <div className="flex flex-wrap gap-2">
        {aberto ? (
          <Botao variante="secundario" tamanho="pequeno" disabled={indo} onClick={() => rodar(() => marcarComoPago(p.id), 'Marcado como pago.')}>
            Marcar como pago
          </Botao>
        ) : null}
        {aberto ? (
          <Botao variante="fantasma" tamanho="pequeno" disabled={indo} onClick={() => rodar(() => cancelarCobranca(p.id), 'Cobrança cancelada.')}>
            Cancelar
          </Botao>
        ) : null}
        {p.situacao === 'pago' && p.valor > 0 && p.nota_situacao !== 'emitida' && p.nota_situacao !== 'agendada' ? (
          <Botao variante="secundario" tamanho="pequeno" disabled={indo} onClick={() => rodar(() => emitirNotaDeNovo(p.id), 'Nota pedida.')}>
            <FileText size={15} aria-hidden="true" /> {p.nota_situacao === 'erro' ? 'Emitir a nota de novo' : 'Emitir a nota'}
          </Botao>
        ) : null}
        {aberto && p.pix_copia_cola ? <CopiarPix texto={p.pix_copia_cola} /> : null}
        {aberto && p.link_pagamento ? (
          <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className={classeBotao('fantasma', 'pequeno')}>
            <ExternalLink size={15} aria-hidden="true" /> Página da cobrança
          </a>
        ) : null}
        {indo ? <span className="self-center text-[13px] text-tinta-3">Um momento…</span> : null}
      </div>
      <Mensagem msg={msg} />
    </li>
  );
}

function NotaDoPagamento({ p }: { p: PagamentoNoPainel }) {
  if (p.nota_situacao === 'emitida' && p.nota_url) {
    return (
      <a href={p.nota_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-caneta hover:underline">
        <FileText size={14} aria-hidden="true" /> Nota{p.nota_numero ? ` nº ${p.nota_numero}` : ''}
      </a>
    );
  }
  if (p.nota_situacao === 'erro') return <p className="mt-0.5 text-[13px] font-semibold text-atraso">Nota com erro: {p.nota_erro ?? 'sem detalhe'}</p>;
  if (p.nota_situacao === 'agendada') return <p className="mt-0.5 text-[13px] text-tinta-3">Nota pedida, esperando a prefeitura</p>;
  if (p.nota_situacao === 'cancelada') return <p className="mt-0.5 text-[13px] text-tinta-3">Nota cancelada</p>;
  return null;
}

function CopiarPix({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Botao
      variante="fantasma"
      tamanho="pequeno"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          setCopiado(false);
        }
      }}
    >
      <Copy size={15} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar o Pix'}
    </Botao>
  );
}

// ---------------------------------------------------------------- lojas do mês

function Lojas({ mes, mesAnterior, mesSeguinte, lojas, semExtrato, erroLojas, gateways }: PropsAdminCobrancas) {
  const comAlgo = lojas.filter((l) => l.total > 0 || l.cobrancas.length);
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? lojas : comAlgo;
  const total = lojas.reduce((s, l) => s + l.total, 0);
  const podePix = !!(gateways.asaas || gateways.efi || gateways.teste);
  return (
    <Secao
      titulo="Lojas, fechamento do mês"
      descricao={`${nomeDoMes(mes)}: comissão das vendas confirmadas e mensalidade do destaque. ${formatarMoeda(total)} no total.`}
      acao={
        <div className="flex items-center gap-1">
          <Link href={`/admin/cobrancas?mes=${mesAnterior}`} className={classeBotao('secundario', 'pequeno')} aria-label="Mês anterior">
            <ChevronLeft size={16} aria-hidden="true" />
          </Link>
          <Link href={`/admin/cobrancas?mes=${mesSeguinte}`} className={classeBotao('secundario', 'pequeno')} aria-label="Mês seguinte">
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      }
    >
      {semExtrato ? (
        <AvisoErro>O extrato das lojas (public.extrato_da_loja) ainda não está neste banco. Aplique a migração da loja para fechar o mês por aqui.</AvisoErro>
      ) : erroLojas ? (
        <AvisoErro>{erroLojas}</AvisoErro>
      ) : (
        <div className="flex flex-col gap-3">
          {!podePix ? <p className="text-[14px] text-tinta-3">Nenhum gateway ligado: lance à mão e mande o Pix pelo WhatsApp; depois marque como pago.</p> : null}
          {visiveis.length ? (
            <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
              {visiveis.map((l) => (
                <LinhaLoja key={l.fornecedorId} l={l} mes={mes} podePix={podePix} />
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhuma loja com valor neste mês" />
          )}
          {lojas.length > comAlgo.length ? (
            <button type="button" onClick={() => setTodas((v) => !v)} className="self-start text-[14px] font-semibold text-caneta hover:underline">
              {todas ? 'Mostrar só as lojas com valor' : `Mostrar todas as ${lojas.length} lojas`}
            </button>
          ) : null}
        </div>
      )}
    </Secao>
  );
}

function LinhaLoja({ l, mes, podePix }: { l: LojaDoMes; mes: string; podePix: boolean }) {
  const { indo, msg, rodar } = useAcao();
  const [valor, setValor] = useState(l.total > 0 ? l.total.toFixed(2).replace('.', ',') : '');
  const viva = l.cobrancas.find((c) => c.situacao !== 'cancelado' && c.situacao !== 'estornado') ?? null;
  const v = lerNumero(valor) ?? 0;
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold">{l.nome}</p>
          <p className="text-[13.5px] text-tinta-3">
            {l.pedidos} {l.pedidos === 1 ? 'pedido' : 'pedidos'}, {formatarMoeda(l.totalVendas)} em vendas · comissão {formatarMoeda(l.totalComissao)} · mensalidade {formatarMoeda(l.mensalidade)}
          </p>
          {!l.cnpj ? <p className="text-[13px] font-semibold text-atraso">Sem CNPJ no cadastro: o Pix pelo gateway e a nota pedem o CNPJ.</p> : null}
          {l.erro ? <p className="text-[13px] text-atraso">{l.erro}</p> : null}
        </div>
        <p className="num text-[17px] font-extrabold">{formatarMoeda(l.total)}</p>
      </div>
      {viva ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tom={tomPagamento(viva.situacao)}>
            {NOMES_SITUACAO_PAGAMENTO[viva.situacao]}: {formatarMoeda(viva.valor)} ({NOMES_PROVEDOR[viva.provedor]})
          </Chip>
          {viva.situacao === 'pendente' || viva.situacao === 'atrasado' ? (
            <>
              <Botao variante="secundario" tamanho="pequeno" disabled={indo} onClick={() => rodar(() => marcarComoPago(viva.id), 'Marcado como pago.')}>
                Marcar como pago
              </Botao>
              {viva.pix_copia_cola ? <CopiarPix texto={viva.pix_copia_cola} /> : null}
            </>
          ) : null}
          {viva.nota_situacao === 'emitida' && viva.nota_url ? (
            <a href={viva.nota_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-caneta hover:underline">
              <FileText size={14} aria-hidden="true" /> Nota{viva.nota_numero ? ` nº ${viva.nota_numero}` : ''}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-tinta-2">
            Valor a cobrar
            <input className={`${classeEntrada} num h-9 w-32`} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" aria-label={`Valor a cobrar de ${l.nome}`} />
          </label>
          {podePix ? (
            <Botao
              variante="primario"
              tamanho="pequeno"
              disabled={indo || v < 1 || !l.cnpj}
              onClick={() => rodar(() => gerarPixDaLoja({ fornecedorId: l.fornecedorId, mes, valor: v }), 'Pix gerado. Mande o código para a loja.')}
            >
              Gerar o Pix
            </Botao>
          ) : null}
          <Botao
            variante="secundario"
            tamanho="pequeno"
            disabled={indo || v <= 0}
            onClick={() => rodar(() => lancarLojaAMao({ fornecedorId: l.fornecedorId, mes, valor: v }), 'Lançado. Marque como pago quando o Pix cair.')}
          >
            Lançar à mão
          </Botao>
        </div>
      )}
      <Mensagem msg={msg} />
    </li>
  );
}

// ---------------------------------------------------------------- avisos

function Avisos({ avisos }: { avisos: AvisoComProblema[] }) {
  const tentar = useAcao();
  const agendar = useAcao();
  return (
    <Secao
      titulo="Avisos dos gateways"
      descricao="Os avisos que chegaram e ainda não foram aplicados (o gateway avisou, mas a cobrança ainda não estava no banco, por exemplo). A rotina diária tenta de novo sozinha."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" tamanho="pequeno" disabled={tentar.indo} onClick={() => tentar.rodar(() => tentarAvisosDeNovo())}>
            {tentar.indo ? 'Tentando…' : 'Tentar os avisos de novo'}
          </Botao>
          <Botao variante="secundario" tamanho="pequeno" disabled={agendar.indo} onClick={() => agendar.rodar(() => agendarPixAutomaticoAgora())}>
            {agendar.indo ? 'Agendando…' : 'Agendar o Pix Automático do mês'}
          </Botao>
        </div>
        <Mensagem msg={tentar.msg} />
        <Mensagem msg={agendar.msg} />
        {avisos.length ? (
          <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
            {avisos.map((w) => (
              <li key={`${w.provedor}:${w.evento}`} className="flex flex-col gap-0.5 px-4 py-3">
                <p className="text-[14px] font-semibold">
                  {NOMES_PROVEDOR[w.provedor as keyof typeof NOMES_PROVEDOR] ?? w.provedor} · {w.tipo ?? 'aviso'} <span className="num font-normal text-tinta-3">{w.evento}</span>
                </p>
                <p className="text-[13px] text-tinta-3">
                  Chegou em {formatarData(dataLocal(w.recebidoEm))}, {w.tentativas} {w.tentativas === 1 ? 'tentativa' : 'tentativas'}
                  {w.erro ? ` · ${w.erro}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-tinta-3">Nenhum aviso pendente.</p>
        )}
      </div>
    </Secao>
  );
}
