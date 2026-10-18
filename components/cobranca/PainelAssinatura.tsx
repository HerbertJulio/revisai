'use client';

// A assinatura do Pro na oficina: escolher o jeito de pagar, pagar (Pix, QR do Pix Automático,
// boleto ou a página do cartão no gateway), ver a situação e as notas fiscais, e cancelar.
// Enquanto há pagamento em aberto, a tela confere a cada 10 segundos.

import { Barcode, Check, Copy, CreditCard, ExternalLink, FileText, LoaderCircle, QrCode as IconeQr, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { assinar, cancelar, conferir } from '@/app/oficina/assinatura/acoes';
import { QrCode } from '@/components/QrCode';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, Secao, classeBotao, classeEntrada } from '@/components/ui';
import { documentoValido, formatarDocumento } from '@/lib/cobranca/documento';
import {
  METODOS,
  NOMES_SITUACAO_ASSINATURA,
  NOMES_SITUACAO_PAGAMENTO,
  nomeDoMetodo,
  type LinhaAssinatura,
  type LinhaPagamento,
  type Metodo
} from '@/lib/cobranca/tipos';
import { dataLocal, formatarData } from '@/lib/datas';
import { formatarMoeda } from '@/lib/formatos';
import { formatarCodigo } from '@/lib/plano';
import { useOficina } from '@/lib/store';

export interface PrecoDoPro {
  valor: number;
  fundadora: boolean;
  vagas: number;
}

export interface PropsAssinatura {
  oficina: { nome: string; proAte: string | null; plano: 'pro' | 'teste' | 'gratis' };
  ligada: boolean;
  metodos: Metodo[];
  preco: PrecoDoPro | null;
  assinatura: LinhaAssinatura | null;
  anterior: LinhaAssinatura | null;
  pagamentos: LinhaPagamento[];
  sugestao: { nome: string; email: string; documento: string };
  codigo: { codigo: string; ate: string } | null;
  hoje: string;
}

const ICONES: Record<Metodo, typeof CreditCard> = { pix_automatico: Repeat, pix: IconeQr, cartao: CreditCard, boleto: Barcode };

function emAberto(p: LinhaPagamento) {
  return p.situacao === 'pendente' || p.situacao === 'atrasado';
}

export function PainelAssinatura(props: PropsAssinatura) {
  const { oficina, ligada, assinatura, pagamentos, hoje } = props;
  const router = useRouter();
  const toast = useToast();
  const [trocando, setTrocando] = useState(false);
  const aberto = useMemo(() => pagamentos.find((p) => p.assinatura_id === assinatura?.id && emAberto(p)) ?? null, [pagamentos, assinatura]);
  // no Pix Automático e no cartão, a mensalidade da assinatura em dia sai sozinha no vencimento
  const sozinha = !!aberto && aberto.situacao === 'pendente' && assinatura?.situacao === 'ativa' && (aberto.metodo === 'pix_automatico' || aberto.metodo === 'cartao');
  const esperando = (!!aberto && !sozinha) || assinatura?.situacao === 'pendente';
  const proValendo = !!oficina.proAte && oficina.proAte >= hoje;

  // confere o pagamento a cada 10 segundos enquanto houver algo em aberto
  useEffect(() => {
    if (!esperando) return;
    let vivo = true;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await conferir();
      } catch {
        // sem conexão: tenta na próxima
      }
      if (vivo) router.refresh();
    }, 10_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [esperando, router]);

  // o Pro pago liga também neste aparelho
  const planoLocal = useOficina((s) => s.plano.proAte);
  const ativarPro = useOficina((s) => s.ativarPro);
  useEffect(() => {
    if (props.codigo && (!planoLocal || planoLocal < props.codigo.ate)) ativarPro(props.codigo.ate, props.codigo.codigo);
  }, [props.codigo, planoLocal, ativarPro]);

  // avisa quando o pagamento que estava em aberto foi confirmado
  const ultimoAberto = useRef<string | null>(aberto?.id ?? null);
  useEffect(() => {
    const antes = ultimoAberto.current;
    if (antes && !aberto) {
      const p = pagamentos.find((x) => x.id === antes);
      if (p?.situacao === 'pago') toast({ texto: `Pagamento confirmado. Pro ativo até ${formatarData(oficina.proAte)}.` });
    }
    ultimoAberto.current = aberto?.id ?? null;
  }, [aberto, pagamentos, oficina.proAte, toast]);

  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="text-[14px] font-semibold text-tinta-3">
          <Link href="/oficina/ajustes#plano" className="hover:text-caneta">
            Ajustes
          </Link>{' '}
          / Plano
        </p>
        <h1 className="largo mt-1 text-[30px] sm:text-[34px]">Assinatura do Pro</h1>
        <p className="mt-1 text-tinta-2">
          {proValendo ? `O Pro da ${oficina.nome} vale até ${formatarData(oficina.proAte)}.` : `Avisos e ordens por voz sem limite para a ${oficina.nome}.`}
        </p>
      </header>

      {assinatura && !trocando ? (
        <Situacao {...props} assinatura={assinatura} aberto={aberto} esperando={esperando} aoTrocar={() => setTrocando(true)} />
      ) : !ligada ? (
        <PeloWhatsApp />
      ) : (
        <Formulario {...props} trocando={trocando} aoVoltar={trocando ? () => setTrocando(false) : undefined} aoAssinar={() => setTrocando(false)} />
      )}

      {props.codigo ? <CodigoDoPro codigo={props.codigo} /> : null}

      <Historico pagamentos={pagamentos} />
    </div>
  );
}

