import test from 'node:test';
import assert from 'node:assert/strict';
import { createLookup, parseFiles, parseMunicipalities, validateCriteria } from '../supabase/functions/official-weather-documents/lookup.mjs';

const towns = [{ codi: '081878', nom: 'Sabadell' }, { codi: '430445', nom: 'La Sénia' }];
const file = 'climatologia/InformesEREM/2026/09/081878_2026-09-09.pdf';
const townHtml = `new Meteocat.serveis.descarregues.buscador({dom:'searchMunicipi',dades:${JSON.stringify(towns)}});`;
const fileHtml = files => `Meteocat.serveis.descarregues.init(${JSON.stringify(files)}, [], '081878');`;
const criteria = { date: '2026-09-09', location: 'sabadell', incident: 'rain' };
test('parsea JSON oficial sin ejecutar scripts; formato roto no equivale a vacío', () => {
  assert.equal(parseMunicipalities(townHtml)[1].name, 'La Sénia');
  assert.deepEqual(parseFiles(fileHtml([file])), [file]);
  assert.deepEqual(parseFiles(fileHtml([])), []);
  for (const html of ['', 'Meteocat.serveis.descarregues.init(null, [])', fileHtml(['https://evil.test/file.pdf']), fileHtml(['../../file.pdf'])]) assert.throws(() => parseFiles(html));
});
test('devuelve solo el PDF publicado para municipio y fecha exactos, y reutiliza catálogo', async () => {
  const calls = [];
  const lookup = createLookup(async (url, options) => {
    calls.push([url, options]);
    return new Response(options?.method === 'POST' ? fileHtml([file, 'climatologia/InformesEREM/2026/09/080018_2026-09-09.pdf']) : townHtml, { headers: { 'Content-Type': 'text/html' } });
  });
  const found = await lookup(criteria);
  assert.equal(found.status, 'found');
  assert.equal(found.documents.length, 1);
  assert.equal(new URL(found.documents[0].url).searchParams.get('file_name'), file);
  assert.equal(found.municipality, 'Sabadell');
  assert.equal(calls[1][1].body, 'codi=081878');
  assert.equal((await lookup({ ...criteria, date: '2026-09-28' })).status, 'not_published');
  assert.equal(calls.length, 2);
  assert.equal((await lookup({ ...criteria, location: 'Vallès Occidental' })).status, 'unknown_municipality');
  assert.equal((await lookup({ ...criteria, incident: 'snow' })).status, 'not_supported');
});
test('acepta acentos normalizados y no busca municipios aproximados', async () => {
  const lookup = createLookup(async (_, options) => new Response(options?.method === 'POST' ? fileHtml([]) : townHtml, { headers: { 'Content-Type': 'text/html' } }));
  assert.equal((await lookup({ ...criteria, location: 'la senia' })).municipality, 'La Sénia');
  assert.equal((await lookup({ ...criteria, location: 'saba' })).status, 'unknown_municipality');
});
test('rechaza fechas inválidas y fallos de origen sin fabricar resultados', async () => {
  for (const date of ['2026-02-30', '2027-01-01', '../2026']) assert.throws(() => validateCriteria({ ...criteria, date }, '2026-09-29'));
  const lookup = createLookup(async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(lookup(criteria), /SOURCE_UNAVAILABLE/);
});

test('endpoint exige JWT y afiliación antes de acceder al catálogo', async () => {
  let handler;
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  let calls = [], authorized = false;
  globalThis.Deno = { env: { get: key => key === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'test-anon' }, serve: fn => { handler = fn; } };
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user' });
    if (url.includes('/rpc/')) { assert.equal(options.headers.authorization, 'Bearer test-user'); return Response.json(authorized); }
    return new Response(options?.method === 'POST' ? fileHtml([file]) : townHtml, { headers: { 'Content-Type': 'text/html' } });
  };
  try {
    await import('../supabase/functions/official-weather-documents/index.ts');
    const request = token => new Request('https://example.test', { method: 'POST', headers: token ? { Authorization: token } : {}, body: JSON.stringify(criteria) });
    assert.equal((await handler(request())).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await handler(request('Bearer test-user'))).status, 403);
    assert.equal(calls.filter(x => x.includes('meteo.cat')).length, 0);
    authorized = true;
    const response = await handler(request('Bearer test-user'));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'found');
  } finally { globalThis.fetch = originalFetch; globalThis.Deno = originalDeno; }
});
