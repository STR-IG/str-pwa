import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { validDutyFacts, dutyFacts, dutySections, validDutyGuidance, electoralGuidance } from '../public-duty.js';
import { permitCaseHandler } from '../supabase/functions/_shared/permit-case-core.js';

const facts = { obligation: 'Citación judicial u oficial', overlap: 'Parcialmente', outside: 'No, el horario viene impuesto', date: '2026-10-02', time: '09:00', workSchedule: '22:00 del día anterior a 06:00', proof: 'Todavía no', electoralRole: '', substituteOutcome: '', electoralDayStatus: '', details: '' };
const guidance = Object.fromEntries(Object.keys(dutySections).map(k => [k, 'Orientación prudente de prueba.']));
function loadAnswer(aiGuidance = guidance, ok = true) {
  let handler, calls = [];
  const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/answer-public-duty/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
  runInNewContext(source, { servePermit: fn => { handler = fn; }, validDutyFacts, dutyFacts, dutySections, validDutyGuidance, electoralGuidance,
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
test('electoral member receives deterministic special rules before generic AI', async () => {
  const fn = loadAnswer();
  const electoral = { ...facts, obligation: 'Mesa electoral / elecciones', time: '08:00', workSchedule: 'Noche 12 h — 18:00 a 06:11 del día siguiente', electoralRole: 'Presidente/a titular', electoralDayStatus: 'Sí, es día laborable' };
  const response = await fn.call(electoral);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.guidance.time, /20:00 del día anterior/);
  assert.match(body.guidance.time, /reducción de cinco horas/);
  assert.equal(fn.calls.length, 0);
});
test('electoral questionnaire requires role and workday selections', async () => {
  const fn = loadAnswer();
  const electoral = { ...facts, obligation: 'Mesa electoral / elecciones', electoralRole: '', electoralDayStatus: '' };
  assert.equal((await fn.call(electoral)).status, 400);
  assert.equal(fn.calls.length, 0);
});
test('AI errors and malformed guidance are failures, allowing shared quota release', async () => {
  assert.equal((await loadAnswer({}, true).call(facts)).status, 502);
  assert.equal((await loadAnswer(guidance, false).call(facts)).status, 502);
});
test('retired case endpoint never reads or saves cases, even for administrators and old clients', async () => {
  const forbidden = new Proxy({}, { get() { throw Error('Personal case database must not be accessed'); } });
  const handler = permitCaseHandler(forbidden);
  for (const body of [{action:'list'},{facts,guidance}]) {
    const response = await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer old-admin-token'},body:JSON.stringify(body)}));
    assert.equal(response.status,410);
    assert.equal((await response.json()).error,'CASE_COLLECTION_DISABLED');
  }
});
