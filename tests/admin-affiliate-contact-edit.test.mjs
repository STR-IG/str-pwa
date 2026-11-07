import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../alta-afiliados.html', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../supabase/functions/manage-affiliates/index.ts', import.meta.url), 'utf8');

test('la gestión de usuarios conserva la autorización de administrador del servidor', () => {
  const guard = endpoint.indexOf('if (!adminRow) return json(req, { error: "FORBIDDEN" }, 403)');
  const action = endpoint.indexOf('if (action === "upsert")');
  assert.ok(guard >= 0 && action > guard);
  assert.match(endpoint, /if \(!adminRow\)[\s\S]*?FORBIDDEN/);
});

test('el servidor registra y devuelve solo el correo y el estado de acceso', () => {
  assert.match(endpoint, /\.upsert\(\{ email: targetEmail, active: true \}/);
  assert.match(endpoint, /\.select\("email, active"\)/);
  assert.doesNotMatch(endpoint, /display_name|employee_number|phone|update_contact/);
});

test('el formulario permite registrar solo un correo electrónico', () => {
  assert.match(html, /Usuarios registrados/);
  assert.match(html, /manageAffiliates\('upsert',\{email\}\)/);
  assert.match(html, /<th>Correo electrónico<\/th>/);
  assert.doesNotMatch(html, /id="name"|id="employee"|id="phone"|display_name|employee_number|Nombre y apellidos|Número de afiliado/);
});
