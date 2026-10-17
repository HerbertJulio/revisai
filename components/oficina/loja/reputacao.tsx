'use client';

// A reputação das lojas (pedidos, cancelamentos, atrasos e tempo para confirmar nos últimos 90
// dias), calculada pelo banco em reputacao_das_lojas. Se a função falhar ou não existir, o selo
// simplesmente não aparece.

import type { SupabaseClient } from '@supabase/supabase-js';
import { CircleAlert, Clock3, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConta } from '@/components/conta/ProvedorConta';
import { lerReputacoes, seloDaReputacao, type Reputacao } from '@/lib/marketplace-dados';

const VALIDADE_MS = 10 * 60_000;

const guardadas = new Map<number, { r: Reputacao | null; em: number }>();
const ouvintes = new Set<() => void>();
const fila = new Set<number>();
let agendado: ReturnType<typeof setTimeout> | null = null;
let cliente: SupabaseClient | null = null;

async function carregar(sb: SupabaseClient, ids: number[]) {
  try {
    const { data, error } = await sb.rpc('reputacao_das_lojas', { p_ids: ids });
    if (error) throw error;
    const m = lerReputacoes(data);
    for (const id of ids) guardadas.set(id, { r: m.get(id) ?? null, em: Date.now() });
  } catch {
    // sem a reputação, sem selo (tenta de novo depois da validade)
    for (const id of ids) guardadas.set(id, { r: null, em: Date.now() });
  }
  for (const o of ouvintes) o();
}

function pedir(sb: SupabaseClient, id: number) {
  const g = guardadas.get(id);
  if ((g && Date.now() - g.em < VALIDADE_MS) || fila.has(id)) return;
  fila.add(id);
  cliente = sb;
  // junta os pedidos da mesma tela numa chamada só
  agendado ??= setTimeout(() => {
    agendado = null;
    const ids = [...fila].slice(0, 100);
    for (const i of ids) fila.delete(i);
    if (cliente && ids.length) void carregar(cliente, ids);
  }, 60);
}

/** A reputação da loja (null enquanto carrega, se der erro ou sem loja). */
export function useReputacao(fornecedorId: number | null | undefined): Reputacao | null {
  const { banco } = useConta();
  const [, setVersao] = useState(0);
  useEffect(() => {
    const o = () => setVersao((v) => v + 1);
    ouvintes.add(o);
    return () => {
      ouvintes.delete(o);
    };
  }, []);
  useEffect(() => {
    if (fornecedorId == null) return;
    const sb = banco();
    if (sb) pedir(sb, fornecedorId);
  }, [fornecedorId, banco]);
  return fornecedorId == null ? null : (guardadas.get(fornecedorId)?.r ?? null);
}

/** O selo da reputação, com o detalhe ao lado (ou no título, quando é compacto). */
export function SeloDaLoja({ fornecedorId, escuro = false, compacto = false }: { fornecedorId: number | null | undefined; escuro?: boolean; compacto?: boolean }) {
  const r = useReputacao(fornecedorId);
  if (!r) return null;
  const s = seloDaReputacao(r);
  const Icone = s.tom === 'atencao' ? CircleAlert : r.nova ? Sparkles : Clock3;
  const cor = escuro ? (s.tom === 'atencao' ? 'text-oleo' : 'text-white/75') : s.tom === 'atencao' ? 'text-atraso' : s.tom === 'ok' ? 'text-ok' : 'text-tinta-2';
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 text-[12.5px] ${cor}`} title={compacto ? s.detalhe : undefined}>
      <span className="inline-flex items-center gap-1 font-semibold">
        <Icone size={13} aria-hidden="true" /> {s.texto}
      </span>
      {compacto ? <span className="sr-only">{s.detalhe}</span> : <span className={escuro ? 'text-white/55' : 'text-tinta-3'}>{s.detalhe}</span>}
    </span>
  );
}
