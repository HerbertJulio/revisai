// Service worker do Revisaí: guarda o app da oficina para abrir sem internet (a última versão de
// cada tela que abriu com internet, mais os arquivos do app), mostra as notificações do resumo do
// dia e os avisos que chegam por Web Push, e abre a tela certa ao tocar neles. Ao sair da conta, o
// app apaga essa cópia (components/conta/sair.ts).
//
// Guardar é só para abrir sem internet: se o aparelho não tiver espaço, a tela segue com a resposta
// da internet e as cópias mais antigas saem. Cada publicação traz arquivos novos, então só ficam os
// mais recentes (LIMITE_ARQUIVOS e LIMITE_TELAS).
const ARQUIVOS = 'revisai-app-v2-arquivos';
const TELAS = 'revisai-app-v2-telas';
const LIMITE_ARQUIVOS = 300;
const LIMITE_TELAS = 40;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) =>
  evento.waitUntil(
    (async () => {
      const chaves = await caches.keys();
      await Promise.all(chaves.filter((k) => k.startsWith('revisai-app-') && k !== ARQUIVOS && k !== TELAS).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  )
);

const PAGINA_SEM_INTERNET = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem internet</title><style>body{font-family:system-ui,sans-serif;background:#e6e9e7;color:#1b1f22;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}main{max-width:420px}h1{font-size:24px}button{font:inherit;font-weight:600;padding:10px 18px;border-radius:999px;border:0;background:#1b1f22;color:#fff}</style></head><body><main><h1>Sem internet</h1><p>Esta tela ainda não foi aberta neste aparelho com internet. Volte para a tela inicial do app ou tente de novo quando o sinal voltar.</p><p><button onclick="location.href='/oficina'">Abrir o app</button></p></main></body></html>`;

function ehDoApp(url) {
  return url.pathname === '/oficina' || url.pathname.startsWith('/oficina/');
}

function ehArquivoFixo(url) {
  return url.pathname.startsWith('/_next/static/') || /^\/icone[-\w]*\.png$/.test(url.pathname) || url.pathname === '/manifest.webmanifest';
}

// deixa só as `manter` cópias mais novas (as chaves vêm na ordem em que foram guardadas)
async function aparar(cache, manter) {
  const chaves = await cache.keys();
  if (chaves.length > manter) await Promise.all(chaves.slice(0, chaves.length - manter).map((k) => cache.delete(k)));
}

async function guardar(nome, pedido, resposta, limite) {
  try {
    const cache = await caches.open(nome);
    try {
      await cache.put(pedido, resposta);
    } catch {
      // sem espaço no aparelho: solta a metade mais antiga e segue sem esta cópia
      await aparar(cache, Math.floor((await cache.keys()).length / 2));
      return;
    }
    await aparar(cache, limite);
  } catch {
    // nunca quebra a tela por não conseguir guardar
  }
}

async function guardado(nome, pedido, opcoes) {
  try {
    return await caches.match(pedido, { ...opcoes, cacheName: nome });
  } catch {
    return undefined;
  }
}

// arquivos do app têm o nome com o conteúdo: o que está guardado vale para sempre
async function primeiroGuardado(evento) {
  const pedido = evento.request;
  const copia = await guardado(ARQUIVOS, pedido);
  if (copia) return copia;
  const resposta = await fetch(pedido);
  // no desenvolvimento (?v=) cada mudança vira um arquivo novo: não vale guardar
  if (resposta.ok && resposta.type === 'basic' && !new URL(pedido.url).searchParams.has('v')) {
    evento.waitUntil(guardar(ARQUIVOS, pedido, resposta.clone(), LIMITE_ARQUIVOS));
  }
  return resposta;
}

// telas: sempre da internet; sem internet, a última cópia daquela tela (ou do início do app)
async function primeiroInternet(evento) {
  const pedido = evento.request;
  let resposta;
  try {
    resposta = await fetch(pedido);
  } catch {
    const copia = (await guardado(TELAS, pedido, { ignoreSearch: true })) || (await guardado(TELAS, '/oficina', { ignoreSearch: true }));
    if (copia) return copia;
    return new Response(PAGINA_SEM_INTERNET, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  if (resposta.ok && resposta.type === 'basic' && !resposta.redirected) evento.waitUntil(guardar(TELAS, pedido, resposta.clone(), LIMITE_TELAS));
  return resposta;
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  if (ehArquivoFixo(url)) {
    evento.respondWith(primeiroGuardado(evento));
    return;
  }
  if (pedido.mode === 'navigate' && ehDoApp(url)) evento.respondWith(primeiroInternet(evento));
});

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
