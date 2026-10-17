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

// ---------------------------------------------------------------- Web Push (avisos com o app fechado)

export type EstadoPush = 'indisponivel' | 'bloqueado' | 'desligado' | 'ligado';

function paraBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const bruto = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/** iPhone e iPad só recebem push com o app instalado na tela de início (iOS 16.4 ou mais novo). */
export function precisaInstalarParaPush(): boolean {
  try {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const instalado = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return ios && !instalado;
  } catch {
    return false;
  }
}

export async function estadoDoPush(): Promise<EstadoPush> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'indisponivel';
    if (Notification.permission === 'denied') return 'bloqueado';
    const registro = await navigator.serviceWorker.getRegistration('/');
    const inscricao = await registro?.pushManager.getSubscription();
    return inscricao && Notification.permission === 'granted' ? 'ligado' : 'desligado';
  } catch {
    return 'indisponivel';
  }
}

/** Pede a permissão, inscreve este navegador e avisa o servidor. */
export async function ligarPush(): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, erro: 'Este navegador não recebe avisos com o app fechado.' };
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') return { ok: false, erro: 'O navegador não deixou mostrar avisos. Libere nas configurações do site.' };
    const registro = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);
    if (!registro) return { ok: false, erro: 'Não deu para preparar os avisos neste navegador.' };
    const r = await fetch('/api/push/chave', { cache: 'no-store' });
    const { chave } = (await r.json()) as { chave: string | null };
    if (!chave) return { ok: false, erro: 'Os avisos ainda não estão ligados no servidor.' };
    let inscricao = await registro.pushManager.getSubscription();
    if (!inscricao) inscricao = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(chave) });
    const salvo = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inscricao.toJSON()) });
    if (!salvo.ok) {
      const j = (await salvo.json().catch(() => ({}))) as { erro?: string };
      return { ok: false, erro: j.erro ?? 'Não deu para ligar os avisos agora.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não deu para ligar os avisos neste navegador.' };
  }
}

/** Tira este navegador dos avisos (no servidor e no navegador). */
export async function desligarPush(): Promise<boolean> {
  try {
    const registro = await navigator.serviceWorker.getRegistration('/');
    const inscricao = await registro?.pushManager.getSubscription();
    if (!inscricao) return true;
    await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: inscricao.endpoint }) }).catch(() => null);
    return await inscricao.unsubscribe();
  } catch {
    return false;
  }
}
