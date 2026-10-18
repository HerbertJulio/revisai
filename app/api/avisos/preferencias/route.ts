import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { lerJson, mesmaOrigem } from '@/lib/avisos/http';
import { TIPOS_AVISO, type TipoAviso } from '@/lib/avisos/mensagens';
import { clienteDoUsuario, sessaoAtual } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

// As preferências de avisos de quem está na conta: canais (push, e-mail, WhatsApp) e os tipos desligados.

const PADRAO = { push: true, email: true, whatsapp: true, desligados: [] as TipoAviso[] };

const esquema = z.object({
  push: z.boolean(),
  email: z.boolean(),
  whatsapp: z.boolean(),
  desligados: z.array(z.enum(TIPOS_AVISO.map((t) => t.id) as [TipoAviso, ...TipoAviso[]])).max(TIPOS_AVISO.length)
});

const SEM_CACHE = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (!(await sessaoAtual())) return NextResponse.json({ ok: false }, { status: 401, headers: SEM_CACHE });
  const sb = await clienteDoUsuario();
  if (!sb) return NextResponse.json({ ok: false }, { status: 503, headers: SEM_CACHE });
  const [p, i] = await Promise.all([sb.from('avisos_preferencias').select('push, email, whatsapp, desligados').maybeSingle(), sb.from('push_inscricoes').select('endpoint', { count: 'exact', head: true })]);
  return NextResponse.json({ ok: true, preferencias: p.data ? { ...PADRAO, ...p.data } : PADRAO, aparelhos: i.count ?? 0 }, { headers: SEM_CACHE });
}

export async function PUT(req: NextRequest) {
  if (!mesmaOrigem(req)) return NextResponse.json({ ok: false }, { status: 403, headers: SEM_CACHE });
  const sessao = await sessaoAtual();
  if (!sessao) return NextResponse.json({ ok: false }, { status: 401, headers: SEM_CACHE });
  const r = esquema.safeParse(await lerJson(req, 2000));
  if (!r.success) return NextResponse.json({ ok: false, erro: 'Preferências inválidas.' }, { status: 400, headers: SEM_CACHE });
  const sb = await clienteDoUsuario();
  if (!sb) return NextResponse.json({ ok: false }, { status: 503, headers: SEM_CACHE });
  const { error } = await sb
    .from('avisos_preferencias')
    .upsert({ user_id: sessao.userId, ...r.data, desligados: [...new Set(r.data.desligados)], atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) {
    console.error('[avisos] preferências', error.message);
    return NextResponse.json({ ok: false, erro: 'Não deu para salvar agora.' }, { status: 500, headers: SEM_CACHE });
  }
  return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
}
