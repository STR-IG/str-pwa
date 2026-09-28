import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaHandler, permitSubject } from '../supabase/functions/_shared/permit-quota-core.js';

const request = (key = 'a'.repeat(64)) => new Request('https://example.test/answer', {
  method: 'POST', headers: { 'X-Permit-Device': key }, body: '{}'
});
function counter() {
  const records = new Map();
  return async ({ p_action: action, p_reservation: id }) => {
    if (action === 'reserve') {
      if (records.size >= 2) return { data: { allowed: false, remaining: 0 } };
      id = crypto.randomUUID(); records.set(id, false);
    } else if (action === 'complete') records.set(id, true);
    else if (action === 'release' && !records.get(id)) records.delete(id);
    return { data: { allowed: true, remaining: 2 - records.size, reservation: id } };
  };
}
const success = async () => Response.json({ guidance: { title: 'Orientación' } });

test('dos respuestas entre servicios, tercera bloqueada incluso sin Origin', async () => {
  const rpc = counter(), first = quotaHandler(success, rpc), second = quotaHandler(success, rpc);
  assert.equal((await first(request())).status, 200);
  assert.equal((await second(request())).status, 200);
  const blocked = await first(request());
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error, 'MONTHLY_LIMIT_REACHED');
});
test('reservas simultáneas no permiten una tercera llamada a IA', async () => {
  let calls = 0, finish;
  const wait = new Promise(r => finish = r);
  const handler = quotaHandler(async () => { calls++; await wait; return success(); }, counter());
  const pending = [handler(request()), handler(request()), handler(request())];
  await new Promise(r => setTimeout(r, 25));
  assert.equal(calls, 2); finish();
  assert.deepEqual((await Promise.all(pending)).map(r => r.status).sort(), [200, 200, 429]);
});
test('fallos de IA y cuestionarios inválidos devuelven el cupo', async () => {
  const rpc = counter();
  for (const status of [400, 502, 500]) {
    const response = await quotaHandler(async () => Response.json({ error: 'FAIL' }, { status }), rpc)(request());
    assert.equal((await response.json()).quota.remaining, 2);
  }
  assert.equal((await quotaHandler(success, rpc)(request())).status, 200);
});
test('consultar saldo no consume; fallo de base de datos impide invocar IA', async () => {
  const rpc = counter();
  const status = quotaHandler(success, rpc, true);
  for (let i = 0; i < 4; i++) assert.equal((await (await status(request())).json()).quota.remaining, 2);
  let called = false;
  const failure = quotaHandler(async () => { called = true; return success(); }, async () => ({ error: 'offline' }));
  assert.equal((await failure(request())).status, 503); assert.equal(called, false);
});
test('requiere clave aleatoria válida, conserva anonimato y permite preflight', async () => {
  const handler = quotaHandler(success, counter());
  assert.equal((await handler(request(''))).status, 401);
  assert.equal((await handler(request('x'.repeat(64)))).status, 401);
  assert.notEqual(await permitSubject(request()), 'a'.repeat(64));
  const response = await handler(new Request('https://example.test', { method: 'OPTIONS' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /x-permit-device/);
});
