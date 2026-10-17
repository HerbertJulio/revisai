import { NextResponse, type NextRequest } from 'next/server';
import { estadoDaIA } from '@/lib/agente/ia';
import { permitido } from '@/lib/limite';
import { conferirBanco } from '@/lib/saude-do-sistema';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico para o monitor: o banco responde? Responde 503 quando não. Com ?ia=1, diz também
 * se a IA das ordens por voz está ligada e autorizada (sem gastar crédito).
 */
export async function GET(req: NextRequest) {
  const banco = await conferirBanco();
  const comIa = req.nextUrl.searchParams.get('ia') === '1' && (await permitido('saude-ia', 10, 10));
  return NextResponse.json(
    {
      ok: banco.ok,
      banco: banco.ok ? 'respondendo' : 'sem resposta',
      ms: banco.ms,
      supabase: process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY ? 'configurado' : 'sem configuração',
      whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'configurado' : 'sem configuração',
      ...(comIa ? { ia: await estadoDaIA() } : {})
    },
    { status: banco.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
