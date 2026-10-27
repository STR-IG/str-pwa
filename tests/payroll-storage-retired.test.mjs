import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('retired administrative endpoint rejects every document operation without reading the body', async () => {
  const source = readFileSync(new URL('../supabase/functions/admin-payroll-documents/index.ts', import.meta.url), 'utf8');
  let handler;
  vm.runInNewContext(source.replace('req: Request', 'req'), { Deno: { serve(fn) { handler = fn; } }, Response, JSON });
  for (const method of ['POST', 'GET', 'PUT', 'DELETE']) {
    const response = await handler({ method, json() { throw Error('must not read documents'); } });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'PAYROLL_STORAGE_RETIRED');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal((await handler({ method: 'OPTIONS' })).status, 204);
});
