// Um cliente do Supabase de mentira para os testes do lado da loja: guarda o que o código pediu
// (tabela, operação, filtros, argumentos) e devolve o que o teste mandar.

import type { SupabaseClient } from '@supabase/supabase-js';

export type Erro = { code?: string; message?: string } | null;
export type Resposta = { data?: unknown; error?: Erro; count?: number };
export interface Chamada {
  tipo: 'from' | 'rpc';
  nome: string;
  op: 'select' | 'insert' | 'update';
  dados?: unknown;
  args?: unknown;
  filtros: [string, string, unknown][];
}

/** Um cliente que guarda o que o código pediu e devolve o que o teste mandar, por tabela/função. */
export function bancoFalso(respostas: Record<string, Resposta | ((c: Chamada) => Resposta)> = {}) {
  const chamadas: Chamada[] = [];
  const responder = (c: Chamada) => {
    const r = respostas[`${c.nome}.${c.op}`] ?? respostas[c.nome];
    const v = typeof r === 'function' ? r(c) : (r ?? {});
    return { data: v.data ?? null, error: v.error ?? null, count: v.count ?? null };
  };
  const uploads: { caminho: string; tipo: string }[] = [];
  const sb = {
    from(nome: string) {
      const c: Chamada = { tipo: 'from', nome, op: 'select', filtros: [] };
      chamadas.push(c);
      const filtro =
        (f: string) =>
        (k: string, v: unknown) => {
          c.filtros.push([f, k, v]);
          return q;
        };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (d: unknown) => ((c.op = 'insert'), (c.dados = d), q),
        update: (d: unknown) => ((c.op = 'update'), (c.dados = d), q),
        eq: filtro('eq'),
        in: filtro('in'),
        is: filtro('is'),
        gt: filtro('gt'),
        gte: filtro('gte'),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => responder(c),
        single: async () => responder(c),
        then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => Promise.resolve(responder(c)).then(ok, erro)
      };
      return q;
    },
    async rpc(nome: string, args: unknown) {
      const c: Chamada = { tipo: 'rpc', nome, op: 'select', args, filtros: [] };
      chamadas.push(c);
      return responder(c);
    },
    storage: {
      from: () => ({
        upload: async (caminho: string, _bytes: Uint8Array, o: { contentType: string }) => (uploads.push({ caminho, tipo: o.contentType }), { error: null }),
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://fotos.teste/${caminho}` } })
      })
    }
  };
  return { sb: sb as unknown as SupabaseClient, chamadas, uploads };
}

