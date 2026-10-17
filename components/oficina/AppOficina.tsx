'use client';

import { Bell, ClipboardList, LayoutGrid, Mic, Package, Plus, Settings, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { MenuDaConta } from '@/components/conta/MenuDaConta';
import { ProvedorConta, useConta } from '@/components/conta/ProvedorConta';
import { Logo } from '@/components/marca';
import { Toasts } from '@/components/Toasts';
import { classeBotao } from '@/components/ui';
import { plural } from '@/lib/formatos';
import type { Conta } from '@/lib/conta-dados';
import { useGrupos, useHidratado } from '@/lib/ganchos';
import { notificar, registrarServiceWorker } from '@/lib/notificacao';
import { armazenamentoComProblema, pedirArmazenamentoPersistente, useOficina } from '@/lib/store';
import type { ConfigPublica } from '@/lib/supabase-navegador';
import { ProvedorCatalogo } from './catalogo';
import { useEnvioDeDemanda } from './demanda';
import { Inicio } from './Inicio';
import { ProvedorDeAndamento, useAndamento } from './loja/andamento';
import { LinhaDoPlano, ProvedorDoPro } from './plano';
import { IndicadorDaSincronia, ProvedorDaSincronia } from './sincronia/ProvedorDaSincronia';

const ITENS = [
  { href: '/oficina', rotulo: 'Avisos', lateral: 'Avisos', Icone: Bell },
  { href: '/oficina/ordens', rotulo: 'Ordens', lateral: 'Orçamentos e OS', Icone: ClipboardList },
  { href: '/oficina/nova', rotulo: 'Nova', lateral: 'Nova', Icone: Plus, destaque: true },
  { href: '/oficina/estoque', rotulo: 'Estoque', lateral: 'Estoque', Icone: Package },
  { href: '/oficina/loja', rotulo: 'Loja', lateral: 'Loja', Icone: Store },
  { href: '/oficina/clientes', rotulo: 'Clientes', lateral: 'Clientes', Icone: Users, soNaLateral: true },
  { href: '/oficina/ordem', rotulo: 'Ordem por voz', lateral: 'Ordem por voz', Icone: Mic, soNaLateral: true },
  { href: '/oficina/mais', rotulo: 'Mais', lateral: 'Financeiro, agenda e mais', Icone: LayoutGrid, soNaLateral: true },
  { href: '/oficina/ajustes', rotulo: 'Ajustes', lateral: 'Ajustes', Icone: Settings, soNaLateral: true }
] as const;

export function AppOficina({ children, conta, oficinaId, config }: { children: ReactNode; conta: Conta | null; oficinaId: string | null; config: ConfigPublica | null }) {
  return (
    <ProvedorConta conta={conta} oficinaId={oficinaId} config={config}>
      <ProvedorDaSincronia>
        <Conteudo>{children}</Conteudo>
      </ProvedorDaSincronia>
    </ProvedorConta>
  );
}

function Conteudo({ children }: { children: ReactNode }) {
  const hidratado = useHidratado();
  const { conta, oficina } = useConta();
  const configurado = useOficina((s) => s.configurado);
  const contaOficinaId = useOficina((s) => s.contaOficinaId);

  if (!hidratado) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <Logo className="animate-pulse opacity-60" />
      </div>
    );
  }

  // entrou, mas ainda não tem oficina: cria ou aceita o convite na conta
  if (conta && !oficina) return <SemOficina />;
  // os dados deste aparelho são de uma conta, e a sessão terminou: não mostra nada até entrar de novo
  if (!conta && contaOficinaId) return <SessaoTerminou />;
  // com a conta, espera ligar os dados do aparelho à oficina
  if (oficina && contaOficinaId !== oficina.id) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <Logo className="animate-pulse opacity-60" />
      </div>
    );
  }

  return (
    <Toasts>
      <ProvedorCatalogo>
        {configurado ? (
          <ProvedorDoPro>
            <ProvedorDeAndamento>
              <Moldura>{children}</Moldura>
            </ProvedorDeAndamento>
          </ProvedorDoPro>
        ) : (
          <Inicio />
        )}
      </ProvedorCatalogo>
    </Toasts>
  );
}

