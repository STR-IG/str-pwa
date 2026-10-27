import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedPayrollPeriod, createPayrollSession } from '../payroll-session.mjs';
import { monthReceipts } from '../payroll-receipts.mjs';
import { readFileSync } from 'node:fs';

test('monthly documents and review work in RAM and disappear on clear', async () => {
  const bucket = createPayrollSession({ now: () => new Date('2026-11-27T12:00:00Z') });
  await bucket.upload('user/2026/10/payroll', new Blob(['synthetic image']));
  await bucket.upload('user/2026/10/review', new Blob(['{"status":"complete"}']));
  assert.equal((await monthReceipts(bucket, 'user/2026/10')).length, 1);
  assert.equal(await (await bucket.download('user/2026/10/review')).data.text(), '{"status":"complete"}');
  assert.equal((await createPayrollSession({ now: () => new Date('2026-11-27T12:00:00Z') }).list('user/2026/10')).data.length, 0);
  bucket.clear();
  assert.equal((await bucket.list('user/2026/10')).data.length, 0);
  assert.ok((await bucket.download('user/2026/10/payroll')).error);
});

test('closing prevents an in-flight operation from restoring discarded data', async () => {
  const bucket = createPayrollSession({ now: () => new Date('2026-11-27T12:00:00Z') });
  bucket.close();
  assert.ok((await bucket.upload('user/2026/10/payroll', new Blob(['late']))).error);
  assert.deepEqual((await bucket.list('user')).data, []);
});

test('review entry has no server bucket or persisted salary settings; statistics cannot reopen', () => {
  const source = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
  assert.match(source, /const storageBucket = createPayrollSession\(\)/);
  assert.doesNotMatch(source, /supabase\.storage|adminApi\.bucket/);
  assert.doesNotMatch(source, /localStorage\?\.(?:getItem|setItem)/);
  assert.match(source, /'pagehide', \(\) => storageBucket.close\(\)/);
  assert.match(source, /event.persisted\) window.location.reload\(\)/);
  const entry = readFileSync(new URL('../revisa-tu-nomina.html', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /history-lab-patch|saved-review-open-patch|payroll-vision/);
  const stats = readFileSync(new URL('../estadisticas-nomina.html', import.meta.url), 'utf8');
  assert.doesNotMatch(stats, /<script/);
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /next=estadisticas-nomina/);
});

test('rejects other months and discards data at Madrid month rollover', async () => {
  let date = new Date('2026-11-30T22:59:59Z');
  const bucket = createPayrollSession({ now: () => date });
  assert.ok((await bucket.upload('user/2026/11/payroll', new Blob(['future']))).error);
  assert.ok((await bucket.upload('user/2026/09/payroll', new Blob(['old']))).error);
  assert.ok((await bucket.upload('user/2025/10/payroll', new Blob(['old']))).error);
  assert.equal((await bucket.upload('user/2026/10/payroll', new Blob(['current']))).error, null);
  date = new Date('2026-11-30T23:00:00Z');
  assert.ok((await bucket.download('user/2026/10/payroll')).error);
  assert.deepEqual((await bucket.list('user')).data, []);
  assert.ok((await bucket.upload('user/2026/11/payroll', new Blob(['late']))).error);
});

test('allowed period is the previous completed Madrid month including year rollover', () => {
  for (const [date, expected] of [
    ['2026-10-27T12:00:00Z', { year: 2026, month: 9 }],
    ['2026-11-01T00:00:00Z', { year: 2026, month: 10 }],
    ['2026-12-01T00:00:00Z', { year: 2026, month: 11 }],
    ['2026-12-31T23:00:00Z', { year: 2026, month: 12 }],
    ['2027-01-31T23:00:00Z', { year: 2027, month: 1 }]
  ]) assert.deepEqual(allowedPayrollPeriod(new Date(date)), expected);
});
