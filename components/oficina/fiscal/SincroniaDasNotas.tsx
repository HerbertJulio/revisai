'use client';

// No início, sem aparecer: pergunta ao emissor pelas notas que ainda processam e põe o resumo da
// nota em cada ordem (documento.nota), para a ordem mostrar a nota mesmo sem abrir o painel.

import { useEffect } from 'react';
import { atualizarNotas } from '@/app/oficina/fiscal/acoes';
import { COLUNAS_DA_NOTA, lerNotaFiscal, notasDaOrdem, resumoDaNota, resumoMudou, type NotaFiscal } from '@/lib/fiscal/dados';
import { useOficina } from '@/lib/store';
import { useGestao } from '../cobranca-cliente/gestao';
import { perguntarEstado } from './estado';

const DE_TEMPOS_EM_TEMPOS = 120_000;

export function SincroniaDasNotas() {
  const { gestao, ctx, plano } = useGestao();
  useEffect(() => {
    if (!gestao || !ctx || plano === 'gratis') return;
    let vivo = true;
    async function rodar() {
      if (!ctx || document.visibilityState !== 'visible') return;
      const estado = await perguntarEstado();
      if (!estado.ligado || !vivo) return;
      await atualizarNotas().catch(() => null);
      const desde = new Date(Date.now() - 45 * 86_400_000).toISOString();
      const { data, error } = await ctx.sb.from('notas_fiscais').select(COLUNAS_DA_NOTA).eq('oficina_id', ctx.oficinaId).gte('atualizado_em', desde).order('atualizado_em', { ascending: false }).limit(500);
      if (!vivo || error || !data) return;
      const notas = data.map(lerNotaFiscal).filter((n): n is NotaFiscal => !!n);
      const s = useOficina.getState();
      for (const documentoId of new Set(notas.map((n) => n.documentoId).filter((x): x is string => !!x))) {
        const d = s.documentos[documentoId];
        if (!d) continue;
        const resumo = resumoDaNota(notasDaOrdem(notas, documentoId));
        if (resumoMudou(d.nota, resumo)) s.salvarDocumento({ ...d, nota: resumo });
      }
    }
    void rodar().catch(() => {});
    const t = setInterval(() => void rodar().catch(() => {}), DE_TEMPOS_EM_TEMPOS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [gestao, ctx, plano]);
  return null;
}
