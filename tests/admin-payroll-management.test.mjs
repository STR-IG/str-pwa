import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminPayrollApi } from '../admin-payroll-storage.mjs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { bucketFor, extract } from './payroll-receipts.test.mjs';
import { monthReceipts, newReceiptId } from '../payroll-receipts.mjs';

const page = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../panel-administracion.html', import.meta.url), 'utf8');
const endpoint = readFileSync(new URL('../supabase/functions/admin-payroll-documents/index.ts', import.meta.url), 'utf8');
const policy = readFileSync(new URL('../supabase/migrations/20260909000000_allow_admin_managed_payroll_ownership.sql', import.meta.url), 'utf8');

test('la ficha existente agrega periodos y abre el mismo flujo de Revisa tu nómina', () => {
  assert.match(panel, /Nóminas y Registro/);
  assert.match(panel, /adminPayrollApi/);
  assert.match(panel, /revisa-tu-nomina\.html\?\$\{params\}/);
  assert.match(panel, /Registro: \$\{period\.timesheet\?'existente':'no existente'\}/);
  assert.match(panel, /period\.payrollCount/);
});

test('el periodo administrativo abre el mismo Calcula tu V con afiliado, mes y recibo', () => {
  assert.match(page, /id="admin-calculate-v"/);
  assert.match(page, /window\.location\.href = `area-privada\.html\?\$\{params\}`/);
  assert.match(page, /adminAffiliate: adminAffiliateEmail/);
  assert.match(page, /adminYear: year\.value/);
  assert.match(page, /adminMonth: String\(Number\(month\.value\) \+ 1\)/);
  assert.match(page, /params\.set\('adminReceipt', activeReceiptId\)/);
});

test('el modo administrativo reutiliza lectores y bucket, sin un segundo OCR', () => {
  assert.match(page, /const storageBucket = isAdminMode \? adminApi\.bucket : supabase\.storage\.from\(STORAGE_BUCKET\)/);
  assert.match(page, /assertUniquePayroll\(storageBucket/);
  assert.match(page, /monthReceipts\(storageBucket/);
  assert.match(page, /saveAdminTimesheetForMonth/);
  assert.doesNotMatch(endpoint, /tesseract|openai|vision|ocr/i);
});

test('cada operación se autentica y autoriza antes de aceptar acción, afiliado o ruta', () => {
  const authenticate = endpoint.indexOf('admin.auth.getUser(token)');
  const authorize = endpoint.indexOf('.from("committee_admins")');
  const action = endpoint.indexOf('const action =');
  const validatePath = endpoint.indexOf('if (action === "list")');
  assert.ok(authenticate > 0 && authorize > authenticate && action > authorize && validatePath > action);
  assert.match(endpoint, /AFFILIATE_ACCOUNT_NOT_FOUND/);
  assert.match(endpoint, /parts\[0\] !== userId/);
  assert.match(endpoint, /isAllowedFile/);
});

test('sustituir o eliminar invalida la revisión sin tocar otros recibos', () => {
  assert.match(page, /invalidateStoredReviewIfNeeded/);
  assert.match(page, /invalidateAdminReceiptReview/);
  assert.match(page, /storageBucket\.remove\(\[storagePath\('payroll'\)\]\)/);
  assert.match(page, /Las nóminas del mes permanecen intactas/);
  assert.match(page, /Los demás recibos del mes permanecen intactos|los demás recibos del mes permanecen intactos/);
  assert.match(page, /adminReplacementKind === activeKind/);
});

test('el administrador no puede editar manualmente los resultados leídos', () => {
  assert.match(page, /input\.readOnly = isAdminMode/);
  assert.match(page, /comparisonFields\.querySelectorAll\('select'\)/);
  assert.match(page, /edit-payroll-values'\)\.hidden = isAdminMode/);
});

test('Descuentos usa el mismo lector y permite consultar, sustituir, reprocesar o eliminar solo sus datos', () => {
  assert.doesNotMatch(page, /getElementById\('discounts-card'\)\.hidden = true/);
  assert.match(page, /Consultar Descuentos/);
  assert.match(page, /Añadir Descuentos/);
  assert.match(page, /prepareAdminDiscounts\('replace'\)/);
  assert.match(page, /prepareAdminDiscounts\('reprocess'\)/);
  assert.match(page, /deleteAdminDiscounts/);
  assert.match(page, /delete updated\.discounts/);
  assert.match(page, /showDiscountsScreen\(\{ fresh: true \}\)/);
  assert.match(page, /str:discounts-opened/);
  assert.doesNotMatch(endpoint, /discounts-reader|readDiscounts|ocr/i);
});

test('eliminar Descuentos conserva Nómina, Registro, comparación y cierre del recibo', async () => {
  let uploaded = null;
  const previous = {
    status: 'complete', scope: 'receipt',
    timesheet: { vacation: '3' }, payroll: { vacation: '3' },
    comparisons: { vacation: { status: 'match' } },
    discounts: [{ code: '9350', amount: 120.5 }]
  };
  const reviews = new Map([['2026-08/receipt-test', previous]]);
  const ctx = vm.createContext({
    Date, Map, Array, isAdminMode: true, savingReview: false, savingDocument: false,
    monthlyReviews: reviews, periodKey: () => '2026-08/receipt-test',
    adminActionDescription: () => 'Descuentos · agosto de 2026 · afiliado de prueba',
    window: { confirm: () => true },
    uploadMonthlyReview: async review => { uploaded = review; },
    updatePeriodCards() {}, showPeriodMessage() {}
  });
  vm.runInContext(extract('deleteAdminDiscounts'), ctx);
  await ctx.deleteAdminDiscounts();
  assert.equal(uploaded.discounts, undefined);
  assert.deepEqual(uploaded.timesheet, previous.timesheet);
  assert.deepEqual(uploaded.payroll, previous.payroll);
  assert.deepEqual(uploaded.comparisons, previous.comparisons);
  assert.equal(uploaded.status, 'complete');
});

test('el adaptador envía token y afiliado en cada operación y nunca una clave secreta', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    return new Response(JSON.stringify({ data: [], userId: 'target-user' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const api = adminPayrollApi({
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'admin-token' } } }) } },
      endpoint: 'https://example.invalid/admin', publishableKey: 'publishable', email: 'affiliate@example.test'
    });
    await api.resolve();
    await api.bucket.list('target-user/2026/08');
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.headers.Authorization, 'Bearer admin-token');
      assert.match(call.body, /affiliate@example\.test/);
      assert.doesNotMatch(call.body, /service_role/i);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('la política conserva aislamiento por UUID y permite leer archivos creados por soporte', () => {
  assert.match(policy, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g);
  assert.doesNotMatch(policy, /owner_id/);
  assert.match(policy, /storage\.filename\(name\) = any/);
});

