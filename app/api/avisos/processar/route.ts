import { NextResponse, type NextRequest } from 'next/server';
import { dentroDoLimite, iguais, marcaDoIp } from '@/lib/avisos/http';
import { processarAvisos } from '@/lib/avisos/processar';
import { clienteSistema } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Manda os avisos da fila. Quem chama: o próprio banco (pg_net, com o código do cabeçalho
 * x-revisai-avisos, que o banco confere) ou o Vercel Cron (Authorization: Bearer CRON_SECRET).
 */
async function autorizado(req: NextRequest): Promise<boolean> {
  const cron = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get('authorization') ?? '';
  if (cron && auth.startsWith('Bearer ') && iguais(auth.slice(7), cron)) return true;
  const token = req.headers.get('x-revisai-avisos') ?? '';
  if (token.length < 32 || token.length > 200) return false;
  const sb = clienteSistema();
  if (!sb) return false;
  const { data, error } = await sb.rpc('avisos_ping_confere', { p_token: token });
  return !error && data === true;
}

async function processar(req: NextRequest) {
  if (!(await dentroDoLimite(`avisos-processar:${marcaDoIp(req)}`, 120, 60))) return NextResponse.json({ ok: false }, { status: 429 });
  if (!(await autorizado(req))) return NextResponse.json({ ok: false }, { status: 401 });
  const r = await processarAvisos({ ateMs: 22_000 });
  return NextResponse.json({ ok: !r.erro, ...r }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = processar;
export const GET = processar;
