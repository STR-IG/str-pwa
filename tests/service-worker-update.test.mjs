import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
function setup(offline = false) {
  const handlers = {}, deleted = [], writes = [], requests = [];
  let claimed = false, skipped = false;
  const response = { version: 'current', clone() { return this; } };
  const context = vm.createContext({
    URL, Promise, Date, Math,
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => { skipped = true; },
      clients: { claim: async () => { claimed = true; } },
    },
    caches: {
      keys: async () => ['str-ig-cache-v42', 'str-ig-cache-v43', 'str-ig-cache-v44', 'str-ig-cache-v45', 'str-ig-cache-v46', 'other-app-cache'],
      delete: async name => { deleted.push(name); },
      open: async name => ({ put: async (request, value) => { writes.push({ name, request, value }); } }),
      match: async () => ({ version: 'cached' }),
    },
    fetch: async (request, options) => {
      requests.push({ request, options });
      if (offline) throw new Error('offline');
      return response;
    },
  });
  vm.runInContext(source, context);
  return { handlers, deleted, writes, requests, claimed: () => claimed, skipped: () => skipped };
}
test('new worker activates and removes only obsolete PWA caches', async () => {
  const app = setup();
  app.handlers.install({});
  let activated;
  app.handlers.activate({ waitUntil: promise => { activated = promise; } });
  await activated;
  assert.equal(app.skipped(), true);
  assert.equal(app.claimed(), true);
  assert.deepEqual(app.deleted, ['str-ig-cache-v42', 'str-ig-cache-v43', 'str-ig-cache-v44', 'str-ig-cache-v45', 'str-ig-cache-v46']);
});
for (const mode of ['navigate', 'cors']) {
  test(`${mode}: online load uses current network version even with cached data`, async () => {
    const app = setup();
    let result;
    app.handlers.fetch({
      request: { method: 'GET', mode, url: 'https://example.org/revisa-tu-nomina-base.html' },
      waitUntil() {}, respondWith: promise => { result = promise; },
    });
    assert.equal((await result).version, 'current');
    assert.equal(app.requests[0].options.cache, 'no-store');
    assert.equal(app.writes[0].name, 'str-ig-cache-v49');
  });
}
test('offline fallback remains available', async () => {
  const app = setup(true);
  let result;
  app.handlers.fetch({
    request: { method: 'GET', mode: 'navigate', url: 'https://example.org/revisa-tu-nomina-base.html' },
    waitUntil() {}, respondWith: promise => { result = promise; },
  });
  assert.equal((await result).version, 'cached');
});
