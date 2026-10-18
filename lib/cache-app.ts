'use client';

/**
 * Apaga a cópia do app que o service worker guarda para abrir sem internet (as telas da oficina
 * vêm com dados da conta). Chamado ao sair da conta.
 */
export async function limparCacheDoApp(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k.startsWith('revisai-app-')).map((k) => caches.delete(k)));
  } catch {
    // sem acesso ao cache (navegação privada): não há o que apagar
  }
}
