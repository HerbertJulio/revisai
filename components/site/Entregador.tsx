'use client';

// A página do entregador: aberta no celular, manda a posição para a oficina acompanhar no mapa e avisa
// quando entregou. O navegador só manda a posição com a página aberta e a tela ligada.

import { Check, MapPin, MessageCircle, Navigation, Package } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { avisarEntregue, enviarPosicao } from '@/app/entrega/acoes';
import { Botao, classeBotao } from '@/components/ui';
import { deveMandar, haQuantoTempo, linkDoCaminho } from '@/lib/entregas-dados';
import { formatarTelefone } from '@/lib/formatos';
import { linkWhatsApp } from '@/lib/whatsapp';
import type { DadosDaEntrega } from '@/lib/entregas';

type Estado = 'parado' | 'pedindo' | 'mandando' | 'negado' | 'sem-gps' | 'entregue' | 'encerrado';

export function Entregador({ token, dados }: { token: string; dados: DadosDaEntrega }) {
  const [estado, setEstado] = useState<Estado>('parado');
  const [ultima, setUltima] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [, setRelogio] = useState(0);
  const [entregando, iniciar] = useTransition();
  const vigia = useRef<number | null>(null);
  const ultimoEnvio = useRef<{ t: number; lat: number; lng: number } | null>(null);
  // a última posição do GPS: o celular pode parar de avisar quando o entregador para, e ela ainda precisa sair
  const ultimaPosicao = useRef<{ t: number; lat: number; lng: number; precisao: number | null } | null>(null);
  const trava = useRef<{ release(): Promise<void> } | null>(null);
  const endereco = [dados.endereco, [dados.cidade, dados.uf].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const zap = linkWhatsApp(dados.whatsapp, `Olá! Sou da entrega da ${dados.loja}, com o pedido ${dados.codigo}.`);

  async function travarTela() {
    try {
      const n = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
      trava.current = (await n.wakeLock?.request('screen')) ?? null;
    } catch {}
  }

  function parar() {
    if (vigia.current != null) navigator.geolocation?.clearWatch(vigia.current);
    vigia.current = null;
    void trava.current?.release().catch(() => {});
    trava.current = null;
  }

  async function mandar() {
    const pos = ultimaPosicao.current;
    // posição velha (GPS perdido) não sai como se fosse de agora
    if (!pos || Date.now() - pos.t > 90_000) return;
    const agora = { t: Date.now(), lat: pos.lat, lng: pos.lng };
    if (!deveMandar(ultimoEnvio.current, agora)) return;
    ultimoEnvio.current = agora;
    try {
      const r = await enviarPosicao(token, { lat: agora.lat, lng: agora.lng, precisao: pos.precisao });
      if (r.ok) {
        if (r.guardada) setUltima(agora.t);
        setErro(null);
      } else if (/não vale/.test(r.erro)) {
        // a loja marcou a entrega ou gerou um link novo: para de mandar
        parar();
        setEstado('encerrado');
      } else setErro(r.erro);
    } catch {
      setErro('Sem internet agora. A posição volta a ser mandada quando a conexão voltar.');
      ultimoEnvio.current = null;
    }
  }

  function comecar() {
    setErro(null);
    if (!('geolocation' in navigator)) return setEstado('sem-gps');
    setEstado('pedindo');
    parar();
    vigia.current = navigator.geolocation.watchPosition(
      (pos) => {
        ultimaPosicao.current = { t: Date.now(), lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null };
        setEstado('mandando');
        void mandar();
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setEstado('negado');
        else setErro('Não deu para achar a posição. Confira se a localização do celular está ligada.');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
    void travarTela();
  }

  function entreguei() {
    iniciar(async () => {
      try {
        const r = await avisarEntregue(token);
        if (!r.ok) {
          if (/não vale/.test(r.erro)) {
            parar();
            setEstado('encerrado');
          } else setErro(r.erro);
          return;
        }
        parar();
        setEstado('entregue');
      } catch {
        setErro('Sem internet agora. Tente de novo em instantes.');
      }
    });
  }

  // a tela pode ter apagado: ao voltar, segura a tela ligada de novo
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && vigia.current != null) void travarTela();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    const t = setInterval(() => setRelogio((n) => n + 1), 10_000);
    // manda a última posição quando der a hora, mesmo sem aviso novo do GPS
    const envio = setInterval(() => {
      if (vigia.current != null) void mandar();
    }, 5_000);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      clearInterval(t);
      clearInterval(envio);
      parar();
    };
  }, []);

  if (estado === 'entregue')
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ok-claro text-ok">
          <Check size={30} aria-hidden="true" />
        </span>
        <h1 className="largo text-[28px] leading-tight">Entrega registrada</h1>
        <p className="text-tinta-2">
          A {dados.oficina} e a {dados.loja} já veem o pedido {dados.codigo} como entregue. A localização parou de ser mandada. Obrigado!
        </p>
      </div>
    );

  if (estado === 'encerrado')
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="largo text-[28px] leading-tight">Este link não vale mais</h1>
        <p className="text-tinta-2">
          A {dados.loja} marcou o pedido {dados.codigo} como entregue ou mandou um link novo. A localização parou de ser mandada. Se ainda está com o pedido, fale com a loja.
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-[14px] text-tinta-3">Entrega da {dados.loja}</p>
        <h1 className="largo text-[30px] leading-tight">
          Pedido <span className="num tracking-wider">{dados.codigo}</span>
        </h1>
        {dados.previsao ? <p className="text-tinta-2">Combinado para chegar {dados.previsao}.</p> : null}
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha" aria-label="Para onde levar">
        <p className="flex items-start gap-2">
          <MapPin size={19} className="mt-0.5 shrink-0 text-tinta-3" aria-hidden="true" />
          <span>
            <span className="block font-bold">{dados.oficina}</span>
            <span className="block text-[15px] text-tinta-2">{endereco || 'Endereço não informado. Chame a oficina no WhatsApp.'}</span>
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {endereco ? (
            <a href={linkDoCaminho(endereco)} target="_blank" rel="noopener noreferrer" className={classeBotao('secundario', 'pequeno')}>
              <Navigation size={15} aria-hidden="true" /> Abrir o caminho
            </a>
          ) : null}
          {zap ? (
            <a href={zap} target="_blank" rel="noopener noreferrer" className={classeBotao('whatsapp', 'pequeno')}>
              <MessageCircle size={15} aria-hidden="true" /> {formatarTelefone(dados.whatsapp)}
            </a>
          ) : null}
        </div>
      </section>

      {dados.itens.length ? (
        <section className="flex flex-col gap-1.5" aria-label="O que levar">
          <p className="flex items-center gap-2 font-bold">
            <Package size={17} aria-hidden="true" /> O que levar
          </p>
          <ul className="flex flex-col gap-1 rounded-xl bg-papel-2 px-3 py-2.5 text-[15px]">
            {dados.itens.map((i, n) => (
              <li key={n}>
                <span className="num font-semibold">{i.quantidade}x</span> {i.nome}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-live="polite">
        {estado === 'parado' || estado === 'pedindo' ? (
          <>
            <Botao variante="primario" tamanho="grande" onClick={comecar} className="w-full">
              <Navigation size={19} aria-hidden="true" /> {estado === 'pedindo' ? 'Esperando a localização…' : 'Começar a entrega'}
            </Botao>
            <p className="text-[14px] text-tinta-3">A oficina acompanha no mapa enquanto esta página estiver aberta. Ninguém vê a sua posição depois que a entrega termina.</p>
          </>
        ) : estado === 'mandando' ? (
          <div className="flex items-start gap-3 rounded-2xl bg-ok-claro px-4 py-3.5 text-ok">
            <span className="relative mt-1.5 flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-ok" />
            </span>
            <p className="text-[15px]">
              <span className="font-semibold">Mandando a sua posição para a oficina.</span>
              <span className="block text-[14px]">
                {ultima ? `Posição mandada ${haQuantoTempo(new Date(ultima).toISOString(), Date.now())}. ` : ''}Deixe esta página aberta e a tela ligada até entregar.
              </span>
            </p>
          </div>
        ) : estado === 'negado' ? (
          <div className="flex flex-col items-start gap-2 rounded-2xl bg-atraso-claro px-4 py-3.5 text-atraso">
            <p className="text-[15px]">A localização foi bloqueada. Libere a localização para este site nas configurações do navegador e toque de novo.</p>
            <Botao tamanho="pequeno" variante="escuro" onClick={comecar}>
              Tentar de novo
            </Botao>
          </div>
        ) : (
          <p className="rounded-2xl bg-papel-2 px-4 py-3.5 text-[15px] text-tinta-2">Este celular não passa a localização pelo navegador. Dá para entregar normalmente e marcar quando terminar.</p>
        )}

        {erro ? (
          <p className="text-[14px] text-atraso" role="alert">
            {erro}
          </p>
        ) : null}

        {confirmar ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha">
            <p className="font-semibold">Entregou o pedido {dados.codigo} para a {dados.oficina}?</p>
            <div className="flex gap-2">
              <Botao variante="escuro" onClick={entreguei} disabled={entregando} className="flex-1">
                <Check size={17} aria-hidden="true" /> {entregando ? 'Registrando…' : 'Sim, entreguei'}
              </Botao>
              <Botao variante="fantasma" onClick={() => setConfirmar(false)}>
                Ainda não
              </Botao>
            </div>
          </div>
        ) : (
          <Botao variante="escuro" tamanho="grande" onClick={() => setConfirmar(true)} className="w-full">
            <Check size={19} aria-hidden="true" /> Entreguei
          </Botao>
        )}
      </section>
    </div>
  );
}
