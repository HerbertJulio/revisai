'use client';

// A pergunta do NPS no início, para quem tem conta: aparece depois de 30 dias usando a oficina e
// de novo a cada 90 (o banco decide). Nota de 0 a 10, comentário se quiser, e "agora não".

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { Botao, classeArea } from '@/components/ui';
import { esquemaPendenteNps, PERGUNTA_NPS } from '@/lib/nps';

// respondeu ou dispensou nesta página: não pergunta de novo enquanto ela estiver aberta
let resolvidoNestaPagina = false;

type Estado = 'esperando' | 'perguntar' | 'enviando' | 'obrigado' | 'fora';

export function CartaoNps() {
  const { oficina, banco } = useConta();
  const [estado, setEstado] = useState<Estado>('esperando');
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const oficinaId = oficina?.id ?? null;

  useEffect(() => {
    const sb = banco();
    if (!oficinaId || !sb || resolvidoNestaPagina) return;
    let vivo = true;
    void Promise.resolve(sb.rpc('nps_pendente', { p_oficina: oficinaId }))
      .then(({ data, error }) => {
        if (!vivo || error) return;
        const r = esquemaPendenteNps.safeParse(data);
        if (r.success && r.data.perguntar) setEstado('perguntar');
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [oficinaId, banco]);

  useEffect(() => {
    if (estado !== 'obrigado') return;
    const t = setTimeout(() => setEstado('fora'), 6000);
    return () => clearTimeout(t);
  }, [estado]);

  if (estado === 'esperando' || estado === 'fora' || !oficinaId) return null;

  async function enviar() {
    const sb = banco();
    if (nota == null || !sb || !oficinaId) return;
    setErro(null);
    setEstado('enviando');
    const { error } = await sb.rpc('nps_responder', { p_nota: nota, p_comentario: comentario.trim() || null, p_oficina: oficinaId });
    if (error && error.code !== 'RV091') {
      setErro('Não deu para mandar agora. Tente de novo.');
      setEstado('perguntar');
      return;
    }
    resolvidoNestaPagina = true;
    setEstado('obrigado');
  }

  function dispensar() {
    resolvidoNestaPagina = true;
    setEstado('fora');
    void Promise.resolve(banco()?.rpc('nps_dispensar')).catch(() => {});
  }

  if (estado === 'obrigado')
    return (
      <p className="rounded-2xl bg-ok-claro px-4 py-3 font-semibold text-ok" role="status">
        Obrigado! A sua resposta ajuda a melhorar o Revisaí.
      </p>
    );

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5" aria-labelledby="nps-pergunta" data-testid="cartao-nps">
      <div className="flex items-start justify-between gap-3">
        <p id="nps-pergunta" className="font-bold">
          {PERGUNTA_NPS}
        </p>
        <button type="button" onClick={dispensar} className="-mt-1 -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-tinta-3 hover:bg-papel-2" aria-label="Agora não">
          <X size={18} />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-labelledby="nps-pergunta">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nota === n}
              aria-label={`Nota ${n}`}
              onClick={() => setNota(n)}
              className={`num h-10 rounded-lg text-[15px] font-bold ${nota === n ? 'bg-tinta text-papel' : 'bg-papel-2 text-tinta-2 hover:text-tinta'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[12px] text-tinta-3" aria-hidden="true">
          <span>Nada provável</span>
          <span>Muito provável</span>
        </div>
      </div>
      {nota != null ? (
        <>
          <label htmlFor="nps-comentario" className="sr-only">
            Comentário
          </label>
          <textarea id="nps-comentario" className={classeArea} rows={2} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Quer contar o porquê? (opcional)" />
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="primario" onClick={enviar} disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Mandando…' : 'Mandar'}
            </Botao>
            <Botao variante="fantasma" onClick={dispensar}>
              Agora não
            </Botao>
          </div>
        </>
      ) : null}
      {erro ? (
        <p className="text-[14px] text-atraso" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