function SemOficina() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-md flex-col items-start gap-4">
        <Logo />
        <h1 className="largo text-[26px]">Falta a oficina</h1>
        <p className="text-tinta-2">Sua conta ainda não está em nenhuma oficina. Crie a sua, ou peça ao dono da oficina para convidar o seu e-mail.</p>
        <Link href="/conta?ver=1" className={classeBotao('escuro', 'grande')}>
          Abrir a conta
        </Link>
      </div>
    </main>
  );
}

function SessaoTerminou() {
  const router = useRouter();
  const { banco } = useConta();
  const pendentes = useOficina((s) => Object.keys(s.sinc.pendentes).length);
  // a conta não veio: a sessão acabou, ou o servidor não conseguiu abrir a conta agora?
  const [comSessao, setComSessao] = useState<boolean | null>(null);
  useEffect(() => {
    const sb = banco();
    if (!sb) return setComSessao(false);
    let vivo = true;
    sb.auth
      .getSession()
      .then(({ data }) => vivo && setComSessao(!!data.session))
      .catch(() => vivo && setComSessao(false));
    return () => {
      vivo = false;
    };
  }, [banco]);

  if (comSessao === null)
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <Logo className="animate-pulse opacity-60" />
      </div>
    );

  if (comSessao)
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="flex max-w-md flex-col items-start gap-4">
          <Logo />
          <h1 className="largo text-[26px]">Não deu para abrir a conta</h1>
          <p className="text-tinta-2">
            O servidor não respondeu agora. Os dados continuam guardados neste aparelho{pendentes ? `, com ${plural(pendentes, 'mudança', 'mudanças')} esperando para subir` : ''}.
          </p>
          <button type="button" className={classeBotao('escuro', 'grande')} onClick={() => router.refresh()}>
            Tentar de novo
          </button>
        </div>
      </main>
    );

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-md flex-col items-start gap-4">
        <Logo />
        <h1 className="largo text-[26px]">Entre de novo</h1>
        <p className="text-tinta-2">
          {pendentes
            ? `Sua sessão terminou. ${plural(pendentes, 'mudança deste aparelho ainda não subiu', 'mudanças deste aparelho ainda não subiram')}: entre com a mesma conta e elas sobem para a nuvem.`
            : 'Sua sessão terminou. Os dados da oficina estão guardados na nuvem: entre para continuar de onde parou.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/entrar?para=/oficina&motivo=sessao" className={classeBotao('escuro', 'grande')}>
            Entrar
          </Link>
          <button
            type="button"
            className={classeBotao('fantasma', 'grande')}
            onClick={() => {
              const texto = pendentes
                ? `Usar sem conta apaga deste aparelho a cópia dos dados da oficina, e ${plural(pendentes, 'mudança que não subiu se perde', 'mudanças que não subiram se perdem')}. Continuar?`
                : 'Usar sem conta apaga deste aparelho a cópia dos dados da oficina (eles continuam na nuvem). Continuar?';
              if (confirm(texto)) useOficina.getState().esquecerConta();
            }}
          >
            Usar sem conta
          </button>
        </div>
      </div>
    </main>
  );
}

function ativo(caminho: string, href: string) {
  if (href === '/oficina') return caminho === '/oficina';
  // /oficina/ordem (voz) e /oficina/ordens são telas diferentes
  return caminho === href || caminho.startsWith(`${href}/`);
}

