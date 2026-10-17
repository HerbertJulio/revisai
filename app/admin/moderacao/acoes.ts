'use server';

// Ações da equipe na moderação e no limite de compra das oficinas novas. Cada uma confere de novo o
// papel (o banco confere outra vez e guarda no histórico da equipe).

import { revalidatePath } from 'next/cache';
import { PODE } from '@/lib/equipe/papeis';
import { equipeNaAcao } from '@/lib/equipe/sessao';
import { decidir, produtoNaVitrine, salvarLimite } from '@/lib/loja/moderacao';

type Gravacao<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

/** Uma decisão sobre a denúncia: analisar, descartar, manter fora, mostrar de novo, desativar a loja. */
export async function decidirDenuncia(id: string, acao: string, resolucao: string): Promise<Gravacao<{ denuncias: number }>> {
  const a = await equipeNaAcao(PODE.suporte);
  if (!a.ok) return a;
  const r = await decidir(a.sb, String(id ?? ''), String(acao ?? ''), typeof resolucao === 'string' ? resolucao : '');
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

/** Mostra de novo (ou esconde) um produto da lista dos que estão fora da vitrine. */
export async function mudarVitrineDoProduto(produtoId: number, visivel: boolean): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.suporte);
  if (!a.ok) return a;
  const r = await produtoNaVitrine(a.sb, Number(produtoId), visivel === true);
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}

/** O limite de compra a cada 7 dias da oficina nova (null volta para o padrão de R$ 2.000). */
export async function mudarLimiteDeCompra(oficinaId: string, limite: number | null): Promise<Gravacao> {
  const a = await equipeNaAcao(PODE.mudarCadastro);
  if (!a.ok) return a;
  const r = await salvarLimite(a.sb, String(oficinaId ?? ''), limite == null ? null : Number(limite));
  if (r.ok) revalidatePath('/admin', 'layout');
  return r;
}
