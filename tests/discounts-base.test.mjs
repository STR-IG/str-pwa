import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');

test('documents keep Registro and Nómina and add Descuentos with the same card pattern', () => {
  assert.match(html, /id="timesheet-card" class="document-card"/);
  assert.match(html, /id="payroll-card" class="document-card locked"/);
  assert.match(html, /id="discounts-card" class="document-card"/);
  assert.match(html, /id="open-timesheet"[\s\S]*id="open-payroll"[\s\S]*id="open-discounts"/);
});

test('discounts opens a base screen only, without upload, OCR or storage wiring', () => {
  const screen = html.match(/<section id="discounts-screen"[\s\S]*?<\/section>\s*<\/section>/)?.[0] || '';
  assert.match(screen, /Lector de descuentos/);
  assert.match(screen, /Seguridad Social e IRPF/);
  assert.doesNotMatch(screen, /<input|type="file"|supabase|ocr|Guardar imagen/i);
  assert.match(html, /open-discounts'\)\.addEventListener\('click', showDiscountsScreen\)/);
});

test('back navigation returns from Descuentos and existing document handlers stay unchanged', () => {
  assert.match(html, /if \(!discountsScreen\.hidden\) \{[\s\S]*?showPeriodScreen\(\);[\s\S]*?return;/);
  assert.match(html, /open-timesheet'\)\.addEventListener\('click', \(\) => openDocument\('timesheet'\)\)/);
  assert.match(html, /open-payroll'\)\.addEventListener\('click', \(\) => openDocument\('payroll'\)\)/);
});

test('existing iPhone rule lets card headings and status wrap without clipping', () => {
  assert.match(html, /@media \(max-width: 390px\) \{\s*\.document-line \{ display: block; \}/);
  assert.match(html, /\.document-info \{\s*min-width: 0;/);
});
