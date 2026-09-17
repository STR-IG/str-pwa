import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('la portada incorpora una única card privada con badge inferior derecho', () => {
  const html = read('index.html');
  assert.equal(html.split('card-comunicados-internos.png').length - 1, 1);
  assert.match(html, /href="acceso-privado\.html\?next=comunicados-internos\.html"/);
  assert.match(html, /data-news-category="internal-communications"/);
  assert.match(html, /internal-communications-card \.news-notification-badge \{ top:auto; right:8px; bottom:8px; \}/);
});

test('el acceso privado permite únicamente el destino interno conocido', () => {
  const html = read('acceso-privado.html');
  assert.match(html, /'comunicados-internos\.html'/);
  assert.match(html, /ALLOWED_DESTINATIONS\.has\(requestedDestination\)/);
});

test('la página valida sesión y afiliación antes de mostrar el comunicado', () => {
  const html = read('comunicados-internos.html');
  assert.match(html, /supabase\.auth\.getUser\(\)/);
  assert.match(html, /is_current_user_private_access_allowed/);
  assert.match(html, /STORAGE_BUCKET='comunicados-internos'/);
  assert.match(html, /STORAGE_PATH='2026\/09\/comunicado-datos-afiliacion\.png'/);
  assert.match(html, /SIGNED_URL_TTL_SECONDS=300/);
  assert.match(html, /createSignedUrl\(STORAGE_PATH,SIGNED_URL_TTL_SECONDS\)/);
  assert.doesNotMatch(html, /src="comunicado-datos-afiliacion\.png"/);
  assert.match(html, /markNewsRead\(\[button\.dataset\.newsId\]\)/);
});

test('la URL firmada solo se solicita después de validar el acceso privado', () => {
  const html = read('comunicados-internos.html');
  const accessCheck = html.indexOf("supabase.rpc('is_current_user_private_access_allowed')");
  const signedUrl = html.indexOf('.createSignedUrl(STORAGE_PATH,SIGNED_URL_TTL_SECONDS)');
  assert.ok(accessCheck >= 0);
  assert.ok(signedUrl > accessCheck);
});

test('la migración crea un bucket privado y restringe la lectura al archivo y afiliación autorizada', () => {
  const sql = read('supabase/migrations/20260917100000_private_internal_communications.sql');
  assert.match(sql, /'comunicados-internos'[\s\S]*false/);
  assert.match(sql, /for select\s+to authenticated/i);
  assert.match(sql, /name = '2026\/09\/comunicado-datos-afiliacion\.png'/);
  assert.match(sql, /is_current_user_private_access_allowed\(\)/);
});

test('la novedad privada queda aislada de los contadores generales', () => {
  const source = read('novedades.js');
  assert.match(source, /category: 'internal-communications'/);
  assert.match(source, /item\.category !== 'internal-communications'/);
  assert.match(source, /export async function markNewsRead\(newsIds\)/);
});

test('el badge pasa de 1 a oculto después de visualizar el comunicado', async () => {
  const storage = new Map();
  const badge = {
    textContent: '',
    label: '',
    visible: false,
    setAttribute(_name, value) { this.label = value; },
    classList: { toggle(_name, value) { badge.visible = value; } },
  };
  const card = {
    dataset: { newsCategory: 'internal-communications' },
    querySelector() { return badge; },
  };
  const context = vm.createContext({
    console,
    crypto,
    setTimeout,
    clearTimeout,
    atob,
    fetch: async () => ({ ok: true, json: async () => [] }),
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    navigator: { clearAppBadge: async () => {} },
    window: { addEventListener() {} },
    document: {
      visibilityState: 'visible',
      head: { appendChild() {} },
      addEventListener() {},
      createElement: () => ({ id: '', textContent: '' }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: (selector) => selector === '[data-news-category]' ? [card] : [],
    },
  });
  vm.runInContext(read('novedades.js').replaceAll('export ', ''), context);

  await context.initNews();
  assert.equal(badge.textContent, '1');
  assert.equal(badge.visible, true);

  await context.markNewsRead(['internal-data-affiliation-2026-09']);
  assert.equal(badge.textContent, '0');
  assert.equal(badge.visible, false);
});
