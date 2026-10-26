import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

async function analytics() {
  const sent = [], removed = [], listeners = {};
  const context = vm.createContext({ URL, location: { href: 'https://str-ig.github.io/str-pwa/app.html' },
    localStorage: { removeItem: key => removed.push(key) }, sessionStorage: { removeItem: key => removed.push(key) },
    indexedDB: { deleteDatabase: key => removed.push(key) },
    document: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    fetch: async (url, options) => { sent.push({ url, ...options }); return {}; }
  });
  const module = new vm.SourceTextModule(readFileSync(new URL('../app-analytics.js', import.meta.url), 'utf8'), { context });
  await module.link(() => new vm.SourceTextModule(readFileSync(new URL('../card-catalog.mjs', import.meta.url), 'utf8'), { context }));
  await module.evaluate();
  return { api: module.namespace, sent, removed, click: listeners.click };
}

test('loading a page records no event and clears legacy analytics identities and consultation drafts', async () => {
  const a = await analytics();
  assert.equal(a.sent.length, 0);
  assert.ok(a.removed.includes('str_analytics_visitor_v1'));
  assert.ok(a.removed.includes('str-ig-analytics'));
  assert.ok(a.removed.includes('strPublicDutyDraftV1'));
});

test('card counts send only a catalog key, without account token, cookies, query, fragment or user label', async () => {
  const a = await analytics();
  const key = a.api.cardDestination('acceso-privado.html?next=revisa-nomina.html&email=private%40example.com#private-name');
  assert.equal(key, 'revisa-tu-nomina.html');
  await a.api.track('card_click', key);
  assert.equal(a.sent.length, 1);
  const r = a.sent[0];
  assert.equal(r.body, '{"p_card":"revisa-tu-nomina.html"}');
  assert.equal(r.credentials, 'omit');
  assert.equal(r.referrerPolicy, 'no-referrer');
  assert.equal(r.headers.Authorization, undefined);
  assert.equal(r.headers['X-Permit-Device'], undefined);
});

test('external destinations, private filenames and arbitrary labels cannot enter the card catalog', async () => {
  const a = await analytics();
  for (const href of ['https://other.test/user.html', 'private-user@example.com.html', 'https://str-ig.github.io/other/app.html']) {
    assert.equal(a.api.cardDestination(href), null);
  }
  await a.api.track('page_view', 'app.html');
  await a.api.track('card_click', 'private-user@example.com');
  assert.equal(a.sent.length, 0);
});

test('a card click increments once; the worker has no secondary navigation tracking', async () => {
  const a = await analytics();
  const anchor = { dataset: {}, matches: () => true, getAttribute: () => 'hospitalizacion-primer-grado.html' };
  a.click({ target: { closest: () => anchor } });
  assert.equal(a.sent.length, 1);
  const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /visitorId|sessionId|sendAnalyticsEvent|trackPublicPermissionsNavigation|app_analytics_events/);
});
