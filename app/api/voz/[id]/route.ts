// A voz natural de uma frase do passo a passo (WAV). Sem voz pronta, 204 sem corpo: o navegador lê o
// texto (sem erro no console de quem usa o app).

import { permitido } from '@/lib/limite';
import { fraseValida, versaoDaFrase } from '@/lib/voz-frases';
import { vozDaFrase } from '@/lib/voz-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!fraseValida(id)) return new Response('Frase não encontrada', { status: 404 });
  // o endereço leva a versão da frase: outro valor não passa (e não fura o cache da CDN)
  if (new URL(req.url).searchParams.get('v') !== versaoDaFrase(id)) return new Response('Versão da frase não confere', { status: 404 });
  try {
    const wav = await vozDaFrase(id, () => permitido('voz-gerar', 30, 60));
    if (!wav) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    return new Response(new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wav.length),
        // o endereço muda quando a frase muda (?v=), então pode guardar por bastante tempo
        'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, immutable'
      }
    });
  } catch (e) {
    console.error('[voz]', e);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
}
