import { NextResponse, type NextRequest } from 'next/server';
import { atenderApi, lerCorpoLimitado, type PedidoDaApi } from '@/lib/loja/api';
import { MAXIMO_DO_CORPO } from '@/lib/loja/api-dados';
import { clienteSistema } from '@/lib/supabase-servidor';

// API de estoque e preço para o sistema da loja (ERP, Bling, Tiny, planilha automática).
//   GET   /api/lojas/v1/produtos?codigo=&depois=&limite=   os produtos da loja do token
//   PATCH /api/lojas/v1/produtos {"produtos": [...]}         preço, estoque, prazo e "à venda" por código
// O token vai em Authorization: Bearer <token> (o dono cria no painel, em Integração). O banco resolve
// o token pelas funções do sistema e só mexe nos produtos daquela loja.

export const dynamic = 'force-dynamic';

function pedido(req: NextRequest, metodo: PedidoDaApi['metodo']): PedidoDaApi {
  const tamanho = req.headers.get('content-length');
  return {
    metodo,
    autorizacao: req.headers.get('authorization'),
    ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local',
    busca: req.nextUrl.searchParams,
    corpo: () => lerCorpoLimitado(req.body, MAXIMO_DO_CORPO, tamanho != null && /^\d+$/.test(tamanho) ? Number(tamanho) : null)
  };
}

async function responder(req: NextRequest, metodo: PedidoDaApi['metodo']) {
  const r = await atenderApi(pedido(req, metodo), clienteSistema());
  return NextResponse.json(r.corpo, { status: r.status, headers: { 'Cache-Control': 'no-store', ...(r.cabecalhos ?? {}) } });
}

export function GET(req: NextRequest) {
  return responder(req, 'GET');
}

export function PATCH(req: NextRequest) {
  return responder(req, 'PATCH');
}
