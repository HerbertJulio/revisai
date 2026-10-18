import { NextResponse, type NextRequest } from 'next/server';
import { destinoSeguro } from '@/lib/entrada';
import { clienteDoUsuario } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

/** Volta do Google (ou de outro provedor): troca o código pela sessão e segue para a conta. */
export async function GET(req: NextRequest) {
  const para = destinoSeguro(req.nextUrl.searchParams.get('para'));
  const codigo = req.nextUrl.searchParams.get('code');
  const sb = await clienteDoUsuario();
  if (!codigo || !sb) return NextResponse.redirect(new URL(`/entrar?erro=google&para=${encodeURIComponent(para)}`, req.url), { status: 303 });
  const { error } = await sb.auth.exchangeCodeForSession(codigo);
  if (error) {
    console.error('[entrar] callback', error.message);
    return NextResponse.redirect(new URL(`/entrar?erro=google&para=${encodeURIComponent(para)}`, req.url), { status: 303 });
  }
  return NextResponse.redirect(new URL(`/conta?para=${encodeURIComponent(para)}`, req.url), { status: 303 });
}
