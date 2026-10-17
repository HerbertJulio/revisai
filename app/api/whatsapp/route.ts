import { after, NextResponse, type NextRequest } from 'next/server';
import { tratarTodas } from '@/lib/agente/webhook';
import { assinaturaValida, configWhatsApp, lerMensagens } from '@/lib/agente/whatsapp-cloud';

export const dynamic = 'force-dynamic';
// a IA pode levar até um minuto; o processamento roda depois da resposta (after)
export const maxDuration = 120;

/** Verificação do webhook pela Meta (feita uma vez, ao cadastrar a URL). */
export async function GET(req: NextRequest) {
  const c = configWhatsApp();
  const p = req.nextUrl.searchParams;
  if (c && p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === c.verificacao) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('Proibido', { status: 403 });
}

/** Mensagens que chegam no número do agente. Responde 200 na hora e trata depois. */
export async function POST(req: NextRequest) {
  const c = configWhatsApp();
  if (!c) return NextResponse.json({ erro: 'WhatsApp não configurado' }, { status: 503 });
  const corpo = await req.text();
  if (corpo.length > 1_000_000) return NextResponse.json({ erro: 'grande demais' }, { status: 413 });
  if (!assinaturaValida(corpo, req.headers.get('x-hub-signature-256'), c.segredo)) return NextResponse.json({ erro: 'assinatura' }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const mensagens = lerMensagens(json).slice(0, 50);
  if (mensagens.length) after(() => tratarTodas(c, mensagens));
  return NextResponse.json({ ok: true });
}