// ---------------------------------------------------------------- sem gateway

function PeloWhatsApp() {
  return (
    <Secao titulo="Assinatura pelo WhatsApp da equipe" descricao="A assinatura pelo app ainda não está ligada. A equipe do Revisaí combina o pagamento com você e manda o código do Pro.">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">
        <p className="text-[15px] text-tinta-2">Pix, cartão ou boleto, com nota fiscal. O código do Pro chega pelo WhatsApp e você digita em Ajustes.</p>
        <Link href="/planos#assinar" className={classeBotao('primario')}>
          Assinar pelo WhatsApp
        </Link>
      </div>
    </Secao>
  );
}

// ---------------------------------------------------------------- situação e pagamento

function Situacao({
  assinatura,
  aberto,
  esperando,
  oficina,
  hoje,
  aoTrocar
}: PropsAssinatura & { assinatura: LinhaAssinatura; aberto: LinhaPagamento | null; esperando: boolean; aoTrocar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, iniciar] = useTransition();
  const tom = assinatura.situacao === 'ativa' ? 'ok' : assinatura.situacao === 'atrasada' ? 'atraso' : 'oleo';

  function fazerCancelamento() {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await cancelar();
        if (!r.ok) return setErro(r.erro);
        setConfirmando(false);
        toast({ texto: oficina.proAte && oficina.proAte >= hoje ? `Assinatura cancelada. O Pro vale até ${formatarData(oficina.proAte)}.` : 'Assinatura cancelada.' });
        router.refresh();
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <Secao titulo="Sua assinatura">
      <div className="flex flex-col gap-5 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[19px] font-extrabold">Pro, {formatarMoeda(assinatura.valor)} por mês</p>
              <Chip tom={tom}>{NOMES_SITUACAO_ASSINATURA[assinatura.situacao]}</Chip>
            </div>
            <p className="mt-0.5 text-[14.5px] text-tinta-2">
              {nomeDoMetodo(assinatura.metodo)}
              {assinatura.proximo_vencimento && assinatura.situacao !== 'pendente' ? `, próxima cobrança em ${formatarData(assinatura.proximo_vencimento)}` : ''}
              {assinatura.nome_nota ? `. Nota fiscal para ${assinatura.nome_nota}` : ''}
              {assinatura.documento ? ` (${formatarDocumento(assinatura.documento)})` : ''}.
            </p>
          </div>
        </div>

        {assinatura.metodo === 'pix_automatico' && assinatura.autorizacao && assinatura.situacao === 'pendente' ? (
          <Autorizacao codigo={assinatura.autorizacao} valor={assinatura.valor} />
        ) : aberto && !esperando ? (
          <SaiSozinha pagamento={aberto} />
        ) : aberto ? (
          <Pagar pagamento={aberto} />
        ) : null}

        {esperando ? (
          <p className="flex items-center gap-2 text-[14px] text-tinta-3" aria-live="polite">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Esperando o pagamento. A tela confere sozinha.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-linha pt-4">
          <Botao variante="secundario" tamanho="pequeno" onClick={aoTrocar}>
            Trocar o jeito de pagar
          </Botao>
          {confirmando ? (
            <div className="flex w-full flex-col gap-2 rounded-xl bg-papel-2 p-3">
              <p className="text-[14.5px]">
                Nada mais será cobrado.{' '}
                {oficina.proAte && oficina.proAte >= hoje ? `O Pro já pago vale até ${formatarData(oficina.proAte)}.` : 'O Pro para quando o mês pago acabar.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Botao variante="perigo" tamanho="pequeno" onClick={fazerCancelamento} disabled={indo}>
                  {indo ? 'Cancelando…' : 'Cancelar a assinatura'}
                </Botao>
                <Botao variante="fantasma" tamanho="pequeno" onClick={() => setConfirmando(false)} disabled={indo}>
                  Manter
                </Botao>
              </div>
            </div>
          ) : (
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => setConfirmando(true)}>
              Cancelar assinatura
            </Botao>
          )}
        </div>
        {erro ? (
          <p className="text-[14px] font-semibold text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    </Secao>
  );
}

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Botao
      variante="escuro"
      tamanho="pequeno"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          setCopiado(false);
        }
      }}
    >
      {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copiado ? 'Copiado' : rotulo}
    </Botao>
  );
}

