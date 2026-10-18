'use client';

import { LogIn, MessageCircle, Mic, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { codigoParaWhatsApp, desligarWhatsApp, estadoDoWhatsApp, type EstadoWhatsApp } from '@/app/oficina/acoes-agente';
import { useConta } from '@/components/conta/ProvedorConta';
import { useToast } from '@/components/Toasts';
import { Botao, Secao, classeBotao } from '@/components/ui';
import { formatarTelefone } from '@/lib/formatos';
import { useOfertaDoPro, usePlano } from './plano';

/** Ajustes: ligar o WhatsApp do mecânico ao agente de ordens de serviço (Pro, com a conta da oficina). */
export function AgenteWhatsApp() {
  const toast = useToast();
  const { oficina } = useConta();
  const oficinaId = oficina?.id ?? null;
  const [estado, setEstado] = useState<EstadoWhatsApp | null>(null);
  const [codigo, setCodigo] = useState<{ codigo: string; numero: string | null } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const plano = usePlano();
  const abrirPro = useOfertaDoPro();

  useEffect(() => {
    if (!oficinaId) return;
    let vivo = true;
    estadoDoWhatsApp()
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado({ ligado: false, numero: null, telefones: [] }));
    return () => {
      vivo = false;
    };
  }, [oficinaId]);

  function gerar() {
    if (!plano.liberado) return abrirPro('whatsapp');
    iniciar(async () => {
      try {
        const r = await codigoParaWhatsApp();
        if (!r.ok) {
          if (r.semPro) abrirPro('whatsapp');
          else toast({ texto: r.erro, tom: 'erro' });
          return;
        }
        setCodigo({ codigo: r.codigo, numero: r.numero });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  function desligar(telefone: string) {
    if (!window.confirm(`Desligar o WhatsApp ${formatarTelefone(telefone)} desta oficina?`)) return;
    iniciar(async () => {
      const ok = await desligarWhatsApp(telefone).catch(() => false);
      if (!ok) {
        toast({ texto: 'Não deu para desligar agora.', tom: 'erro' });
        return;
      }
      setEstado((e) => (e ? { ...e, telefones: e.telefones.filter((t) => t !== telefone) } : e));
      toast({ texto: 'WhatsApp desligado.' });
    });
  }

  const numeroLimpo = codigo?.numero?.replace(/\D/g, '') ?? '';
  return (
    <Secao
      id="agente"
      titulo="Agente no WhatsApp"
      descricao="O mecânico manda áudios e fotos do serviço para o número do Revisaí e a IA monta a ordem de serviço e a mensagem para o cliente. Você confere aqui no app antes de registrar."
    >
      <div className="flex flex-col gap-4 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/oficina/ordem" className={classeBotao('escuro')}>
            <Mic size={17} aria-hidden="true" /> Ordem por voz no app
          </Link>
          <p className="text-[14px] text-tinta-2">{plano.semConta ? 'Com a conta da oficina, funciona direto no celular.' : 'Funciona já, direto no celular, sem configurar nada.'}</p>
        </div>
        {plano.semConta ? (
          <div className="flex flex-col gap-3 rounded-xl bg-papel-2 px-4 py-3">
            <p className="text-[14px] text-tinta-2">O agente no WhatsApp e a voz com IA usam a conta da oficina. Entre para ligar o WhatsApp do mecânico.</p>
            <Link href="/entrar?para=/oficina/ajustes" className={`${classeBotao('escuro', 'pequeno')} self-start`}>
              <LogIn size={16} aria-hidden="true" /> Entrar
            </Link>
          </div>
        ) : estado == null ? null : !estado.ligado ? (
          <p className="rounded-xl bg-papel-2 px-4 py-3 text-[14px] text-tinta-2">
            O número do agente no WhatsApp está sendo ligado pela equipe do Revisaí. Enquanto isso, use a ordem por voz aqui no app, que faz a mesma coisa.
          </p>
        ) : (
          <>
            {estado.telefones.length ? (
              <ul className="flex flex-col gap-2">
                {estado.telefones.map((t) => (
                  <li key={t} className="flex items-center gap-3 rounded-xl bg-papel-2 px-3 py-2">
                    <Smartphone size={17} className="text-tinta-3" aria-hidden="true" />
                    <span className="num flex-1 font-semibold">{formatarTelefone(t)}</span>
                    <button type="button" className="text-[13.5px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => desligar(t)} disabled={ocupado}>
                      Desligar
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!plano.liberado ? (
              <div className="flex flex-col gap-2 rounded-xl bg-oleo-claro px-4 py-3 text-oleo-tinta">
                <p className="text-[14px]">O agente no WhatsApp é do Pro. {estado.telefones.length ? 'Os números ligados voltam a funcionar quando a oficina estiver no Pro.' : ''}</p>
                <Botao tamanho="pequeno" variante="escuro" className="self-start" onClick={() => abrirPro('whatsapp')}>
                  {plano.podeTestar ? 'Testar o Pro grátis' : 'Conhecer o Pro'}
                </Botao>
              </div>
            ) : codigo ? (
              <div className="flex flex-col gap-3 rounded-xl bg-ok-claro px-4 py-4">
                <p className="text-[15px]">
                  No WhatsApp do mecânico, mande este código {codigo.numero ? <>para <strong className="num">{codigo.numero}</strong></> : 'para o número do agente'}. Vale por 15 minutos e uma vez só.
                </p>
                <p className="largo num text-[34px] font-extrabold tracking-[0.2em]">{codigo.codigo}</p>
                {numeroLimpo ? (
                  <a href={`https://wa.me/${numeroLimpo}?text=${encodeURIComponent(`conectar ${codigo.codigo}`)}`} target="_blank" rel="noopener noreferrer" className={`${classeBotao('whatsapp')} self-start`}>
                    <MessageCircle size={17} aria-hidden="true" /> Abrir no WhatsApp
                  </a>
                ) : null}
              </div>
            ) : (
              <Botao className="self-start" onClick={gerar} disabled={ocupado}>
                <MessageCircle size={17} /> {estado.telefones.length ? 'Ligar outro WhatsApp' : 'Ligar o WhatsApp do mecânico'}
              </Botao>
            )}
          </>
        )}
      </div>
    </Secao>
  );
}
