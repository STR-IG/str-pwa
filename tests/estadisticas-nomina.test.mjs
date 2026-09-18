import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('la portada y el acceso privado enlazan la nueva Estadísticas', () => {
  const index = read('index.html');
  const access = read('acceso-privado.html');
  assert.match(index, /href="acceso-privado\.html\?next=estadisticas-nomina\.html"/);
  assert.match(index, /card-estadisticas-nomina\.png/);
  assert.match(access, /'estadisticas-nomina\.html'/);
});

test('Estadísticas valida sesión y afiliación antes de leer el Storage privado', () => {
  const source = read('estadisticas-nomina.js');
  const accessCheck = source.indexOf("supabase.rpc('is_current_user_private_access_allowed')");
  const firstLoad = source.lastIndexOf('await loadStatistics()');
  assert.ok(accessCheck >= 0);
  assert.ok(firstLoad > accessCheck);
  assert.match(source, /supabase\.storage\.from\(STORAGE_BUCKET\)/);
  assert.match(source, /currentUserId = session\.user\.id/);
  assert.match(source, /const folder = `\$\{currentUserId\}\/\$\{year\}\/\$\{String\(month\)/);
});

test('la pantalla consume revisiones guardadas y no crea otro lector ni compara el Registro', () => {
  const source = read('estadisticas-nomina.js');
  assert.match(source, /readReview\(bucket, `\$\{receipt\.folder\}\/review`\)/);
  assert.match(source, /reviewToReceipt/);
  assert.doesNotMatch(source, /Tesseract|lab-read-payroll-variables|timesheet|COMPARABLE_KEYS|comparisons/);
  assert.doesNotMatch(source, /storageBucket\.upload|\.upload\(/);
});

test('la vista incluye año, Acumulado/Mensual, una gráfica y Sin datos', () => {
  const html = read('estadisticas-nomina.html');
  assert.match(html, /id="year-select"/);
  assert.match(html, />Acumulado</);
  assert.match(html, />Mensual</);
  assert.match(html, /id="annual-chart"/);
  assert.match(html, /Pluses y complementos del mes/);
  assert.match(html, /meses sin nómina se muestran como «Sin datos»/);
  assert.match(html, /Los cálculos incluyen únicamente las nóminas cargadas/);
});

test('la página se actualiza al volver, al recuperar visibilidad o al pulsar actualizar', () => {
  const source = read('estadisticas-nomina.js');
  assert.match(source, /addEventListener\('pageshow'/);
  assert.match(source, /addEventListener\('visibilitychange'/);
  assert.match(source, /refreshButton\.addEventListener\('click', loadStatistics\)/);
  assert.doesNotMatch(source, /localStorage|indexedDB/);
});

test('el mismo lector amplía y conserva datos económicos sin alterar la comparación', () => {
  const edge = read('supabase/functions/lab-read-payroll-variables/index.ts');
  const vision = read('payroll-vision-lab.js');
  const base = read('revisa-tu-nomina-base.html');
  assert.match(edge, /const includeEconomics = body\?\.includeEconomics === true/);
  assert.match(edge, /"economics" con esta estructura/);
  assert.match(edge, /normalizePayrollEconomics\(parsed\.economics\)/);
  assert.match(vision, /includeEconomics: true/);
  assert.match(vision, /str:payroll-economics/);
  assert.match(base, /payrollEconomics: documents\.payroll\.payrollEconomics/);
  assert.match(base, /delete pending\.payrollEconomics/);
});
