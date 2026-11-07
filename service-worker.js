const CACHE_NAME = 'str-ig-cache-v146-privacy-draft';

const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const APP_ORIGIN = self.location.origin;

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
      .then(() => {
        try { indexedDB.deleteDatabase('str-ig-analytics'); } catch {}
        return self.clients.claim();
      })
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

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#e30613"><title>STR-IG</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f5f5f7;color:#222;font-family:Arial,sans-serif"><main style="max-width:420px;padding:24px;border-radius:20px;background:#fff;box-shadow:0 6px 22px #0002;text-align:center"><h1 style="margin:0 0 12px;color:#e30613">STR-IG</h1><p style="margin:0;line-height:1.5">Ahora mismo no hay conexión. Cierra la app y vuelve a abrirla cuando recuperes internet.</p></main></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

async function networkFirst(request, isNavigation) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isNavigation) return offlinePage();
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin === SUPABASE_URL || event.request.headers.has('Authorization')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (requestUrl.pathname.includes('/functions/v1/surveys') || /\/encuestas(?:-admin)?\.html$/.test(requestUrl.pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (requestUrl.origin === 'https://analisi.transparenciacatalunya.cat') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Let Safari handle external modules and resources directly. Caching opaque
  // cross-origin responses caused some installed copies to open as a blank page.
  if (requestUrl.origin !== APP_ORIGIN) return;

  event.respondWith(networkFirst(event.request, event.request.mode === 'navigate'));
});