function Autorizacao({ codigo, valor }: { codigo: string; valor: number }) {
  return (
    <div className="grid gap-4 rounded-xl bg-papel-2 p-4 sm:grid-cols-[180px_1fr] sm:items-center">
      <QrCode texto={codigo} rotulo="QR Code para autorizar o Pix Automático" className="mx-auto h-[180px] w-[180px] rounded-lg" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-bold">Autorize no app do seu banco</p>
        <p className="text-[14.5px] text-tinta-2">
          Leia o QR Code (ou copie o código) na área Pix do app do banco. Você paga o primeiro mês ({formatarMoeda(valor)}) e autoriza os próximos: todo mês o Pix sai
          sozinho, e você cancela quando quiser, no banco ou aqui.
        </p>
        <div>
          <Copiar texto={codigo} rotulo="Copiar o código" />
        </div>
      </div>
    </div>
  );
}

function SaiSozinha({ pagamento: p }: { pagamento: LinhaPagamento }) {
  return (
    <p className="rounded-xl bg-papel-2 p-4 text-[14.5px] text-tinta-2">
      A mensalidade de {formatarMoeda(p.valor)} sai sozinha {p.metodo === 'cartao' ? 'no cartão' : 'pelo Pix Automático do seu banco'}
      {p.vencimento ? ` em ${formatarData(p.vencimento)}` : ''}. Não precisa fazer nada.
    </p>
  );
}

