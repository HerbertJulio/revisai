import { NextResponse, type NextRequest } from 'next/server';
import { limparRascunhosVelhos } from '@/lib/agente/rascunhos';
import { supabaseServidor } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Chamada uma vez por dia pelo Vercel Cron (vercel.json). Uma consulta leve mantém o projeto
 * grátis do Supabase ativo, que pausa depois de uma semana sem uso. Aproveita para apagar a mídia
 * dos rascunhos do agente que ficaram parados.
 */
export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const sb = supabaseServidor();
  if (!sb) return NextResponse.json({ ok: false, erro: 'Supabase não configurado' }, { status: 503 });
  const { count, error } = await sb.from('produtos').select('id', { count: 'exact', head: true });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 502 });
  const limpeza = await limparRascunhosVelhos().catch((e) => {
    console.error('[cron] limpeza dos rascunhos', e);
    return { rascunhos: 0 };
  });
  return NextResponse.json({ ok: true, produtos: count, rascunhosLimpos: limpeza.rascunhos }, { headers: { 'Cache-Control': 'no-store' } });
}
