const CACHE_NAME = 'str-ig-cache-v38';

const SUPABASE_URL = 'https://icneigdnuntzugisexaz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_apKjcPClIBTHS2wwN6qPsA_6Vm4tk9m';
const ANALYTICS_TABLE = 'app_analytics_events';
const ANALYTICS_DB = 'str-ig-analytics';
const ANALYTICS_STORE = 'identity';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const PERMIT_TARGETS = {
  'hospitalizacion-primer-grado.html': 'hospitalizacion_primer_grado',
  'hospitalizacion-segundo-grado.html': 'hospitalizacion_segundo_grado',
  'intervencion-familiar-sin-ingreso-primer-grado.html': 'intervencion_sin_ingreso_primer_grado',
  'intervencion-familiar-sin-ingreso-segundo-grado.html': 'intervencion_sin_ingreso_segundo_grado',
  'intervencion-conviviente-sin-ingreso.html': 'intervencion_conviviente_sin_ingreso',
  'fallecimiento-familiar.html': 'fallecimiento_familiar',
  'matrimonio.html': 'matrimonio',
  'visita-medica.html': 'visita_medica',
  'permiso-deber-inexcusable.html': 'deber_inexcusable',
  'fuerza-mayor-familiar.html': 'fuerza_mayor_familiar',
  'permiso-traslado-domicilio.html': 'traslado_domicilio',
  'emergencia-climatica.html': 'emergencia_climatica'
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
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

function openAnalyticsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ANALYTICS_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ANALYTICS_STORE)) {
        db.createObjectStore(ANALYTICS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdentity() {
  const db = await openAnalyticsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYTICS_STORE, 'readonly');
    const request = tx.objectStore(ANALYTICS_STORE).get('analytics_identity');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeIdentity(value) {
  const db = await openAnalyticsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYTICS_STORE, 'readwrite');
    tx.objectStore(ANALYTICS_STORE).put(value, 'analytics_identity');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAnalyticsIdentity() {
  const now = Date.now();
  let identity = await readIdentity();

  if (!identity?.visitorId) {
    identity = {
      visitorId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      lastSeen: now
    };
  } else if (!identity.sessionId || !identity.lastSeen || now - identity.lastSeen > SESSION_TIMEOUT_MS) {
    identity.sessionId = crypto.randomUUID();
    identity.lastSeen = now;
  } else {
    identity.lastSeen = now;
  }

  await writeIdentity(identity);
  return identity;
}

function fileNameFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.pathname.split('/').filter(Boolean).pop() || '';
  } catch (_error) {
    return '';
  }
}

async function sendAnalyticsEvent(eventType, target, path) {
  try {
    const identity = await getAnalyticsIdentity();
    await fetch(`${SUPABASE_URL}/rest/v1/${ANALYTICS_TABLE}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        visitor_id: identity.visitorId,
        session_id: identity.sessionId,
        event_type: eventType,
        area: 'public',
        section: 'permisos_retribuidos',
        target: target || null,
        path,
        environment: 'production'
      })
    });
  } catch (_error) {
    // Analytics must never affect app navigation.
  }
}

async function trackPublicPermissionsNavigation(request) {
  const currentFile = fileNameFromUrl(request.url);

  if (currentFile === 'permisos.html') {
    await sendAnalyticsEvent('page_view', null, 'permisos.html');
    return;
  }

  const sourceFile = fileNameFromUrl(request.referrer || '');
  const target = PERMIT_TARGETS[currentFile];
  if (sourceFile === 'permisos.html' && target) {
    await sendAnalyticsEvent('card_click', target, currentFile);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.waitUntil(trackPublicPermissionsNavigation(event.request));
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
