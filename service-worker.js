const CACHE_PREFIX = 'str-ig-cache-';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX))
      .map((name) => caches.delete(name)));

    await self.clients.claim();

    const windows = await self.clients.matchAll({ type: 'window' });
    await Promise.all(windows.map(async (client) => {
      try {
        await client.navigate(client.url);
      } catch (_) {}
    }));
  })());
});
