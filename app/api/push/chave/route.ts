import { NextResponse } from 'next/server';
import { chavesVapid } from '@/lib/avisos/push';

export const dynamic = 'force-dynamic';

/** A chave pública do push do Revisaí (o navegador precisa dela para se inscrever). */
export async function GET() {
  const chaves = await chavesVapid();
  if (!chaves) return NextResponse.json({ chave: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ chave: chaves.publica }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } });
}
