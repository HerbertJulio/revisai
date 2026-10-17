import { after, NextResponse, type NextRequest } from 'next/server';
import { ehNomeDeProvedor, provedorPorNome } from '@/lib/cobranca';
import { processarAvisos } from '@/lib/cobranca/servidor';
import type { Evento } from '@/lib/cobranca/tipos';
import { clienteSistema } from '@/lib/supabase-servidor';

// Avisos dos gateways de pagamento: /api/pagamentos/asaas, /api/pagamentos/efi (a Efí acrescenta
// /pix no fim) e /api/pagamentos/teste (só no computador). Confere que o aviso é do gateway,
// guarda cada evento uma vez só e responde na hora; o efeito (Pro ligado, nota fiscal) é
// aplicado depois da resposta. O mesmo aviso repetido recebe 200 e não faz nada.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMITE = 256 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ provedor: string; resto?: string[] }> }) {
  const { provedor: nome } = await ctx.params;
  const provedor = ehNomeDeProvedor(nome) ? provedorPorNome(nome) : null;
  if (!provedor) return NextResponse.json({ erro: 'Gateway desconhecido' }, { status: 404 });

  const corpo = await req.text();
  if (corpo.length > LIMITE) return NextResponse.json({ erro: 'Aviso grande demais' }, { status: 413 });
  if (!provedor.validarWebhook({ cabecalhos: req.headers, url: new URL(req.url), corpo })) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }
  let json: unknown;
  try {
    json = corpo ? JSON.parse(corpo) : {};
  } catch {
    return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  const eventos = provedor.lerEventos(json);
  if (!eventos.length) return NextResponse.json({ ok: true, novos: 0 });
  const sb = clienteSistema();
  if (!sb) return NextResponse.json({ erro: 'Indisponível' }, { status: 503 });

  const novos: Evento[] = [];
  for (const e of eventos) {
    const { data, error } = await sb.rpc('cobranca_webhook_guardar', {
      p_provedor: provedor.nome,
      p_evento: e.id,
      p_tipo: e.tipo,
      p_corpo: { evento: e, bruto: eventos.length === 1 ? json : null }
    });
    if (error) {
      console.error('[pagamentos] guardar aviso', provedor.nome, e.id, error.message);
      // sem guardar, o gateway manda de novo depois
      return NextResponse.json({ erro: 'Tente de novo' }, { status: 500 });
    }
    if (data === true) novos.push(e);
  }
  if (novos.length) after(() => processarAvisos(provedor.nome, novos));
  return NextResponse.json({ ok: true, novos: novos.length });
}
