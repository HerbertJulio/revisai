import { NextResponse, type NextRequest } from 'next/server';
import { estadoDaIA } from '@/lib/agente/ia';
import { permitido } from '@/lib/limite';
import { clientePublico } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

/** Uma consulta leve no banco, com 3 segundos de prazo. */
async function conferirBanco(): Promise<{ ok: boolean; ms: number }> {
  const inicio = Date.now();
  const sb = clientePublico();
  if (!sb) return { ok: false, ms: 0 };
  try {
    const { error } = await sb.from('fornecedores').select('id').limit(1).abortSignal(AbortSignal.timeout(3000));
    return { ok: !error, ms: Date.now() - inicio };
  } catch {
    return { ok: false, ms: Date.now() - inicio };
  }
}

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
