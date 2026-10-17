'use client';

// As fotos do andamento e do checklist. Com a conta, vão reduzidas para o Storage (bucket
// 'links', pasta da oficina, nome aleatório) e o registro guarda só o caminho; sem conta, ficam
// pequenas no próprio registro (data URL).

import { enderecoDaFoto } from '@/lib/andamento';
import { LIMITE_FOTO_NO_APARELHO } from '@/lib/checklist';
import { reduzirFoto } from '@/lib/imagem-cliente';
import type { FotoRegistro } from '@/lib/registros-oficina';
import type { ContextoDaConta } from './conta';

function aleatorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function novoIdDeFoto(): string {
  return `f-${aleatorio().slice(0, 16)}`;
}

/** O endereço para mostrar a foto (a do Storage passa pelo próprio site). */
export function enderecoDaFotoRegistro(f: FotoRegistro): string | null {
  if (f.dataUrl) return f.dataUrl;
  return f.caminho ? enderecoDaFoto(f.caminho) : null;
}

export async function enviarFoto(ctx: ContextoDaConta, pasta: 'andamento' | 'checklist', arquivo: File): Promise<{ ok: true; foto: FotoRegistro } | { ok: false; erro: string }> {
  try {
    const reduzida = await reduzirFoto(arquivo, 1280, 0.8);
    const ext = reduzida.type === 'image/webp' ? 'webp' : 'jpg';
    const caminho = `${ctx.oficinaId}/${pasta}/${aleatorio()}.${ext}`;
    const { error } = await ctx.sb.storage.from('links').upload(caminho, reduzida, { contentType: reduzida.type, upsert: false, cacheControl: '31536000' });
    if (error) {
      console.error('[fotos] envio', error);
      return { ok: false, erro: 'Não deu para guardar a foto. Confira a internet e tente de novo.' };
    }
    return { ok: true, foto: { id: novoIdDeFoto(), caminho } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não deu para preparar a foto.' };
  }
}

function lerComoDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, falhou) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falhou(new Error('Não deu para ler a foto.'));
    r.readAsDataURL(b);
  });
}

/** Sem conta: a foto bem pequena, até o limite do aparelho. */
export async function fotoNoAparelho(arquivo: File): Promise<{ ok: true; foto: FotoRegistro } | { ok: false; erro: string }> {
  try {
    for (const [lado, qualidade] of [
      [1000, 0.7],
      [800, 0.6],
      [640, 0.5]
    ] as const) {
      const reduzida = await reduzirFoto(arquivo, lado, qualidade);
      const dataUrl = await lerComoDataUrl(reduzida);
      if (dataUrl.length <= LIMITE_FOTO_NO_APARELHO) return { ok: true, foto: { id: novoIdDeFoto(), dataUrl } };
    }
    return { ok: false, erro: 'A foto ficou grande demais para guardar sem conta.' };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não deu para preparar a foto.' };
  }
}
