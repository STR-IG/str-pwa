import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('las novedades laborales se cuentan y se leen sin afectar a las de empresa', async () => {
  const storage = new Map();
  const badges = ['labor-news', 'company-news'].map(category => ({
    dataset: {newsCategory: category},
    badge: {textContent: '', setAttribute() {}, classList: {toggle() {}}},
    querySelector() { return this.badge; },
  }));
  const context = vm.createContext({
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    fetch: async () => { throw new Error('offline'); },
    navigator: {},
    document: {querySelectorAll: () => badges},
  });
  const source = readFileSync(new URL('../novedades.js', import.meta.url), 'utf8')
    .replace(/import \{ LABOR_NEWS \} from '[^']+';/, `const LABOR_NEWS = [{id:'labor-test',date:'2026-10-01'}];`)
    .replaceAll('export ', '');
  vm.runInContext(source, context);
  await context.refreshNewsBadges();
  assert.equal(badges[0].badge.textContent, '1');
  assert.equal(badges[1].badge.textContent, '1');
  await context.markCategoryRead('labor-news');
  assert.equal(badges[0].badge.textContent, '0');
  assert.equal(badges[1].badge.textContent, '1');
  assert.ok(JSON.parse(storage.get('str_news_read_ids')).includes('labor-test'));
});
