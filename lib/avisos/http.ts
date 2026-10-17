import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { clienteSistema } from '../supabase-servidor';

/** O pedido veio de uma página do próprio site (sem Origin, quando o navegador não manda, também vale). */
export function mesmaOrigem(req: NextRequest): boolean {
  const origem = req.headers.get('origin');
  if (!origem) return true;
  try {
    const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase();
    return new URL(origem).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/** Lê o corpo JSON com limite de tamanho (null se passar ou não for JSON). */
export async function lerJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  const tamanho = Number(req.headers.get('content-length') ?? 0);
  if (tamanho > maxBytes) return null;
  try {
    const texto = await req.text();
    if (texto.length > maxBytes) return null;
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
}

export function ipDe(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/** O limite contra abuso, guardado no banco (vale para todos os servidores). Sem banco, deixa passar. */
export async function dentroDoLimite(chave: string, maximo: number, segundos: number): Promise<boolean> {
  const sb = clienteSistema();
  if (!sb) return true;
  const { data, error } = await sb.rpc('limite_consumir', { p_chave: chave, p_max: maximo, p_segundos: segundos });
  if (error) {
    console.error('[avisos] limite', error.message);
    return true;
  }
  return data === true;
}

/** Hash curto do IP para a chave do limite (o IP em si não fica guardado). */
export function marcaDoIp(req: NextRequest): string {
  return createHash('sha256').update(ipDe(req)).digest('hex').slice(0, 24);
}

/** Compara dois textos sem vazar pelo tempo. */
export function iguais(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}
