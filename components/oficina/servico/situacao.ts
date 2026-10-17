'use client';

// Como está um link no banco: quantas vezes o cliente abriu, quando, se respondeu e o que está
// publicado (para saber se o documento mudou depois de mandar). As regras do banco mostram só os
// links da oficina de quem está vendo.

import { useCallback, useEffect, useState } from 'react';
import type { TipoLink } from '@/lib/links-publicos';
import { useContextoDaConta } from './conta';
import { ouvirLinks } from './respostas';

export interface LinkNoBanco {
  id: string;
  vistas: number;
  vistoEm: string | null;
  respondidoEm: string | null;
  atualizadoEm: string;
  expiraEm: string;
  revogado: boolean;
  dados: Record<string, unknown>;
}

export function useLinkNoBanco(tipo: TipoLink, ref: string | null | undefined, ligado = true): { link: LinkNoBanco | null; recarregar: () => void } {
  const ctx = useContextoDaConta();
  const [link, setLink] = useState<LinkNoBanco | null>(null);
  const [vez, setVez] = useState(0);
  const recarregar = useCallback(() => setVez((v) => v + 1), []);

  useEffect(() => ouvirLinks(recarregar), [recarregar]);

  useEffect(() => {
    if (!ctx || !ref || !ligado) return;
    let vivo = true;
    void ctx.sb
      .from('links_publicos')
      .select('id, vistas, visto_em, respondido_em, atualizado_em, expira_em, revogado, dados')
      .eq('oficina_id', ctx.oficinaId)
      .eq('tipo', tipo)
      .eq('ref', ref)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) return setLink(null);
        const d = data as Record<string, unknown>;
        setLink({
          id: String(d.id),
          vistas: Number(d.vistas ?? 0),
          vistoEm: (d.visto_em as string | null) ?? null,
          respondidoEm: (d.respondido_em as string | null) ?? null,
          atualizadoEm: String(d.atualizado_em ?? ''),
          expiraEm: String(d.expira_em ?? ''),
          revogado: !!d.revogado,
          dados: (d.dados as Record<string, unknown>) ?? {}
        });
      });
    return () => {
      vivo = false;
    };
  }, [ctx, tipo, ref, ligado, vez]);

  return { link, recarregar };
}
