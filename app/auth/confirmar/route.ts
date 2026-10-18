import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { destinoSeguro } from '@/lib/entrada';
import { clienteDoUsuario } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

const TIPOS: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'email_change', 'recovery'];

/** O link do e-mail (quando a pessoa toca no link em vez de digitar o código). */
export async function GET(req: NextRequest) {
  const para = destinoSeguro(req.nextUrl.searchParams.get('para'));
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const tipo = req.nextUrl.searchParams.get('type') as EmailOtpType | null;
  const sb = await clienteDoUsuario();
  if (sb && tokenHash && tipo && TIPOS.includes(tipo)) {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (!error) return NextResponse.redirect(new URL(`/conta?para=${encodeURIComponent(para)}`, req.url), { status: 303 });
  }
  // o fluxo com código no endereço (PKCE)
  const codigo = req.nextUrl.searchParams.get('code');
  if (sb && codigo) {
    const { error } = await sb.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(new URL(`/conta?para=${encodeURIComponent(para)}`, req.url), { status: 303 });
  }
  return NextResponse.redirect(new URL(`/entrar?erro=link&para=${encodeURIComponent(para)}`, req.url), { status: 303 });
}
