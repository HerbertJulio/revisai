'use client';

// Áudios e fotos das ordens de serviço, guardados no IndexedDB do aparelho (fora do estado
// principal, para o salvamento continuar rápido).

import { del, get, set } from 'idb-keyval';
import { useEffect, useState } from 'react';

const chave = (id: string) => `revisai:midia:${id}`;

export async function guardarMidia(id: string, blob: Blob): Promise<boolean> {
  try {
    await set(chave(id), blob);
    return true;
  } catch {
    return false;
  }
}

export async function lerMidia(id: string): Promise<Blob | null> {
  try {
    return ((await get(chave(id))) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function apagarMidia(id: string): Promise<void> {
  try {
    await del(chave(id));
  } catch {}
}

/** Um endereço temporário para mostrar a mídia guardada (some quando o componente sai da tela). */
export function useUrlDaMidia(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    let criado: string | null = null;
    void lerMidia(id).then((b) => {
      if (!vivo || !b) return;
      criado = URL.createObjectURL(b);
      setUrl(criado);
    });
    return () => {
      vivo = false;
      if (criado) URL.revokeObjectURL(criado);
    };
  }, [id]);
  return url;
}
