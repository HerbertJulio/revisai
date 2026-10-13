import { NextResponse } from 'next/server';
import { buscarCatalogo } from '@/lib/catalogo-servidor';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { catalogo, erro } = await buscarCatalogo();
  return NextResponse.json(catalogo, {
    headers: {
      // a CDN guarda por 5 minutos; com o banco fora do ar, guarda só 1 minuto
      'Cache-Control': erro ? 'public, s-maxage=60' : 'public, s-maxage=300, stale-while-revalidate=3600'
    }
  });
}
