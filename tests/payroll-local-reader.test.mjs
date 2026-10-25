import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { money, localDiscountRows, discountTemplates, confirmedDiscountRows, readLocalTotals, recognizeLocally } from '../payroll-local-reader.mjs';

test('Spanish money, missing values and explicit zero stay distinct', () => {
  assert.equal(money('1.234,56'), 1234.56);
  assert.equal(money('1234.56'), 1234.56);
  assert.equal(money(1.234), 1.234);
  assert.equal(money(''), null);
  assert.equal(money('0'), 0);
  assert.ok(Number.isNaN(money('1e3')));
  assert.ok(Number.isNaN(money('12 basura')));
});

test('local OCR never guesses worker/company columns or duplicate bases', () => {
  const rows = localDiscountRows('9102 Devengado Total CC 2.000,00\n9350 Contingencias Comunes 2.000,00 4,70 94,00 23,60 472,00');
  assert.equal(rows.find(r => r.kind === 'accrued_total_cc').value, 2000);
  assert.ok(rows.filter(r => r.kind === 'common_contingencies').every(r => r.amount === null));
  assert.equal(localDiscountRows('9102 Base 2.000,00\n9102 Base 3.000,00').find(r => r.kind === 'accrued_total_cc').value, null);
  assert.equal(localDiscountRows('9102 Base 2.000,00 3.000,00').find(r => r.kind === 'accrued_total_cc').value, null);
});

test('manual discounts persist both sides, reject invalid input, omit empty rows', () => {
  const rows = discountTemplates();
  assert.equal(confirmedDiscountRows(rows).length, 0);
  rows.find(r => r.kind === 'common_contingencies' && r.section === 'worker').amount = '94,00';
  rows.find(r => r.kind === 'common_contingencies' && r.section === 'company').amount = '472,00';
  rows.find(r => r.kind === 'irpf').amount = '0';
  const saved = confirmedDiscountRows(rows);
  assert.equal(saved.length, 3);
  assert.equal(saved.find(r => r.section === 'worker').amount, 94);
  assert.equal(saved.find(r => r.section === 'company').amount, 472);
  assert.equal(saved.find(r => r.kind === 'irpf').amount, 0);
  rows.find(r => r.kind === 'irpf').rate = '101';
  assert.throws(() => confirmedDiscountRows(rows), /Revisa/);
});

test('manual totals preserve economic concepts and allow unknown totals', () => {
  const values = { gross: '2.500,00', deductions: '', net: '0' };
  const root = { getElementById: id => ({ value: values[id.replace('local-total-', '')] }) };
  const concepts = [{ code: '0001', amount: 2500 }];
  const result = readLocalTotals(root, { concepts });
  assert.deepEqual(result.totals, { gross: 2500, deductions: null, net: 0 });
  assert.equal(result.concepts, concepts);
  values.net = 'abc';
  assert.throws(() => readLocalTotals(root), /Revisa/);
});

test('local OCR always releases its worker, including failed recognition', async () => {
  const previous = globalThis.Tesseract;
  let terminated = 0;
  globalThis.Tesseract = { createWorker: async () => ({
    setParameters: async () => {}, recognize: async () => { throw Error('synthetic OCR failure'); },
    terminate: async () => { terminated++; }
  }) };
  try { await assert.rejects(recognizeLocally('synthetic')); assert.equal(terminated, 1); }
  finally { globalThis.Tesseract = previous; }
});

test('active document flow loads no external AI readers and discounts have no network transport', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const wrapper = read('revisa-tu-nomina.html');
  assert.doesNotMatch(wrapper, /(?:payroll|timesheet)-vision|gemini-document-fallback/);
  for (const path of ['discounts-reader.js', 'payroll-local-reader.mjs', 'payroll-lab-patch.js']) {
    assert.doesNotMatch(read(path), /fetch\s*\(|lab-read-payroll|gemini-str|api\.openai/);
  }
  assert.match(read('revisa-tu-nomina-base.html'), /readLocalTotals\(document/);
});
