'use client';

import { BellOff, BellRing, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alternar, Botao } from '@/components/ui';
import { TIPOS_AVISO, type TipoAviso } from '@/lib/avisos/mensagens';
import { desligarPush, estadoDoPush, ligarPush, precisaInstalarParaPush, type EstadoPush } from '@/lib/notificacao';

// Os avisos com o app fechado: ligar neste aparelho (Web Push), escolher os canais (push,
// e-mail, WhatsApp da empresa) e quais tipos de aviso chegam. Fala só com /api/push e
// /api/avisos/preferencias; serve para a oficina e para a loja (pela prop `para`).

interface Preferencias {
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  desligados: TipoAviso[];
}

const PADRAO: Preferencias = { push: true, email: true, whatsapp: true, desligados: [] };

export function AtivarAvisos({ para }: { para: 'oficina' | 'loja' }) {
  const [estado, setEstado] = useState<EstadoPush | 'carregando'>('carregando');
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const instalar = typeof window !== 'undefined' && precisaInstalarParaPush();

  useEffect(() => {
    void estadoDoPush().then(setEstado);
    void fetch('/api/avisos/preferencias', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { preferencias?: Preferencias } | null) => setPrefs(j?.preferencias ?? PADRAO))
      .catch(() => setPrefs(PADRAO));
  }, []);

  const salvar = useCallback(async (novas: Preferencias) => {
    setPrefs(novas);
    const r = await fetch('/api/avisos/preferencias', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novas) }).catch(() => null);
    if (!r?.ok) setMensagem({ tom: 'erro', texto: 'Não deu para salvar a preferência. Tente de novo.' });
  }, []);

  async function ligar() {
    setOcupado(true);
    setMensagem(null);
    const r = await ligarPush();
    setOcupado(false);
    setEstado(await estadoDoPush());
    setMensagem(r.ok ? { tom: 'ok', texto: 'Avisos ligados neste aparelho.' } : { tom: 'erro', texto: r.erro });
  }

  async function desligar() {
    setOcupado(true);
    await desligarPush();
    setOcupado(false);
    setEstado(await estadoDoPush());
    setMensagem({ tom: 'ok', texto: 'Este aparelho não recebe mais avisos.' });
  }

  async function testar() {
    setOcupado(true);
    setMensagem(null);
    const r = await fetch('/api/push/teste', { method: 'POST' }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { ok?: boolean; erro?: string } | undefined;
    setOcupado(false);
    setMensagem(j?.ok ? { tom: 'ok', texto: 'Aviso de teste enviado. Ele chega em alguns segundos.' } : { tom: 'erro', texto: j?.erro ?? 'O teste não chegou. Desligue e ligue os avisos de novo.' });
  }

  const tipos = TIPOS_AVISO.filter((t) => t.para === para || t.para === 'todos');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">Neste aparelho</p>
            <p className="text-[14px] text-tinta-2">
              {estado === 'ligado'
                ? 'Os avisos chegam mesmo com o Revisaí fechado.'
                : estado === 'bloqueado'
                  ? 'O navegador bloqueou os avisos deste site. Libere nas configurações do navegador.'
                  : estado === 'indisponivel'
                    ? 'Este navegador não recebe avisos com o app fechado.'
                    : 'Ligue para saber na hora de pedidos, propostas e respostas.'}
            </p>
            {instalar && estado !== 'ligado' ? (
              <p className="mt-1 text-[13px] text-tinta-3">No iPhone, instale o Revisaí na tela de início (Compartilhar, Adicionar à Tela de Início) e ligue os avisos por lá.</p>
            ) : null}
          </div>
          {estado === 'ligado' ? (
            <div className="flex gap-2">
              <Botao variante="fantasma" tamanho="pequeno" onClick={testar} disabled={ocupado}>
                <Send size={15} aria-hidden="true" /> Testar
              </Botao>
              <Botao variante="secundario" tamanho="pequeno" onClick={desligar} disabled={ocupado}>
                <BellOff size={15} aria-hidden="true" /> Desligar
              </Botao>
            </div>
          ) : estado === 'desligado' ? (
            <Botao variante="escuro" onClick={ligar} disabled={ocupado}>
              <BellRing size={16} aria-hidden="true" /> {ocupado ? 'Ligando…' : 'Ligar os avisos'}
            </Botao>
          ) : null}
        </div>
        {mensagem ? (
          <p className={`text-[14px] font-semibold ${mensagem.tom === 'ok' ? 'text-ok' : 'text-atraso'}`} role={mensagem.tom === 'erro' ? 'alert' : 'status'}>
            {mensagem.texto}
          </p>
        ) : null}
      </div>

      {prefs ? (
        <div className="flex flex-col gap-1 rounded-2xl bg-papel px-5 py-4 ring-1 ring-linha">
          <p className="mb-1 font-bold">Por onde avisar</p>
          <Alternar id="aviso-push" ligado={prefs.push} aoMudar={(v) => void salvar({ ...prefs, push: v })} rotulo="No celular e no computador" descricao="Nos aparelhos em que os avisos estão ligados." />
          <Alternar id="aviso-email" ligado={prefs.email} aoMudar={(v) => void salvar({ ...prefs, email: v })} rotulo="Por e-mail" descricao="No e-mail da sua conta." />
          <Alternar
            id="aviso-whatsapp"
            ligado={prefs.whatsapp}
            aoMudar={(v) => void salvar({ ...prefs, whatsapp: v })}
            rotulo="Pelo WhatsApp"
            descricao={para === 'loja' ? 'No WhatsApp da loja, para pedidos e alertas novos.' : 'No WhatsApp da oficina, para pedidos e propostas.'}
          />
          <p className="mt-3 mb-1 font-bold">O que avisar</p>
          {tipos.map((t) => (
            <Alternar
              key={t.id}
              id={`aviso-${t.id}`}
              ligado={!prefs.desligados.includes(t.id)}
              aoMudar={(v) => void salvar({ ...prefs, desligados: v ? prefs.desligados.filter((x) => x !== t.id) : [...prefs.desligados, t.id] })}
              rotulo={t.nome}
              descricao={t.descricao}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
