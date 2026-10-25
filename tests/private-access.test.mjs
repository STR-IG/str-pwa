import test from 'node:test';
import assert from 'node:assert/strict';
import { accessHandler } from '../supabase/functions/manage-private-access/handler.mjs';

function setup({ target = { email: 'user@example.com', active: true }, adminRole = true, validToken = true, mail = 'ok' } = {}) {
  const writes = [], messages = [], auth = [];
  const handler = accessHandler({
    env: name => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-only', RESEND_API_KEY: 'mail-only' })[name],
    createClient: () => ({
      auth: { getUser: async token => { auth.push(token); return validToken ? { data: { user: { email: 'admin@example.com' } } } : { error: true }; } },
      from: table => {
        const query = { select: () => query, eq: () => query,
          maybeSingle: async () => ({ data: table === 'committee_admins' ? (adminRole ? { email: 'admin@example.com' } : null) : target }),
          insert: async value => { writes.push(value); return { error: null }; }
        };
        return query;
      }
    }),
    send: async (url, options) => {
      messages.push({ url, ...options });
      if (mail === 'timeout') throw Error('timeout');
      return new Response(JSON.stringify(mail === 'ok' ? { id: 'accepted-test-id' } : { error: true }), { status: mail === 'ok' ? 200 : 503 });
    }
  });
  const call = (body, token = 'real-admin-token') => handler(new Request('https://example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  return { call, writes, messages, auth };
}
const intent = { action: 'send', email: 'user@example.com', requestId: 'bba21746-2123-4237-b823-a56719152215' };

test('no token, invalid token and non-admin users cannot add or send', async () => {
  for (const options of [{}, { validToken: false }, { adminRole: false }]) {
    const s = setup(options);
    const r = await s.call(intent, Object.keys(options).length ? 'bad' : '');
    assert.ok([401, 403].includes(r.status));
    assert.equal(s.messages.length, 0); assert.equal(s.writes.length, 0);
  }
});

test('adding an email saves only access fields and never sends a message', async () => {
  const s = setup({ target: null });
  const r = await s.call({ action: 'add', email: ' New@Example.com ', display_name: 'unwanted', phone: 'unwanted' });
  assert.equal(r.status, 200); assert.equal((await r.json()).saved, true);
  assert.deepEqual(s.writes, [{ email: 'new@example.com', active: true }]);
  assert.equal(s.messages.length, 0);
});

test('existing access is preserved; inactive access is not silently reactivated', async () => {
  const s = setup({ target: { email: 'user@example.com', active: false } });
  assert.equal((await s.call({ action: 'add', email: 'user@example.com' })).status, 409);
  assert.equal((await s.call(intent)).status, 409);
  assert.equal(s.messages.length, 0); assert.equal(s.writes.length, 0);
});

test('server controls sender, single recipient and template; retries use the same idempotency key', async () => {
  const s = setup();
  for (let i = 0; i < 2; i++) assert.equal((await s.call({ ...intent, to: ['victim@example.com'], subject: 'override', text: 'override' })).status, 200);
  assert.equal(s.messages[0].headers['Idempotency-Key'], s.messages[1].headers['Idempotency-Key']);
  const message = JSON.parse(s.messages[0].body);
  assert.deepEqual(message.to, ['user@example.com']);
  assert.equal(message.from, 'STR-IG <acceso@str-ig.es>');
  assert.match(message.text, /No es necesario estar afiliado/);
  assert.doesNotMatch(message.text, /override/);
});

test('invalid recipients and send requests never reach mail provider', async () => {
  const s = setup();
  for (const body of [{ ...intent, email: 'x@example.com\r\nBcc: y@example.com' }, { ...intent, requestId: 'bad' }, { ...intent, email: ['x@example.com', 'y@example.com'] }]) {
    assert.equal((await s.call(body)).status, 400);
  }
  assert.equal(s.messages.length, 0);
});

test('provider errors and timeouts never claim successful delivery', async () => {
  for (const mail of ['error', 'timeout']) {
    const s = setup({ mail }); const r = await s.call(intent);
    assert.equal(r.status, 503); assert.equal((await r.json()).error, 'MAIL_UNCONFIRMED');
  }
});
