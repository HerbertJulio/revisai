import { NextResponse, type NextRequest } from 'next/server';
import { permitido } from '@/lib/limite';
import { buscarFipe, type PedidoFipe } from './fonte';

export const dynamic = 'force-dynamic';

// A tabela FIPE para a tela do carro: ?acao=marcas | modelos&marca= | anos&marca=&modelo= |
// detalhe&marca=&modelo=&ano= | preco&codigo=. A FIPE é pública e grátis; o limite por endereço
// segura quem tentar usar o servidor do app como atalho.

const CABECALHOS = { 'Cache-Control': 'private, max-age=3600' };

function lerPedido(q: URLSearchParams): PedidoFipe | null {
  const acao = q.get('acao');
  const marca = q.get('marca') ?? '';
  const modelo = q.get('modelo') ?? '';
  const ano = q.get('ano') ?? '';
  const codigo = q.get('codigo') ?? '';
  const numero = (v: string) => /^\d{1,7}$/.test(v);
  if (acao === 'marcas') return { acao };
  if (acao === 'modelos' && numero(marca)) return { acao, marca };
  if (acao === 'anos' && numero(marca) && numero(modelo)) return { acao, marca, modelo };
  if (acao === 'detalhe' && numero(marca) && numero(modelo) && /^\d{4,5}-\d$/.test(ano)) return { acao, marca, modelo, ano };
  if (acao === 'preco' && /^\d{6}-\d$/.test(codigo)) return { acao, codigo };
  return null;
}

export async function GET(req: NextRequest) {
  const pedido = lerPedido(req.nextUrl.searchParams);
  if (!pedido) return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 });
  if (!(await permitido('fipe', 120, 10))) return NextResponse.json({ ok: false, erro: 'Muitas consultas seguidas. Espere alguns minutos.' }, { status: 429 });
  const r = await buscarFipe(pedido);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  if ('precos' in r && !r.precos.length) return NextResponse.json({ ok: false, erro: 'A FIPE não tem preço para esse carro.' }, { status: 404 });
  return NextResponse.json(r, { headers: CABECALHOS });
}
