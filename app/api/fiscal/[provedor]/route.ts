import { NextResponse, type NextRequest } from 'next/server';
import { ehNomeFiscal, provedorFiscalPorNome } from '@/lib/fiscal';
import { aplicarAvisoFiscal } from '@/lib/fiscal/servidor';

// Avisos do emissor de notas: /api/fiscal/focus (gatilhos da Focus NFe, com ?ambiente=) e
// /api/fiscal/teste (só no computador). Confere o segredo combinado, guarda o aviso uma vez só e
// aplica na nota numa chamada ao banco. O mesmo aviso repetido recebe 200 e não muda nada;
// erro no banco recebe 500 e o emissor manda de novo.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const LIMITE = 256 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }) {
  const { provedor: nome } = await ctx.params;
  const provedor = ehNomeFiscal(nome) ? provedorFiscalPorNome(nome) : null;
  if (!provedor) return NextResponse.json({ erro: 'Emissor desconhecido' }, { status: 404 });

  const corpo = await req.text();
  if (corpo.length > LIMITE) return NextResponse.json({ erro: 'Aviso grande demais' }, { status: 413 });
  const url = new URL(req.url);
  if (!provedor.validarWebhook({ cabecalhos: req.headers, url, corpo })) return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  let json: unknown;
  try {
    json = corpo ? JSON.parse(corpo) : {};
  } catch {
    return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  const evento = provedor.lerEvento(json, url);
  // aviso de outra coisa (ou de nota que não é do Revisaí): recebido, nada a fazer
  if (!evento) return NextResponse.json({ ok: true, novo: false });
  const r = await aplicarAvisoFiscal(provedor.nome, evento.id, evento.nota);
  if (!r.ok) return NextResponse.json({ erro: 'Tente de novo' }, { status: 500 });
  return NextResponse.json({ ok: true, novo: r.novo });
}
