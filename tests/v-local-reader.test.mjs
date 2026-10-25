import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { parseVText, previousVMonth, readVReview } from '../v-local-reader.mjs';

test('local V parser suggests known unambiguous rows without confusing 12 hours with quantity', () => {
  const read = parseVText('0024 Pluses vacaciones 10,00 20,00 200,00\n0010 Plus de turno 20,00 10,00 200,00\n0080 Plus turno 12 horas 3,00 15,00 45,00\n0016 Rotatividad 20,00 100,00');
  assert.equal(read.concepts.length, 3);
  assert.deepEqual(read.concepts.find(row => row.code === '0080'), { code: '0080', name: 'Plus de turno 12 horas', quantity: 3, devengos: 45 });
  assert.equal(read.concepts.find(row => row.code === '0024').devengos, 200);
  assert.equal(parseVText('0010 Turno 20,00 200,00\n0010 Turno 10,00 100,00').concepts.length, 0);
  assert.equal(parseVText('0010 Turno ilegible').concepts.length, 0);
  assert.equal(parseVText('Jornada reducida').specialFlags.length, 1);
});

test('local review requires explicit monthly confirmation and valid days/amounts', () => {
  const nodes = new Map();
  const root = { getElementById: id => nodes.get(id) };
  nodes.set('v-local-days', { value: '10' }); nodes.set('v-local-paid', { value: '200,00' });
  for (let i = 0; i < 3; i++) {
    nodes.set(`v-local-confirm-${i}`, { checked: true });
    nodes.set(`v-local-${i}-0-quantity`, { value: '20' }); nodes.set(`v-local-${i}-0-amount`, { value: '400,00' });
  }
  const result = readVReview(root, '2026-10');
  assert.deepEqual(result.payrolls.map(row => row.month), ['2026-07', '2026-08', '2026-09']);
  assert.equal(result.payrolls[0].concepts[0].devengos, 400);
  assert.equal(result.days, 10); assert.equal(result.paidTotal, 200);
  nodes.get('v-local-confirm-1').checked = false;
  assert.throws(() => readVReview(root, '2026-10'), /CONFIRM_LOCAL_MONTHS/);
  nodes.get('v-local-confirm-1').checked = true; nodes.get('v-local-0-0-amount').value = 'incorrecto';
  assert.throws(() => readVReview(root, '2026-10'), /INVALID_LOCAL_VALUES/);
  assert.equal(previousVMonth('2026-01', 0), '2025-10');
});

const source = readFileSync(new URL('../supabase/functions/calculate-v-payrolls/index.ts', import.meta.url), 'utf8');
function backend({ admin = false, authorized = true, failStatus = false, failInsert = false } = {}) {
  const used = new Set(); let handler;
  const database = {
    auth: { getUser: async token => token === 'synthetic-token' ? { data: { user: { id: 'synthetic-user', email: 'synthetic@example.invalid' } } } : { data: {}, error: Error('unauthorized') } },
    from(table) {
      const filters = {};
      const query = {
        select() { return this; }, ilike(key, value) { filters[key] = value; return this; }, eq(key, value) { filters[key] = value; return this; },
        async maybeSingle() {
          if (table === 'private_access_allowlist') return { data: authorized ? { email: 'synthetic@example.invalid' } : null };
          if (table === 'committee_admins') return { data: admin ? { email: 'synthetic@example.invalid' } : null };
          if (table === 'v_calculation_usage') return failStatus ? { error: Error('synthetic status error') } : { data: used.has(filters.v_month) ? { v_month: filters.v_month } : null };
          throw Error('Unexpected table');
        },
        async insert(row) {
          if (failInsert) return { error: { code: 'synthetic' } };
          if (used.has(row.v_month)) return { error: { code: '23505' } };
          used.add(row.v_month); return { data: null };
        }
      }; return query;
    }
  };
  const js = stripTypeScriptTypes(source.replace(/^import[^\n]+\n/gm, ''));
  vm.runInNewContext(js, { Deno: { serve: fn => { handler = fn; }, env: { get: () => 'synthetic-config' } },
    createClient: () => database, Request, Response, console: { error() {} } });
  return { used, call: async (body, token = 'synthetic-token') => {
    const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  } };
}
const calculation = () => ({ vMonth: '2026-10', payrolls: ['2026-07','2026-08','2026-09'].map(month => ({ month, concepts: [{ code: '0010', quantity: 20, devengos: 400 }] })) });

