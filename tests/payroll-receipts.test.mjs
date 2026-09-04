import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { newReceiptId, receiptCreatedAt, monthReceipts, assertUniquePayroll, sha256, listFiles } from '../payroll-receipts.mjs';

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
    objects, failUploads: false,
    async upload(path, blob, options) {
      if (!allowed(path) || this.failUploads) return { error: new Error('Denied or offline') };
      if (objects.has(path) && !options.upsert) return { error: new Error('Duplicate') };
      objects.set(path, blob); return { error: null };
    },
    async download(path) {
      return allowed(path) && objects.has(path) ? { data: objects.get(path), error: null } : { error: new Error('Denied or missing') };
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
    currentUserId: 'owner-a', STORAGE_BUCKET: 'payroll-documents', supabase: { storage: { from: () => bucket } },
    month: { value: '7' }, year: { value: '2026' }, activeReceiptId: null, receiptCreated: null, payrollSourceHash: '',
    storageLoadVersion: 0, historyLoadVersion: 0, loadingDocuments: false, historyEntries: [], savingReview: false, savingDocument: false,
    confirmedTimesheetAnalyses: new Map(), confirmedPayrollAnalyses: new Map(), monthlyReviews: new Map(), workSchedules: new Map(),
    documents: { timesheet: {}, payroll: {} }, comparisonInputs: new Map(), PAYROLL_VARIABLES: [],
    clearAllDocuments() { this; }, loadWorkSchedule() {}, updatePeriodCards() {}, showPeriodMessage() {},
    showPeriodScreen() {}, ensureYearOption() {}, renderPrivateHistory() {},
    currentScheduleSettings: () => ({}), buildMonthlyComparisons: () => ({}),
    applyComparisonCardResult() {}, renderComparisonResult() {}, setComparisonProgress() {},
    parseQuantityValue: Number, formatQuantity: String,
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); } }
  });
  for (const key of ['addMonthlyPayroll','historyCount','historyLoading','historyError','historyList','historyEmpty','refreshHistoryButton','comparisonError','confirmComparisonButton','comparisonSaved','comparisonResult','comparisonDetectedCount']) ctx[key] = element();
  for (const name of ['monthFolder','periodFolder','periodKey','storagePath','mapToPlainObject','plainObjectToMap','uploadMonthlyReview','hydrateMonthlyReview','downloadMonthlyReview','loadStoredDocuments','listAllStorageItems','loadPrivateHistory','openHistoryPeriod','confirmMonthlyComparison','isCurrentReviewComplete','startAnotherPayroll']) vm.runInContext(extract(name), ctx);
  return ctx;
}

function documentHarness(bucket) {
  const app = harness(bucket);
  Object.assign(app, {
    activeKind: '', workingFile: null, workingUrl: '', workingSaved: false, workingOcrText: '',
    privacyScanState: 'idle', periodLabel: () => 'agosto de 2026', monthlyIncidentCount: () => 0,
    window: { scrollTo() {} }, resetDocumentScreen() {},
    documentCopy: { timesheet: {}, payroll: {} },
    ALLOWED_IMAGE_TYPES: new Set(['image/png']), MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    openTimesheetCrop() { app.cropOpened = true; },
    showPeriodScreen() { app.returnedToSummary = true; },
    startMonthlyReview() { app.openedSavedReview = true; }
  });
  for (const key of ['addPeriodPayroll','addDocumentPayroll','savedDocumentNotice','documentUploadControls',
    'privacyConfirmation','fileInput','selectImageButton','selectHint','preview','previewImage','previewStatusText',
    'fileError','documentActions','changeImageButton','confirmImageButton','startAnalysisButton',
    'periodScreen','historyScreen','analysisScreen','comparisonScreen','documentScreen','topBack']) app[key] = element();
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
    app.openDocument('timesheet');
    assert.equal(app.savedDocumentNotice.hidden, true);
    assert.equal(app.documentUploadControls.hidden, false);
    assert.equal(app.selectImageButton.disabled, false);
    app.workingFile = new Blob(['new timesheet'], { type: 'image/png' });
    app.workingUrl = URL.createObjectURL(app.workingFile);
    app.privacyScanState = 'passed'; app.privacyConfirmation.checked = true;
    await app.confirmImage();
    assert.equal(await bucket.objects.get(app.storagePath('timesheet')).text(), 'new timesheet');
    app.openDocument('payroll');
    app.workingFile = new Blob(['new payroll'], { type: 'image/png' });
    app.workingUrl = URL.createObjectURL(app.workingFile);
    app.privacyScanState = 'passed'; app.privacyConfirmation.checked = true;
    await app.confirmImage();
    app.confirmComparisonButton.dataset.action = 'check';
    await app.confirmMonthlyComparison();
    assert.equal(app.addPeriodPayroll.hidden, false);
    for (const [path, blob] of original) assert.equal(await bucket.objects.get(path).text(), await blob.text());
    await app.loadPrivateHistory();
    assert.equal(app.historyEntries.length, 2);
    const savedCount = bucket.objects.size;
    await app.addPeriodPayroll.click();
    assert.equal(app.isCurrentReviewComplete(), false);
    assert.equal(bucket.objects.size, savedCount, 'starting another receipt does not write or delete data');
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

test('August: three separate receipts, add-another action, reopening and legacy compatibility', async () => {
  const bucket = bucketFor('owner-a');
  const app = harness(bucket);
  await app.loadStoredDocuments();
  const paths = [];
  for (let i = 0; i < 3; i++) {
    const payroll = new Blob([`Fictitious payroll ${i}`]);
    const path = app.storagePath('payroll');
    await assertUniquePayroll(bucket, app.monthFolder(), payroll, path);
    await bucket.upload(path, payroll, { upsert: false });
    await bucket.upload(app.storagePath('timesheet'), new Blob(['Fictitious timesheet']), { upsert: false });
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
    if (i < 2) await app.startAnotherPayroll();
  }
  assert.equal(new Set(paths.map(p => p.id)).size, 3);
  for (const p of paths) assert.equal(await bucket.objects.get(p.reviewPath).text(), p.saved);
  await app.loadPrivateHistory();
  assert.equal(app.historyEntries.length, 3);
  for (const entry of app.historyEntries) {
    await app.openHistoryPeriod(entry.year, entry.month, entry.receiptId);
    assert.equal(app.activeReceiptId, entry.receiptId);
    assert.equal(app.monthlyReviews.get(app.periodKey()).status, 'complete');
  }
  await bucket.upload('owner-a/2026/08/payroll', new Blob(['Legacy payroll']), { upsert: false });
  await bucket.upload('owner-a/2026/08/review', new Blob([JSON.stringify({period:'2026-08',status:'complete',timesheet:{},payroll:{}})]), { upsert: false });
  await app.loadPrivateHistory();
  assert.equal(app.historyEntries.length, 4);
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
