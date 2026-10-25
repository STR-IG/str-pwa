import test from 'node:test';
import assert from 'node:assert/strict';
import { deletePayrollData, deletionTarget, clearLocalPayrollData, confirmDeletion } from '../payroll-deletion.mjs';

const user = 'owner-a';
const month = `${user}/2026/10`;
const receipt = 'receipt-1792925663552-64c533ab-9492-466c-958e-3cdf4a4faa09';
const review = { status: 'complete', timesheet: { night: 12 }, payroll: { night: 10 }, discounts: [{ amount: 94 }],
  payrollEconomics: { totals: { gross: 2000, deductions: 500, net: 1500 }, concepts: [{ side: 'deductions', amount: 500 }, { side: 'earnings', amount: 2000 }] },
  supplemental: { '0038': { amount: 10 }, '0001': { amount: 2000 } },
  comparisons: { night: { difference: -2 } }, incidentCount: 1, paymentInfo: { breakdown: { netTotal: 1500 } } };

function bucket() {
  const objects = new Map();
  const removed = [];
  return {
    objects, removed, failRemove: false, ignoreRemove: false, failUpload: false,
    async list(folder, { limit = 100, offset = 0 } = {}) {
      if (!(folder === user || folder.startsWith(user + '/'))) return { error: Error('RLS') };
      const rows = new Map();
      for (const key of objects.keys()) {
        if (!key.startsWith(folder + '/')) continue;
        const relative = key.slice(folder.length + 1), name = relative.split('/')[0];
        rows.set(name, { name, id: relative.includes('/') ? null : key });
      }
      return { data: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + limit) };
    },
    async remove(paths) {
      if (this.failRemove) return { error: Error('synthetic failure') };
      if (paths.some(path => !path.startsWith(user + '/'))) return { error: Error('RLS') };
      if (!this.ignoreRemove) for (const path of paths) { objects.delete(path); removed.push(path); }
      return { data: [] };
    },
    async download(path) { return objects.has(path) ? { data: objects.get(path) } : { error: Error('missing') }; },
    async upload(path, blob) { if (this.failUpload) return { error: Error('failed') }; objects.set(path, blob); return { data: {} }; }
  };
}

function seed(b, folder = month) {
  for (const name of ['payroll', 'timesheet']) b.objects.set(`${folder}/${name}`, new Blob(['synthetic image']));
  b.objects.set(`${folder}/review`, new Blob([JSON.stringify(review)]));
}
const args = b => ({ bucket: b, userId: user, year: 2026, month: 10 });
const read = async (b, folder = month) => JSON.parse(await b.objects.get(`${folder}/review`).text());

test('delete all paginates, removes every object including summaries, and preserves another user', async () => {
  const b = bucket();
  for (let i = 0; i < 205; i++) b.objects.set(`${month}/file-${i}`, new Blob(['synthetic']));
  seed(b); seed(b, `${month}/${receipt}`); seed(b, `${user}/2025/01`);
  b.objects.set(`${month}/month-summary/review`, new Blob(['synthetic summary']));
  b.objects.set('owner-b/2026/10/payroll', new Blob(['other synthetic owner']));
  await deletePayrollData({ ...args(b), scope: 'all' });
  assert.deepEqual([...b.objects.keys()], ['owner-b/2026/10/payroll']);
  assert.ok(b.removed.length > 205);
});

test('receipt and payroll erasure remove figures and discounts, preserve unrelated receipts', async () => {
  for (const scope of ['receipt', 'payroll']) {
    const b = bucket(); seed(b); seed(b, `${month}/${receipt}`);
    b.objects.set(`${month}/month-summary/review`, new Blob(['summary']));
    await deletePayrollData({ ...args(b), scope });
    assert.equal(b.objects.has(`${month}/payroll`), false);
    assert.equal(b.objects.has(`${month}/review`), false);
    assert.equal(b.objects.has(`${month}/timesheet`), scope === 'payroll');
    assert.equal(b.objects.has(`${month}/${receipt}/review`), true);
    assert.equal(b.objects.has(`${month}/month-summary/review`), false);
  }
});

test('month deletes all receipts and closure while retaining the next month', async () => {
  const b = bucket(); seed(b); seed(b, `${month}/${receipt}`); seed(b, `${user}/2026/11`);
  await deletePayrollData({ ...args(b), scope: 'month' });
  assert.ok([...b.objects.keys()].every(path => path.startsWith(`${user}/2026/11/`)));
});

