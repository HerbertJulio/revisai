import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { midiaDoRascunho } from '@/lib/agente/rascunhos';
import { permitido } from '@/lib/limite';

export const dynamic = 'force-dynamic';

const esquema = z.object({ aparelhoId: z.uuid(), rascunhoId: z.uuid(), indice: z.number().int().min(0).max(19) });

/** Entrega ao app da oficina um áudio ou foto que chegou pelo WhatsApp (o navegador só fala com o site). */
export async function POST(req: NextRequest) {
  const r = esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ erro: 'Pedido inválido' }, { status: 400 });
  if (!(await permitido('agente-midia', 240, 10))) return NextResponse.json({ erro: 'Muitos pedidos' }, { status: 429 });
  const m = await midiaDoRascunho(r.data.aparelhoId, r.data.rascunhoId, r.data.indice);
  if (!m) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 });
  return new NextResponse(Buffer.from(m.bytes), { headers: { 'Content-Type': m.mime, 'Cache-Control': 'private, no-store' } });
}
