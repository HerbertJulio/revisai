import { NextResponse, type NextRequest } from 'next/server';
import { estadoDaIA } from '@/lib/agente/ia';
import { buscarCatalogo } from '@/lib/catalogo-servidor';
import { permitido } from '@/lib/limite';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico: o Supabase está configurado e respondendo? Com ?ia=1, diz também se a IA das
 * ordens por voz está ligada e autorizada (sem gastar crédito).
 */
export async function GET(req: NextRequest) {
  const { catalogo, erro } = await buscarCatalogo();
  const comIa = req.nextUrl.searchParams.get('ia') === '1' && (await permitido('saude-ia', 10, 10));
  return NextResponse.json(
    {
      supabase: process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY ? 'configurado' : 'sem configuração',
      catalogo: catalogo.origem,
      produtos: catalogo.produtos.length,
      promocoes: catalogo.promocoes.length,
      erro: erro ?? null,
      ...(comIa ? { ia: await estadoDaIA() } : {}),
      whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configurado' : 'sem configuração'
    },
    { headers: { 'Cache-Control': comIa ? 'no-store' : 'public, s-maxage=60' } }
  );
}
