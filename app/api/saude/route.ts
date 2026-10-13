import { NextResponse } from 'next/server';
import { buscarCatalogo } from '@/lib/catalogo-servidor';

export const dynamic = 'force-dynamic';

/** Diagnóstico: o Supabase está configurado e respondendo? */
export async function GET() {
  const { catalogo, erro } = await buscarCatalogo();
  return NextResponse.json(
    {
      supabase: process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY ? 'configurado' : 'sem configuração',
      catalogo: catalogo.origem,
      produtos: catalogo.produtos.length,
      promocoes: catalogo.promocoes.length,
      erro: erro ?? null
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60' } }
  );
}
