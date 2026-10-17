'use client';

import { CheckCheck, RotateCcw, Send } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { mudarSituacaoDoChamado, responderChamado } from '@/app/admin/acoes';
import { useToast } from '@/components/Toasts';
import { Botao, classeArea } from '@/components/ui';
import { quandoFoi } from '@/lib/equipe-dados';
import type { Chamado, MensagemDoChamado } from '@/lib/equipe/tipos';
import { AtualizarSozinho } from './ChamadosEquipe';
import { AvisoErro } from './comum';

/** A conversa de um pedido de ajuda, com a resposta da equipe. */
export function ConversaChamado({ chamado, mensagens, agora }: { chamado: Chamado; mensagens: MensagemDoChamado[]; agora: number }) {
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function responder(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!texto.trim()) return setErro('Escreva a resposta.');
    iniciar(async () => {
      try {
        const r = await responderChamado(chamado.id, texto);
        if (!r.ok) return setErro(r.erro);
        setTexto('');
        toast({ texto: 'Resposta enviada. A pessoa vê no app.' });
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function mudar(situacao: 'fechado' | 'novo') {
    iniciar(async () => {
      try {
        const r = await mudarSituacaoDoChamado(chamado.id, situacao);
        toast(r.ok ? { texto: situacao === 'fechado' ? 'Pedido fechado.' : 'Pedido aberto de novo.' } : { texto: r.erro, tom: 'erro' });
      } catch {
        toast({ texto: 'Sem conexão com o servidor. Tente de novo.', tom: 'erro' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <AtualizarSozinho segundos={20} />
      <ol className="flex flex-col gap-3" aria-label="Mensagens">
        {mensagens.map((m) => (
          <li key={m.id} className={`flex ${m.autor === 'equipe' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.autor === 'equipe' ? 'bg-tinta text-papel' : 'bg-papel ring-1 ring-linha'}`}>
              <p className="text-[15px] leading-relaxed whitespace-pre-line break-words">{m.texto}</p>
              <p className={`mt-1 text-[12.5px] ${m.autor === 'equipe' ? 'text-papel/70' : 'text-tinta-3'}`}>
                {m.autor === 'equipe' ? `Equipe${m.email ? `, ${m.email}` : ''}` : (m.email ?? 'Cliente')}, {quandoFoi(m.criado_em, agora)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <form onSubmit={responder} className="flex flex-col gap-3 rounded-2xl bg-papel p-4 ring-1 ring-linha sm:p-5">
        <label htmlFor="resposta" className="text-sm font-semibold">
          Responder
        </label>
        <textarea
          id="resposta"
          rows={4}
          className={classeArea}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={4000}
          placeholder="Escreva a resposta em português simples. A pessoa vê no app."
        />
        {erro ? <AvisoErro>{erro}</AvisoErro> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Botao type="submit" variante="escuro" disabled={ocupado}>
            <Send size={16} aria-hidden="true" /> {ocupado ? 'Mandando…' : 'Mandar resposta'}
          </Botao>
          {chamado.situacao === 'fechado' ? (
            <Botao variante="fantasma" onClick={() => mudar('novo')} disabled={ocupado}>
              <RotateCcw size={16} aria-hidden="true" /> Abrir de novo
            </Botao>
          ) : (
            <Botao variante="fantasma" onClick={() => mudar('fechado')} disabled={ocupado}>
              <CheckCheck size={16} aria-hidden="true" /> Fechar o pedido
            </Botao>
          )}
        </div>
      </form>
    </div>
  );
}
