import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dentroDoLimite, lerJson, marcaDoIp, mesmaOrigem } from '@/lib/avisos/http';
import { servicoDePushValido } from '@/lib/avisos/push';
import { clienteDoUsuario, sessaoAtual } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

// Inscreve (POST) ou tira (DELETE) este navegador dos avisos de quem está na conta.
// Só aceita os serviços de push dos navegadores (em desenvolvimento, também um local, para os testes).

const inscricao = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => servicoDePushValido(u), 'endereço do push inválido'),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,200}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{8,64}={0,2}$/)
  })
});

function nao(status: number, erro: string) {
  return NextResponse.json({ ok: false, erro }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return nao(403, 'origem');
  if (!(await sessaoAtual())) return nao(401, 'Entre na sua conta para ligar os avisos.');
  if (!(await dentroDoLimite(`push:${marcaDoIp(req)}`, 30, 600))) return nao(429, 'Muitas tentativas. Espere alguns minutos.');
  const r = inscricao.safeParse(await lerJson(req, 4000));
  if (!r.success) return nao(400, 'Inscrição inválida.');
  const sb = await clienteDoUsuario();
  if (!sb) return nao(503, 'Sem banco.');
  const { error } = await sb.rpc('push_inscrever', {
    p_endpoint: r.data.endpoint,
    p_p256dh: r.data.keys.p256dh,
    p_auth: r.data.keys.auth,
    p_agente: (req.headers.get('user-agent') ?? '').slice(0, 300)
  });
  if (error) {
    console.error('[push] inscrever', error.message);
    return nao(500, 'Não deu para ligar os avisos agora.');
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest) {
  if (!mesmaOrigem(req)) return nao(403, 'origem');
  if (!(await sessaoAtual())) return nao(401, 'Entre na sua conta.');
  const corpo = (await lerJson(req, 2000)) as { endpoint?: unknown } | null;
  const endpoint = typeof corpo?.endpoint === 'string' ? corpo.endpoint.slice(0, 1000) : '';
  if (!endpoint) return nao(400, 'Inscrição inválida.');
  const sb = await clienteDoUsuario();
  if (!sb) return nao(503, 'Sem banco.');
  const { error } = await sb.rpc('push_cancelar', { p_endpoint: endpoint });
  if (error) return nao(500, 'Não deu para desligar agora.');
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
