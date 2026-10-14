import { NextResponse, type NextRequest } from 'next/server';
import { configEquipe } from '@/lib/equipe';
import { permitido } from '@/lib/limite';
import { fornecedorDoCodigo } from '@/lib/marketplace';
import { codigoValido, COOKIE_FORNECEDOR, criarSessaoFornecedor, DURACAO_FORNECEDOR_MS } from '@/lib/sessao-fornecedor';

export const dynamic = 'force-dynamic';

/** Abre o painel do fornecedor pelo link que a equipe mandou. */
export async function GET(req: NextRequest) {
  const destino = new URL('/fornecedor', req.url);
  const c = configEquipe();
  const codigo = req.nextUrl.searchParams.get('c');
  if (!c || !codigoValido(codigo) || !(await permitido('fornecedor-entrar', 20, 15))) {
    destino.searchParams.set('erro', 'link');
    return NextResponse.redirect(destino, { status: 303 });
  }
  const achado = await fornecedorDoCodigo(codigo);
  if (!achado) {
    await new Promise((r) => setTimeout(r, 300));
    destino.searchParams.set('erro', 'link');
    return NextResponse.redirect(destino, { status: 303 });
  }
  const res = NextResponse.redirect(destino, { status: 303 });
  res.cookies.set(COOKIE_FORNECEDOR, criarSessaoFornecedor(c.chave, achado.fornecedorId, achado.hash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/fornecedor',
    maxAge: Math.floor(DURACAO_FORNECEDOR_MS / 1000)
  });
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