test('timesheet erasure removes every monthly copy and derived quantities, retains payroll economics', async () => {
  const b = bucket(); seed(b); seed(b, `${month}/${receipt}`);
  b.objects.set(`${month}/month-summary/review`, new Blob(['summary']));
  await deletePayrollData({ ...args(b), scope: 'timesheet' });
  for (const folder of [month, `${month}/${receipt}`]) {
    assert.equal(b.objects.has(`${folder}/timesheet`), false);
    assert.equal(b.objects.has(`${folder}/payroll`), true);
    const result = await read(b, folder);
    assert.equal(result.timesheet, undefined); assert.equal(result.comparisons, undefined);
    assert.equal(result.paymentInfo, undefined); assert.equal(result.status, 'pending');
    assert.deepEqual(result.payrollEconomics, review.payrollEconomics);
  }
});

test('discount erasure also removes economic copies and net fallback', async () => {
  const b = bucket(); seed(b);
  await deletePayrollData({ ...args(b), scope: 'discounts' });
  const result = await read(b);
  assert.equal(result.discounts, undefined); assert.equal(result.paymentInfo, undefined);
  assert.equal(result.payrollEconomics.totals.net, null);
  assert.equal(result.payrollEconomics.totals.deductions, null);
  assert.equal(result.payrollEconomics.totals.gross, 2000);
  assert.ok(result.payrollEconomics.concepts.every(row => row.side === 'earnings'));
  assert.equal(result.supplemental['0038'], undefined);
  assert.equal(b.objects.has(`${month}/payroll`), true);
});

test('invalid paths fail before access; corrupt reviews and silent RLS deletion fail closed', async () => {
  assert.throws(() => deletionTarget('../owner-b', { scope: 'all' }));
  assert.throws(() => deletionTarget(user, { scope: 'month', year: 2026, month: 13 }));
  assert.throws(() => deletionTarget(user, { scope: 'payroll', year: 2026, month: 10, receiptId: '../owner-b' }));
  const b = bucket(); seed(b);
  b.objects.set(`${month}/review`, new Blob(['corrupt']));
  await assert.rejects(deletePayrollData({ ...args(b), scope: 'discounts' }));
  assert.equal(b.removed.length, 0);
  b.ignoreRemove = true;
  await assert.rejects(deletePayrollData({ ...args(b), scope: 'all' }), /INCOMPLETE/);
  b.ignoreRemove = false; b.failRemove = true;
  await assert.rejects(deletePayrollData({ ...args(b), scope: 'all' }), /failure/);
});

test('local cleanup removes only matching settings and private cached objects', async () => {
  const store = new Map([[`strLabSchedule:${user}:2026-10/${receipt}`, 'sensitive'], [`strLabSchedule:${user}:2026-11`, 'keep'], ['auth-session', 'keep']]);
  const deleted = [];
  const environment = {
    localStorage: { get length() { return store.size; }, key: i => [...store.keys()][i], removeItem: key => store.delete(key) },
    caches: { keys: async () => ['app'], open: async () => ({ keys: async () => [
      { url: `https://example.supabase.co/storage/v1/object/authenticated/payroll-documents/${user}/2026/10/payroll` },
      { url: 'https://example.supabase.co/storage/v1/object/authenticated/payroll-documents/owner-b/2026/10/payroll' }
    ], delete: async request => { deleted.push(request.url); return true; } }) }
  };
  await clearLocalPayrollData(user, environment, { scope: 'month', year: 2026, month: 10 });
  assert.equal(store.size, 2); assert.equal(store.get('auth-session'), 'keep');
  assert.equal(deleted.length, 1);
});

test('full erasure requires exact typed confirmation and cancellation does nothing', () => {
  assert.equal(confirmDeletion('all', 'synthetic', { prompt: () => 'borrar' }), false);
  assert.equal(confirmDeletion('all', 'synthetic', { prompt: () => 'BORRAR' }), true);
  assert.equal(confirmDeletion('payroll', 'synthetic', { confirm: () => false }), false);
});

test('legacy receipt cleanup does not erase another receipt settings', async () => {
  const store = new Map([[`strLabSchedule:${user}:2026-10`, 'remove'], [`strLabSchedule:${user}:2026-10/${receipt}`, 'keep']]);
  const localStorage = { get length() { return store.size; }, key: i => [...store.keys()][i], removeItem: key => store.delete(key) };
  await clearLocalPayrollData(user, { localStorage }, { scope: 'receipt', year: 2026, month: 10, receiptId: '' });
  assert.equal(store.size, 1);
  assert.equal(store.get(`strLabSchedule:${user}:2026-10/${receipt}`), 'keep');
});

test('failed rewrite and concurrent document creation never report a complete deletion', async () => {
  const b = bucket(); seed(b); b.failUpload = true;
  await assert.rejects(deletePayrollData({ ...args(b), scope: 'discounts' }), /failed/);
  const originalRemove = b.remove.bind(b);
  b.failUpload = false;
  b.remove = async paths => {
    const result = await originalRemove(paths);
    b.objects.set(`${month}/payroll`, new Blob(['synthetic concurrent upload']));
    return result;
  };
  await assert.rejects(deletePayrollData({ ...args(b), scope: 'all' }), /INCOMPLETE/);
});
