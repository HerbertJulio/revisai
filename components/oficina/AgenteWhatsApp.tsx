'use client';

import { MessageCircle, Mic, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { codigoParaWhatsApp, desligarWhatsApp, estadoDoWhatsApp, type EstadoWhatsApp } from '@/app/oficina/acoes-agente';
import { useToast } from '@/components/Toasts';
import { Botao, Secao, classeBotao } from '@/components/ui';
import { formatarTelefone } from '@/lib/formatos';
import { useOficina } from '@/lib/store';

/** Ajustes: ligar o WhatsApp do mecânico ao agente de ordens de serviço. */
export function AgenteWhatsApp() {
  const toast = useToast();
  const aparelhoId = useOficina((s) => s.aparelhoId);
  const garantir = useOficina((s) => s.garantirAparelhoId);
  const oficina = useOficina((s) => s.oficina.nome);
  const [estado, setEstado] = useState<EstadoWhatsApp | null>(null);
  const [codigo, setCodigo] = useState<{ codigo: string; numero: string | null } | null>(null);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    estadoDoWhatsApp(aparelhoId ?? '')
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado({ ligado: false, numero: null, telefones: [] }));
    return () => {
      vivo = false;
    };
  }, [aparelhoId]);

  function gerar() {
    const id = garantir();
    iniciar(async () => {
      try {
        const r = await codigoParaWhatsApp(id, oficina);
        if (!r.ok) return toast({ texto: r.erro, tom: 'erro' });
        setCodigo({ codigo: r.codigo, numero: r.numero });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  function desligar(telefone: string) {
    if (!aparelhoId || !window.confirm(`Desligar o WhatsApp ${formatarTelefone(telefone)} desta oficina?`)) return;
    iniciar(async () => {
      const ok = await desligarWhatsApp(aparelhoId, telefone).catch(() => false);
      if (!ok) return toast({ texto: 'Não deu para desligar agora.', tom: 'erro' });
      setEstado((e) => (e ? { ...e, telefones: e.telefones.filter((t) => t !== telefone) } : e));
      toast({ texto: 'WhatsApp desligado.' });
    });
  }

  const numeroLimpo = codigo?.numero?.replace(/\D/g, '') ?? '';
  return (
    <Secao
      titulo="Agente no WhatsApp"
      descricao="O mecânico manda áudios e fotos do serviço para o número do Revisaí e a IA monta a ordem de serviço e a mensagem para o cliente. Você confere aqui no app antes de registrar."
    >
      <div className="flex flex-col gap-4 rounded-2xl bg-papel px-5 py-5 ring-1 ring-linha">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/oficina/ordem" className={classeBotao('escuro')}>
            <Mic size={17} aria-hidden="true" /> Ordem por voz no app
          </Link>
          <p className="text-[14px] text-tinta-2">Funciona já, direto no celular, sem configurar nada.</p>
        </div>
        {estado == null ? null : !estado.ligado ? (
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
                    <button type="button" className="text-[13.5px] font-semibold text-tinta-3 hover:text-atraso" onClick={() => desligar(t)}>
                      Desligar
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {codigo ? (
              <div className="flex flex-col gap-3 rounded-xl bg-ok-claro px-4 py-4">
                <p className="text-[15px]">
                  No WhatsApp do mecânico, mande este código {codigo.numero ? <>para <strong className="num">{codigo.numero}</strong></> : 'para o número do agente'}. Vale por 15 minutos.
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
