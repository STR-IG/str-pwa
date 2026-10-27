const CACHE_NAME = 'str-ig-cache-v136-payroll-no-discounts';

const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
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
      .then(() => { try { indexedDB.deleteDatabase('str-ig-analytics'); } catch {} return self.clients.claim(); })
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Private API responses must not survive document erasure in offline caches.
  if (new URL(event.request.url).origin === SUPABASE_URL || event.request.headers.has('Authorization')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Survey APIs and survey pages must never return stale/private cached data.
  const surveyUrl = new URL(event.request.url);
  if (surveyUrl.pathname.includes('/functions/v1/surveys') || /\/encuestas(?:-admin)?\.html$/.test(surveyUrl.pathname)) {
    event.respondWith(fetch(event.request, {cache:'no-store'}));
    return;
  }

  // Emergency status must never fall back to an old cached response.
  if (new URL(event.request.url).origin === 'https://analisi.transparenciacatalunya.cat') {
    event.respondWith(fetch(event.request, { cache:'no-store' }));
    return;
  }

  if (event.request.mode === 'navigate') {

    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
