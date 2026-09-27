import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../alta-afiliados.html', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../supabase/functions/manage-affiliates/index.ts', import.meta.url), 'utf8');

test('la edición de contacto solo está disponible tras la comprobación de administrador del servidor', () => {
  const guard = endpoint.indexOf('if (!adminRow) return json(req, { error: "FORBIDDEN" }, 403)');
  const update = endpoint.indexOf('if (action === "update_contact")');
  assert.ok(guard >= 0 && update > guard);
  assert.match(endpoint, /if \(!adminRow\)[\s\S]*?FORBIDDEN/);
});

test('la acción solo actualiza nombre y teléfono y admite quitar el teléfono', () => {
  assert.match(endpoint, /\(phone\.length !== 0 && phone\.length !== 9\)/);
  assert.match(endpoint, /\.update\(\{ display_name: displayName, phone: phone \|\| null \}\)\s*\.eq\("email", targetEmail\)/);
  assert.doesNotMatch(endpoint, /\.update\(\{[^}]*employee_number[^}]*\}\)/);
});

test('el formulario protege correo y número de afiliado y permite guardar nombre/teléfono', () => {
  assert.match(html, /El correo y el número de afiliado se mantienen\. Deja el teléfono vacío si quieres eliminarlo\./);
  assert.match(html, /manageAffiliates\('update_contact',\{email:affiliatePendingEdit\.email,displayName,phone\}\)/);
  assert.match(html, /Editar datos/);
});
