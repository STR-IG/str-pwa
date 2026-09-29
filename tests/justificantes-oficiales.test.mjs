import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SOURCES, localToday, validateSearch, searchUrl, privateAccess } from '../justificantes-oficiales.mjs';

const criteria = { date: '2024-10-29', location: 'Tarragona', incident: 'rain' };
test('card única en Área privada, imagen existente y retorno permitido tras login', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const login = readFileSync(new URL('../acceso-privado.html', import.meta.url), 'utf8');
  const card = home.indexOf('justificantes-oficiales.png');
  assert.ok(card > home.indexOf('ÁREA PRIVADA') && card < home.indexOf('ÁREA PÚBLICA'));
  assert.equal(home.split('justificantes-oficiales.png').length, 2);
  assert.match(home, /href="acceso-privado.html\?next=justificantes-oficiales.html"/);
  assert.match(login, /'justificantes-oficiales.html'/);
  assert.ok(existsSync(new URL('../justificantes-oficiales.png', import.meta.url)));
});
test('valida fechas reales, futuras y ubicaciones vacías', () => {
  assert.equal(localToday(new Date(2026, 0, 2, 0, 10)), '2026-01-02');
  assert.deepEqual(validateSearch({ ...criteria, location: '  La   Sénia  ' }), { ...criteria, location: 'La Sénia' });
  for (const date of ['', '2025-02-29', '2024-02-30', '2024-13-01', 'tomorrow', '2026-10-01']) {
    assert.throws(() => validateSearch({ ...criteria, date }, '2026-09-29'));
  }
  assert.equal(validateSearch({ ...criteria, date: '2024-02-29' }).date, '2024-02-29');
  for (const location of ['', '  ', 'A', 'a'.repeat(101)]) assert.throws(() => validateSearch({ ...criteria, location }));
  assert.throws(() => validateSearch({ ...criteria, incident: 'unknown' }));
});
test('búsquedas codificadas por organismo, fecha y municipio; directorio municipal identificado', () => {
  for (const source of SOURCES) {
    assert.equal(new URL(source.url).protocol, 'https:');
    const url = new URL(searchUrl(source, { ...criteria, location: 'Móra d’Ebre & Tivissa' }));
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal([...url.searchParams].length, 1);
    const query = url.searchParams.get('q');
    assert.ok(query.startsWith(`site:${source.domain} `));
    assert.ok(query.includes('"Móra d’Ebre & Tivissa"'));
    if (source.id !== 'municipal') {
      assert.ok(query.includes('29/10/2024') && query.includes('2024-10-29'));
    } else assert.ok(query.includes('ajuntament'));
  }
  assert.ok(new URL(searchUrl(SOURCES[0], { ...criteria, location: 'X" OR site:evil.test' })).searchParams.get('q').includes('"X  OR site:evil.test"'));
});
function mockClient({ session = true, user = true, allowed = true, sessionError = null, userError = null, accessError = null } = {}) {
  return {
    auth: { getSession: async () => ({ data: { session }, error: sessionError }), getUser: async () => ({ data: { user }, error: userError }) },
    rpc: async name => { assert.equal(name, 'is_current_user_private_access_allowed'); return { data: allowed, error: accessError }; }
  };
}
test('solo permite acceso con sesión, usuario y afiliación confirmada por servidor', async () => {
  assert.equal(await privateAccess(mockClient()), true);
  for (const options of [{ session: null }, { user: null }, { allowed: false }, { allowed: 'true' }, { allowed: null }]) {
    assert.equal(await privateAccess(mockClient(options)), false);
  }
  for (const key of ['sessionError', 'userError', 'accessError']) {
    await assert.rejects(privateAccess(mockClient({ [key]: new Error('offline') })), /offline/);
  }
});
