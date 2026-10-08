const CACHE_NAME = 'str-ig-cache-v59';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('str-ig-cache-') && cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch (_error) {}
  const badgeCount = Math.max(0, Number(payload.badge) || 0);

  event.waitUntil((async () => {
    try {
      if (badgeCount > 0 && 'setAppBadge' in self.navigator) {
        await self.navigator.setAppBadge(badgeCount);
      } else if ('clearAppBadge' in self.navigator) {
        await self.navigator.clearAppBadge();
      }
    } catch (_error) {}

    await self.registration.showNotification('Tienes una novedad', {
      body: 'Entra en la app para verla.',
      icon: './icono-str-ig-192.png',
      badge: './icono-str-ig-192.png',
      tag: 'str-ig-novedades',
      renotify: true,
      data: { url: './index.html' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});


// Cache only public files on this site. Supabase responses and signed URLs
// must never survive logout in the PWA cache.
const PRIVATE_PAGES = new Set([
  'acceso-privado.html', 'auth-callback.html', 'area-privada.html',
  'revisa-tu-nomina.html', 'revisa-tu-nomina-base.html', 'revisa-nomina.html',
  'estadisticas-nomina.html', 'justificantes-oficiales.html',
  'comunicados-internos.html', 'panel-administracion.html', 'alta-afiliados.html'
]);
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (url.search || PRIVATE_PAGES.has(url.pathname.split('/').pop())) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok && response.type !== 'opaque') {
        const copy = response.clone();
        await caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await caches.match(event.request, { cacheName: CACHE_NAME });
      if (cached) return cached;
      throw error;
    }
  })());
});
