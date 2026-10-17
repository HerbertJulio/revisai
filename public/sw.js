// Service worker mínimo do Revisaí: mostra as notificações do resumo do dia e os avisos que
// chegam por Web Push (pedido novo, resposta de alerta, orçamento aprovado...) e abre a tela
// certa ao tocar neles. Não guarda nada em cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let d = {};
  try {
    d = evento.data ? evento.data.json() : {};
  } catch {
    d = { corpo: evento.data ? evento.data.text() : '' };
  }
  const titulo = typeof d.titulo === 'string' && d.titulo ? d.titulo : 'Revisaí';
  const marca = typeof d.marca === 'string' && d.marca ? d.marca : undefined;
  const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/oficina';
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: typeof d.corpo === 'string' ? d.corpo : '',
      icon: '/icone-192.png',
      badge: '/icone-192.png',
      tag: marca,
      renotify: !!marca,
      data: { url }
    })
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || '/oficina';
  const area = '/' + (destino.split('/')[1] || 'oficina').split('?')[0].split('#')[0];
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const janela of janelas) {
        if (new URL(janela.url).pathname.startsWith(area)) {
          if (new URL(janela.url).pathname + new URL(janela.url).search !== destino && 'navigate' in janela) {
            try {
              await janela.navigate(destino);
            } catch {
              // a janela pode não deixar navegar (outra origem); só traz para a frente
            }
          }
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    })()
  );
});

// o navegador trocou a inscrição do push: inscreve de novo e avisa o servidor
self.addEventListener('pushsubscriptionchange', (evento) => {
  evento.waitUntil(
    (async () => {
      try {
        const r = await fetch('/api/push/chave', { credentials: 'same-origin' });
        const { chave } = await r.json();
        if (!chave) return;
        const bruto = atob(chave.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (chave.length % 4)) % 4));
        const bytes = new Uint8Array(bruto.length);
        for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
        const nova = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        await fetch('/api/push', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nova.toJSON()) });
      } catch {
        // na próxima vez que o app abrir, a tela de avisos inscreve de novo
      }
    })()
  );
});
