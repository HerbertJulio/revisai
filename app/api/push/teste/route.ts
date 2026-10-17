import { NextResponse, type NextRequest } from 'next/server';
import { dentroDoLimite, marcaDoIp, mesmaOrigem } from '@/lib/avisos/http';
import { cargaDoPush } from '@/lib/avisos/mensagens';
import { chavesVapid, enviarPush } from '@/lib/avisos/push';
import { clienteDoUsuario, sessaoAtual } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

/** Manda um aviso de teste para os navegadores de quem está na conta. */
export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const sessao = await sessaoAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: 'Entre na sua conta.' }, { status: 401 });
  if (!(await dentroDoLimite(`push-teste:${sessao.userId}:${marcaDoIp(req)}`, 5, 600))) return NextResponse.json({ ok: false, erro: 'Espere alguns minutos para testar de novo.' }, { status: 429 });
  const sb = await clienteDoUsuario();
  const chaves = await chavesVapid();
  if (!sb || !chaves) return NextResponse.json({ ok: false, erro: 'Os avisos ainda não estão ligados no servidor.' }, { status: 503 });
  const { data, error } = await sb.from('push_inscricoes').select('endpoint, p256dh, auth').limit(20);
  if (error) return NextResponse.json({ ok: false, erro: 'Não deu para testar agora.' }, { status: 500 });
  const carga = cargaDoPush({ titulo: 'Avisos ligados', corpo: 'É assim que os avisos do Revisaí chegam neste aparelho.', url: '/conta?ver=1', marca: 'teste' });
  let enviados = 0;
  const sumiram: string[] = [];
  for (const i of (data ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
    const r = await enviarPush(i, carga, chaves, 300);
    if (r === 'ok') enviados++;
    else if (r === 'sumiu') sumiram.push(i.endpoint);
  }
  // inscrição que o serviço de push disse que não existe mais sai da lista
  for (const endpoint of sumiram) await sb.rpc('push_cancelar', { p_endpoint: endpoint });
  return NextResponse.json({ ok: enviados > 0, enviados }, { headers: { 'Cache-Control': 'no-store' } });
}