test('dos nóminas conservan recibos separados al sustituir/eliminar Registro o una nómina', async () => {
  const bucket = bucketFor('owner-a');
  bucket.remove = async paths => { paths.forEach(path => bucket.objects.delete(path)); return { data: paths, error: null }; };
  const one = newReceiptId(); const two = newReceiptId();
  const folders = [`owner-a/2026/08/${one}`, `owner-a/2026/08/${two}`];
  for (const [index, folder] of folders.entries()) {
    bucket.objects.set(`${folder}/timesheet`, new Blob(['old register']));
    bucket.objects.set(`${folder}/payroll`, new Blob([`payroll-${index + 1}`]));
    bucket.objects.set(`${folder}/review`, new Blob([JSON.stringify({ status: 'complete', createdAt: '2026-08-01T00:00:00.000Z', discounts: [{ code: '9350' }] })]));
  }
  const ctx = vm.createContext({
    Blob, Date, Set, Map, Promise, crypto: webcrypto, console, monthReceipts,
    isAdminMode: true, currentUserId: 'owner-a', storageBucket: bucket,
    year: { value: '2026' }, month: { value: '7' }, activeReceiptId: one,
    documents: { timesheet: { saved: true }, payroll: { saved: true } }, savingDocument: false,
    adminReplacementKind: '', monthlyReviews: new Map(),
    monthFolder: () => 'owner-a/2026/08', periodFolder: () => `owner-a/2026/08/${one}`,
    storagePath: kind => `owner-a/2026/08/${one}/${kind}`,
    downloadMonthlyReview: async path => JSON.parse(await bucket.objects.get(path).text()),
    adminActionDescription: () => 'documento de prueba',
    window: { confirm: () => true }, showPeriodMessage() {}, updatePeriodCards() {}, async loadStoredDocuments() {},
    async invalidateStoredReviewIfNeeded() {
      const path = `owner-a/2026/08/${one}/review`;
      bucket.objects.set(path, new Blob([JSON.stringify({ status: 'pending' })]));
    }
  });
  for (const name of ['invalidateAdminReceiptReview', 'saveAdminTimesheetForMonth', 'deleteAdminPayroll', 'deleteAdminTimesheet']) {
    vm.runInContext(extract(name), ctx);
  }

  await ctx.saveAdminTimesheetForMonth(new Blob(['replacement register']));
  const currentReceipt = (await monthReceipts(bucket, 'owner-a/2026/08')).find(receipt => receipt.id === one);
  await ctx.invalidateAdminReceiptReview(currentReceipt);
  for (const folder of folders) {
    assert.equal(await bucket.objects.get(`${folder}/timesheet`).text(), 'replacement register');
    assert.equal(JSON.parse(await bucket.objects.get(`${folder}/review`).text()).status, 'pending');
    assert.equal(JSON.parse(await bucket.objects.get(`${folder}/review`).text()).discounts[0].code, '9350');
  }
  await ctx.deleteAdminPayroll();
  assert.equal(bucket.objects.has(`${folders[0]}/payroll`), false);
  assert.equal(await bucket.objects.get(`${folders[1]}/payroll`).text(), 'payroll-2');
  await ctx.deleteAdminTimesheet();
  assert.equal(bucket.objects.has(`${folders[0]}/timesheet`), false);
  assert.equal(bucket.objects.has(`${folders[1]}/timesheet`), false);
  assert.equal(await bucket.objects.get(`${folders[1]}/payroll`).text(), 'payroll-2');
});
