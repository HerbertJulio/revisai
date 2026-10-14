import { NextResponse } from 'next/server';
import { buscarReferencias } from '@/lib/referencias-servidor';

export const dynamic = 'force-dynamic';

/** A base de prazos por produto (só o que a equipe aprovou). */
export async function GET() {
  const { referencias, erro } = await buscarReferencias();
  return NextResponse.json(
    { referencias },
    { headers: { 'Cache-Control': erro ? 'public, s-maxage=60' : 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
