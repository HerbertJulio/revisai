// Service worker mínimo do Revisaí: mostra as notificações do resumo do dia (o Chrome do
// Android só mostra notificação por service worker) e abre o painel ao tocar nelas.
// Não guarda nada em cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const janela of janelas) {
        if (new URL(janela.url).pathname.startsWith('/oficina')) return janela.focus();
      }
      return self.clients.openWindow('/oficina');
    })()
  );
});
