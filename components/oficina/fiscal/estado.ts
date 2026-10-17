'use client';

import { estadoFiscal } from '@/app/oficina/fiscal/acoes';
import type { NomeProvedorFiscal } from '@/lib/fiscal/tipos';

type Estado = { ligado: boolean; provedor: NomeProvedorFiscal | null };

let guardado: Promise<Estado> | null = null;

/** Se o emissor de notas está ligado no servidor (uma pergunta por aba; se falhar, pergunta de novo depois). */
export function perguntarEstado(): Promise<Estado> {
  guardado ??= estadoFiscal().catch(() => {
    guardado = null;
    return { ligado: false, provedor: null };
  });
  return guardado;
}
