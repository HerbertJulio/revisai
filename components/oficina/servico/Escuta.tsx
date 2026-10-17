'use client';

// Liga, nas telas da oficina, a escuta das respostas dos clientes e a publicação do que ficou
// para trás. Não desenha nada.

import { useEffect } from 'react';
import { useContextoDaConta } from './conta';
import { publicarPendencias } from './publicar';
import { useRespostasDosLinks } from './respostas';

export function EscutaDasRespostas(): null {
  useRespostasDosLinks();
  return null;
}

export function EscutaDoInicio(): null {
  const ctx = useContextoDaConta();
  useRespostasDosLinks();
  useEffect(() => {
    if (!ctx) return;
    // deixa a sincronização trazer os dados antes de olhar o que falta publicar
    const t = setTimeout(() => void publicarPendencias(ctx).catch((e) => console.error('[links] pendências', e)), 8000);
    return () => clearTimeout(t);
  }, [ctx]);
  return null;
}
