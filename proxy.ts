import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

// Antes de cada página: renova a sessão de quem entrou, separa a área da equipe (só no endereço
// dela, e "não existe" para quem não é da equipe) e anota o acesso exigido pelo Marco Civil
// (no máximo uma vez por hora por pessoa).

const URL_SUPABASE = process.env.SUPABASE_URL ?? '';
const CHAVE_PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const HOST_EQUIPE = (process.env.EQUIPE_HOST ?? '').trim().toLowerCase();
const IPS_EQUIPE = (process.env.EQUIPE_IPS ?? '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const COOKIE_ACESSO = 'revisai_acesso';

function naoExiste(req: NextRequest) {
  return NextResponse.rewrite(new URL('/nao-encontrado', req.url), { status: 404 });
}

function temSessao(req: NextRequest): boolean {
  return req.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
}

function ipDe(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/** IPv4 com máscara (1.2.3.0/24) ou endereço exato. */
function ipPermitido(ip: string, lista: string[]): boolean {
  if (!lista.length) return true;
  const num = (v: string) => v.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
  return lista.some((regra) => {
    if (!regra.includes('/')) return regra === ip;
    const [base, bits] = regra.split('/');
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
    const mascara = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (num(ip) & mascara) === (num(base) & mascara);
  });
}

async function anotarAcesso(userId: string, req: NextRequest): Promise<void> {
  const chave = (process.env.SISTEMA_CHAVE ?? process.env.EQUIPE_CHAVE ?? '').trim();
  if (!URL_SUPABASE || !CHAVE_PUBLICA || chave.length < 32) return;
  try {
    await fetch(`${URL_SUPABASE}/rest/v1/rpc/registrar_acesso`, {
      method: 'POST',
      headers: { apikey: CHAVE_PUBLICA, authorization: `Bearer ${CHAVE_PUBLICA}`, 'content-type': 'application/json', 'x-revisai-sistema': chave },
      body: JSON.stringify({ p_user: userId, p_ip: ipDe(req), p_porta: Number(req.headers.get('x-forwarded-port')) || null, p_rota: req.nextUrl.pathname.slice(0, 200), p_agente: (req.headers.get('user-agent') ?? '').slice(0, 300) }),
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    // o acesso fica para a próxima hora
  }
}

export async function proxy(req: NextRequest, evento: NextFetchEvent) {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  const caminho = req.nextUrl.pathname;
  const naAreaDaEquipe = caminho === '/admin' || caminho.startsWith('/admin/');

  if (HOST_EQUIPE) {
    const noHostDaEquipe = host === HOST_EQUIPE;
    if (noHostDaEquipe) {
      if (!ipPermitido(ipDe(req), IPS_EQUIPE)) return naoExiste(req);
      if (caminho === '/') return NextResponse.redirect(new URL('/admin', req.url));
      if (!naAreaDaEquipe && !caminho.startsWith('/_next/') && caminho !== '/nao-encontrado') return naoExiste(req);
    } else if (naAreaDaEquipe) {
      return naoExiste(req);
    }
  }

  let resposta = NextResponse.next({ request: req });
  if (!URL_SUPABASE || !CHAVE_PUBLICA || !temSessao(req)) {
    // sem sessão, a área da equipe só mostra a entrada
    if (naAreaDaEquipe && caminho !== '/admin/entrar') return naoExiste(req);
    return resposta;
  }

  const supabase = createServerClient(URL_SUPABASE, CHAVE_PUBLICA, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(lista) {
        for (const { name, value } of lista) req.cookies.set(name, value);
        resposta = NextResponse.next({ request: req });
        for (const { name, value, options } of lista)
          resposta.cookies.set(name, value, naAreaDaEquipe ? { ...options, httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' } : options);
      }
    }
  });

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getClaims();
    userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  } catch {
    userId = null;
  }

  if (naAreaDaEquipe && caminho !== '/admin/entrar' && !userId) return naoExiste(req);

  if (userId) {
    const hora = Math.floor(Date.now() / 3_600_000).toString(36);
    const marca = `${hora}.${userId.slice(0, 8)}`;
    if (req.cookies.get(COOKIE_ACESSO)?.value !== marca) {
      evento.waitUntil(anotarAcesso(userId, req));
      resposta.cookies.set(COOKIE_ACESSO, marca, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 3600, path: '/' });
    }
  }
  return resposta;
}

export const config = {
  matcher: [
    // tudo, menos arquivos estáticos, imagens e as rotas de máquina (webhook, cron, voz)
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icone-|og.png|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|api/whatsapp|api/cron|api/voz|api/saude|api/pagamentos).*)'
  ]
};
