// A foto de um pedido de devolução, pelo próprio site (as páginas só carregam imagens dele). Sai só
// para quem vê a devolução, pelas regras do banco: a oficina que pediu, a loja que vendeu e a equipe.
// Serve aos dois lados; o endereço vem de enderecoDaFotoDaDevolucao.

import { fotoDaDevolucao } from '@/lib/loja/devolucoes';
import { clienteDoUsuario } from '@/lib/supabase-servidor';

export const dynamic = 'force-dynamic';

const NAO_ACHOU = () => new Response('Foto não encontrada', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; indice: string }> }) {
  const { id, indice } = await params;
  if (!/^\d$/.test(indice)) return NAO_ACHOU();
  const sb = await clienteDoUsuario();
  if (!sb) return NAO_ACHOU();
  const foto = await fotoDaDevolucao(sb, id, Number(indice));
  if (!foto) return NAO_ACHOU();
  return new Response(foto.bytes, {
    headers: {
      'Content-Type': foto.tipo,
      'Content-Length': String(foto.bytes.byteLength),
      // a foto não muda (o nome é novo a cada envio), mas é de quem pode ver: só no aparelho
      'Cache-Control': 'private, max-age=86400',
      'Content-Disposition': 'inline'
    }
  });
}
