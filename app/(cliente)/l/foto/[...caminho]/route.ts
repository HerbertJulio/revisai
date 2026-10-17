// As fotos do andamento e do checklist, pelo próprio site (as páginas só carregam imagens dele).
// O arquivo fica no bucket público 'links', numa pasta da oficina e com nome aleatório.

import { enderecoDaFotoNoStorage } from '@/lib/links-servidor';

export const dynamic = 'force-dynamic';

const NAO_ACHOU = () => new Response('Foto não encontrada', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, { params }: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await params;
  const url = enderecoDaFotoNoStorage((caminho ?? []).join('/'));
  if (!url) return NAO_ACHOU();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!r.ok || !/^image\/(jpeg|webp|png)$/.test(tipo)) return NAO_ACHOU();
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > 2_000_000) return NAO_ACHOU();
    return new Response(bytes, {
      headers: {
        'Content-Type': tipo,
        'Content-Length': String(bytes.byteLength),
        // o nome é novo a cada foto: não muda nunca
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch {
    return NAO_ACHOU();
  }
}
