import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { midiaDoRascunho } from '@/lib/agente/rascunhos';
import { acessoDaOficina } from '@/lib/conta';
import { permitido } from '@/lib/limite';

export const dynamic = 'force-dynamic';

const esquema = z.object({ rascunhoId: z.uuid(), indice: z.number().int().min(0).max(19) });

/** Só tipos de áudio e foto saem como tais; o resto vai como arquivo comum. */
function tipoSeguro(mime: string): string {
  return /^audio\/[a-z0-9.+-]+$/i.test(mime) || /^image\/(jpeg|png|webp)$/i.test(mime) ? mime : 'application/octet-stream';
}

/**
 * Entrega ao app da oficina um áudio ou foto que chegou pelo WhatsApp. Com a sessão de quem
 * entrou: o banco só mostra os rascunhos e a pasta da oficina dessa pessoa.
 */
export async function POST(req: NextRequest) {
  const r = esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ erro: 'Pedido inválido' }, { status: 400 });
  const a = await acessoDaOficina();
  if (!a.ok) return NextResponse.json({ erro: a.erro }, { status: 401 });
  if (!(await permitido('agente-midia', 240, 10))) return NextResponse.json({ erro: 'Muitos pedidos' }, { status: 429 });
  const m = await midiaDoRascunho(a.sb, a.oficina.id, r.data.rascunhoId, r.data.indice);
  if (!m) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 });
  return new NextResponse(Buffer.from(m.bytes), {
    headers: { 'Content-Type': tipoSeguro(m.mime), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment' }
  });
}
