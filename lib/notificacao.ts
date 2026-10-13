'use client';

// Notificações do navegador. No Android, só funcionam pelo service worker (public/sw.js).

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!('serviceWorker' in navigator)) return null;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/** Mostra uma notificação. Devolve true se ela apareceu. */
export async function notificar(titulo: string, corpo: string): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const registro = (await navigator.serviceWorker?.getRegistration('/')) ?? (await registrarServiceWorker());
    const opcoes: NotificationOptions = { body: corpo, icon: '/icone-192.png', badge: '/icone-192.png', tag: 'revisai-resumo' };
    if (registro) {
      await registro.showNotification(titulo, opcoes);
      return true;
    }
    new Notification(titulo, opcoes);
    return true;
  } catch {
    return false;
  }
}

export async function pedirPermissao(): Promise<NotificationPermission | 'indisponivel'> {
  try {
    if (typeof Notification === 'undefined') return 'indisponivel';
    await registrarServiceWorker();
    return await Notification.requestPermission();
  } catch {
    return 'indisponivel';
  }
}
