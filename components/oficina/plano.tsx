'use client';

// O plano da oficina no app: quanto do grátis já foi usado, a folha que apresenta o Pro quando
// um limite chega, a parte Plano dos Ajustes e o relatório de retorno dos avisos.

import { BellRing, KeyRound, MessageCircle, Mic, Star, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from 'react';
import { ativarCodigoPro } from '@/app/oficina/acoes-pro';
import { Folha } from '@/components/Folha';
import { useToast } from '@/components/Toasts';
import { Botao, Chip, Secao, classeBotao, classeEntrada } from '@/components/ui';
import { formatarData, somarDias } from '@/lib/datas';
import { ehExemplo } from '@/lib/exemplo';
import { formatarMoeda, plural, primeiroNome } from '@/lib/formatos';
import { useHoje } from '@/lib/ganchos';
import {
  avisosNoMes,
  formatarCodigo,
  liberado,
  montagensNoMes,
  normalizarCodigo,
  planoAtual,
  podeAvisar,
  podeDitar,
  PRO,
  retornoDosAvisos,
  type PlanoAtual
} from '@/lib/plano';
import { useOficina } from '@/lib/store';
import { linkWhatsApp } from '@/lib/whatsapp';

export interface UsoDoPlano extends PlanoAtual {
  hoje: string;
  liberado: boolean;
  avisos: number;
  montagens: number;
  podeAvisar: boolean;
  podeDitar: boolean;
}

export function usePlano(): UsoDoPlano {
  const estado = useOficina((s) => s.plano);
  const contatos = useOficina((s) => s.contatos);
  const hoje = useHoje();
  return useMemo(() => {
    const atual = planoAtual(estado, hoje);
    // os clientes de exemplo não gastam os avisos do grátis
    const avisos = avisosNoMes(Object.values(contatos).filter((c) => !ehExemplo(c.veiculoId)), hoje);
    const montagens = montagensNoMes(estado, hoje);
    return { ...atual, hoje, liberado: liberado(atual), avisos, montagens, podeAvisar: podeAvisar(atual, avisos), podeDitar: podeDitar(atual, montagens) };
  }, [estado, contatos, hoje]);
}

// ---------------------------------------------------------------- folha do Pro

export type MotivoPro = 'avisos' | 'ordens' | 'retorno' | 'avaliacao' | 'whatsapp' | 'geral';

const Contexto = createContext<(m: MotivoPro) => void>(() => {});

/** Deixa qualquer tela do app abrir a apresentação do Pro. */
export function ProvedorDoPro({ children }: { children: ReactNode }) {
  const [motivo, setMotivo] = useState<MotivoPro | null>(null);
  return (
    <Contexto.Provider value={setMotivo}>
      {children}
      <FolhaDoPro motivo={motivo} aoFechar={() => setMotivo(null)} />
    </Contexto.Provider>
  );
}

export function useOfertaDoPro(): (m: MotivoPro) => void {
  return useContext(Contexto);
}

const TITULOS: Record<MotivoPro, string> = {
  avisos: `Os ${PRO.avisosGratis} avisos grátis deste mês acabaram`,
  ordens: `As ${PRO.ordensGratis} ordens por voz grátis deste mês acabaram`,
  retorno: 'Veja quanto os avisos rendem',
  avaliacao: 'Peça avaliação no Google com um toque',
  whatsapp: 'O agente no WhatsApp é do Pro',
  geral: 'Revisaí Pro'
};

const DESCRICOES: Record<MotivoPro, string> = {
  avisos: 'No plano grátis, a oficina avisa até 20 carros por mês. No Pro, avisa todos os clientes que precisam voltar.',
  ordens: 'No plano grátis, a IA monta 5 ordens por mês. No Pro, o mecânico fala o serviço de cada carro e a ordem sai pronta.',
  retorno: 'O Pro mostra quantos clientes voltaram depois do aviso e quanto esses serviços somaram.',
  avaliacao: 'Depois do serviço, o Pro manda ao cliente o link para avaliar a oficina no Google. Mais avaliação, mais cliente novo.',
  whatsapp: 'O mecânico manda áudio e foto para o número do Revisaí e a ordem chega pronta no app para conferir.',
  geral: 'Para a oficina que avisa todo cliente e quer ver o retorno disso.'
};

const VANTAGENS = [
  { Icone: BellRing, texto: 'Avisos sem limite pelo WhatsApp' },
  { Icone: Mic, texto: 'Ordem por voz e agente no WhatsApp para a oficina toda' },
  { Icone: TrendingUp, texto: 'Relatório de quem voltou depois do aviso e quanto rendeu' },
  { Icone: Star, texto: 'Pedido de avaliação no Google depois do serviço' }
];

function FolhaDoPro({ motivo, aoFechar }: { motivo: MotivoPro | null; aoFechar: () => void }) {
  const plano = usePlano();
  const comecar = useOficina((s) => s.comecarTeste);
  const toast = useToast();

  function testar() {
    comecar(plano.hoje);
    toast({ texto: `Pro liberado até ${formatarData(somarDias(plano.hoje, PRO.diasTeste - 1))}. Bom proveito.` });
    aoFechar();
  }

  return (
    <Folha
      aberta={motivo != null}
      aoFechar={aoFechar}
      titulo={motivo ? TITULOS[motivo] : ''}
      descricao={motivo ? DESCRICOES[motivo] : undefined}
      rodape={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Link href="/oficina/ajustes#plano" onClick={aoFechar} className={classeBotao('fantasma')}>
            <KeyRound size={17} aria-hidden="true" /> Tenho um código
          </Link>
          {plano.podeTestar ? (
            <Botao variante="primario" onClick={testar}>
              Testar 30 dias grátis
            </Botao>
          ) : (
            <Link href="/planos#assinar" onClick={aoFechar} className={classeBotao('primario')}>
              Quero o Pro
            </Link>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2.5">
          {VANTAGENS.map(({ Icone, texto }) => (
            <li key={texto} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-oleo-claro text-oleo-tinta">
                <Icone size={18} aria-hidden="true" />
              </span>
              <span className="text-[15px]">{texto}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-xl bg-papel-2 px-4 py-3">
          <p className="num text-[15px]">
            <span className="text-[22px] font-extrabold">{formatarMoeda(PRO.precoFundador)}</span> por mês para as {PRO.vagasFundador} primeiras oficinas
          </p>
          <p className="text-[13.5px] text-tinta-3">
            Depois, {formatarMoeda(PRO.preco)} por mês. {plano.podeTestar ? 'Teste 30 dias sem pagar nada e sem cartão.' : 'Pagamento por Pix, sem fidelidade.'}
          </p>
        </div>
      </div>
    </Folha>
  );
}

// ---------------------------------------------------------------- lateral do app

/** A linha do plano no pé da lateral. */
export function LinhaDoPlano() {
  const p = usePlano();
  const texto =
    p.tipo === 'pro'
      ? `Pro até ${formatarData(p.ate)}`
      : p.tipo === 'teste'
        ? `Teste do Pro, ${p.diasRestantes === 0 ? 'último dia' : `faltam ${plural(p.diasRestantes ?? 0, 'dia', 'dias')}`}`
        : 'Plano grátis. Conheça o Pro';
  return (
    <Link href="/oficina/ajustes#plano" className="text-[13px] text-tinta-3 hover:text-caneta">
      {texto}
    </Link>
  );
}

// ---------------------------------------------------------------- Ajustes

export function PlanoDaOficina() {
  const p = usePlano();
  const abrirPro = useOfertaDoPro();
  const comecar = useOficina((s) => s.comecarTeste);
  const ativar = useOficina((s) => s.ativarPro);
  const codigoAtual = useOficina((s) => s.plano.codigo);
  const toast = useToast();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [mostrarCodigo, setMostrarCodigo] = useState(false);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const limpo = normalizarCodigo(codigo);
    if (limpo.length !== 16) return setErro('O código tem 16 letras e números.');
    iniciar(async () => {
      try {
        const r = await ativarCodigoPro(limpo);
        if (!r.ok) return setErro(r.erro);
        ativar(r.ate, r.codigo);
        setCodigo('');
        setMostrarCodigo(false);
        toast({ texto: `Pro ativado até ${formatarData(r.ate)}. Obrigado!` });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <Secao id="plano" titulo="Plano" descricao={p.tipo === 'gratis' ? 'O grátis renova todo dia 1º.' : undefined}>
        <div className="flex flex-col gap-4 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[19px] font-extrabold">{p.tipo === 'gratis' ? 'Grátis' : 'Pro'}</p>
                {p.tipo === 'teste' ? <Chip tom="oleo">Teste</Chip> : p.tipo === 'pro' ? <Chip tom="ok">Ativo</Chip> : null}
              </div>
              <p className="mt-0.5 text-[14.5px] text-tinta-2">
                {p.tipo === 'pro'
                  ? `Vale até ${formatarData(p.ate)}${codigoAtual ? `, código terminado em ${codigoAtual.slice(-4)}` : ''}.`
                  : p.tipo === 'teste'
                    ? `O teste vai até ${formatarData(p.ate)}. Para continuar no Pro depois disso, assine e digite o código aqui.`
                    : `${PRO.avisosGratis} avisos e ${PRO.ordensGratis} ordens por voz por mês.`}
              </p>
            </div>
            {p.tipo === 'gratis' ? (
              p.podeTestar ? (
                <Botao
                  variante="primario"
                  onClick={() => {
                    comecar(p.hoje);
                    toast({ texto: `Pro liberado até ${formatarData(somarDias(p.hoje, PRO.diasTeste - 1))}.` });
                  }}
                >
                  Testar o Pro 30 dias grátis
                </Botao>
              ) : (
                <Botao variante="primario" onClick={() => abrirPro('geral')}>
                  Conhecer o Pro
                </Botao>
              )
            ) : p.tipo === 'teste' ? (
              <Link href="/planos#assinar" className={classeBotao('primario')}>
                Assinar o Pro
              </Link>
            ) : null}
          </div>

          {p.tipo === 'gratis' ? (
            <div className="grid gap-4 border-t border-linha pt-4 sm:grid-cols-2">
              <Uso rotulo="Avisos neste mês" usado={p.avisos} total={PRO.avisosGratis} />
              <Uso rotulo="Ordens por voz neste mês" usado={p.montagens} total={PRO.ordensGratis} />
            </div>
          ) : null}

          <div className="border-t border-linha pt-4">
            {mostrarCodigo || p.tipo === 'teste' ? (
              <form onSubmit={enviar} className="flex flex-col gap-2">
                <label htmlFor="pro-codigo" className="text-[14px] font-semibold">
                  Código do Pro
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="pro-codigo"
                    className={`${classeEntrada} num max-w-[280px] flex-1 tracking-[0.06em] uppercase`}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={24}
                    aria-describedby="pro-codigo-dica"
                  />
                  <Botao type="submit" variante="escuro" disabled={enviando}>
                    {enviando ? 'Conferindo…' : 'Ativar'}
                  </Botao>
                </div>
                <p id="pro-codigo-dica" className="text-[13px] text-tinta-3">
                  A equipe do Revisaí manda o código pelo WhatsApp depois do pagamento. Vale em até 3 aparelhos da oficina.
                </p>
                {erro ? (
                  <p className="text-[14px] font-semibold text-atraso" role="alert">
                    {erro}
                  </p>
                ) : null}
              </form>
            ) : (
              <button type="button" onClick={() => setMostrarCodigo(true)} className="inline-flex items-center gap-2 text-[14.5px] font-semibold text-caneta hover:underline">
                <KeyRound size={16} aria-hidden="true" /> {p.tipo === 'pro' ? 'Digitar um código novo (renovação)' : 'Tenho um código do Pro'}
              </button>
            )}
          </div>
        </div>
    </Secao>
  );
}

function Uso({ rotulo, usado, total }: { rotulo: string; usado: number; total: number }) {
  const fracao = Math.min(1, usado / total);
  const acabou = usado >= total;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold">{rotulo}</p>
        <p className={`num text-[14px] font-bold ${acabou ? 'text-atraso' : ''}`}>
          {Math.min(usado, total)} de {total}
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-papel-2" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(usado, total)} aria-label={rotulo}>
        <div className={`h-full rounded-full ${acabou ? 'bg-atraso' : fracao >= 0.75 ? 'bg-oleo' : 'bg-ok'}`} style={{ width: `${Math.max(2, fracao * 100)}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- retorno dos avisos

/** Dos carros avisados nos últimos 90 dias, quantos voltaram e quanto isso rendeu. */
export function RetornoDosAvisos() {
  const p = usePlano();
  const abrirPro = useOfertaDoPro();
  const contatos = useOficina((s) => s.contatos);
  const atendimentos = useOficina((s) => s.atendimentos);
  const r = useMemo(() => retornoDosAvisos(Object.values(contatos), Object.values(atendimentos), p.hoje), [contatos, atendimentos, p.hoje]);
  if (r.avisados < 3) return null;
  const taxa = Math.round((r.voltaram / r.avisados) * 100);

  return (
    <section className="rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha" aria-labelledby="t-retorno">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-retorno" className="text-[17px]">
          Retorno dos avisos
        </h2>
        <p className="text-[13px] text-tinta-3">últimos 90 dias</p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-[13px] text-tinta-3">Avisados</dt>
          <dd className="largo num text-[24px] font-extrabold">{r.avisados}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-tinta-3">Voltaram</dt>
          <dd className="largo num text-[24px] font-extrabold">
            {r.voltaram}
            {p.liberado ? <span className="ml-1 text-[14px] font-bold text-ok">{taxa}%</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-tinta-3">Rendeu</dt>
          <dd>
            {p.liberado ? (
              <span className="largo num text-[24px] font-extrabold">{r.valor > 0 ? formatarMoeda(r.valor) : 'sem valor'}</span>
            ) : (
              <button type="button" onClick={() => abrirPro('retorno')} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-oleo-claro px-3 py-1 text-[13.5px] font-bold text-oleo-tinta hover:brightness-95">
                Ver no Pro
              </button>
            )}
          </dd>
        </div>
      </dl>
      {p.liberado && r.valor === 0 && r.voltaram > 0 ? <p className="mt-2 text-[13px] text-tinta-3">Anote o valor ao registrar o serviço para ver quanto os avisos rendem.</p> : null}
    </section>
  );
}

// ---------------------------------------------------------------- avaliação no Google

/** Depois do serviço, manda ao cliente o link para avaliar a oficina no Google (Pro). */
export function BotaoAvaliacao({ telefone, nomeCliente, carro, tamanho = 'grande' }: { telefone: string | null | undefined; nomeCliente: string; carro: string; tamanho?: 'normal' | 'grande' }) {
  const p = usePlano();
  const abrirPro = useOfertaDoPro();
  const oficina = useOficina((s) => s.oficina);
  const link = oficina.linkAvaliacao?.trim();
  if (!telefone) return null;

  if (!p.liberado) {
    return (
      <Botao tamanho={tamanho} onClick={() => abrirPro('avaliacao')}>
        <Star size={18} /> Pedir avaliação <Chip tom="oleo">Pro</Chip>
      </Botao>
    );
  }
  if (!link) {
    return (
      <Link href="/oficina/ajustes#oficina" className={classeBotao('secundario', tamanho)}>
        <Star size={18} aria-hidden="true" /> Configurar pedido de avaliação
      </Link>
    );
  }
  const nome = primeiroNome(nomeCliente);
  const texto = `Oi${nome ? `, ${nome}` : ''}! Obrigado por confiar o ${carro} à ${oficina.nome || 'nossa oficina'}. Se puder, deixe sua avaliação no Google. Leva menos de um minuto e ajuda muito: ${link}`;
  const zap = linkWhatsApp(telefone, texto);
  if (!zap) return null;
  return (
    <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', tamanho)}>
      <MessageCircle size={18} aria-hidden="true" /> Pedir avaliação no Google
    </a>
  );
}

// ---------------------------------------------------------------- aviso de limite

/** Faixa no topo dos avisos quando o grátis está acabando ou o teste está no fim. */
export function AvisoDeLimite() {
  const p = usePlano();
  const abrirPro = useOfertaDoPro();
  if (p.tipo === 'teste' && (p.diasRestantes ?? 99) <= 5) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta">
        <p>{p.diasRestantes === 0 ? 'Hoje é o último dia do teste do Pro.' : `O teste do Pro acaba em ${plural(p.diasRestantes ?? 0, 'dia', 'dias')}.`} Depois volta para o grátis, sem perder nada.</p>
        <Link href="/planos#assinar" className={classeBotao('escuro', 'pequeno')}>
          Assinar o Pro
        </Link>
      </div>
    );
  }
  if (p.liberado) return null;
  const restam = PRO.avisosGratis - p.avisos;
  if (restam > 5) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-oleo-claro px-4 py-3 text-[14.5px] text-oleo-tinta">
      <p>{restam > 0 ? `${restam === 1 ? 'Resta 1 aviso grátis' : `Restam ${restam} avisos grátis`} neste mês.` : 'Os avisos grátis deste mês acabaram.'} No Pro, os avisos não têm limite.</p>
      <Botao tamanho="pequeno" variante="escuro" onClick={() => abrirPro('avisos')}>
        {p.podeTestar ? 'Testar o Pro grátis' : 'Conhecer o Pro'}
      </Botao>
    </div>
  );
}
