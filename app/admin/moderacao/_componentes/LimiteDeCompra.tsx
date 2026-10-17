'use client';

// O limite de compra da oficina nova, na página da oficina: quanto vale agora, quanto já comprou nos
// últimos 7 dias e o limite que a equipe dá (ou volta para o padrão).

import { ShieldCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/Toasts';
import { Botao, Campo, Chip, classeEntrada } from '@/components/ui';
import { formatarData } from '@/lib/datas';
import { formatarMoeda, lerNumero } from '@/lib/formatos';
import { LIMITE_PADRAO_DE_COMPRA, type LimiteDeCompra } from '@/lib/loja/moderacao-dados';
import { mudarLimiteDeCompra } from '../acoes';

export function ControleDoLimite({ oficinaId, agora, daEquipe, podeMudar }: { oficinaId: string; agora: LimiteDeCompra | null; daEquipe: number | null; podeMudar: boolean }) {
  const toast = useToast();
  const [valor, setValor] = useState(daEquipe != null ? String(daEquipe).replace('.', ',') : '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function salvar(limite: number | null) {
    setErro(null);
    iniciar(async () => {
      try {
        const r = await mudarLimiteDeCompra(oficinaId, limite);
        if (!r.ok) return setErro(r.erro);
        toast({ texto: limite == null ? 'A oficina voltou para o limite padrão.' : `Limite de ${formatarMoeda(limite)} a cada 7 dias.` });
        if (limite == null) setValor('');
      } catch {
        setErro('Sem conexão com o servidor. Tente de novo.');
      }
    });
  }

  function salvarDigitado() {
    const n = lerNumero(valor);
    if (n == null || n < 0) return setErro('Confira o valor, como 5.000.');
    salvar(n);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-papel px-4 py-4 ring-1 ring-linha sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck size={18} className="text-caneta" aria-hidden="true" />
        {agora ? (
          <>
            <Chip tom={agora.livre > 0 ? 'ok' : 'atraso'}>
              {formatarMoeda(agora.usado)} de {formatarMoeda(agora.limite)} nos últimos 7 dias
            </Chip>
            <Chip>{agora.daEquipe ? 'Limite dado pela equipe' : 'Limite padrão'}</Chip>
            <span className="text-[13.5px] text-tinta-3">vale até {formatarData(agora.ate.slice(0, 10))}</span>
          </>
        ) : (
          <span className="text-[14.5px] text-tinta-2">A oficina já passou dos 30 dias: compra sem limite.</span>
        )}
      </div>
      <p className="text-[14px] text-tinta-2">
        Nos primeiros 30 dias, cada oficina compra até {formatarMoeda(LIMITE_PADRAO_DE_COMPRA)} a cada 7 dias pela loja. A equipe pode dar outro limite para esse período (o pedido que passa
        é barrado e aparece em Antifraude).
      </p>
      {podeMudar ? (
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Limite a cada 7 dias (R$)" htmlFor="limite-compra" className="w-52" erro={erro}>
            <input id="limite-compra" className={`${classeEntrada} num`} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={String(LIMITE_PADRAO_DE_COMPRA)} />
          </Campo>
          <Botao variante="escuro" onClick={salvarDigitado} disabled={ocupado || !valor.trim()}>
            {ocupado ? 'Salvando…' : 'Salvar o limite'}
          </Botao>
          {daEquipe != null ? (
            <Botao variante="fantasma" onClick={() => salvar(null)} disabled={ocupado}>
              Voltar ao padrão
            </Botao>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
