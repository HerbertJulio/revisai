import { NextResponse, type NextRequest } from 'next/server';
import { agendarCobrancasRecorrentes, reprocessarAvisos } from '@/lib/cobranca/servidor';

// A rotina diária da cobrança (Vercel Cron, com o CRON_SECRET): agenda a cobrança do mês de quem
// paga por Pix Automático e tenta de novo os avisos dos gateways que falharam.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo && process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false, erro: 'CRON_SECRET não configurado' }, { status: 503 });
  if (segredo && req.headers.get('authorization') !== `Bearer ${segredo}`) return NextResponse.json({ ok: false }, { status: 401 });
  const [agenda, avisos] = await Promise.all([agendarCobrancasRecorrentes(), reprocessarAvisos()]);
  return NextResponse.json({ ok: agenda.ok && avisos.ok, agenda, avisos }, { headers: { 'Cache-Control': 'no-store' } });
}
