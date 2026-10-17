export const dynamic = 'force-dynamic';

/**
 * O antigo link de acesso da loja. Agora cada pessoa entra com o próprio e-mail: o link leva para
 * a entrada (o código que vinha nele não vale mais nada). O endereço é relativo, para ficar no
 * mesmo domínio em que a pessoa abriu o link.
 */
export function GET() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/entrar?para=%2Ffornecedor', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }
  });
}
