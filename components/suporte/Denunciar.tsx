'use client';

// "Denunciar" na loja da oficina: abre ali mesmo (sem outra janela por cima) o motivo e um texto
// curto, e manda para a fila da equipe do Revisaí. A loja não fica sabendo quem denunciou.

import { Flag } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Botao, classeArea } from '@/components/ui';
import { denunciarNaLoja } from '@/lib/loja/acoes-da-oficina';
import { MOTIVOS_DA_DENUNCIA, type MotivoDaDenuncia } from '@/lib/loja/moderacao-dados';

export function Denunciar({ produtoId = null, fornecedorId = null, alvo }: { produtoId?: number | null; fornecedorId?: number | null; alvo: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDaDenuncia | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, iniciar] = useTransition();
  const motivos = MOTIVOS_DA_DENUNCIA.filter((m) => produtoId == null || !m.soLoja);

  if (enviado)
    return (
      <p className="rounded-xl bg-ok-claro px-3.5 py-2.5 text-[14px] text-ok" role="status">
        Denúncia enviada. A equipe do Revisaí vai olhar. Obrigado por avisar.
      </p>
    );

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-tinta-3 hover:text-atraso" data-denunciar>
        <Flag size={14} aria-hidden="true" /> Denunciar {alvo}
      </button>
    );

  function enviar() {
    if (!motivo) return setErro('Escolha o motivo.');
    setErro(null);
    iniciar(async () => {
      try {
        const r = await denunciarNaLoja({ produtoId, fornecedorId, motivo, texto });
        if (!r.ok) return setErro(r.erro);
        setEnviado(true);
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl bg-papel-2 px-4 py-3.5">
      <legend className="sr-only">Denunciar {alvo}</legend>
      <p className="font-semibold">O que tem de errado com {alvo}?</p>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Motivo">
        {motivos.map((m) => (
          <label key={m.id} className="flex cursor-pointer items-center gap-2 text-[14.5px]">
            <input type="radio" name={`motivo-${produtoId ?? fornecedorId}`} checked={motivo === m.id} onChange={() => setMotivo(m.id)} className="h-4 w-4 shrink-0 accent-[var(--color-tinta)]" />
            {m.nome}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-[14px]">
        <span className="font-semibold">Conte o que aconteceu (opcional)</span>
        <textarea rows={3} className={classeArea} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder="Ex.: veio sem lacre e a caixa é diferente da original." />
      </label>
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
      <p className="text-[12.5px] text-tinta-3">A loja não vê quem denunciou. Produto denunciado por várias oficinas sai da vitrine até a equipe olhar.</p>
      <div className="flex justify-end gap-2">
        <Botao tamanho="pequeno" variante="fantasma" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
        <Botao tamanho="pequeno" variante="escuro" onClick={enviar} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar a denúncia'}
        </Botao>
      </div>
    </fieldset>
  );
}
