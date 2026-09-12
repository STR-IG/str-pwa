import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../area-privada.html', import.meta.url), 'utf8');
const calculate = readFileSync(new URL('../supabase/functions/calculate-v-payrolls/index.ts', import.meta.url), 'utf8');

test('Administración reutiliza la misma pantalla, lector y función de Calcula tu V', () => {
  assert.match(page, /adminPayrollApi/);
  assert.equal((page.match(/READ_V_ENDPOINT/g) || []).length >= 3, true);
  assert.equal((page.match(/CALCULATE_V_ENDPOINT/g) || []).length, 2);
  assert.match(page, /callPrivateFunction\(READ_V_ENDPOINT/);
  assert.match(page, /callPrivateFunction\(CALCULATE_V_ENDPOINT, calculationBody/);
  assert.doesNotMatch(page, /admin-calculate-v-payrolls|admin-read-v-payroll/);
});

test('el contexto visible contiene afiliado y periodo y no se conserva en almacenamiento local', () => {
  assert.match(page, /Calcula tu V — \$\{adminContext\.affiliate\?\.display_name \|\| adminAffiliateEmail\}/);
  assert.match(page, /admin-v-period/);
  assert.doesNotMatch(page, /(?:localStorage|sessionStorage)\.setItem\([^\n]*(?:adminAffiliate|adminContext)/);
});

test('cada cambio de afiliado vuelve a resolver UUID, resumen y rutas del afiliado seleccionado', () => {
  assert.match(page, /adminContext = await adminApi\.resolve\(\)/);
  assert.match(page, /adminPeriods = \(await adminApi\.summary\(\)\)\.periods/);
  assert.match(page, /return `\$\{adminContext\.userId\}\/\$\{period\.year\}\/\$\{month\}/);
  assert.match(page, /adminApi\.bucket\.download\(adminPeriodPath/);
});

test('si un periodo contiene varias nóminas exige elegir el recibo', () => {
  assert.match(page, /if \(receipts\.length !== 1\)/);
  assert.match(page, /Selecciona una nómina/);
  assert.match(page, /selects\.some\(select => !select\.value\)/);
});

test('un afiliado normal no puede utilizar el contexto administrativo del cálculo', () => {
  const adminContext = calculate.indexOf('if (body?.adminContext !== undefined)');
  const roleGate = calculate.indexOf('if (!adminRole) return json({ error: "FORBIDDEN" }, 403)', adminContext);
  const targetGate = calculate.indexOf('.from("private_access_allowlist")', adminContext);
  assert.ok(adminContext > 0 && roleGate > adminContext && targetGate > roleGate);
  assert.match(calculate, /body\.adminContext\?\.vMonth !== requestedVMonth/);
  assert.match(calculate, /if \(!targetAffiliate\) return json\(\{ error: "AFFILIATE_NOT_FOUND" \}, 404\)/);
});

test('el flujo normal conserva el payload y el comportamiento existentes', () => {
  assert.match(page, /const calculationBody = \{ payrolls: payrollReadings, vMonth \}/);
  assert.match(page, /if \(isAdminMode\(\)\) calculationBody\.adminContext/);
  assert.match(page, /else if \(await isAuthorizedSession\(session\)\)/);
});
