import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
test('la entrada sindical unificada conserva contenido, rutas y avisos', () => {
  const home = read('index.html');
  assert.equal((home.match(/src="actividad-informacion-sindical-v2.png"/g) || []).length, 1);
  assert.doesNotMatch(home, /src="card-(?:actividad-sindical|informacion-plantilla).png"/);
  assert.match(home, /sindical-news-card[^>]+href="actividad-informacion-sindical.html"[^>]+data-news-category="activity"/);
  const hub = read('actividad-informacion-sindical.html');
  for (const file of ['nuestra-explicacion-documentacion.html', 'dia-afiliacion.html', 'comunicado-comedor.html', 'index.html']) {
    assert.ok(hub.includes('href="' + file + '"'));
    assert.ok(existsSync(new URL('../' + file, import.meta.url)));
  }
  assert.doesNotMatch(hub, /Infórmate y participa|class="accesses"|<span class="post-category">/);
  assert.equal((hub.match(/<article /g) || []).length, 3);
  for (const file of ['informacion-plantilla.html', 'actualidad-sindical.html', 'actividad-sindical.html']) {
    assert.match(read(file), /location.replace\('actividad-informacion-sindical.html'\)/);
    assert.doesNotMatch(read(file), /<article /);
  }
  assert.match(read('nuestra-explicacion-documentacion.html'), /markNewsRead\(\['documentation-explanation-2026-09-30'\]\)/);
  assert.match(read('dia-afiliacion.html'), /markNewsRead\(\['activity-dia-afiliacion-2026-10-24'\]\)/);
  for (const file of ['index.html', 'menu-comedor.html', 'permisos.html', 'preguntale-str-permisos.html']) {
    assert.doesNotMatch(read(file), /bottom-nav/);
  }
  assert.doesNotMatch(read('novedades.js'), /applyBottomNavActivity|bottom-nav/);
  assert.match(read('dia-afiliacion.html'), /href="https:\/\/www.soporteusuarios.com\/STR\/diaafiliacion\/"/);
});

import vm from 'node:vm';
test('la tarjeta de protección de datos abre la cronología y marca el aviso como leído', () => {
  const hub = read('actividad-informacion-sindical.html');
  const card = hub.match(/<article[^>]+data-news-category="documentation-info"[\s\S]*?<\/article>/)[0];
  assert.doesNotMatch(card, /<img|<a\s/);
  assert.match(card, /<button[^>]+aria-expanded="false"[^>]+aria-controls="documentation-timeline"/);
  assert.match(card, /id="documentation-timeline" hidden>\s*<details open>/);
  assert.doesNotMatch(card, /<summary>Paso/);
  assert.deepEqual([...card.matchAll(/<summary><strong>(.*?)<\/strong>/g)].map(([, date]) => date), [
    'noviembre de 2026', 'octubre de 2026', 'julio de 2026', 'julio de 2026',
  ]);
  const step = { open: false };
  const timeline = { hidden: true, querySelector: () => step };
  const action = { textContent: '' };
  const reads = [];
  const toggle = {
    addEventListener(type, listener) { this.click = listener; },
    setAttribute(key, value) { this[key] = value; },
    closest: () => ({ dataset: { newsId: 'documentation-explanation-2026-09-30' } }),
  };
  const elements = { '.documentation-toggle': toggle, '#documentation-timeline': timeline, '#documentation-action': action };
  vm.runInNewContext(hub.slice(hub.indexOf('    const toggle ='), hub.indexOf('    initNews().catch')), {
    document: { querySelector: selector => elements[selector] },
    markNewsRead: async ids => reads.push(...ids),
  });
  toggle.click();
  assert.equal(timeline.hidden, false);
  assert.equal(toggle['aria-expanded'], 'true');
  assert.equal(action.textContent, 'Ocultar cronología ▴');
  assert.equal(step.open, true);
  assert.deepEqual(reads, ['documentation-explanation-2026-09-30']);
  toggle.click();
  assert.equal(timeline.hidden, true);
  assert.equal(toggle['aria-expanded'], 'false');
  assert.equal(action.textContent, 'Ver cronología ▾');
});

test('el badge pasa de 1 a oculto después de visualizar la explicación', async () => {
  const storage = new Map();
  const badge = {
    textContent: '',
    label: '',
    visible: false,
    setAttribute(_name, value) { this.label = value; },
    classList: { toggle(_name, value) { badge.visible = value; } },
  };
  const card = {
    dataset: { newsCategory: 'documentation-info', newsId: 'documentation-explanation-2026-09-30' },
    querySelector() { return badge; },
  };
  const homeBadge = {textContent: '', setAttribute() {}, classList: {toggle() {}}};
  const homeCard = {dataset: {newsCategory: 'activity', newsCategories: 'activity documentation-info'}, querySelector: () => homeBadge};
  const context = vm.createContext({
    console,
    crypto,
    setTimeout,
    clearTimeout,
    atob,
    fetch: async () => ({ ok: true, json: async () => [{id: 'activity-dia-afiliacion-2026-10-24', category: 'activity', active: true}] }),
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
      querySelectorAll: (selector) => selector === '[data-news-category]' ? [card, homeCard] : [],
    },
  });
  vm.runInContext(read('novedades.js').replace(/import \{ LABOR_NEWS \} from '[^']+';/, 'const LABOR_NEWS = [];').replaceAll('export ', ''), context);

  await context.initNews();
  assert.equal(badge.textContent, '1');
  assert.equal(badge.visible, true);
  assert.equal(homeBadge.textContent, '2');

  await context.markNewsRead(['documentation-explanation-2026-09-30']);
  assert.equal(badge.textContent, '0');
  assert.equal(badge.visible, false);
  assert.equal(homeBadge.textContent, '1');
  await context.markNewsRead(['activity-dia-afiliacion-2026-10-24']);
  assert.equal(homeBadge.textContent, '0');
});

test('el listado ordena por publicación y vuelve directamente a Inicio', () => {
  const html = read('actividad-informacion-sindical.html');
  assert.match(html, /class="back" href="index.html"/);
  assert.match(html, /class="home" href="index.html"/);
  const children = ['2026-09-08T09:42:00Z', '2026-09-30T00:00:00Z', '2026-09-16T12:00:00Z'].map(publishedAt => ({dataset: {publishedAt}}));
  const ordered = [];
  const feed = {children, appendChild: post => ordered.push(post.dataset.publishedAt)};
  const script = html.split('const feed =')[1].split('const toggle =')[0];
  vm.runInNewContext('const feed =' + script, {document: {querySelector: () => feed}});
  assert.deepEqual(ordered, ['2026-09-30T00:00:00Z', '2026-09-16T12:00:00Z', '2026-09-08T09:42:00Z']);
});
