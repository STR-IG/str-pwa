import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const panel = readFileSync(new URL('../panel-administracion.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const login = readFileSync(new URL('../acceso-privado.html', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../supabase/functions/manage-affiliates/index.ts', import.meta.url), 'utf8');

test('el módulo del panel compila', () => {
  const source = panel.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] || '';
  assert.ok(source);
  assert.doesNotThrow(() => new vm.SourceTextModule(source));
});

test('el panel solo consulta mediante el endpoint administrativo existente', () => {
  assert.match(panel, /adminRequest\('authorize'\)/);
  assert.match(panel, /adminRequest\('list'\)/);
  assert.doesNotMatch(panel, /adminRequest\('(upsert|delete)'/);
  assert.doesNotMatch(panel, /localStorage/);
  assert.match(panel, /display_name,affiliate\.email,affiliate\.employee_number,affiliate\.phone/);
});

test('la URL directa valida primero sesión y rol en servidor', () => {
  const authorization = panel.indexOf("await adminRequest('authorize')");
  const visiblePanel = panel.indexOf("show('home')", authorization);
  assert.ok(authorization > 0 && visiblePanel > authorization);
  assert.match(panel, /acceso-privado\.html\?next=\$\{PAGE\}/);
  assert.match(login, /'panel-administracion\.html'/);
});

test('el servidor autentica y autoriza antes de procesar cualquier acción', () => {
  const authenticate = endpoint.indexOf('admin.auth.getUser(token)');
  const authorize = endpoint.indexOf('.from("committee_admins")');
  const readAction = endpoint.indexOf('const body = await req.json()');
  assert.ok(authenticate > 0 && authorize > authenticate && readAction > authorize);
  assert.match(endpoint, /if \(!adminRow\) return json\(req, \{ error: "FORBIDDEN" \}, 403\)/);
});

test('el acceso del menú permanece oculto para afiliados normales', () => {
  assert.match(index, /\.committee-fab \{ display:none !important/);
  assert.match(index, /if \(response\.ok\) card\.classList\.add\('show'\)/);
  assert.match(index, /href="panel-administracion\.html"/);
});

test('la prueba interna de Gemini reutiliza la sesión del administrador sin exponer secretos', () => {
  assert.match(panel, />Probar conexión Gemini</);
  assert.match(panel, /Probando conexión\.\.\./);
  assert.match(panel, /✅ Conexión Gemini correcta/);
  assert.match(panel, /Authorization:`Bearer \$\{session\.access_token\}`/);
  assert.match(panel, /body:JSON\.stringify\(\{action:'connection_test'\}\)/);
  assert.doesNotMatch(panel, /GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(panel, /console\.(log|error|warn)/);
});