function Moldura({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  const nomeOficina = useOficina((s) => s.oficina.nome);
  const carrinho = useOficina((s) => s.carrinho.reduce((n, c) => n + c.quantidade, 0));
  const ordensAbertas = useOficina((s) => Object.values(s.documentos).filter((d) => (d.tipo === 'ordem' && d.situacao === 'aberta') || (d.tipo === 'orcamento' && d.situacao === 'enviado')).length);
  const { resumo, hoje } = useGrupos();
  const paraAvisar = resumo.avisar;
  // propostas para escolher e entregas a caminho chamam mais atenção que o carrinho
  const { pendencias } = useAndamento();
  const { oficina: daConta } = useConta();

  useNotificacaoDoDia(paraAvisar, resumo.atrasados, resumo.agendadosHoje, hoje);
  useEnvioDeDemanda();

  useEffect(() => {
    void pedirArmazenamentoPersistente();
    void registrarServiceWorker();
  }, []);

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* lateral no computador */}
      <aside className="nao-imprimir fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-linha bg-papel px-4 py-5 lg:flex">
        <Link href="/oficina" className="px-2">
          <Logo />
        </Link>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Seções">
          {ITENS.map(({ href, lateral, Icone, ...resto }) => {
            const sel = ativo(caminho, href);
            if ('destaque' in resto)
              return (
                <Link key={href} href={href} aria-current={sel ? 'page' : undefined} className="my-2 flex items-center gap-3 rounded-[12px] bg-oleo px-3 py-2.5 text-[#1b1f22] shadow-etiqueta hover:brightness-[0.97]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#1b1f22]/10">
                    <Icone size={20} aria-hidden="true" />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="font-bold">{lateral}</span>
                    <span className="text-[13px] font-semibold opacity-75">OS ou orçamento</span>
                  </span>
                </Link>
              );
            return (
              <Link
                key={href}
                href={href}
                aria-current={sel ? 'page' : undefined}
                className={`flex h-11 items-center gap-3 rounded-[10px] px-3 font-semibold transition-colors ${sel ? 'bg-tinta text-papel' : 'text-tinta-2 hover:bg-papel-2 hover:text-tinta'}`}
              >
                <Icone size={19} aria-hidden="true" />
                <span className="flex-1">{lateral}</span>
                {href === '/oficina' && paraAvisar > 0 ? <Contador n={paraAvisar} invertido={sel} /> : null}
                {href === '/oficina/ordens' && ordensAbertas > 0 ? <Contador n={ordensAbertas} invertido={sel} neutro /> : null}
                {href === '/oficina/loja' && pendencias > 0 ? (
                  <Contador n={pendencias} invertido={sel} />
                ) : href === '/oficina/loja' && carrinho > 0 ? (
                  <Contador n={carrinho} invertido={sel} neutro />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-linha px-2 pt-4">
          <p className="truncate font-bold">{nomeOficina || 'Minha oficina'}</p>
          <LinhaDoPlano />
          <div className="mt-1">
            <IndicadorDaSincronia />
          </div>
          <MenuDaConta />
        </div>
      </aside>

      {/* topo no celular */}
      <header className="nao-imprimir sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-linha bg-fundo/90 px-4 backdrop-blur lg:hidden">
        <Link href="/oficina" aria-label="Revisaí, avisos">
          <Logo tamanho={26} />
        </Link>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-tinta-2">{nomeOficina}</span>
          {caminho.startsWith('/oficina/ordem') && !caminho.startsWith('/oficina/ordens') ? null : (
            <Link href="/oficina/ordem" aria-label="Ordem por voz" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-papel-2 text-tinta hover:bg-linha">
              <Mic size={19} aria-hidden="true" />
            </Link>
          )}
          <Link href="/oficina/clientes" aria-label="Clientes" aria-current={caminho.startsWith('/oficina/clientes') ? 'page' : undefined} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-tinta-2 hover:bg-papel-2 aria-[current=page]:bg-tinta aria-[current=page]:text-papel">
            <Users size={19} aria-hidden="true" />
          </Link>
          <Link href="/oficina/mais" aria-label="Financeiro, agenda e mais" aria-current={caminho.startsWith('/oficina/mais') ? 'page' : undefined} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-tinta-2 hover:bg-papel-2 aria-[current=page]:bg-tinta aria-[current=page]:text-papel">
            <LayoutGrid size={19} aria-hidden="true" />
          </Link>
          <Link href="/oficina/ajustes" aria-label="Ajustes" aria-current={caminho.startsWith('/oficina/ajustes') ? 'page' : undefined} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-tinta-2 hover:bg-papel-2 aria-[current=page]:bg-tinta aria-[current=page]:text-papel">
            <Settings size={19} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main
        className={`mx-auto w-full px-4 pt-5 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16 ${caminho.startsWith('/oficina/loja') ? 'max-w-7xl' : 'max-w-5xl'}`}
      >
        <div className="mb-3 flex items-center gap-3 lg:hidden">
          <MenuDaConta compacto />
          <div className="ml-auto">
            <IndicadorDaSincronia compacto />
          </div>
        </div>
        {armazenamentoComProblema() ? (
          <p className="mb-5 rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
            O navegador não deixou abrir os dados salvos neste aparelho. Feche o Revisaí e abra de novo antes de cadastrar algo. Se continuar, restaure um backup em Ajustes.
          </p>
        ) : null}
        {daConta && !daConta.ativa ? (
          <p className="mb-5 rounded-xl bg-atraso-claro px-4 py-3 text-[14px] text-atraso" role="alert">
            A exclusão desta oficina foi pedida, e nada do que você mudar agora vai para a conta.{' '}
            <Link href="/oficina/ajustes#apagar-oficina" className="font-semibold underline">
              Ver ou cancelar a exclusão
            </Link>
          </p>
        ) : null}
        {children}
      </main>

      {/* abas no celular */}
      <nav
        className="nao-imprimir fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-linha bg-papel pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Seções"
      >
        {ITENS.filter((i) => !('soNaLateral' in i)).map(({ href, rotulo, Icone, ...resto }) => {
          const sel = ativo(caminho, href);
          const destaque = 'destaque' in resto;
          return (
            <Link
              key={href}
              href={href}
              aria-current={sel ? 'page' : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold ${sel ? 'text-tinta' : 'text-tinta-3'}`}
            >
              {destaque ? (
                <span className="-mt-5 grid h-12 w-12 place-items-center rounded-2xl bg-oleo text-[#1b1f22] shadow-etiqueta ring-4 ring-papel">
                  <Icone size={24} aria-hidden="true" />
                </span>
              ) : (
                <span className="relative">
                  <Icone size={22} aria-hidden="true" strokeWidth={sel ? 2.4 : 2} />
                  {href === '/oficina' && paraAvisar > 0 ? <Contador n={paraAvisar} flutuante /> : null}
                  {href === '/oficina/ordens' && ordensAbertas > 0 ? <Contador n={ordensAbertas} flutuante neutro /> : null}
                  {href === '/oficina/loja' && pendencias > 0 ? (
                    <Contador n={pendencias} flutuante />
                  ) : href === '/oficina/loja' && carrinho > 0 ? (
                    <Contador n={carrinho} flutuante neutro />
                  ) : null}
                </span>
              )}
              <span>{rotulo}</span>
              {sel && !destaque ? <span className="absolute top-0 h-[3px] w-8 rounded-b bg-oleo" /> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Contador({ n, invertido = false, flutuante = false, neutro = false }: { n: number; invertido?: boolean; flutuante?: boolean; neutro?: boolean }) {
  const cor = neutro ? (invertido ? 'bg-papel text-tinta' : 'bg-tinta text-papel') : 'bg-oleo text-[#1b1f22]';
  return (
    <span
      className={`num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11.5px] font-bold ${cor} ${flutuante ? 'absolute -top-1.5 -right-3 ring-2 ring-papel' : ''}`}
      aria-label={`${n}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Ao abrir o app, avisa (uma vez por dia) quantos clientes chamar; mostra o número na aba e no ícone. */
function useNotificacaoDoDia(avisar: number, atrasados: number, agendadosHoje: number, hoje: string) {
  useEffect(() => {
    document.title = avisar > 0 ? `(${avisar}) Avisos | Revisaí` : 'Avisos | Revisaí';
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (avisar > 0) void nav.setAppBadge?.(avisar).catch(() => {});
      else void nav.clearAppBadge?.().catch(() => {});
    } catch {}
  }, [avisar]);

  useEffect(() => {
    if (avisar === 0 && agendadosHoje === 0) return;
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (localStorage.getItem('revisai:notificado') === hoje) return;
    } catch {
      return;
    }
    const partes: string[] = [];
    if (avisar > 0) partes.push(`${avisar} ${avisar === 1 ? 'cliente para avisar' : 'clientes para avisar'}`);
    if (atrasados > 0) partes.push(`${atrasados} com serviço atrasado`);
    if (agendadosHoje > 0) partes.push(`${agendadosHoje} ${agendadosHoje === 1 ? 'agendado para hoje' : 'agendados para hoje'}`);
    void notificar('Revisaí', `Hoje: ${partes.join(', ')}.`).then((ok) => {
      if (!ok) return;
      try {
        localStorage.setItem('revisai:notificado', hoje);
      } catch {}
    });
  }, [avisar, atrasados, agendadosHoje, hoje]);
}
