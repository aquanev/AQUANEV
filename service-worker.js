/**
 * ============================================================
 * AQUANEV Sistema Profesional — Service Worker v1.0
 * ============================================================
 * Para actualizar en todos los dispositivos:
 *   Cambia CACHE_VERSION a un número mayor y sube el archivo.
 *   Ej: 'v1' → 'v2'  El banner de actualización aparece solo.
 * ============================================================
 */

const CACHE_VERSION = 'v1';
const CACHE_APP     = `aquanev-app-${CACHE_VERSION}`;
const CACHE_EXT     = `aquanev-ext-${CACHE_VERSION}`;

// Archivos del App Shell — se cachean al instalar
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// CDN externos: cachear con stale-while-revalidate
const EXT_ORIGINS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'kit.fontawesome.com',
  'ka-f.fontawesome.com',
];

// Siempre a la red: sincronización Google Sheets
const NET_ONLY_ORIGINS = [
  'script.google.com',
  'script.googleusercontent.com',
];

// ── INSTALL ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[AQUANEV SW] Instalando', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_APP).then(cache =>
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(e =>
            console.warn('[SW] Sin cachear:', url, e.message)
          )
        )
      )
    )
    // NO skipWaiting aquí: el usuario controla cuándo aplica la actualización
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[AQUANEV SW] Activando', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_APP && k !== CACHE_EXT)
          .map(k => { console.log('[SW] Borrando caché viejo:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Google Apps Script / sync → siempre red
  if (NET_ONLY_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. CDN externos → stale-while-revalidate
  if (EXT_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(swrStrategy(event.request, CACHE_EXT));
    return;
  }

  // 3. Archivos propios → cache-first con fallback a red
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(event.request, CACHE_APP));
    return;
  }

  // 4. Resto → red con fallback a caché
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── ESTRATEGIAS ───────────────────────────────────────────────

async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(
      `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
       <meta name="viewport" content="width=device-width,initial-scale=1">
       <title>AQUANEV — Sin conexión</title>
       <style>
         body{font-family:Arial,sans-serif;background:#667eea;color:white;
              display:flex;flex-direction:column;align-items:center;
              justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}
         .card{background:rgba(255,255,255,0.15);border-radius:16px;padding:32px;max-width:340px;}
         h2{margin:0 0 12px;}p{opacity:.9;line-height:1.5;}
         button{margin-top:20px;padding:12px 24px;border-radius:8px;border:none;
                background:white;color:#667eea;font-weight:700;font-size:16px;cursor:pointer;}
       </style></head>
       <body><div class="card">
         <div style="font-size:48px">📴</div>
         <h2>Sin conexión</h2>
         <p>AQUANEV necesita cargarse una vez con internet para funcionar offline.<br><br>
            Conéctate a WiFi o datos móviles y recarga la página.</p>
         <button onclick="location.reload()">🔄 Reintentar</button>
       </div></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function swrStrategy(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchP = fetch(request)
    .then(r => { if (r.ok) cache.put(request, r.clone()); return r; })
    .catch(() => null);
  return cached || await fetchP;
}

// ── MENSAJES DEL CLIENTE ──────────────────────────────────────
self.addEventListener('message', event => {
  // Activar nueva versión cuando el usuario aprieta "Actualizar"
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] skipWaiting — nueva versión activándose');
    self.skipWaiting();
  }
  // Mostrar notificación solicitada por el cliente
  if (event.data?.type === 'AQUANEV_NOTIFY') {
    const { title, body, tag, tab, requireInteraction } = event.data;
    self.registration.showNotification(title || 'AQUANEV', {
      body:               body || '',
      icon:               './icon-192.png',
      badge:              './icon-192.png',
      tag:                tag  || 'aquanev',
      requireInteraction: requireInteraction || false,
      data:               { tab: tab || 'dashboard' },
    });
  }
});

// ── BACKGROUND SYNC ───────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'aquanev-sync') {
    console.log('[SW] Background sync — notificando clientes');
    event.waitUntil(broadcastToClients({ type: 'AQUANEV_BACKGROUND_SYNC' }));
  }
});

// ── NOTIFICACIONES PUSH ───────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'AQUANEV', {
      body:               data.body || 'Nueva notificación',
      icon:               './icon-192.png',
      badge:              './icon-192.png',
      tag:                data.tag  || 'aquanev-push',
      requireInteraction: data.requireInteraction || false,
      data:               { tab: data.tab || 'dashboard' },
      actions: [
        { action: 'open',  title: '📂 Abrir' },
        { action: 'close', title: '✕ Cerrar' },
      ],
    })
  );
});

// Clic en notificación: enfocar ventana existente o abrir nueva
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const tab = event.notification.data?.tab || 'dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const win = clients.find(c =>
          c.url.includes('index.html') || c.url.includes('aquanev')
        );
        if (win) {
          win.focus();
          win.postMessage({ type: 'AQUANEV_NAV', tab });
        } else {
          self.clients.openWindow('./?tab=' + tab);
        }
      })
  );
});

// ── HELPER ────────────────────────────────────────────────────
async function broadcastToClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage(msg));
}
