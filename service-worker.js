/**
 * ============================================================
 * AQUANEV Sistema Profesional — Service Worker v1.0
 * ============================================================
 * Para actualizar en todos los dispositivos:
 *   Cambia CACHE_VERSION a un número mayor y sube el archivo.
 *   Ej: 'v42' → 'v43'  El banner de actualización aparece solo.
 * ============================================================
 */
const CACHE_VERSION = 'v48';
const CACHE_APP     = `aquanev-app-${CACHE_VERSION}`;
const CACHE_EXT     = `aquanev-ext-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

// ── Instalación ──────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_APP).then(cache =>
      cache.addAll(APP_SHELL).catch(e => console.warn('[SW] Cache parcial:', e))
    )
  );
  // skipWaiting lo pide el cliente cuando está listo (ver mensaje SKIP_WAITING)
});

// ── Activación ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_APP && k !== CACHE_EXT)
          .map(k => { console.log('[SW] Eliminando caché obsoleto:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: red primero para index.html, caché para el resto ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // index.html: siempre red primero para garantizar código fresco
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_APP).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Resto de recursos: caché primero
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_EXT).then(c => c.put(event.request, clone));
        return response;
      });
    })
  );
});

// ── Mensajes desde el cliente ────────────────────────────────
self.addEventListener('message', event => {
  // Activación inmediata cuando el index.html detecta nueva versión
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] skipWaiting solicitado — activando nueva versión');
    self.skipWaiting();
  }

  // Background sync manual iniciado desde el cliente
  if (event.data?.type === 'AQUANEV_BACKGROUND_SYNC') {
    self.clients.matchAll().then(clients =>
      clients.forEach(c => c.postMessage({ type: 'AQUANEV_BACKGROUND_SYNC' }))
    );
  }
});

// ── Background sync ──────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'aquanev-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'AQUANEV_BACKGROUND_SYNC' }))
      )
    );
  }
});