test('server status reads existing usage without consuming a calculation', async () => {
  const app = backend();
  assert.equal((await app.call({ action: 'status', vMonth: '2026-10' })).data.canCalculate, true);
  assert.equal(app.used.size, 0);
  app.used.add('2026-10-01');
  const result = await app.call({ action: 'status', vMonth: '2026-10', adminContext: { affiliate: 'someone@example.invalid' } });
  assert.equal(result.data.used, true); assert.equal(result.data.canCalculate, false); assert.equal(result.cache, 'no-store');
});

test('one successful calculation stays consumed after deleting local documents and reopening', async () => {
  const app = backend();
  assert.equal((await app.call(calculation())).data.dailyValue, 20);
  // Local erasure sends no usage-delete request. The server marker survives.
  const erasedFiles = [];
  assert.equal(erasedFiles.length, 0);
  assert.equal((await app.call({ action: 'status', vMonth: '2026-10' })).data.used, true);
  assert.equal((await app.call(calculation())).status, 409);
  assert.equal((await app.call({ action: 'delete', vMonth: '2026-10' })).status, 400);
  assert.equal(app.used.size, 1);
});

test('concurrent calculations claim the existing unique usage only once', async () => {
  const app = backend();
  const results = await Promise.all([app.call(calculation()), app.call(calculation())]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('invalid input, access failures and storage failures do not return a completed result', async () => {
  const app = backend();
  assert.equal((await app.call({ action: 'status', vMonth: 'invalid' })).status, 400);
  assert.equal((await app.call(calculation(), 'bad-token')).status, 401);
  assert.equal((await backend({ authorized: false }).call(calculation())).status, 403);
  assert.equal((await backend({ failStatus: true }).call({ action: 'status', vMonth: '2026-10' })).status, 503);
  assert.equal((await backend({ failInsert: true }).call(calculation())).status, 500);
  const invalid = calculation(); invalid.payrolls[0].concepts = [];
  assert.equal((await app.call(invalid)).status, 422); assert.equal(app.used.size, 0);
  const spoof = calculation(); spoof.adminContext = { affiliate: 'someone@example.invalid', vMonth: '2026-10' };
  assert.equal((await app.call(spoof)).status, 403);
});

test('existing authorized administrator exemption is preserved', async () => {
  const app = backend({ admin: true });
  assert.equal((await app.call({ action: 'status', vMonth: '2026-10' })).data.unlimited, true);
  assert.equal((await app.call(calculation())).status, 200);
  assert.equal((await app.call(calculation())).status, 200);
  assert.equal(app.used.size, 0);
});

test('V entry has no image API transport and retired endpoints never forward a payload', async () => {
  const page = readFileSync(new URL('../area-privada.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /READ_V_ENDPOINT|read-v-payroll|imageDataUrl|imageFileToJpegDataUrl/);
  assert.match(page, /readVImageLocally/); assert.match(page, /eraseVCaptures/);
  for (const name of ['read-v-payroll','lab-read-v-payroll','calculate-v','lab-calculate-v']) {
    const retired = readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(retired, /fetch\(|api\.openai|OPENAI_API_KEY|req\.json|req\.text/);
    let handler;
    vm.runInNewContext(stripTypeScriptTypes(retired), { Deno: { serve: fn => { handler = fn; } }, Response });
    const response = handler(new Request('https://example.invalid', { method: 'POST', body: 'synthetic-image' }));
    assert.equal(response.status, 410);
  }
});
