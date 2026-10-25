import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayrollSession } from '../payroll-session.mjs';
import { monthReceipts } from '../payroll-receipts.mjs';
import { readFileSync } from 'node:fs';

test('monthly documents and review work in RAM and disappear on clear', async () => {
  const bucket = createPayrollSession();
  await bucket.upload('user/2026/10/payroll', new Blob(['synthetic image']));
  await bucket.upload('user/2026/10/review', new Blob(['{"status":"complete"}']));
  assert.equal((await monthReceipts(bucket, 'user/2026/10')).length, 1);
  assert.equal(await (await bucket.download('user/2026/10/review')).data.text(), '{"status":"complete"}');
  assert.equal((await createPayrollSession().list('user/2026/10')).data.length, 0);
  bucket.clear();
  assert.equal((await bucket.list('user/2026/10')).data.length, 0);
  assert.ok((await bucket.download('user/2026/10/payroll')).error);
});

test('closing prevents an in-flight operation from restoring discarded data', async () => {
  const bucket = createPayrollSession();
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
  const home = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /next=estadisticas-nomina/);
});
