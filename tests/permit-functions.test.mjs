import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

function load(name) {
  let handler;
  let aiCalls = 0;
  const source = stripTypeScriptTypes(readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?$/gm, '');
  runInNewContext(source, {
    servePermit: fn => { handler = fn; },
    Deno: { env: { get: () => 'test-key' } },
    Response, Request, URL, AbortSignal, crypto, TextEncoder, console,
    fetch: async () => { aiCalls++; return Response.json({ output_text: JSON.stringify({ status: 'compatible', title: 'Test', summary: 'Test', reasons: [], recommendations: [] }) }); }
  });
  return {
    call: payload => handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(payload) }), 'a'.repeat(64)),
    calls: () => aiCalls
  };
}
for (const name of ['answer-bereavement', 'answer-force-majeure', 'answer-home-move', 'answer-hospitalization', 'answer-medical-visit', 'answer-surgical-intervention']) {
  test(`${name}: validates input before calling AI without requiring affiliation`, async () => {
    const fn = load(name);
    const response = await fn.call({});
    assert.equal(response.status, 400);
    assert.equal(fn.calls(), 0);
  });
}
test('anonymous home-move request returns guidance with the existing questionnaire', async () => {
  const fn = load('answer-home-move');
  const response = await fn.call({ habitual: 'yes', moveDate: '2026-10-01', workday: 'yes', workShift: 'morning', documentType: 'empadronamiento', thirdPartyData: 'no' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).guidance.status, 'compatible');
  assert.equal(fn.calls(), 1);
});
