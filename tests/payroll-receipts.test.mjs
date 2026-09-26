import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { newReceiptId, receiptCreatedAt, monthReceipts, assertUniquePayroll, sha256, listFiles } from '../payroll-receipts.mjs';
import { readSupplemental } from '../payroll-supplemental.mjs';
import { readOvertime } from '../payroll-overtime.mjs';
import { hasCompletePaymentBreakdown, hasValidPayrollCrop, payrollRegularizationMonth } from '../payroll-payments.mjs';

const html = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/\r/g, '');
function extract(name) {
  const start = source.search(new RegExp(`    (?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n    }', start) + 6);
}
const element = () => ({ hidden: false, disabled: false, textContent: '', value: '', dataset: {}, listeners: {},
  classList: { toggle() {}, add() {}, remove() {} }, scrollIntoView() {}, focus() {},
  setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; },
  addEventListener(name, fn) { this.listeners[name] = fn; }, click() { return this.listeners.click?.(); }
});

// Contract test double; production policy validation is separate and read-only.
function bucketFor(user, objects = new Map()) {
  const allowed = path => path.startsWith(`${user}/`);
  return {
    objects, failUploads: false, failDownloads: false, uploads: [],
    async upload(path, blob, options) {
      this.uploads.push({path, options});
      if (!allowed(path) || this.failUploads) return { error: new Error('Denied or offline') };
      if (objects.has(path) && !options.upsert) return { error: new Error('Duplicate') };
      objects.set(path, blob); return { error: null };
    },
    async download(path) {
      return !this.failDownloads && allowed(path) && objects.has(path) ? { data: objects.get(path), error: null } : { error: new Error('Denied or missing') };
    },
    async list(path, { offset, limit }) {
      if (path !== user && !allowed(path)) return { data: [], error: null };
      const entries = new Map();
      for (const key of objects.keys()) {
        if (!key.startsWith(`${path}/`)) continue;
        const tail = key.slice(path.length + 1);
        const name = tail.split('/')[0];
        entries.set(name, { name, id: tail.includes('/') ? null : key });
      }
      return { data: [...entries.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(offset, offset + limit), error: null };
    }
  };
}
function harness(bucket) {
  const nodes = new Map();
  const ctx = vm.createContext({
    Blob, URL, Date, Map, Promise, crypto: webcrypto, console,
    newReceiptId, receiptCreatedAt, monthReceipts, assertUniquePayroll, sha256,
    currentUserId: 'owner-a', STORAGE_BUCKET: 'payroll-documents', storageBucket: bucket, supabase: { storage: { from: () => bucket } },
    isAdminMode: false, adminReplacementKind: '', adminContext: null, adminAffiliateEmail: '',
    month: { value: '7' }, year: { value: '2026' }, activeReceiptId: null, activeReceiptNumber: 1, monthlyComparisonFolder: '', preparingMonthComparison: false, currentMonthReceiptCount: 0, receiptCreated: null, payrollSourceHash: '',
    storageLoadVersion: 0, historyLoadVersion: 0, loadingDocuments: false, historyEntries: [], savingReview: false, savingDocument: false,
    confirmedTimesheetAnalyses: new Map(), confirmedPayrollAnalyses: new Map(), monthlyReviews: new Map(), workSchedules: new Map(),
    documents: { timesheet: {}, payroll: {} }, comparisonInputs: new Map(), PAYROLL_VARIABLES: [],
    activeKind: '', workingFile: null, workingUrl: '', workingSaved: false, workingOcrText: '',
    clearAllDocuments() { this; }, loadWorkSchedule() {}, updatePeriodCards() {}, showPeriodMessage() {},
    showPeriodScreen() {}, showDiscountsScreen() {}, openDocument() {}, ensureYearOption() {}, renderPrivateHistory() {},
    prepareAdminReplacement() {}, deleteAdminTimesheet() {}, deleteAdminPayroll() {},
    currentScheduleSettings: () => ({}), buildMonthlyComparisons: () => ({}),
    applyComparisonCardResult() {}, renderComparisonResult() {}, renderPayrollComparison() {}, renderPaymentInformation() {}, setComparisonProgress() {},
    updateMonthlyControls() {}, hideMonthlyResults() {},
    renderSupplemental() {},
    renderOvertime() {},
    readSupplemental: () => readSupplemental({getElementById: id => nodes.get(id)}),
    readOvertime: () => readOvertime({getElementById: id => nodes.get(id)}),
    parseQuantityValue: Number, formatQuantity: String,
    hasCompletePaymentBreakdown, hasValidPayrollCrop, payrollRegularizationMonth,
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); } }
  });
  for (const key of ['addMonthlyPayroll','addPeriodPayroll','addDocumentPayroll','historyCount','historyLoading','historyError','historyList','historyEmpty','refreshHistoryButton','comparisonError','confirmComparisonButton','comparisonSaved','comparisonResult','comparisonDetectedCount']) ctx[key] = element();
  for (const name of ['monthFolder','periodFolder','periodKey','storagePath','mapToPlainObject','plainObjectToMap','uploadMonthlyReview','hydrateMonthlyReview','downloadMonthlyReview','loadStoredDocuments','listAllStorageItems','loadPrivateHistory','openHistoryPeriod','confirmMonthlyComparison','isCurrentReviewComplete','clearAllDocuments','revokeWorkingUrlIfTemporary','saveWorkSchedule','resetReviewDocument','openNextPayrollDiscounts','startAnotherPayroll','continueMonthComparison']) vm.runInContext(extract(name), ctx);
  return ctx;
}

function documentHarness(bucket) {
  const app = harness(bucket);
  Object.assign(app, {
    activeKind: '', workingFile: null, workingUrl: '', workingSaved: false, workingOcrText: '',
    privacyScanState: 'idle', periodLabel: () => 'agosto de 2026', monthlyIncidentCount: () => 0,
    detectedRegularizationMonth: null, confirmedRegularizationPeriod: null,
    window: { scrollTo() {} }, resetDocumentScreen() {},
    documentCopy: { timesheet: {}, payroll: {} },
    ALLOWED_IMAGE_TYPES: new Set(['image/png']), MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    openTimesheetCrop() { app.cropOpened = true; },
    showPeriodScreen() { app.returnedToSummary = true; app.updatePeriodCards(); },
    showPeriodMessage(message, isError) { app.periodMessage = {message, isError}; },
    startMonthlyReview() { app.openedSavedReview = true; }
  });
  for (const key of ['addPeriodPayroll','addDocumentPayroll','savedDocumentNotice','documentUploadControls',
    'privacyConfirmation','fileInput','selectImageButton','selectHint','preview','previewImage','previewStatusText',
    'fileError','documentActions','changeImageButton','confirmImageButton','startAnalysisButton',
    'periodScreen','historyScreen','analysisScreen','comparisonScreen','documentScreen','topBack']) app[key] = element();
  for (const key of ['regularizationPeriod','regularizationMonth','regularizationYear','confirmRegularizationPeriod','regularizationPeriodStatus']) app[key] = element();
  for (const name of ['clearAllDocuments','revokeWorkingUrlIfTemporary','invalidateStoredReviewIfNeeded',
    'updatePeriodCards','renderWorkingPreview','openDocument','chooseImage','showSelectedFile','confirmImage']) vm.runInContext(extract(name), app);
  const bindings = source.slice(source.indexOf("    addMonthlyPayroll.addEventListener('click'"), source.indexOf("    replaceWrongPayrollButton.addEventListener"));
  vm.runInContext(bindings, app);
  return app;
}

async function seedSavedReceipt(bucket, prefix) {
  for (const kind of ['timesheet','payroll']) await bucket.upload(`${prefix}/${kind}`, new Blob([`saved ${kind}`]), { upsert: false });
  await bucket.upload(`${prefix}/review`, new Blob([JSON.stringify({ period: prefix.slice('owner-a/'.length).replace('2026/08','2026-08'), status:'complete', timesheet:{}, payroll:{} })]), { upsert: false });
}

function privacyHarness() {
  const app = documentHarness(bucketFor('owner-a'));
  Object.assign(app, { privacyScanVersion: 1, ocrWorkerPromise: null,
    createPayrollOcrSources: async file => [{ source: file, pageSegMode: '11' }, { source: file, pageSegMode: '6' }] });
  for (const key of ['privacyScan','privacyScanIcon','privacyScanTitle','privacyScanMessage']) app[key] = element();
  for (const name of ['PERSONAL_DATA_LABELS','DOCUMENT_KIND_MARKERS']) {
    const start = source.indexOf(`    const ${name} = `);
    assert.ok(start >= 0, name);
    vm.runInContext(source.slice(start, source.indexOf(';', start) + 1), app);
  }
  for (const name of ['normalizeOcrText','detectDocumentKind','containsLikelyPersonalData','setPrivacyScanState','checkSelectedFilePrivacy']) vm.runInContext(extract(name), app);
  return app;
}

// Synthetic OCR text only: never store real payroll images or personal details in tests.
const payrollTableText = `DESGLOSE PAGOS: TRANSFER. 1 630,00 LIQUIDO TOTAL 630,00
DEVENGOS Y DEDUCCIONES
CODIGO CONCEPTO CANTIDAD IMPORTE DIARIO DEVENGOS DEDUCCIONES
0001 Salario minimo garantizado 14 50,0000 700,00
SEGURIDAD SOCIAL E IRPF
CODIGO CONCEPTO BASE % CUOTA TRABAJADOR/A % EMPRESA CUOTA EMPRESA
9402 IRPF 700,00 10,00 70,00`;

test('privacy accepts contribution table headings, not just payrolls without that table', () => {
  const app = privacyHarness();
  for (const text of [payrollTableText, payrollTableText.toLowerCase(), payrollTableText.replace(/\n/g, ' '),
    'Seguridad\nSocial   e\nIRPF', 'CUOTA TRABAJADOR / A', 'Cuota trabajador a']) {
    assert.equal(app.containsLikelyPersonalData(text), false, 'a contribution table is not an identity label');
  }
});

test('privacy still rejects identity and contact details even alongside a contribution heading', () => {
  const app = privacyHarness();
  for (const label of ['Trabajador/a', 'Trabajador / A', 'Trabajador a', 'Nombre y apellidos', 'DNI', 'NIE', 'NIF', 'Número de empleado', 'NSS', 'NAF',
    'Número de Seguridad Social', 'Seguridad Social: 12/34567890/12', 'IBAN', 'Cuenta bancaria',
    'Domicilio', 'Dirección', 'Correo electrónico', 'Teléfono', 'Responsable', 'Centro de trabajo', 'Posición',
    '12345678Z', 'X1234567L', 'persona@example.invalid', 'ES0000000000000000000000', 'ES00 0000 0000 0000 0000 0000']) {
    for (const text of [label, `${payrollTableText}\n${label}`, `${label}\n${payrollTableText}`]) {
      assert.equal(app.containsLikelyPersonalData(text), true, `must reject ${label}`);
    }
  }
});

test('privacy scan enables saving a clean table only after consent; blocked, wrong and failed scans stay disabled', async () => {
  const app = privacyHarness();
  app.activeKind = 'payroll';
  app.workingFile = new Blob(['synthetic image'], {type:'image/png'});
  app.workingUrl = 'blob:synthetic';
  app.recognizeTextLocally = async () => payrollTableText;
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(app.privacyScanState, 'passed');
  assert.equal(app.confirmImageButton.disabled, true, 'manual consent still required');
  app.privacyConfirmation.checked = true;
  app.renderWorkingPreview();
  assert.equal(app.confirmImageButton.disabled, false);
  for (const [text, state] of [
    [`${payrollTableText}\nDNI`, 'blocked'],
    ['REGISTRO DE JORNADA RESUMEN DE VARIABLES', 'wrong-document'],
    ['DEVENGOS Y DEDUCCIONES CODIGO CONCEPTO CANTIDAD IMPORTE', 'missing-payment-breakdown'],
    ['', 'failed']
  ]) {
    app.recognizeTextLocally = async () => text;
    await app.checkSelectedFilePrivacy(app.workingFile, 1);
    assert.equal(app.privacyScanState, state);
    assert.equal(app.confirmImageButton.disabled, true);
  }
  app.recognizeTextLocally = async () => { throw new Error('OCR unavailable'); };
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(app.privacyScanState, 'failed');
  assert.equal(app.confirmImageButton.disabled, true);
});

test('privacy accepts a complete 3.255,54 payroll crop despite tolerant OCR headings', async () => {
  const app = privacyHarness();
  app.activeKind = 'payroll';
  app.workingFile = new Blob(['synthetic image'], {type:'image/png'});
  app.workingUrl = 'blob:synthetic-3255';
  app.recognizeTextLocally = async () => `
    DESGLOSE DE PAGO5
    TRANSFERENCIA 1 3.255,54
    L1QUIDO TOTAL 3.255,54
    DEVENG0S Y DEDUCCIONES
    C0DIGO CONCEPTO CANTIDAD IMPORTE DIARIO DEVENGOS DEDUCCIONES
    0001 SALARIO MINIMO GARANTIZADO 30 50,0000 1.500,00
    TOTAL DEVENGOS 4.011,22 TOTAL DEDUCCIONES 755,68`;
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(app.privacyScanState, 'passed');
});

test('saved image view offers another receipt, hides replacement controls, and never overwrites (legacy and new)', async () => {
  for (const id of ['', newReceiptId()]) {
    const bucket = bucketFor('owner-a');
    const prefix = `owner-a/2026/08${id ? `/${id}` : ''}`;
    await seedSavedReceipt(bucket, prefix);
    const original = new Map(bucket.objects);
    const app = documentHarness(bucket);
    await app.loadStoredDocuments();
    assert.equal(app.addPeriodPayroll.hidden, false, 'add-another visible in the summary');
    for (const kind of ['timesheet','payroll']) {
      app.openDocument(kind);
      assert.equal(app.savedDocumentNotice.hidden, false);
      assert.equal(app.documentUploadControls.hidden, true);
      assert.equal(app.changeImageButton.hidden, true);
      assert.equal(app.confirmImageButton.textContent, 'Volver al resumen');
      let chooserOpened = false;
      app.fileInput.click = () => { chooserOpened = true; };
      app.chooseImage();
      await app.showSelectedFile(new Blob(['another image'], { type: 'image/png' }));
      assert.equal(chooserOpened, false);
      assert.notEqual(app.cropOpened, true);
      // Defensive path: a pending file cannot replace a completed review either.
      app.workingFile = new Blob(['must not replace']);
      app.workingUrl = 'blob:pending'; app.workingSaved = false;
      app.privacyConfirmation.checked = true; app.privacyScanState = 'passed';
      app.returnedToSummary = false;
      await app.confirmImage();
      assert.equal(app.returnedToSummary, true);
      assert.deepEqual(bucket.objects, original);
    }
    await app.document.getElementById('open-document-review').click();
    assert.equal(app.openedSavedReview, true);
    await app.addDocumentPayroll.click();
    assert.notEqual(app.activeReceiptId, id);
    assert.equal(app.month.value, '7'); assert.equal(app.year.value, '2026');
    assert.equal(app.addPeriodPayroll.hidden, true);
    assert.equal(app.activeKind, '', 'asks for the new payroll type before uploading');
    assert.equal(app.document.getElementById('open-payroll').disabled, true);
    app.currentScheduleSettings = () => ({type:'full'});
    app.updatePeriodCards();
    app.openDocument('payroll');
    assert.equal(app.documents.timesheet.confirmed, true);
    assert.equal(app.documents.payroll.confirmed, false);
    assert.equal(bucket.objects.has(app.storagePath('timesheet')), false, 'the new receipt does not duplicate the monthly register');
    assert.equal(await bucket.objects.get(`${prefix}/timesheet`).text(), 'saved timesheet');
    assert.equal(app.document.getElementById('open-payroll').disabled, false);
    assert.equal(app.document.getElementById('document-count').textContent, '1 de 2 guardados');
    assert.equal(app.document.getElementById('payroll-timesheet-note').hidden, false);
    assert.equal(app.savedDocumentNotice.hidden, true);
    assert.equal(app.documentUploadControls.hidden, false);
    assert.equal(app.selectImageButton.disabled, false);
    app.workingFile = new Blob(['new payroll'], { type: 'image/png' });
    app.workingUrl = URL.createObjectURL(app.workingFile);
    app.privacyScanState = 'passed'; app.privacyConfirmation.checked = true;
    await app.confirmImage();
    app.confirmComparisonButton.dataset.action = 'check';
    await app.confirmMonthlyComparison();
    assert.equal(app.addPeriodPayroll.hidden, true, 'a completed second payroll cannot open a third payroll');
    for (const [path, blob] of original) assert.equal(await bucket.objects.get(path).text(), await blob.text());
    await app.loadPrivateHistory();
    assert.equal(app.historyEntries.length, 2);
    const savedCount = bucket.objects.size;
    await app.addPeriodPayroll.click();
    assert.equal(bucket.objects.size, savedCount, 'the hidden action cannot create a third payroll');
  }
});

test('new receipt keeps privacy gate; loading or saving cannot start another receipt', async () => {
  const bucket = bucketFor('owner-a'); const app = documentHarness(bucket);
  await app.loadStoredDocuments();
  app.openDocument('timesheet');
  app.workingFile = new Blob(['unverified'], { type: 'image/png' }); app.workingUrl = 'blob:pending';
  app.privacyConfirmation.checked = true; app.privacyScanState = 'checking';
  app.renderWorkingPreview();
  assert.equal(app.confirmImageButton.disabled, true);
  await app.confirmImage();
  assert.equal(bucket.objects.size, 0);
  const id = app.activeReceiptId;
  for (const flag of ['loadingDocuments','savingReview','savingDocument']) {
    app.monthlyReviews.set(app.periodKey(), {status:'complete'}); app[flag] = true;
    await app.startAnotherPayroll();
    assert.equal(app.activeReceiptId, id); app[flag] = false;
  }
});

test('another payroll reuses the register but requires its own schedule and still rejects duplicates', async () => {
  const bucket = bucketFor('owner-a');
  await seedSavedReceipt(bucket, 'owner-a/2026/08');
  const app = documentHarness(bucket);
  await app.loadStoredDocuments();
  const schedule = {type:'reduced', percentage:80, duration:'whole'};
  app.currentScheduleSettings = () => schedule;
  app.confirmedTimesheetAnalyses.set(app.periodKey(), new Map([['night','10'], ['meals','2']]));
  // A pending replacement must not be used as the new receipt's timesheet.
  app.workingFile = new Blob(['unsaved replacement']); app.workingUrl = 'blob:pending';
  const original = new Map(bucket.objects);
  await app.addMonthlyPayroll.click();
  const receiptId = app.activeReceiptId;
  assert.equal(app.activeKind, '');
  assert.equal(app.workSchedules.get(app.periodKey()).type, '');
  app.currentScheduleSettings = () => ({type:'full'});
  app.openDocument('payroll');
  assert.equal(app.confirmedTimesheetAnalyses.get(app.periodKey()).get('night'), '10');
  assert.equal(app.monthlyReviews.get(app.periodKey())?.status, 'pending');
  assert.equal(app.confirmedPayrollAnalyses.has(app.periodKey()), false);
  assert.equal(bucket.objects.has(app.storagePath('payroll')), false);
  assert.equal(bucket.uploads.at(-1).options.upsert, false);
  assert.equal(bucket.objects.has(app.storagePath('timesheet')), false, 'no second register is stored');
  assert.equal(await bucket.objects.get('owner-a/2026/08/timesheet').text(), 'saved timesheet');
  app.workingFile = new Blob(['saved payroll'], {type:'image/png'});
  app.workingUrl = URL.createObjectURL(app.workingFile);
  app.privacyScanState = 'passed'; app.privacyConfirmation.checked = true;
  await app.confirmImage();
  assert.match(app.fileError.textContent, /ya está guardada en otro recibo/);
  assert.equal(bucket.objects.has(app.storagePath('payroll')), false);
  const reopened = documentHarness(bucket);
  await reopened.loadStoredDocuments();
  assert.equal(reopened.activeReceiptId, receiptId);
  assert.equal(reopened.documents.timesheet.confirmed, true);
  assert.equal(reopened.document.getElementById('open-payroll').disabled, true);
  assert.equal(reopened.document.getElementById('document-count').textContent, '1 de 2 guardados');
  for (const [path, blob] of original) assert.equal(await bucket.objects.get(path).text(), await blob.text());
});

test('failed preparation preserves the original receipt, unlocks the UI, and can be retried', async () => {
  for (const failure of ['upload', 'download']) {
    const bucket = bucketFor('owner-a');
    await seedSavedReceipt(bucket, 'owner-a/2026/08');
    const original = new Map(bucket.objects);
    const app = documentHarness(bucket);
    await app.loadStoredDocuments();
    if (failure === 'upload') bucket.failUploads = true;
    else { app.documents.timesheet.blob = null; bucket.failDownloads = true; }
    await app.addPeriodPayroll.click();
    assert.equal(app.activeReceiptId, '');
    assert.equal(app.isCurrentReviewComplete(), true);
    assert.equal(app.periodMessage.isError, true);
    assert.equal(app.savingDocument, false); assert.equal(app.loadingDocuments, false);
    assert.notEqual(app.month.disabled, true); assert.notEqual(app.year.disabled, true);
    assert.equal(app.addPeriodPayroll.disabled, false);
    assert.deepEqual(bucket.objects, original);
    bucket.failUploads = false; bucket.failDownloads = false;
    await app.addPeriodPayroll.click();
    assert.notEqual(app.activeReceiptId, '');
    assert.equal(app.activeKind, '');
    assert.equal(bucket.objects.size, original.size + 1);
  }
});

test('double-click creates only one receipt and keeps the original active until the copy succeeds', async () => {
  const bucket = bucketFor('owner-a');
  await seedSavedReceipt(bucket, 'owner-a/2026/08');
  const app = documentHarness(bucket);
  await app.loadStoredDocuments();
  const upload = bucket.upload.bind(bucket);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  bucket.upload = async (...args) => { await pending; return upload(...args); };
  const adding = app.startAnotherPayroll();
  assert.equal(app.savingDocument, true);
  assert.equal(app.month.disabled, true); assert.equal(app.year.disabled, true);
  assert.equal(app.activeReceiptId, '');
  await app.startAnotherPayroll();
  release(); await adding;
  assert.equal(bucket.objects.size, 4);
  assert.equal(app.activeKind, '');
  assert.equal(app.savingDocument, false);
  assert.equal(app.addPeriodPayroll.disabled, false);
});

test('August: two separate receipts, no third payroll, reopening and legacy compatibility', async () => {
  const bucket = bucketFor('owner-a');
  const app = harness(bucket);
  await app.loadStoredDocuments();
  const paths = [];
  let sharedTimesheetPath = '';
  for (let i = 0; i < 2; i++) {
    const payroll = new Blob([`Fictitious payroll ${i}`]);
    const path = app.storagePath('payroll');
    await assertUniquePayroll(bucket, app.monthFolder(), payroll, path);
    await bucket.upload(path, payroll, { upsert: false });
    if (i === 0) {
      sharedTimesheetPath = app.storagePath('timesheet');
      await bucket.upload(sharedTimesheetPath, new Blob(['Fictitious timesheet']), { upsert: false });
    }
    assert.equal(await bucket.objects.get(sharedTimesheetPath).text(), 'Fictitious timesheet');
    if (i > 0) assert.equal(bucket.objects.has(app.storagePath('timesheet')), false, 'all later payrolls share the first register');
    app.confirmComparisonButton.dataset.action = 'check';
    await app.confirmMonthlyComparison();
    assert.equal(app.addMonthlyPayroll.hidden, false);
    const reviewPath = app.storagePath('review');
    const saved = await bucket.objects.get(reviewPath).text();
    const review = JSON.parse(saved);
    assert.equal(review.userId, 'owner-a');
    assert.equal(review.year, 2026); assert.equal(review.month, 8);
    assert.ok(review.receiptId && review.createdAt && review.updatedAt);
    paths.push({ path, reviewPath, saved, id: app.activeReceiptId });
    if (i === 0) await app.startAnotherPayroll();
  }
  assert.equal(new Set(paths.map(p => p.id)).size, 2);
  const twoReceiptSize = bucket.objects.size;
  await app.startAnotherPayroll();
  assert.equal(bucket.objects.size, twoReceiptSize, 'the flow rejects a third payroll even if invoked programmatically');
  for (const p of paths) assert.equal(await bucket.objects.get(p.reviewPath).text(), p.saved);
  await app.loadPrivateHistory();
  assert.equal(app.historyEntries.length, 2);
  for (const entry of app.historyEntries) {
    await app.openHistoryPeriod(entry.year, entry.month, entry.receiptId);
    assert.equal(app.activeReceiptId, entry.receiptId);
    assert.equal(app.monthlyReviews.get(app.periodKey()).status, 'complete');
  }
  await bucket.upload('owner-a/2026/08/payroll', new Blob(['Legacy payroll']), { upsert: false });
  await bucket.upload('owner-a/2026/08/review', new Blob([JSON.stringify({period:'2026-08',status:'complete',timesheet:{},payroll:{}})]), { upsert: false });
  await app.loadPrivateHistory();
  assert.equal(app.historyEntries.length, 3);
  await app.openHistoryPeriod(2026,8,'');
  assert.equal(app.storagePath('payroll'), 'owner-a/2026/08/payroll');
  assert.equal(app.monthlyReviews.get(app.periodKey()).status, 'complete');
  const other = bucketFor('owner-b', bucket.objects);
  for (const p of paths) assert.ok((await other.download(p.reviewPath)).error);
  assert.deepEqual(await monthReceipts(other, 'owner-a/2026/08'), []);
});

test('same bytes blocked, different payroll accepted, same source with another crop blocked', async () => {
  const b = bucketFor('owner-a');
  const path = `owner-a/2026/08/${newReceiptId()}/payroll`;
  const blob = new Blob(['one original']);
  await b.upload(path, blob, {upsert:false});
  await assert.rejects(assertUniquePayroll(b,'owner-a/2026/08',blob,'new/path'), /DUPLICATE_PAYROLL/);
  await assertUniquePayroll(b,'owner-a/2026/08',new Blob(['different']),'new/path');
  const hash = await sha256(new Blob(['original before crop']));
  await b.upload(path.replace(/payroll$/, 'review'),new Blob([JSON.stringify({payrollSourceHash:hash})]),{upsert:false});
  await assert.rejects(assertUniquePayroll(b,'owner-a/2026/08',new Blob(['different crop']),'new/path',hash), /DUPLICATE_PAYROLL/);
  b.download = async () => ({error: new Error('Offline')});
  await assert.rejects(assertUniquePayroll(b,'owner-a/2026/08',blob,'new/path'), /Offline/);
});

test('failed review upload does not enable add-another or mark complete', async () => {
  const b = bucketFor('owner-a'); const app = harness(b);
  await app.loadStoredDocuments(); b.failUploads = true;
  app.confirmComparisonButton.dataset.action='check';
  await app.confirmMonthlyComparison();
  assert.equal(app.addMonthlyPayroll.hidden, true);
  assert.equal(app.monthlyReviews.size, 0);
  assert.equal(app.comparisonError.hidden, false);
});

test('listing is paginated, with no two-receipt cap', async () => {
  const b = bucketFor('owner-a');
  for (let i=0;i<105;i++) b.objects.set(`owner-a/2026/08/${newReceiptId()}/payroll`, new Blob([String(i)]));
  assert.equal((await listFiles(b,'owner-a/2026/08')).length, 105);
  assert.equal((await monthReceipts(b,'owner-a/2026/08')).length, 105);
});

test('inline module parses', () => { new vm.SourceTextModule(source); });

export { bucketFor, documentHarness, extract, source, element };

function retryPrivacyHarness() {
  const app = privacyHarness();
  app.activeKind = 'payroll';
  app.workingFile = new Blob(['synthetic image'], { type: 'image/png' });
  app.workingUrl = 'blob:synthetic';
  app.privacyConfirmation.checked = true;
  return app;
}

test('uncertain crop retries full-image OCR locally and accepts a recovered header', async () => {
  const app = retryPrivacyHarness();
  const calls = [];
  const fullImage = { name: 'entire image at higher resolution' };
  app.createPayrollOcrSources = async file => {
    assert.equal(file, app.workingFile);
    return [{ source: fullImage, pageSegMode: '11' }];
  };
  app.recognizeTextLocally = async (file, mode) => {
    calls.push([file, mode]);
    return mode === '11' ? payrollTableText : 'DEVENGOS Y DEDUCCIONES CODIGO CONCEPTO';
  };
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], fullImage);
  assert.equal(app.privacyScanState, 'passed');
  assert.equal(app.confirmImageButton.disabled, false);
  assert.ok(app.workingOcrText.includes(payrollTableText));
});

test('a clear first reading needs no extra OCR', async () => {
  const app = retryPrivacyHarness();
  app.recognizeTextLocally = async () => payrollTableText;
  app.createPayrollOcrSources = async () => { throw new Error('unexpected retry'); };
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(app.privacyScanState, 'passed');
});

test('crop validation combines structural evidence from bounded OCR readings of the same image', async () => {
  const app = retryPrivacyHarness();
  let calls = 0;
  app.createPayrollOcrSources = async () => [
    { source: { name: 'full image psm 11' }, pageSegMode: '11' },
    { source: { name: 'full image psm 6' }, pageSegMode: '6' },
  ];
  app.recognizeTextLocally = async () => {
    calls += 1;
    if (calls === 1) return 'DEVENGOS Y DEDUCCIONES CODIGO CONCEPTO CANTIDAD IMPORTE DIARIO';
    return 'DESGLOSE PAGOS TRANSFER. 1 2.247,01 LIQUIDO TOTAL 2.247,01';
  };
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(calls, 2);
  assert.equal(app.privacyScanState, 'passed');
  assert.equal(app.confirmImageButton.disabled, false);
});

test('personal data found on either reading still blocks saving', async () => {
  for (const firstHasIdentity of [true, false]) {
    const app = retryPrivacyHarness();
    let calls = 0;
    app.recognizeTextLocally = async () => {
      calls++;
      if (calls === 1) return `DEVENGOS Y DEDUCCIONES ${firstHasIdentity ? 'DNI 12345678Z' : ''}`;
      return `${payrollTableText}\nDNI 12345678Z`;
    };
    await app.checkSelectedFilePrivacy(app.workingFile, 1);
    assert.equal(app.privacyScanState, 'blocked');
    assert.equal(app.confirmImageButton.disabled, true);
    assert.equal(calls, firstHasIdentity ? 1 : 2);
  }
});

test('unverified crop remains blocked after bounded retries with an accurate message', async () => {
  const app = retryPrivacyHarness();
  let calls = 0;
  app.recognizeTextLocally = async () => { calls++; return 'DEVENGOS Y DEDUCCIONES CODIGO CONCEPTO'; };
  await app.checkSelectedFilePrivacy(app.workingFile, 1);
  assert.equal(calls, 3);
  assert.equal(app.privacyScanState, 'missing-payment-breakdown');
  assert.equal(app.confirmImageButton.disabled, true);
  assert.match(app.privacyScanTitle.textContent, /No hemos podido verificar/);
  assert.doesNotMatch(app.privacyScanTitle.textContent, /Falta la parte superior/);
});

test('changing image while retrying discards both stale success and stale errors', async () => {
  for (const rejectRetry of [false, true]) {
    const app = retryPrivacyHarness();
    let finishRetry;
    let signalRetry;
    const retryStarted = new Promise(resolve => { signalRetry = resolve; });
    app.recognizeTextLocally = async (file, mode) => {
      if (!mode) return 'DEVENGOS Y DEDUCCIONES';
      signalRetry();
      return new Promise((resolve, reject) => { finishRetry = () => rejectRetry ? reject(new Error('stale OCR')) : resolve(payrollTableText); });
    };
    const scan = app.checkSelectedFilePrivacy(app.workingFile, 1);
    await retryStarted;
    app.privacyScanVersion = 2;
    app.workingFile = new Blob(['new image']);
    app.workingOcrText = 'new image text';
    app.privacyScanState = 'checking';
    finishRetry();
    await scan;
    assert.equal(app.privacyScanState, 'checking');
    assert.equal(app.workingOcrText, 'new image text');
  }
});

test('upload flow starts with the register and then requires a payroll type', () => {
  const app = documentHarness(bucketFor('owner-a'));
  app.updatePeriodCards();
  assert.equal(app.document.getElementById('open-timesheet').disabled, false);
  assert.equal(app.document.getElementById('payroll-type-section').hidden, true);
  assert.equal(app.document.getElementById('open-payroll').disabled, true);
  app.documents.timesheet.confirmed = true;
  app.updatePeriodCards();
  assert.equal(app.document.getElementById('payroll-type-section').hidden, false);
  assert.equal(app.document.getElementById('open-payroll').disabled, true);
  for (const type of ['full', 'reduced']) {
    app.currentScheduleSettings = () => ({ type, percentage: type === 'reduced' ? 80 : 100 });
    app.updatePeriodCards();
    assert.equal(app.document.getElementById('open-payroll').disabled, false);
  }
});

test('choosing the second payroll schedule preserves confirmed monthly register quantities', () => {
  const app = documentHarness(bucketFor('owner-a'));
  const values = new Map([['meals', '1'], ['holiday', '24']]);
  app.confirmedTimesheetAnalyses.set(app.periodKey(), values);
  app.analysisConfirmed = element(); app.confirmAnalysisButton = element();
  app.scheduleType = {value:'reduced'};
  app.currentScheduleSettings = () => ({type:'reduced', percentage:80});
  app.updateScheduleUI = () => {};
  vm.runInContext(extract('markScheduleDirty'), app);
  app.markScheduleDirty();
  assert.equal(app.confirmedTimesheetAnalyses.get(app.periodKey()), values);
  assert.equal(app.workSchedules.get(app.periodKey()).type, 'reduced');
});

test('August 2022 historical headings: spaced letters, accents and either block order', async () => {
  for (const text of [
    'D E S G L O S E  P A G O S\nD E V E N G O S  Y  D E D U C C I O N E S',
    'devéngos y deducciónes\ndes gl ose pa gos',
    'DESGLOSE\nPAGOS\nDEVENGOS Y DEDUCCIONES'
  ]) {
    const app = retryPrivacyHarness();
    app.recognizeTextLocally = async () => text;
    await app.checkSelectedFilePrivacy(app.workingFile, 1);
    assert.equal(app.privacyScanState, 'passed');
    app.recognizeTextLocally = async () => `${text}\nDNI 12345678Z`;
    await app.checkSelectedFilePrivacy(app.workingFile, 1);
    assert.equal(app.privacyScanState, 'blocked');
  }
  for (const text of ['D E S G L O S E P A G O S', 'D E V E N G O S Y D E D U C C I O N E S', 'Una imagen cualquiera']) {
    assert.equal(hasValidPayrollCrop(text), false);
  }
});

test('comparison skips the already confirmed shared register for the second receipt', () => {
  const app = documentHarness(bucketFor('owner-a'));
  app.computeScheduleFactor = () => 1;
  app.startPayrollComparison = () => { app.payrollOpened = true; };
  app.startTimesheetAnalysis = () => { throw new Error('must not repeat register'); };
  app.confirmedTimesheetAnalyses.set(app.periodKey(), new Map([['night','17']]));
  vm.runInContext(extract('startMonthlyReview'), app);
  app.startMonthlyReview();
  assert.equal(app.payrollOpened, true);
});

test('both add buttons open payroll 2 immediately after discounts, without reviewing payroll 1', async () => {
  for (const type of ['full','reduced']) {
    const bucket = bucketFor('owner-a');
    await seedSavedReceipt(bucket, 'owner-a/2026/08');
    const firstPath = 'owner-a/2026/08/review';
    const first = {period:'2026-08',status:'pending',schedule:{type:'full'},discounts:[{kind:'irpf',amount:100}]};
    bucket.objects.set(firstPath,new Blob([JSON.stringify(first)]));
    const app = documentHarness(bucket);
    await app.loadStoredDocuments();
    assert.equal(app.currentMonthReceiptCount, 1);
    assert.equal(app.monthlyReviews.get(app.periodKey())?.discounts?.length, 1);
    assert.equal(app.documents.timesheet.confirmed, true);
    assert.equal(app.documents.payroll.confirmed, true);
    app.startMonthlyReview = () => { throw new Error('must not open comparison while adding'); };
    await app.document.getElementById(`add-${type === 'full' ? 'full' : 'reduced'}-payroll`).click();
    assert.equal(app.activeKind,'payroll');
    assert.equal(app.documentScreen.hidden,false);
    assert.equal(app.documents.payroll.confirmed,false);
    assert.equal(app.documents.timesheet.confirmed,true);
    assert.equal(app.workSchedules.get(app.periodKey()).type,type);
    assert.deepEqual(JSON.parse(await bucket.objects.get(firstPath).text()),first);
    assert.equal([...bucket.objects.keys()].filter(path=>path.endsWith('/timesheet')).length,1);
    const draft=JSON.parse(await bucket.objects.get(`${app.periodFolder()}/review`).text());
    assert.equal(draft.discounts,undefined);
    assert.equal(draft.timesheetPath,'owner-a/2026/08/timesheet');
    assert.equal(app.monthlyReviews.get(app.periodKey()).receiptId, app.activeReceiptId);
    assert.equal(app.document.getElementById('discounts-card-title').textContent, 'Descuentos · Nómina 2');
  }
});

test('November 2022 renders the three actions only after payroll 1 quantities are saved', () => {
  const app = documentHarness(bucketFor('owner-a'));
  app.month.value = '10';
  app.year.value = '2022';
  app.documents.timesheet.confirmed = true;
  app.documents.payroll.confirmed = true;
  app.currentScheduleSettings = () => ({type:'full'});
  app.currentMonthReceiptCount = 1;
  app.monthlyReviews.set(app.periodKey(), {status:'pending', schedule:{type:'full'}, discounts:[{kind:'irpf',amount:100}]});
  app.updatePeriodCards();
  assert.equal(app.document.getElementById('completion-panel').hidden, false, 'Leer y guardar cantidades remains available');
  assert.equal(app.document.getElementById('payroll-next-actions').hidden, true, 'the decision is not shown before saving quantities');
  app.monthlyReviews.set(app.periodKey(), {status:'complete', schedule:{type:'full'}, discounts:[{kind:'irpf',amount:100}], payroll:{night:'0'}});
  app.updatePeriodCards();
  assert.equal(app.document.getElementById('completion-panel').hidden, true);
  assert.equal(app.document.getElementById('payroll-next-actions').hidden, false);
  app.currentMonthReceiptCount = 2;
  app.updatePeriodCards();
  assert.equal(app.document.getElementById('payroll-next-actions').hidden, true, 'the decision is never shown after payroll 2');
});

test('Añadir otro descuento opens the next payroll without discounts and preserves discounts 1', async () => {
  const bucket = bucketFor('owner-a');
  const secondId = newReceiptId();
  const folder = 'owner-a/2026/08';
  const discounts1 = [{section:'irpf', kind:'irpf', amount:100}];
  bucket.objects.set(`${folder}/timesheet`, new Blob(['shared register']));
  bucket.objects.set(`${folder}/payroll`, new Blob(['payroll 1']));
  bucket.objects.set(`${folder}/review`, new Blob([JSON.stringify({period:'2026-08',status:'complete',timesheet:{night:'10'},payroll:{night:'10'},discounts:discounts1})]));
  bucket.objects.set(`${folder}/${secondId}/payroll`, new Blob(['payroll 2']));
  bucket.objects.set(`${folder}/${secondId}/review`, new Blob([JSON.stringify({period:`2026-08/${secondId}`,status:'pending',timesheet:{night:'10'}})]));
  const app = documentHarness(bucket);
  app.activeReceiptId = '';
  await app.loadStoredDocuments();
  let openedFresh = false;
  app.showDiscountsScreen = (options) => { openedFresh = options?.fresh === true; };
  await app.openNextPayrollDiscounts();
  assert.equal(app.activeReceiptId, secondId);
  assert.equal(app.activeReceiptNumber, 2);
  assert.equal(openedFresh, true);
  assert.deepEqual(JSON.parse(await bucket.objects.get(`${folder}/review`).text()).discounts, discounts1);
});

test('Comparison reviews pending receipts in order and closes after both, reusing confirmed register',async()=>{
  const bucket=bucketFor('owner-a');
  const id=newReceiptId();
  const folder='owner-a/2026/08';
  const discounts=[{kind:'irpf',amount:100}];
  bucket.objects.set(`${folder}/timesheet`,new Blob(['shared register']));
  for(const [suffix,period,type] of [['','2026-08','full'],[`/${id}`,`2026-08/${id}`,'reduced']]){
    bucket.objects.set(`${folder}${suffix}/payroll`,new Blob([`payroll ${type}`]));
    bucket.objects.set(`${folder}${suffix}/review`,new Blob([JSON.stringify({period,status:'pending',schedule:{type},discounts})]));
  }
  const app=documentHarness(bucket);
  app.renderMultiPayrollSummary=async()=>{app.summaryRendered=true;};
  app.handleMonthClosure=async close=>{app.closed=close;};
  await app.loadStoredDocuments();
  assert.equal(app.activeReceiptId,id);
  await app.document.getElementById('view-current-review').click();
  assert.equal(app.activeReceiptId,'','first pending receipt is reviewed first');
  assert.equal(app.openedSavedReview,true);
  app.confirmedTimesheetAnalyses.set(app.periodKey(),new Map([['night','17']]));
  app.confirmComparisonButton.dataset.action='check';
  await app.confirmMonthlyComparison();
  assert.equal(app.activeReceiptId,id,'continues with payroll 2 after saving payroll 1');
  assert.equal(app.confirmedTimesheetAnalyses.get(app.periodKey()).get('night'),'17');
  assert.equal(app.closed,undefined);
  app.confirmComparisonButton.dataset.action='check';
  await app.confirmMonthlyComparison();
  assert.equal(app.closed,true);
  assert.equal(app.summaryRendered,true);
  for(const suffix of ['',`/${id}`]){
    const review=JSON.parse(await bucket.objects.get(`${folder}${suffix}/review`).text());
    assert.equal(review.status,'complete');
    assert.deepEqual(review.discounts,discounts);
    assert.equal(review.timesheet.night,'17');
  }
});

test('reopening a pending receipt restores its schedule before comparison', async () => {
  const bucket=bucketFor('owner-a');
  await seedSavedReceipt(bucket,'owner-a/2026/08');
  bucket.objects.set('owner-a/2026/08/review',new Blob([JSON.stringify({period:'2026-08',status:'pending',schedule:{type:'reduced',percentage:80},discounts:[{kind:'irpf',amount:100}]})]));
  const app=documentHarness(bucket);
  let restored;
  app.loadWorkSchedule=()=>{restored=app.workSchedules.get(app.periodKey());};
  await app.loadStoredDocuments();
  assert.equal(restored.type,'reduced');
  assert.equal(restored.percentage,80);
});