function Pagar({ pagamento: p }: { pagamento: LinhaPagamento }) {
  const titulo = p.situacao === 'atrasado' ? 'Pagamento atrasado' : 'Falta pagar';
  const vence = p.vencimento ? `, vence em ${formatarData(p.vencimento)}` : '';
  if (p.metodo === 'pix' || (p.metodo === 'pix_automatico' && p.pix_copia_cola)) {
    return (
      <div className="grid gap-4 rounded-xl bg-papel-2 p-4 sm:grid-cols-[180px_1fr] sm:items-center">
        {p.pix_copia_cola ? <QrCode texto={p.pix_copia_cola} rotulo="QR Code do Pix" className="mx-auto h-[180px] w-[180px] rounded-lg" /> : null}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-bold">
            {titulo}: {formatarMoeda(p.valor)}
            {vence}
          </p>
          <p className="text-[14.5px] text-tinta-2">Leia o QR Code no app do banco ou copie o código do Pix. O Pro liga assim que o banco confirmar.</p>
          <div className="flex flex-wrap gap-2">
            {p.pix_copia_cola ? <Copiar texto={p.pix_copia_cola} rotulo="Copiar o Pix" /> : null}
            {p.link_pagamento ? (
              <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
                <ExternalLink size={16} aria-hidden="true" /> Abrir a cobrança
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  if (p.metodo === 'boleto') {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-papel-2 p-4">
        <p className="font-bold">
          {titulo}: {formatarMoeda(p.valor)}
          {vence}
        </p>
        {p.boleto_linha ? <p className="num text-[14px] break-all">{p.boleto_linha}</p> : null}
        <div className="flex flex-wrap gap-2">
          {p.boleto_linha ? <Copiar texto={p.boleto_linha.replace(/\D/g, '')} rotulo="Copiar o código de barras" /> : null}
          {p.link_pagamento ? (
            <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
              <ExternalLink size={16} aria-hidden="true" /> Abrir o boleto
            </a>
          ) : null}
        </div>
        <p className="text-[13px] text-tinta-3">O boleto leva até 3 dias úteis para compensar.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-papel-2 p-4">
      <p className="font-bold">
        {titulo}: {formatarMoeda(p.valor)}
        {vence}
      </p>
      <p className="text-[14.5px] text-tinta-2">Os dados do cartão são digitados na página segura do banco que cobra; o Revisaí não vê o número do cartão.</p>
      {p.link_pagamento ? (
        <div>
          <a href={p.link_pagamento} target="_blank" rel="noopener noreferrer" className={classeBotao('primario', 'pequeno')}>
            <CreditCard size={16} aria-hidden="true" /> Pagar com cartão
          </a>
        </div>
      ) : (
        <p className="text-[14px] text-tinta-3">A página de pagamento chega por e-mail.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- assinar

function Formulario({
  metodos,
  preco,
  sugestao,
  anterior,
  trocando,
  aoVoltar,
  aoAssinar
}: PropsAssinatura & { trocando: boolean; aoVoltar?: () => void; aoAssinar: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [metodo, setMetodo] = useState<Metodo>(metodos[0] ?? 'pix');
  const [nome, setNome] = useState(sugestao.nome);
  const [documento, setDocumento] = useState(sugestao.documento ? formatarDocumento(sugestao.documento) : '');
  const [email, setEmail] = useState(sugestao.email);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, iniciar] = useTransition();
  const opcoes = METODOS.filter((m) => metodos.includes(m.id));
  const docOk = documentoValido(documento);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!docOk) return setErro('Confira o CPF ou o CNPJ.');
    iniciar(async () => {
      try {
        const r = await assinar({ metodo, documento: docOk, nome, email });
        if (!r.ok) return setErro(r.erro);
        toast({ texto: metodo === 'cartao' ? 'Assinatura criada. Agora é só pagar com o cartão.' : 'Assinatura criada. Agora é só pagar.' });
        aoAssinar();
        router.refresh();
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  if (!opcoes.length) return <PeloWhatsApp />;

  return (
    <Secao
      titulo={trocando ? 'Trocar o jeito de pagar' : 'Assinar o Pro'}
      descricao={
        preco
          ? preco.fundadora || preco.vagas > 0
            ? `${formatarMoeda(preco.valor)} por mês, preço de fundadora${preco.fundadora ? '' : ` (restam ${preco.vagas} vagas)`}: fica assim enquanto a assinatura durar.`
            : `${formatarMoeda(preco.valor)} por mês.`
          : undefined
      }
      acao={
        aoVoltar ? (
          <Botao variante="fantasma" tamanho="pequeno" onClick={aoVoltar}>
            Voltar
          </Botao>
        ) : undefined
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-6 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">Como você quer pagar</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {opcoes.map((m) => {
              const Icone = ICONES[m.id];
              const marcado = metodo === m.id;
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors ${marcado ? 'border-tinta bg-papel-2' : 'border-linha hover:border-tinta-3'}`}
                >
                  <input type="radio" name="metodo" value={m.id} checked={marcado} onChange={() => setMetodo(m.id)} className="sr-only" />
                  <Icone size={20} className="mt-0.5 shrink-0 text-tinta-2" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{m.nome}</span>
                    <span className="text-[13px] leading-snug text-tinta-3">{m.descricao}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <legend className="mb-2 text-sm font-semibold sm:col-span-6">Dados para a nota fiscal</legend>
          <Campo rotulo="Nome ou razão social" htmlFor="as-nome" className="sm:col-span-6">
            <input id="as-nome" className={classeEntrada} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="organization" required maxLength={120} />
          </Campo>
          <Campo
            rotulo="CPF ou CNPJ"
            htmlFor="as-doc"
            className="sm:col-span-3"
            erro={documento.replace(/\D/g, '').length >= 11 && !docOk ? 'Confira o número.' : null}
          >
            <input
              id="as-doc"
              className={`${classeEntrada} num`}
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              onBlur={() => docOk && setDocumento(formatarDocumento(docOk))}
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={18}
            />
          </Campo>
          <Campo rotulo="E-mail" htmlFor="as-email" className="sm:col-span-3" dica="A nota fiscal e os recibos chegam aqui.">
            <input id="as-email" type="email" className={classeEntrada} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={160} />
          </Campo>
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-linha pt-4">
          <div>
            <Botao type="submit" variante="primario" disabled={indo}>
              {indo ? 'Criando a assinatura…' : preco ? `Assinar por ${formatarMoeda(preco.valor)} por mês` : 'Assinar'}
            </Botao>
          </div>
          <p className="text-[13px] text-tinta-3">
            Cancele quando quiser: nada mais é cobrado e o Pro já pago vale até o fim.
            {trocando ? ' Ao trocar, a assinatura atual é cancelada e a nova começa com o pagamento de hoje; o mês soma depois do que já está pago.' : ''}
          </p>
          {anterior && !trocando ? <p className="text-[13px] text-tinta-3">A assinatura anterior foi cancelada em {formatarData(anterior.cancelada_em ? dataLocal(anterior.cancelada_em) : null)}.</p> : null}
          {erro ? (
            <p className="text-[14px] font-semibold text-atraso" role="alert">
              {erro}
            </p>
          ) : null}
        </div>
      </form>
    </Secao>
  );
}

// ---------------------------------------------------------------- código e histórico

function CodigoDoPro({ codigo }: { codigo: { codigo: string; ate: string } }) {
  return (
    <Secao titulo="Código do Pro" descricao="Para ligar o Pro em outro aparelho da oficina que não entra com a sua conta: Ajustes, Plano, Tenho um código do Pro.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
        <p className="num text-[18px] font-bold tracking-[0.06em]">{formatarCodigo(codigo.codigo)}</p>
        <p className="text-[14px] text-tinta-3">Vale até {formatarData(codigo.ate)}</p>
      </div>
    </Secao>
  );
}

function Historico({ pagamentos }: { pagamentos: LinhaPagamento[] }) {
  if (!pagamentos.length) return null;
  return (
    <Secao titulo="Pagamentos" descricao="Cada mês pago, com a nota fiscal.">
      <ul className="flex flex-col divide-y divide-linha rounded-2xl bg-papel ring-1 ring-linha">
        {pagamentos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
            <div className="min-w-0">
              <p className="font-semibold">
                {formatarMoeda(p.valor)} <span className="font-normal text-tinta-3">· {nomeDoMetodo(p.metodo)}</span>
              </p>
              <p className="text-[13.5px] text-tinta-3">
                {p.situacao === 'pago' && p.pago_em ? `Pago em ${formatarData(dataLocal(p.pago_em))}` : p.vencimento ? `Vence em ${formatarData(p.vencimento)}` : formatarData(dataLocal(p.criado_em))}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Nota p={p} />
              <Chip tom={p.situacao === 'pago' ? 'ok' : p.situacao === 'atrasado' ? 'atraso' : p.situacao === 'pendente' ? 'oleo' : 'neutro'}>{NOMES_SITUACAO_PAGAMENTO[p.situacao]}</Chip>
            </div>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function Nota({ p }: { p: LinhaPagamento }) {
  if (p.nota_url && p.nota_situacao === 'emitida') {
    return (
      <a href={p.nota_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-caneta hover:underline">
        <FileText size={15} aria-hidden="true" /> Nota fiscal{p.nota_numero ? ` nº ${p.nota_numero}` : ''}
      </a>
    );
  }
  if (p.situacao !== 'pago') return null;
  if (p.nota_situacao === 'erro') return <span className="text-[13.5px] text-tinta-3">A nota está com a equipe</span>;
  if (p.nota_situacao === 'cancelada') return <span className="text-[13.5px] text-tinta-3">Nota cancelada</span>;
  return <span className="text-[13.5px] text-tinta-3">Nota a caminho</span>;
}
