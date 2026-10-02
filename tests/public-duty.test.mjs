import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { validDutyFacts, dutyFacts, dutySections, validDutyGuidance } from '../public-duty.js';
import { permitCaseHandler } from '../supabase/functions/_shared/permit-case-core.js';

const facts = { obligation: 'Citación judicial u oficial', overlap: 'Parcialmente', outside: 'No, el horario viene impuesto', date: '2026-10-02', time: '09:00', workSchedule: '22:00 del día anterior a 06:00', proof: 'Todavía no', electoralRole: '', substituteOutcome: '', details: '' };
const guidance = Object.fromEntries(Object.keys(dutySections).map(k => [k, 'Orientación prudente de prueba.']));
function loadAnswer(aiGuidance = guidance, ok = true) {
  let handler, calls = [];
  const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/answer-public-duty/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  runInNewContext(source, { servePermit: fn => { handler = fn; }, validDutyFacts, dutyFacts, dutySections, validDutyGuidance,
    Deno: { env: { get: () => 'test-key' } }, Response, Request, AbortSignal, crypto, TextEncoder,
    fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ output_text: JSON.stringify(aiGuidance) }, { status: ok ? 200 : 500 }); }
  });
  return { call: body => handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }), 'a'.repeat(64)), calls };
}
test('public questionnaire rejects invalid dates, times, oversized text and tampered choices before AI', async () => {
  const fn = loadAnswer();
  for (const change of [{ date: '2026-02-30' }, { time: '24:00' }, { overlap: 'inventado' }, { workSchedule: '' }, { details: 'x'.repeat(1501) }]) {
    assert.equal((await fn.call({ ...facts, ...change })).status, 400);
  }
  assert.equal(fn.calls.length, 0);
});
test('public AI uses the existing provider, model, privacy and bounded output, without user auth', async () => {
  const fn = loadAnswer();
  const response = await fn.call(facts);
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).guidance, guidance);
  assert.equal(fn.calls[0].model, 'gpt-5.4-mini'); assert.equal(fn.calls[0].store, false);
  assert.equal(fn.calls[0].max_output_tokens, 900); assert.deepEqual(JSON.parse(fn.calls[0].input), facts);
});
test('AI errors and malformed guidance are failures, allowing shared quota release', async () => {
  assert.equal((await loadAnswer({}, true).call(facts)).status, 502);
  assert.equal((await loadAnswer(guidance, false).call(facts)).status, 502);
});
function inbox({ member = false, committee = false, auth = true, dbError = false } = {}) {
  const writes = [];
  const admin = {
    auth: { getUser: async () => ({ data: { user: auth ? { id: 'user-id', email: 'member@example.test', email_confirmed_at: '2026-01-01' } : null }, error: null }) },
    from: table => {
      const query = { select: () => query, eq: () => query, order: () => query,
        maybeSingle: async () => ({ data: (table === 'committee_admins' ? committee : member) ? { email: 'member@example.test' } : null, error: dbError ? {} : null }),
        limit: async () => ({ data: [], error: null }),
        upsert: async (row, options) => { writes.push({ row, options }); return { error: null }; }
      }; return query;
    }
  };
  const handler = permitCaseHandler(admin);
  return { writes, call: (body, token = 'valid-token') => handler(new Request('https://example.test', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) })) };
}
const payload = { id: '814fe349-6da1-4872-8c89-2175bb3f6ef5', facts, guidance };
test('human inbox rejects public, invalid sessions and nonmembers independently of client flags', async () => {
  for (const [options, token, expected] of [[{}, '', 401], [{ auth: false }, 'bad', 401], [{}, 'valid', 403]]) {
    const fn = inbox(options); assert.equal((await fn.call({ ...payload, affiliated: true }, token)).status, expected); assert.equal(fn.writes.length, 0);
  }
});
test('active member can submit with server identity and idempotent retry configuration', async () => {
  const fn = inbox({ member: true }); assert.equal((await fn.call({ ...payload, email: 'spoof@example.test' })).status, 200);
  assert.equal(fn.writes[0].row.email, 'member@example.test'); assert.equal(fn.writes[0].row.user_id, 'user-id');
  assert.equal(fn.writes[0].options.ignoreDuplicates, true);
});
test('member cannot read inbox; committee admin can; membership errors fail closed', async () => {
  assert.equal((await inbox({ member: true }).call({ action: 'list' })).status, 403);
  assert.equal((await inbox({ committee: true }).call({ action: 'list' })).status, 200);
  const fn = inbox({ member: true, dbError: true }); assert.equal((await fn.call(payload)).status, 503); assert.equal(fn.writes.length, 0);
});
test('invalid case is rejected without storage', async () => {
  const fn = inbox({ member: true }); assert.equal((await fn.call({ ...payload, guidance: {} })).status, 400); assert.equal(fn.writes.length, 0);
});
