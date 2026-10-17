import { NextResponse, type NextRequest } from 'next/server';
import { agenteResumido, LIMITES_DO_RELATO, lerRelato } from '@/lib/avisos/erros';
import { dentroDoLimite, lerJson, marcaDoIp, mesmaOrigem } from '@/lib/avisos/http';
import { clienteSistema } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

/**
 * Os erros que as telas encontram, para a equipe ver no painel. Sem dados pessoais: o texto é
 * limpo antes de guardar e o IP não fica guardado (só um resumo dele conta para o limite).
 */
export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return new NextResponse(null, { status: 403 });
  if (!(await dentroDoLimite(`erros:${marcaDoIp(req)}`, 30, 600))) return new NextResponse(null, { status: 429 });
  const relato = lerRelato(await lerJson(req, LIMITES_DO_RELATO.corpo));
  if (!relato) return new NextResponse(null, { status: 400 });
  const sb = clienteSistema();
  if (!sb) return new NextResponse(null, { status: 204 });
  const { error } = await sb.rpc('erros_registrar', {
    p_rota: relato.rota,
    p_mensagem: relato.mensagem,
    p_pilha: relato.pilha,
    p_origem: relato.origem,
    p_agente: agenteResumido(req.headers.get('user-agent')),
    p_versao: relato.versao
  });
  if (error) console.error('[erros] registrar', error.message);
  return new NextResponse(null, { status: 204 });
}
