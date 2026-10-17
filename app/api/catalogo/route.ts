import { NextResponse, type NextRequest } from 'next/server';
import { buscarCatalogo } from '@/lib/catalogo-servidor';
import { sessaoAtual } from '@/lib/supabase-servidor';
import { semPrecos } from '@/lib/vitrine';

export const dynamic = 'force-dynamic';

/**
 * O catálogo da loja. Os preços são só para quem entrou na conta: /api/catalogo?precos=1 confere
 * a sessão e devolve com os preços, sem guardar em cache compartilhado; sem ?precos=1 (ou sem
 * sessão), vai o catálogo sem preços, que a CDN pode guardar. Os extras (prazo, estoque,
 * aplicações, pedido mínimo e anúncios) vão nos dois.
 */
export async function GET(req: NextRequest) {
  const { catalogo, extras, erro } = await buscarCatalogo();
  if (req.nextUrl.searchParams.get('precos') === '1') {
    const sessao = await sessaoAtual();
    if (!sessao) return NextResponse.json({ erro: 'Entre na sua conta para ver os preços.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    return NextResponse.json({ ...catalogo, extras }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  }
  return NextResponse.json({ ...semPrecos(catalogo), extras }, {
    headers: {
      // a CDN guarda por 5 minutos; com o banco fora do ar, guarda só 1 minuto
      'Cache-Control': erro ? 'public, s-maxage=60' : 'public, s-maxage=300, stale-while-revalidate=3600'
    }
  });
}
