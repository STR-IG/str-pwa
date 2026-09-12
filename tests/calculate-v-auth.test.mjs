import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../supabase/functions/calculate-v-payrolls/index.ts', import.meta.url), 'utf8');

test('Calcula tu V reconoce el rol Administrador sin depender de un correo fijo', () => {
  assert.match(source, /\.from\("committee_admins"\)/);
  assert.match(source, /\.eq\("active", true\)/);
  assert.match(source, /if \(!adminRole\) \{/);
  assert.doesNotMatch(source, /unlimitedAdminEmail/);
  assert.doesNotMatch(source, /dubardollorienzu@gmail\.com/);
});

test('el afiliado activo sigue siendo obligatorio y el usuario no autorizado continúa bloqueado', () => {
  const affiliateCheck = source.indexOf('.from("private_access_allowlist")');
  const forbidden = source.indexOf('if (!allowedRow) return json({ error: "FORBIDDEN" }, 403)');
  const adminCheck = source.indexOf('.from("committee_admins")');
  assert.ok(affiliateCheck > 0 && forbidden > affiliateCheck && adminCheck > forbidden);
});
